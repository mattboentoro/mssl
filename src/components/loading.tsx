import { Card, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("bg-surface-muted rounded-lg motion-safe:animate-pulse", className)}
    />
  );
}

export function SectionSkeleton({
  label,
  cards,
  rows = 4,
}: {
  label: string;
  cards?: 3 | 6;
  rows?: number;
}) {
  return (
    <div>
      <p role="status" className="sr-only">
        Loading {label.toLowerCase()}...
      </p>
      <div aria-hidden="true">
        <Skeleton className="mb-3 h-6 w-48 max-w-full" />
        {cards ? (
          <div
            className={
              cards === 6
                ? "grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
                : "grid gap-3 sm:grid-cols-3"
            }
          >
            {Array.from({ length: cards }, (_, index) => (
              <Card key={index} className="space-y-3 p-4">
                <Skeleton className="h-8 w-12" />
                <Skeleton className="h-4 w-24 max-w-full" />
              </Card>
            ))}
          </div>
        ) : (
          <Card className="divide-subtle divide-y">
            {Array.from({ length: rows }, (_, index) => (
              <div key={index} className="space-y-3 p-4">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/3" />
              </div>
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}

export function PageSkeleton({
  title,
  filters = false,
  sections = 1,
}: {
  title: string;
  filters?: boolean;
  sections?: number;
}) {
  return (
    <div>
      <PageHeader title={title} />
      <p role="status" className="sr-only">
        Loading {title.toLowerCase()}...
      </p>
      <div aria-hidden="true" className="space-y-8">
        {filters ? (
          <Card className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-10" />
            ))}
          </Card>
        ) : null}
        {Array.from({ length: sections }, (_, index) => (
          <Card key={index} className="space-y-4 p-4">
            {Array.from({ length: 4 }, (_, row) => (
              <Skeleton key={row} className="h-12" />
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
