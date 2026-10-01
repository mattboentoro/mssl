import type { Metadata } from "next";
import Link from "next/link";

import {
  CreateRescheduleSlotForm,
  DeleteRescheduleSlotForm,
  EditRescheduleSlotForm,
  ImportRescheduleSlotsForm,
  RescheduleSlotAvailabilityForm,
} from "@/components/reschedule-slot-forms";
import { Badge, buttonClass, Card, EmptyState, inputClass, PageHeader } from "@/components/ui";
import {
  formatDateTime,
  formatLongDate,
  toDateInputValue,
  toDateTimeInputValue,
} from "@/lib/dates";
import { prisma } from "@/lib/prisma";
import { RESCHEDULE_SLOT_STATUSES, type RescheduleSlotStatus } from "@/lib/reschedule-slots";

export const metadata: Metadata = { title: "Reschedule slots" };
export const dynamic = "force-dynamic";

function statusFilter(value: string | undefined): RescheduleSlotStatus | undefined {
  return RESCHEDULE_SLOT_STATUSES.find((status) => status === value);
}

export default async function AdminRescheduleSlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string; status?: string; venue?: string }>;
}) {
  const params = await searchParams;
  const selectedStatus = statusFilter(params.status);
  const slots = await prisma.rescheduleSlot.findMany({
    include: {
      requests: {
        where: { activeSlotKey: { not: null } },
        include: { match: { include: { homeTeam: true, awayTeam: true } } },
      },
    },
    orderBy: { kickoffAt: "asc" },
  });
  const venues = [...new Set(slots.map((slot) => slot.venueName))].sort((left, right) =>
    left.localeCompare(right),
  );
  const days = new Map<string, Date>();
  for (const slot of slots) {
    const key = toDateInputValue(slot.kickoffAt);
    if (!days.has(key)) days.set(key, slot.kickoffAt);
  }
  const selectedVenue = venues.includes(params.venue ?? "") ? params.venue : undefined;
  const selectedDay = days.has(params.day ?? "") ? params.day : undefined;
  const filteredSlots = slots.filter((slot) => {
    const effectiveStatus = slot.requests.length > 0 ? "RESERVED" : slot.status;
    return (
      (!selectedVenue || slot.venueName === selectedVenue) &&
      (!selectedDay || toDateInputValue(slot.kickoffAt) === selectedDay) &&
      (!selectedStatus || effectiveStatus === selectedStatus)
    );
  });

  return (
    <div>
      <PageHeader
        title="Reschedule slots"
        description="Captains can request only these league-provided date, time, and venue combinations."
      />
      <Card className="mb-4 p-5">
        <ImportRescheduleSlotsForm />
      </Card>
      <Card className="mb-8 p-5">
        <h2 className="mb-4 text-lg font-semibold">Add availability</h2>
        <CreateRescheduleSlotForm />
      </Card>
      <section aria-labelledby="reschedule-slot-list">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="reschedule-slot-list" className="text-lg font-semibold">
              Availability
            </h2>
            <p className="text-muted text-sm">
              Showing {filteredSlots.length} of {slots.length} slots
            </p>
          </div>
          <form method="get" className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="text-muted mb-1 block text-xs font-medium uppercase">Venue</span>
              <select name="venue" defaultValue={selectedVenue ?? ""} className={inputClass}>
                <option value="">All venues</option>
                {venues.map((venue) => (
                  <option key={venue} value={venue}>
                    {venue}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted mb-1 block text-xs font-medium uppercase">Day</span>
              <select name="day" defaultValue={selectedDay ?? ""} className={inputClass}>
                <option value="">All days</option>
                {[...days].map(([day, kickoffAt]) => (
                  <option key={day} value={day}>
                    {formatLongDate(kickoffAt)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted mb-1 block text-xs font-medium uppercase">Status</span>
              <select name="status" defaultValue={selectedStatus ?? ""} className={inputClass}>
                <option value="">All statuses</option>
                {RESCHEDULE_SLOT_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {status.toLowerCase()}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className={buttonClass("primary")}>
              Filter
            </button>
            <Link
              href="/admin/reschedule-slots"
              className="text-muted self-center text-sm underline"
            >
              Reset
            </Link>
          </form>
        </div>
        {filteredSlots.length ? (
          <div className="space-y-3">
            {filteredSlots.map((slot) => {
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
                        <div className="flex items-start gap-2">
                          <RescheduleSlotAvailabilityForm
                            slotId={slot.id}
                            enable={slot.status === "DISABLED"}
                          />
                          {slot.status === "DISABLED" ? (
                            <DeleteRescheduleSlotForm slotId={slot.id} />
                          ) : null}
                        </div>
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
            title={slots.length ? "No slots match this filter" : "No reschedule slots"}
            hint={
              slots.length
                ? "Choose another status or reset the filter."
                : "Add a future date, time, and venue before Captains can make requests."
            }
          />
        )}
      </section>
    </div>
  );
}
