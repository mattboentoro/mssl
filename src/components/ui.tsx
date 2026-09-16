import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

import { cn } from "@/lib/cn";
import {
  MATCH_DISPLAY_LABELS,
  matchDisplayStatus,
  type MatchDisplayInput,
  type MatchDisplayStatus,
} from "@/lib/match-status";

/* -------------------------------------------------------------------------- */
/* Layout primitives                                                          */
/* -------------------------------------------------------------------------- */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow ? (
          <p className="text-brand text-xs font-semibold tracking-[0.18em] uppercase">{eyebrow}</p>
        ) : null}
        <h1 className="mt-1 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
        {description ? (
          <div className="text-muted mt-2 text-sm sm:text-base">{description}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className,
  as: As = "div",
}: {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "article" | "li";
}) {
  return (
    <As className={cn("bg-surface border-subtle rounded-xl border shadow-sm", className)}>
      {children}
    </As>
  );
}

export function SectionHeading({
  title,
  href,
  linkLabel = "View all",
  children,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-baseline justify-between gap-4">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
      {href ? (
        <Link href={href} className="text-accent text-sm font-medium hover:underline">
          {linkLabel} &rarr;
        </Link>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: ReactNode }) {
  return (
    <div className="border-subtle text-muted rounded-xl border border-dashed p-8 text-center text-sm">
      <p className="font-medium">{title}</p>
      {hint ? <p className="mt-1">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Badges                                                                     */
/* -------------------------------------------------------------------------- */

type BadgeTone = "neutral" | "brand" | "accent" | "success" | "warning" | "danger";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-surface-muted text-muted",
  brand: "bg-brand/10 text-brand",
  accent: "bg-accent/10 text-accent",
  success: "bg-success/10 text-success",
  warning: "bg-warning/10 text-warning",
  danger: "bg-danger/10 text-danger",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap",
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

const DISPLAY_TONES: Record<MatchDisplayStatus, BadgeTone> = {
  COMPLETED: "success",
  FORFEITED: "danger",
  WAITING_REPORT: "warning",
  NOT_STARTED: "warning",
  NEEDS_REFEREE: "neutral",
  POSTPONED: "warning",
  CANCELLED: "danger",
};

export function MatchStatusBadge({ match }: { match: MatchDisplayInput }) {
  const key = matchDisplayStatus(match);
  return <Badge tone={DISPLAY_TONES[key]}>{MATCH_DISPLAY_LABELS[key]}</Badge>;
}

/* -------------------------------------------------------------------------- */
/* Buttons                                                                    */
/* -------------------------------------------------------------------------- */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-brand text-brand-contrast hover:opacity-90",
  secondary: "bg-surface border-subtle border hover:bg-surface-muted",
  ghost: "hover:bg-surface-muted",
  danger: "bg-danger text-white hover:opacity-90",
};

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

export function buttonClass(variant: ButtonVariant = "primary", className?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANTS[variant], className);
}

export function Button({
  variant = "primary",
  className,
  ...props
}: ComponentPropsWithoutRef<"button"> & { variant?: ButtonVariant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  className,
  href,
  children,
  ...props
}: ComponentPropsWithoutRef<typeof Link> & { variant?: ButtonVariant }) {
  return (
    <Link href={href} className={buttonClass(variant, className)} {...props}>
      {children}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/* Form primitives                                                            */
/* -------------------------------------------------------------------------- */

export const inputClass =
  "bg-surface border-subtle w-full rounded-lg border px-3 py-2 text-sm shadow-sm";

export const labelClass = "text-muted mb-1 block text-xs font-semibold uppercase tracking-wide";

export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <label className={labelClass} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? <p className="text-muted mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

export function Alert({
  tone = "danger",
  title,
  children,
  className,
}: {
  tone?: "danger" | "success" | "warning" | "accent" | "info";
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    danger: "border-danger/40 bg-danger/10 text-danger",
    success: "border-success/40 bg-success/10 text-success",
    warning: "border-warning/40 bg-warning/10 text-warning",
    accent: "border-accent/40 bg-accent/10 text-accent",
    info: "border-subtle bg-surface-muted text-muted",
  } as const;

  // Only genuinely urgent tones get an assertive live region.
  const role = tone === "danger" || tone === "warning" ? "alert" : undefined;

  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", tones[tone], className)} role={role}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Form guide                                                                 */
/* -------------------------------------------------------------------------- */

export function FormGuide({ form }: { form: ("W" | "D" | "L")[] }) {
  if (form.length === 0) {
    return <span className="text-muted text-xs">&mdash;</span>;
  }
  const tone = {
    W: "bg-success text-white",
    D: "bg-muted/40 text-foreground",
    L: "bg-danger text-white",
  };
  return (
    <span className="inline-flex gap-1">
      {form.map((result, index) => (
        <span
          key={index}
          className={cn(
            "inline-flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold",
            tone[result],
          )}
          title={{ W: "Win", D: "Draw", L: "Loss" }[result]}
        >
          {result}
        </span>
      ))}
    </span>
  );
}
