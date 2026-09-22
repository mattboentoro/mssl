import "server-only";

import { BlobServiceClient } from "@azure/storage-blob";

import { config } from "@/lib/config";

export const MAX_TEAM_LOGO_BYTES = 2 * 1024 * 1024;

export interface StoredTeamLogo {
  blobName: string;
  container: string;
  contentType: TeamLogoContentType;
  etag: string | null;
}

export type TeamLogoContentType = "image/png" | "image/jpeg" | "image/webp";

export interface TeamLogoStorage {
  upload(blobName: string, bytes: Uint8Array, contentType: TeamLogoContentType): Promise<StoredTeamLogo>;
  delete(blobName: string): Promise<void>;
  read(blobName: string): Promise<Uint8Array | null>;
}

const signatures: Record<TeamLogoContentType, (bytes: Uint8Array) => boolean> = {
  "image/png": (bytes) =>
    bytes.length >= 8 &&
    [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    ),
  "image/jpeg": (bytes) =>
    bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/webp": (bytes) =>
    bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP",
};

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

export function validateTeamLogo(
  bytes: Uint8Array,
  declaredContentType: string,
): TeamLogoContentType {
  if (bytes.length === 0) throw new Error("Choose a non-empty logo file.");
  if (bytes.length > MAX_TEAM_LOGO_BYTES) throw new Error("Team logos must be 2 MiB or smaller.");
  if (!(declaredContentType in signatures)) {
    throw new Error("Team logos must be PNG, JPEG, or WebP.");
  }
  const contentType = declaredContentType as TeamLogoContentType;
  if (!signatures[contentType](bytes)) {
    throw new Error("The file contents do not match its PNG, JPEG, or WebP type.");
  }
  return contentType;
}

export function generateTeamLogoBlobName(
  contentType: TeamLogoContentType,
  randomId: () => string = () => crypto.randomUUID(),
): string {
  const extension = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  }[contentType];
  return `teams/${randomId()}.${extension}`;
}

let storage: TeamLogoStorage | undefined;

export function getTeamLogoStorage(): TeamLogoStorage {
  if (storage) return storage;
  if (!config.teamLogos.connectionString) {
    throw new Error("Azure Blob Storage is not configured for team logos.");
  }

  const container = BlobServiceClient.fromConnectionString(
    config.teamLogos.connectionString,
  ).getContainerClient(config.teamLogos.container);
  let initialized: Promise<void> | undefined;
  const initialize = () =>
    (initialized ??= (async () => {
      await container.createIfNotExists();
      await container.setAccessPolicy();
    })());

  storage = {
    async upload(blobName, bytes, contentType) {
      await initialize();
      const response = await container.getBlockBlobClient(blobName).uploadData(bytes, {
        blobHTTPHeaders: { blobContentType: contentType },
      });
      return {
        blobName,
        container: container.containerName,
        contentType,
        etag: response.etag ?? null,
      };
    },
    async delete(blobName) {
      await initialize();
      await container.deleteBlob(blobName, { deleteSnapshots: "include" });
    },
    async read(blobName) {
      await initialize();
      const client = container.getBlockBlobClient(blobName);
      if (!(await client.exists())) return null;
      return new Uint8Array(await client.downloadToBuffer());
    },
  };
  return storage;
}
