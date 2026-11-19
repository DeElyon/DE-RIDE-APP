import { generateText } from "ai";
import { and, asc, desc, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { ameboConversations, ameboMessages, ameboTokenLedger } from "@/lib/db/schema";

const messageInput = z.object({
  message: z.string().trim().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

function lagosDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Lagos",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

async function getUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to use Amebo." }, { status: 401 });

  const conversationId = new URL(request.url).searchParams.get("conversationId");
  if (conversationId) {
    if (!z.string().uuid().safeParse(conversationId).success) {
      return NextResponse.json({ error: "Invalid conversation." }, { status: 400 });
    }
    const [conversation] = await db
      .select({ id: ameboConversations.id })
      .from(ameboConversations)
      .where(and(eq(ameboConversations.id, conversationId), eq(ameboConversations.userId, userId)))
      .limit(1);
    if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    const messages = await db
      .select({ id: ameboMessages.id, role: ameboMessages.role, content: ameboMessages.content, createdAt: ameboMessages.createdAt })
      .from(ameboMessages)
      .where(and(eq(ameboMessages.conversationId, conversationId), eq(ameboMessages.userId, userId)))
      .orderBy(asc(ameboMessages.createdAt))
      .limit(100);
    return NextResponse.json(messages, { headers: { "Cache-Control": "private, no-store" } });
  }

  const [conversations, [ledger]] = await Promise.all([
    db.select({ id: ameboConversations.id, title: ameboConversations.title, updatedAt: ameboConversations.updatedAt })
      .from(ameboConversations)
      .where(eq(ameboConversations.userId, userId))
      .orderBy(desc(ameboConversations.updatedAt))
      .limit(30),
    db.select({ dailyFreeTokens: ameboTokenLedger.dailyFreeTokens, purchasedTokens: ameboTokenLedger.purchasedTokens })
      .from(ameboTokenLedger)
      .where(eq(ameboTokenLedger.userId, userId))
      .limit(1),
  ]);
  return NextResponse.json({ conversations, tokens: { dailyFree: ledger?.dailyFreeTokens ?? 10, purchased: ledger?.purchasedTokens ?? 0 } }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Sign in to use Amebo." }, { status: 401 });

  let input: z.infer<typeof messageInput>;
  try {
    input = messageInput.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a message up to 4,000 characters." }, { status: 400 });
  }

  let conversationId = input.conversationId;
  const isNewConversation = !conversationId;
  if (conversationId) {
    const [conversation] = await db.select({ id: ameboConversations.id })
      .from(ameboConversations)
      .where(and(eq(ameboConversations.id, conversationId), eq(ameboConversations.userId, userId)))
      .limit(1);
    if (!conversation) return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const now = new Date();
  let tokenSource: "daily" | "purchased";
  let balance: { dailyFreeTokens: number; purchasedTokens: number };
  try {
    const [updatedBalance, source] = await db.transaction(async (tx) => {
      await tx.insert(ameboTokenLedger).values({ userId, dailyFreeTokens: 10, purchasedTokens: 0, dailyTokensResetAt: now, updatedAt: now }).onConflictDoNothing();
      const [ledger] = await tx.select().from(ameboTokenLedger).where(eq(ameboTokenLedger.userId, userId)).for("update");
      let dailyFreeTokens = ledger.dailyFreeTokens;
      let purchasedTokens = ledger.purchasedTokens;
      if (lagosDay(ledger.dailyTokensResetAt) !== lagosDay(now)) dailyFreeTokens = 10;
      if (dailyFreeTokens > 0) {
        dailyFreeTokens -= 1;
        tokenSource = "daily";
      } else if (purchasedTokens > 0) {
        purchasedTokens -= 1;
        tokenSource = "purchased";
      } else {
        throw new Error("NO_TOKENS");
      }
      await tx.update(ameboTokenLedger)
        .set({ dailyFreeTokens, purchasedTokens, dailyTokensResetAt: lagosDay(ledger.dailyTokensResetAt) !== lagosDay(now) ? now : ledger.dailyTokensResetAt, updatedAt: now })
        .where(eq(ameboTokenLedger.userId, userId));
      return [{ dailyFreeTokens, purchasedTokens }, tokenSource] as const;
    });
    balance = updatedBalance;
    tokenSource = source;
  } catch (error) {
    if (error instanceof Error && error.message === "NO_TOKENS") {
      return NextResponse.json({ error: "You’ve used today’s free Amebo messages. Try again tomorrow." }, { status: 429 });
    }
    console.error("[amebo] Unable to reserve a token", error);
    return NextResponse.json({ error: "Amebo is unavailable right now." }, { status: 503 });
  }

  try {
    if (!conversationId) {
      const [conversation] = await db.insert(ameboConversations)
        .values({ userId, title: input.message.slice(0, 80) })
        .returning({ id: ameboConversations.id });
      conversationId = conversation.id;
    }
    const history = conversationId
      ? await db.select({ role: ameboMessages.role, content: ameboMessages.content })
          .from(ameboMessages)
          .where(and(eq(ameboMessages.conversationId, conversationId), eq(ameboMessages.userId, userId)))
          .orderBy(asc(ameboMessages.createdAt))
          .limit(20)
      : [];
    const result = await generateText({
      model: "alibaba/qwen3.5-flash",
      system: "You are Amebo, DE RIDE’s friendly road companion for passengers traveling in Nigeria. Give practical, kind, concise travel help and clearly say when you do not have live traffic or operator data. Never claim to book a ride, contact an operator, or provide current traffic conditions unless a connected DE RIDE tool has actually done so. Do not ask for passwords, payment details, or sensitive personal information.",
      messages: [
        ...history.map((message) => ({ role: message.role as "user" | "assistant", content: message.content })),
        { role: "user" as const, content: input.message },
      ],
      maxOutputTokens: 450,
    });

    const reply = result.text.trim().slice(0, 4000);
    if (!reply) throw new Error("EMPTY_GENERATION");
    await db.transaction(async (tx) => {
      await tx.insert(ameboMessages).values([
        { conversationId: conversationId!, userId, role: "user", content: input.message },
        { conversationId: conversationId!, userId, role: "assistant", content: reply },
      ]);
      await tx.update(ameboConversations).set({ updatedAt: new Date() })
        .where(and(eq(ameboConversations.id, conversationId!), eq(ameboConversations.userId, userId)));
    });

    return NextResponse.json({ conversationId, reply, tokens: balance });
  } catch (error) {
    console.error("[amebo] Generation failed", error);
    await db.transaction(async (tx) => {
      const [ledger] = await tx.select().from(ameboTokenLedger).where(eq(ameboTokenLedger.userId, userId)).for("update");
      await tx.update(ameboTokenLedger).set({
        dailyFreeTokens: tokenSource === "daily" ? Math.min(10, ledger.dailyFreeTokens + 1) : ledger.dailyFreeTokens,
        purchasedTokens: tokenSource === "purchased" ? ledger.purchasedTokens + 1 : ledger.purchasedTokens,
        updatedAt: new Date(),
      }).where(eq(ameboTokenLedger.userId, userId));
      if (isNewConversation && conversationId) {
        await tx.delete(ameboConversations).where(and(eq(ameboConversations.id, conversationId), eq(ameboConversations.userId, userId)));
      }
    });
    return NextResponse.json({ error: "Amebo couldn’t reply. Your message token was returned; try again." }, { status: 503 });
  }
}
