import Image from "next/image";

export function TeamLogo({
  teamId,
  name,
  hasLogo,
  size = 56,
}: {
  teamId: string;
  name: string;
  hasLogo: boolean;
  size?: number;
}) {
  const className = "border-subtle bg-surface shrink-0 rounded-xl border object-contain";
  if (hasLogo) {
    return (
      <Image
        src={`/teams/${teamId}/logo`}
        alt={`${name} logo`}
        width={size}
        height={size}
        className={className}
        unoptimized
      />
    );
  }

  return (
    <span
      aria-label={`${name} has no logo`}
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
