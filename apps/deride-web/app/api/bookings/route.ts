import { NextResponse } from "next/server";
import { and, desc, eq, gt, inArray, or } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { bookings, busParks, trips } from "@/lib/db/schema";

const bookingInput = z.object({
  tripId: z.string().uuid(),
  seatNumber: z.number().int().positive().max(60),
});

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to view your tickets." }, { status: 401 });

  const rows = await db
    .select({
      id: bookings.id,
      tripId: bookings.tripId,
      seatNumber: bookings.seatNumber,
      status: bookings.status,
      holdExpiresAt: bookings.holdExpiresAt,
      createdAt: bookings.createdAt,
      origin: busParks.parkName,
      destination: trips.destinationLabel,
      scheduledDepartureAt: trips.scheduledDepartureAt,
      fare: bookings.baseFare,
      platformFee: bookings.platformFee,
      paymentFee: bookings.paymentFee,
    })
    .from(bookings)
    .innerJoin(trips, eq(bookings.tripId, trips.id))
    .leftJoin(busParks, eq(trips.originParkId, busParks.id))
    .where(eq(bookings.userId, userId))
    .orderBy(desc(bookings.createdAt))
    .limit(50);

  return NextResponse.json(rows, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in before reserving a seat." }, { status: 401 });

  let input: z.infer<typeof bookingInput>;
  try {
    input = bookingInput.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Choose a valid trip and seat." }, { status: 400 });
  }

  try {
    const booking = await db.transaction(async (tx) => {
      const [trip] = await tx
        .select()
        .from(trips)
        .where(eq(trips.id, input.tripId))
        .for("update");
      if (!trip || !["BOARDING", "SCHEDULED"].includes(trip.status) || trip.scheduledDepartureAt <= new Date()) {
        throw new Error("TRIP_UNAVAILABLE");
      }
      if (input.seatNumber > trip.totalSeats) throw new Error("SEAT_UNAVAILABLE");

      const [existing] = await tx
        .select()
        .from(bookings)
        .where(and(eq(bookings.tripId, trip.id), eq(bookings.seatNumber, input.seatNumber)))
        .for("update");
      const now = new Date();
      const activeHold = existing?.status === "PENDING_PAYMENT" && existing.holdExpiresAt && existing.holdExpiresAt > now;
      const activeBooking = existing && ["CONFIRMED", "PAID", "COMPLETED"].includes(existing.status);
      if (activeHold || activeBooking) throw new Error("SEAT_UNAVAILABLE");
      const activeSeats = await tx
        .select({ seatNumber: bookings.seatNumber })
        .from(bookings)
        .where(and(
          eq(bookings.tripId, trip.id),
          or(inArray(bookings.status, ["CONFIRMED", "PAID", "COMPLETED"]), and(eq(bookings.status, "PENDING_PAYMENT"), gt(bookings.holdExpiresAt, now))),
        ));
      if (activeSeats.length >= trip.totalSeats) throw new Error("TRIP_FULL");

      const holdExpiresAt = new Date(now.getTime() + 15 * 60 * 1000);
      const fee = 20;
      const processingFee = Math.min(trip.baseFare * 0.015 + (trip.baseFare < 2500 ? 0 : 100), 2000);

      if (existing) {
        const [updated] = await tx
          .update(bookings)
          .set({ userId, status: "PENDING_PAYMENT", holdExpiresAt, baseFare: trip.baseFare, platformFee: fee, paymentFee: processingFee, createdAt: now })
          .where(eq(bookings.id, existing.id))
          .returning();
        await tx.update(trips).set({ bookedSeats: activeSeats.length + 1 }).where(eq(trips.id, trip.id));
        return updated;
      }

      const [created] = await tx
        .insert(bookings)
        .values({ userId, tripId: trip.id, seatNumber: input.seatNumber, baseFare: trip.baseFare, platformFee: fee, paymentFee: processingFee, status: "PENDING_PAYMENT", holdExpiresAt })
        .returning();
      await tx.update(trips).set({ bookedSeats: activeSeats.length + 1 }).where(eq(trips.id, trip.id));
      return created;
    });
    return NextResponse.json({ booking, message: "Seat held for 15 minutes. Payment has not been collected." }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "SEAT_UNAVAILABLE") {
      return NextResponse.json({ error: "That seat is no longer available. Please choose another." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "TRIP_UNAVAILABLE") {
      return NextResponse.json({ error: "This departure is no longer available." }, { status: 409 });
    }
    if (error instanceof Error && error.message === "TRIP_FULL") {
      return NextResponse.json({ error: "This departure is fully booked." }, { status: 409 });
    }
    console.error("[bookings] Unable to reserve seat", error);
    return NextResponse.json({ error: "Unable to reserve that seat right now." }, { status: 503 });
  }
}
