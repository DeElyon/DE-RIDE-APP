import { NextResponse } from "next/server";
import { and, eq, gt, inArray, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { z } from "zod";
import { bookings, trips } from "@/lib/db/schema";

type Context = { params: Promise<{ tripId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const { tripId } = await params;
  if (!z.string().uuid().safeParse(tripId).success) {
    return NextResponse.json({ error: "Invalid trip." }, { status: 400 });
  }
  const now = new Date();
  const [trip] = await db.select({ totalSeats: trips.totalSeats }).from(trips).where(eq(trips.id, tripId)).limit(1);
  if (!trip) return NextResponse.json({ error: "Trip not found." }, { status: 404 });

  const active = await db
    .select({ seatNumber: bookings.seatNumber })
    .from(bookings)
    .where(and(
      eq(bookings.tripId, tripId),
      or(inArray(bookings.status, ["CONFIRMED", "PAID", "COMPLETED"]), and(eq(bookings.status, "PENDING_PAYMENT"), gt(bookings.holdExpiresAt, now))),
    ));

  return NextResponse.json({ occupied: active.map((booking) => booking.seatNumber), total: trip.totalSeats }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
