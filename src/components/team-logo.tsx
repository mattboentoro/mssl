import Image from "next/image";

export function TeamLogo({
  teamId,
  name,
  hasLogo,
  size = 56,
  decorative = false,
}: {
  teamId: string;
  name: string;
  hasLogo: boolean;
  size?: number;
  decorative?: boolean;
}) {
  const className = "border-subtle bg-surface shrink-0 rounded-xl border object-contain";
  if (hasLogo) {
    return (
      <Image
        src={`/teams/${teamId}/logo`}
        alt={decorative ? "" : `${name} logo`}
        width={size}
        height={size}
        className={className}
        unoptimized
      />
    );
  }

  return (
    <span
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : `${name} has no logo`}
      className={`${className} text-muted inline-flex items-center justify-center text-sm font-bold`}
      style={{ width: size, height: size }}
    >
      {name
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase()}
    </span>
  );
}
