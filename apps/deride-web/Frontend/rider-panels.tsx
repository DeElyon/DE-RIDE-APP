"use client";

import useSWR from "swr";
import { ArrowRight, BusFront, Clock3, Ticket, Wallet } from "lucide-react";

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load account details");
  return response.json();
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}
function money(value: number) {
  return `₦${value.toLocaleString("en-NG")}`;
}

export function RiderTickets() {
  const { data: tickets, error, isLoading } = useSWR<Array<{
    id: string; tripId: string; seatNumber: number; status: string; createdAt: string;
    origin: string | null; destination: string; scheduledDepartureAt: string; fare: number; platformFee: number; paymentFee: number;
  }>>("/api/bookings", fetcher);
  return (
    <section className="rider-panel" aria-labelledby="tickets-title">
      <div className="rider-panel-heading"><span className="alternate-icon"><Ticket size={22} /></span><div><span className="eyebrow">YOUR JOURNEYS</span><h1 id="tickets-title">My tickets</h1><p>Your reservations and upcoming departures.</p></div></div>
      {error && <p className="auth-error" role="alert">We couldn’t load your tickets. Try again in a moment.</p>}
      {isLoading && <p className="rider-panel-note">Loading your tickets…</p>}
      {!isLoading && !error && tickets?.length === 0 && <div className="rider-empty"><Ticket size={22} /><strong>No tickets yet</strong><p>Your seat reservations will appear here.</p></div>}
      <div className="rider-ticket-list">{tickets?.map((ticket) => <article className="rider-ticket" key={ticket.id}>
        <div className="rider-ticket-top"><span><BusFront size={15} /> DE RIDE</span><strong className={`booking-status status-${ticket.status.toLowerCase()}`}>{ticket.status.replaceAll("_", " ")}</strong></div>
        <div className="rider-ticket-route"><strong>{ticket.origin ?? "Origin park"}</strong><ArrowRight size={17} /><strong>{ticket.destination}</strong></div>
        <div className="rider-ticket-meta"><span><Clock3 size={14} /> {formatDate(ticket.scheduledDepartureAt)}</span><span>Seat {ticket.seatNumber}</span><strong>{money(ticket.fare + ticket.platformFee + ticket.paymentFee)}</strong></div>
        {ticket.status === "PENDING_PAYMENT" && ticket.createdAt && <small>Hold expires 15 minutes after reservation. Payment has not been collected.</small>}
      </article>)}</div>
    </section>
  );
}

export function RiderProfile() {
  const { data, error, isLoading } = useSWR<{
    user: { name: string; email: string };
    profile: { role: string; language: string; walletBalance: number; completedTrips: number; dailyFreeTokens: number; purchasedTokens: number };
  }>("/api/profile", fetcher);
  return (
    <section className="rider-panel" aria-labelledby="profile-title">
      <div className="rider-panel-heading"><span className="alternate-icon"><Wallet size={22} /></span><div><span className="eyebrow">YOUR DE RIDE PROFILE</span><h1 id="profile-title">Profile &amp; rank</h1><p>Your account details and rider stats.</p></div></div>
      {error && <p className="auth-error" role="alert">We couldn’t load your profile. Try again in a moment.</p>}
      {isLoading && <p className="rider-panel-note">Loading your profile…</p>}
      {data && <div className="profile-details"><div className="profile-identity"><span className="profile-avatar">{data.user.name.slice(0, 1).toUpperCase()}</span><div><strong>{data.user.name}</strong><span>{data.user.email}</span></div></div>
        <dl><div><dt>Account type</dt><dd>{data.profile.role}</dd></div><div><dt>Completed trips</dt><dd>{data.profile.completedTrips}</dd></div><div><dt>Wallet balance</dt><dd>{money(data.profile.walletBalance)}</dd></div><div><dt>Language</dt><dd>{data.profile.language.toUpperCase()}</dd></div></dl>
      </div>}
    </section>
  );
}
