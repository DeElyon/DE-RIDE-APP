import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { userProfiles } from "@/lib/db/schema";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Sign in to view your profile." }, { status: 401 });

  const [profile] = await db.select({
    role: userProfiles.role,
    language: userProfiles.languagePref,
    walletBalance: userProfiles.walletBalance,
    completedTrips: userProfiles.completedTrips,
    dailyFreeTokens: userProfiles.dailyFreeTokens,
    purchasedTokens: userProfiles.purchasedTokens,
  }).from(userProfiles).where(eq(userProfiles.userId, session.user.id)).limit(1);

  return NextResponse.json({
    user: { id: session.user.id, name: session.user.name, email: session.user.email },
    profile: profile ?? { role: "passenger", language: "en", walletBalance: 0, completedTrips: 0, dailyFreeTokens: 10, purchasedTokens: 0 },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "Sign in to create your profile." }, { status: 401 });
  const now = new Date();
  await db.insert(userProfiles).values({
    userId: session.user.id,
    role: "passenger",
    languagePref: "en",
    walletBalance: 0,
    completedTrips: 0,
    dailyFreeTokens: 10,
    purchasedTokens: 0,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing();
  return NextResponse.json({ ok: true });
}
