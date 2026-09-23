import type { Metadata } from "next";

import {
  CreateRescheduleSlotForm,
  EditRescheduleSlotForm,
  RescheduleSlotAvailabilityForm,
} from "@/components/reschedule-slot-forms";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { formatDateTime, toDateTimeInputValue } from "@/lib/dates";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Reschedule slots" };
export const dynamic = "force-dynamic";

export default async function AdminRescheduleSlotsPage() {
  const slots = await prisma.rescheduleSlot.findMany({
    include: {
      requests: {
        where: { activeSlotKey: { not: null } },
        include: { match: { include: { homeTeam: true, awayTeam: true } } },
      },
    },
    orderBy: { kickoffAt: "asc" },
  });

  return (
    <div>
      <PageHeader
        title="Reschedule slots"
        description="Captains can request only these league-provided date, time, and venue combinations."
      />
      <Card className="mb-8 p-5">
        <h2 className="mb-4 text-lg font-semibold">Add availability</h2>
        <CreateRescheduleSlotForm />
      </Card>
      <section aria-labelledby="reschedule-slot-list">
        <h2 id="reschedule-slot-list" className="mb-3 text-lg font-semibold">
          Availability
        </h2>
        {slots.length ? (
          <div className="space-y-3">
            {slots.map((slot) => {
              const reservation = slot.requests[0];
              const editable = slot.status === "AVAILABLE" && !reservation;
              return (
                <Card key={slot.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{formatDateTime(slot.kickoffAt)}</p>
                      <p className="text-muted text-sm">{slot.venueName}</p>
                      {reservation ? (
                        <p className="mt-2 text-sm">
                          Reserved for {reservation.match.homeTeam.name} v{" "}
                          {reservation.match.awayTeam.name}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          slot.status === "AVAILABLE"
                            ? reservation
                              ? "warning"
                              : "success"
                            : slot.status === "RESERVED"
                              ? "warning"
                              : slot.status === "USED"
                                ? "neutral"
                                : "danger"
                        }
                      >
                        {reservation ? "Reserved" : slot.status.toLowerCase()}
                      </Badge>
                      {slot.status !== "USED" && !reservation ? (
                        <RescheduleSlotAvailabilityForm
                          slotId={slot.id}
                          enable={slot.status === "DISABLED"}
                        />
                      ) : null}
                    </div>
                  </div>
                  {editable ? (
                    <EditRescheduleSlotForm
                      slot={{
                        id: slot.id,
                        kickoffInput: toDateTimeInputValue(slot.kickoffAt),
                        venueName: slot.venueName,
                        updatedAt: slot.updatedAt.toISOString(),
                      }}
                    />
                  ) : null}
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState
            title="No reschedule slots"
            hint="Add a future date, time, and venue before Captains can make requests."
          />
        )}
      </section>
    </div>
  );
}
