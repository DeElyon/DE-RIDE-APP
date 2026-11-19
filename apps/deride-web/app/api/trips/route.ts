import { NextResponse } from "next/server";
import { and, asc, eq, gte, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/lib/db";
import { busParks, trips, vehicleCredentials } from "@/lib/db/schema";

const originParks = alias(busParks, "originPark");
const destinationParks = alias(busParks, "destinationPark");

export async function GET() {
  try {
    const rows = await db
      .select({
        id: trips.id,
        origin: originParks.parkName,
        destinationPark: destinationParks.parkName,
        destinationLabel: trips.destinationLabel,
        stateCode: trips.stateCode,
        scheduledDepartureAt: trips.scheduledDepartureAt,
        fare: trips.baseFare,
        seats: trips.totalSeats,
        bookedSeats: trips.bookedSeats,
        activeSeats: sql<number>`(select count(*)::int from public.bookings b where b.trip_id = ${trips.id} and (b.status in ('CONFIRMED', 'PAID', 'COMPLETED') or (b.status = 'PENDING_PAYMENT' and b.hold_expires_at > now())))`,
        status: trips.status,
        gpsSource: trips.gpsSource,
        operator: vehicleCredentials.operatorName,
        plate: vehicleCredentials.plateNumber,
        vehicleType: vehicleCredentials.vehicleType,
      })
      .from(trips)
      .leftJoin(originParks, eq(trips.originParkId, originParks.id))
      .leftJoin(destinationParks, eq(trips.destinationParkId, destinationParks.id))
      .leftJoin(vehicleCredentials, eq(trips.vehicleId, vehicleCredentials.id))
      .where(
        and(
          inArray(trips.status, ["BOARDING", "SCHEDULED"]),
          gte(trips.scheduledDepartureAt, new Date()),
          eq(vehicleCredentials.verificationStatus, "VERIFIED"),
          eq(originParks.isActive, true),
        ),
      )
      .orderBy(asc(trips.scheduledDepartureAt))
      .limit(100);

    return NextResponse.json(
      rows.map((trip) => ({
        id: trip.id,
        from: trip.origin ?? "Origin park",
        to: trip.destinationPark ?? trip.destinationLabel,
        state: trip.stateCode.toUpperCase() === "OG" ? "Ogun" : "Lagos",
        time: trip.scheduledDepartureAt.toISOString(),
        duration: "Scheduled departure",
        fare: trip.fare,
        seats: Math.max(0, trip.seats - trip.activeSeats),
        total: trip.seats,
        plate: trip.plate ?? "Assigned at park",
        vehicle: trip.vehicleType ?? "Verified vehicle",
        gps: trip.gpsSource,
        operator: trip.operator ?? "Verified operator",
        status: trip.status,
      })),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    console.error("[trips] Unable to load departures", error);
    return NextResponse.json({ error: "Unable to load departures." }, { status: 503 });
  }
}
