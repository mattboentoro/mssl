import readXlsxFile from "read-excel-file";

import type { ImportRescheduleSlotInput } from "@/lib/reschedule-slots";
import { parseLeagueDateTime } from "@/lib/timezone";

const REQUIRED_HEADERS = ["date", "time", "venue"] as const;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MS = 24 * 60 * 60 * 1000;
type WorkbookCell = string | number | boolean | Date | null;

export class RescheduleSlotImportError extends Error {}

export async function parseRescheduleSlotWorkbook(
  buffer: ArrayBuffer,
): Promise<ImportRescheduleSlotInput[]> {
  let rows: WorkbookCell[][];
  try {
    rows = (await readXlsxFile(buffer)) as unknown as WorkbookCell[][];
  } catch {
    throw new RescheduleSlotImportError(
      "The workbook could not be read. Upload a valid .xlsx file.",
    );
  }

  if (rows.length === 0) {
    throw new RescheduleSlotImportError("The workbook is empty.");
  }
  return parseRescheduleSlotRows(rows);
}

export function parseRescheduleSlotRows(rows: WorkbookCell[][]): ImportRescheduleSlotInput[] {
  if (rows.length === 0) {
    throw new RescheduleSlotImportError("The workbook is empty.");
  }
  const headers = rows[0].map((value) =>
    String(value ?? "")
      .trim()
      .toLowerCase(),
  );
  const indexes = Object.fromEntries(
    REQUIRED_HEADERS.map((header) => [header, headers.indexOf(header)]),
  ) as Record<(typeof REQUIRED_HEADERS)[number], number>;
  const missing = REQUIRED_HEADERS.filter((header) => indexes[header] < 0);
  if (missing.length > 0) {
    throw new RescheduleSlotImportError(
      `Missing required column${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}.`,
    );
  }

  const imported: ImportRescheduleSlotInput[] = [];
  const errors: string[] = [];
  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    const rowNumber = index + 1;
    const dateCell = row[indexes.date] ?? null;
    const timeCell = row[indexes.time] ?? null;
    const venueName = String(row[indexes.venue] ?? "").trim();

    if (dateCell === null && timeCell === null && venueName === "") continue;

    const date = formatDateCell(dateCell);
    const time = formatTimeCell(timeCell);
    if (!date) errors.push(`Row ${rowNumber}: date is missing or invalid.`);
    if (!time) errors.push(`Row ${rowNumber}: time is missing or invalid.`);
    if (!venueName) errors.push(`Row ${rowNumber}: venue is required.`);
    if (venueName.length > 300) {
      errors.push(`Row ${rowNumber}: venue must be 300 characters or fewer.`);
    }
    if (!date || !time || !venueName || venueName.length > 300) continue;

    const kickoffAt = parseLeagueDateTime(`${date} ${time}`);
    if (!kickoffAt) {
      errors.push(`Row ${rowNumber}: date and time are invalid.`);
      continue;
    }
    imported.push({ kickoffAt, venueName, rowNumber });
  }

  if (errors.length > 0) {
    const visible = errors.slice(0, 8);
    const remaining = errors.length - visible.length;
    throw new RescheduleSlotImportError(
      `${visible.join(" ")}${remaining > 0 ? ` Plus ${remaining} more error${remaining === 1 ? "" : "s"}.` : ""}`,
    );
  }
  if (imported.length === 0) {
    throw new RescheduleSlotImportError("The workbook does not contain any availability rows.");
  }
  if (imported.length > 500) {
    throw new RescheduleSlotImportError("A workbook can contain at most 500 availability rows.");
  }
  return imported;
}

function formatDateCell(value: WorkbookCell): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    const date = new Date(EXCEL_EPOCH + Math.floor(value) * DAY_MS);
    return formatDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  if (typeof value !== "string") return null;

  const trimmed = value.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(trimmed);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  const us = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (us) return validDate(Number(us[3]), Number(us[1]), Number(us[2]));
  return null;
}

function formatTimeCell(value: WorkbookCell): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatClock(value.getUTCHours(), value.getUTCMinutes());
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value < 1) {
    const minutes = Math.round(value * 24 * 60) % (24 * 60);
    return formatClock(Math.floor(minutes / 60), minutes % 60);
  }
  if (typeof value !== "string") return null;

  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/i.exec(value.trim());
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = Number(match[2]);
  const meridiem = match[3]?.toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = meridiem === "pm" ? (hour % 12) + 12 : hour % 12;
  }
  return hour <= 23 && minute <= 59 ? formatClock(hour, minute) : null;
}

function validDate(year: number, month: number, day: number): string | null {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return formatDateParts(year, month, day);
}

function formatDateParts(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function formatClock(hour: number, minute: number) {
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}
