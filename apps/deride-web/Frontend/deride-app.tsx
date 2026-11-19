"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import AmeboChat from "@/Frontend/amebo-chat";
import { RiderProfile, RiderTickets } from "@/Frontend/rider-panels";
import { authClient } from "@/lib/auth-client";
import {
  ArrowDownUp,
  ArrowRight,
  Bike,
  BusFront,
  Check,
  ChevronDown,
  CircleHelp,
  LogOut,
  Clock3,
  Compass,
  CreditCard,
  Headphones,
  MapPin,
  Menu,
  MessageCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserRound,
  X,
} from "lucide-react";

type Trip = {
  id: string;
  from: string;
  to: string;
  state: "Lagos" | "Ogun";
  time: string;
  duration: string;
  fare: number;
  seats: number;
  total: number;
  plate: string;
  vehicle: string;
  gps: string;
  operator: string;
};


const navItems = [
  { label: "Explore parks", icon: Compass },
  { label: "My tickets", icon: Ticket },
  { label: "Bike hail", icon: Bike },
  { label: "Amebo AI", icon: MessageCircle },
  { label: "Profile & rank", icon: UserRound },
];

function formatDeparture(value: string) {
  return new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", hour: "numeric", minute: "2-digit", day: "numeric", month: "short" }).format(new Date(value));
}

function money(value: number) {
  return `₦${value.toLocaleString("en-NG", { minimumFractionDigits: Number.isInteger(value) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

function Brand() {
  return (
    <a className="brand" href="#home" aria-label="DE RIDE home">
      <span className="brand-mark" aria-hidden="true" />
      <span className="brand-copy"><strong>DE RIDE</strong><small>MOVE WITH CONFIDENCE</small></span>
    </a>
  );
}

function SchematicMap({ selected }: { selected: Trip }) {
  return (
    <section className="map-panel" aria-label={`Schematic route from ${selected.from} to ${selected.to}`}>
      <div className="map-grid" aria-hidden="true" />
      <svg className="map-roads" viewBox="0 0 720 420" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <path d="M-20 350 C105 280 122 180 265 210 S426 301 740 85" />
        <path d="M-20 95 C155 155 230 55 340 104 S495 235 740 300" />
        <path d="M96 -15 C118 95 180 128 181 250 S140 347 206 435" />
        <path d="M456 -15 C402 87 456 140 408 210 S355 331 394 435" />
        <path d="M-20 250 C120 215 272 317 408 276 S555 155 740 192" />
        <path className="route-line" d="M136 294 C205 255 207 185 312 193 S444 260 550 126" />
      </svg>
      <div className="map-neighborhood neighborhood-a">OJOTA</div>
      <div className="map-neighborhood neighborhood-b">BERGER</div>
      <div className="map-neighborhood neighborhood-c">IKORODU RD</div>
      <div className="map-neighborhood neighborhood-d">LAGOS — OGUN</div>
      <span className="map-pin pin-start"><span><BusFront size={17} /></span><small>{selected.from}</small></span>
      <span className="map-pin pin-end"><span><MapPin size={17} /></span><small>{selected.to}</small></span>
      <div className="map-legend"><span className="live-dot" /> ROUTE PREVIEW <span className="legend-divider" /> SCHEMATIC MAP</div>
      <button className="map-control" type="button" aria-label="Map help"><CircleHelp size={17} /></button>
    </section>
  );
}

function TripCard({ trip, onSelect, selected }: { trip: Trip; onSelect: (trip: Trip) => void; selected: boolean }) {
  const filled = trip.total - trip.seats;
  return (
    <article className={`trip-card${selected ? " trip-card-selected" : ""}`}>
      <div className="trip-card-top">
        <div className="operator-avatar"><BusFront size={18} /></div>
        <div className="operator-info"><strong>{trip.operator}</strong><span>{trip.plate} <i /> {trip.gps}</span></div>
        <span className="verified-tag"><ShieldCheck size={13} /> Verified</span>
      </div>
      <div className="trip-route">
        <div className="route-stations"><strong>{trip.from}</strong><span>{trip.to}</span></div>
        <div className="route-connector"><span /><i /><span /></div>
        <div className="route-duration"><strong>{trip.duration}</strong><span>{trip.vehicle}</span></div>
      </div>
      <div className="trip-progress-row"><span><Clock3 size={14} /> Departs {formatDeparture(trip.time)}</span><span>{trip.seats} seats left</span></div>
      <div className="seat-progress" role="progressbar" aria-label={`${filled} of ${trip.total} seats filled`} aria-valuenow={filled} aria-valuemin={0} aria-valuemax={trip.total}><span style={{ width: `${(filled / trip.total) * 100}%` }} /></div>
      <div className="trip-card-bottom"><div className="fare"><strong>{money(trip.fare)}</strong><span>per seat</span></div><button className="button button-coral book-button" onClick={() => onSelect(trip)} type="button">Choose seat <ArrowRight size={16} /></button></div>
    </article>
  );
}

function BookingDialog({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const router = useRouter();
  const [seat, setSeat] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [bookingError, setBookingError] = useState("");
  const { data: seatData, mutate: refreshSeats } = useSWR<{ occupied: number[] }>(`/api/trips/${trip.id}/seats`, (url: string) => fetch(url).then((response) => response.json()));
  const occupied = seatData?.occupied ?? [];
  const paystackFee = Math.min(trip.fare * 0.015 + (trip.fare < 2500 ? 0 : 100), 2000);
  const total = trip.fare + 20 + paystackFee;
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="booking-dialog" role="dialog" aria-modal="true" aria-labelledby="booking-heading">
        <header className="dialog-header"><div><span className="eyebrow">YOUR NEXT RIDE</span><h2 id="booking-heading">Choose your seat</h2></div><button className="icon-button" onClick={onClose} aria-label="Close seat selection" type="button"><X size={19} /></button></header>
        {confirmed ? <div className="checkout-state"><span className="checkout-icon"><Check size={25} /></span><h3>Seat {seat} held</h3><p>Your reservation is held for 15 minutes. Payment has not been collected.</p><button className="button button-primary" onClick={onClose} type="button">Done</button><small>Complete checkout before your seat hold expires.</small></div> : <>
          <div className="booking-route"><span>{trip.from}</span><ArrowRight size={16} /><span>{trip.to}</span></div>
          <div className="seat-legend"><span><i className="seat-key available" /> Available</span><span><i className="seat-key taken" /> Taken</span><span><i className="seat-key chosen" /> Selected</span></div>
          <div className="bus-layout"><div className="bus-front"><BusFront size={18} /><span>FRONT</span></div><div className="seat-grid" aria-label="Bus seat selection">{Array.from({ length: trip.total }, (_, index) => { const number = index + 1; const unavailable = occupied.includes(number); return <button key={number} type="button" disabled={unavailable} aria-pressed={seat === number} aria-label={`Seat ${number}${unavailable ? ", occupied" : ""}`} onClick={() => setSeat(number)} className={`seat${unavailable ? " seat-taken" : ""}${seat === number ? " seat-selected" : ""}`}>{number}</button>; })}</div></div>
          <div className="receipt"><div><span>Base fare</span><strong>{money(trip.fare)}</strong></div><div><span>DE RIDE service fee</span><strong>₦20</strong></div><div><span>Paystack processing</span><strong>{money(paystackFee)}</strong></div><div className="receipt-total"><span>Total payable</span><strong>{money(total)}</strong></div></div>
          {bookingError && <p className="auth-error" role="alert">{bookingError}</p>}
          <button className="button button-coral confirm-booking" type="button" disabled={!seat || pending} onClick={async () => {
            if (!seat) return;
            setPending(true);
            setBookingError("");
            try {
              const response = await fetch("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tripId: trip.id, seatNumber: seat }) });
              const result = await response.json();
              if (response.status === 401) { router.push("/sign-in"); return; }
              if (!response.ok) throw new Error(result.error ?? "Unable to reserve this seat.");
              setConfirmed(true);
              await refreshSeats();
            } catch (error) {
              setBookingError(error instanceof Error ? error.message : "Unable to reserve this seat.");
            } finally {
              setPending(false);
            }
          }}><CreditCard size={17} /> {pending ? "Reserving…" : `Hold seat · ${money(total)}`}</button>
          <p className="preview-disclaimer">Seat holds expire after 15 minutes. No payment has been collected.</p>
        </>}
      </section>
    </div>
  );
}

function AlternatePanel({ page }: { page: string }) {
  const content: Record<string, { icon: typeof Ticket; eyebrow: string; title: string; detail: string }> = {
    "Bike hail": { icon: Bike, eyebrow: "LAST-MILE RIDES", title: "Your next stop, closer.", detail: "Find verified bike riders near your park for a safe last-mile connection. Bike availability will appear here." },
  };
  const item = content[page] ?? content["Bike hail"];
  const Icon = item.icon;
  return <section className="alternate-panel"><div className="alternate-icon"><Icon size={25} /></div><span className="eyebrow">{item.eyebrow}</span><h1>{item.title}</h1><p>{item.detail}</p><span className="coming-soon"><span /> PILOT PREVIEW</span></section>;
}

const fetchTrips = async (url: string): Promise<Trip[]> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load departures");
  return response.json();
};

const fetchJson = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Unable to load account data");
  return response.json();
};

export default function DerideApp({ displayName }: { displayName: string }) {
  const router = useRouter();
  const [activePage, setActivePage] = useState("Explore parks");
  const [stateFilter, setStateFilter] = useState("All routes");
  const [search, setSearch] = useState("");
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null);
  const { data: trips = [], error: tripError } = useSWR<Trip[]>("/api/trips", fetchTrips, { refreshInterval: 30000 });
  const { data: ameboMeta } = useSWR<{ tokens: { dailyFree: number; purchased: number } }>("/api/amebo", fetchJson);
  const { data: userBookings } = useSWR<Array<{ id: string }>>("/api/bookings", fetchJson);
  const selectedTrip = trips.find((trip) => trip.id === selectedTripId) ?? trips[0] ?? null;
  const [bookingTrip, setBookingTrip] = useState<Trip | null>(null);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [language, setLanguage] = useState("EN");
  const query = search.trim().toLowerCase();
  const filteredTrips = trips.filter((trip) => {
    const stateMatches = stateFilter === "All routes" || trip.state === stateFilter;
    const queryMatches = !query || `${trip.from} ${trip.to} ${trip.operator}`.toLowerCase().includes(query);
    return stateMatches && queryMatches;
  });

  return (
    <main className="app-shell" id="home">
      <aside className={`sidebar${mobileMenu ? " sidebar-open" : ""}`}>
        <Brand />
        <div className="sidebar-label">YOUR JOURNEY</div>
        <nav className="side-nav" aria-label="Main navigation">{navItems.map(({ label, icon: Icon }) => <button key={label} className={`nav-item${activePage === label ? " nav-item-active" : ""}`} onClick={() => { setActivePage(label); setMobileMenu(false); }} type="button"><Icon size={19} strokeWidth={1.8} /><span>{label}</span>{label === "My tickets" && <span className="nav-count">{userBookings?.length ?? 0}</span>}</button>)}</nav>
        <div className="sidebar-spacer" />
        <div className="help-card"><span className="help-icon"><Headphones size={17} /></span><strong>Need a hand?</strong><p>Our team is here to help you travel with ease.</p><button type="button" onClick={() => setActivePage("My tickets")}>Visit help centre <ArrowRight size={14} /></button></div>
        <button className="profile-mini" onClick={() => setActivePage("Profile & rank")} type="button"><span className="profile-avatar">{displayName.slice(0, 1).toUpperCase()}</span><span><strong>{displayName}</strong><small>Passenger account</small></span><ChevronDown size={15} /></button>
      </aside>
      {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Close navigation" type="button" />}

      <div className="main-column">
        <header className="topbar">
          <button className="mobile-menu-button icon-button" type="button" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><Menu size={21} /></button>
          <div className="breadcrumb"><span>DE RIDE</span><span className="breadcrumb-slash">/</span><strong>{activePage}</strong></div>
          <div className="topbar-actions"><label className="language-picker"><span className="sr-only">Language</span><select value={language} onChange={(event) => setLanguage(event.target.value)} aria-label="Choose language"><option value="EN">EN</option><option value="YO">YO</option><option value="HA">HA</option><option value="IG">IG</option><option value="PCM">PCM</option></select><ChevronDown size={13} /></label><button className="token-pill" type="button" onClick={() => setActivePage("Amebo AI")}><Sparkles size={14} /><strong>{(ameboMeta?.tokens.dailyFree ?? 10) + (ameboMeta?.tokens.purchased ?? 0)}</strong><span>tokens</span></button><button className="top-avatar" type="button" aria-label="Open profile" onClick={() => setActivePage("Profile & rank")}>{displayName.slice(0, 1).toUpperCase()}</button><button className="icon-button sign-out-button" type="button" aria-label="Sign out" onClick={async () => { await authClient.signOut(); router.replace("/sign-in"); router.refresh(); }}><LogOut size={15} /></button></div>
        </header>

        {activePage === "Explore parks" ? <div className="content-area">
          <div className="welcome-row"><div><div className="eyebrow welcome-eyebrow"><span className="live-dot" /> LAGOS & OGUN PILOT</div><h1>Where to next?</h1><p>Find your park. Catch your ride. Get there with confidence.</p></div><button className="today-pill" type="button"><span className="today-dot" /> Today, {new Intl.DateTimeFormat("en-NG", { timeZone: "Africa/Lagos", day: "numeric", month: "short" }).format(new Date())} <ChevronDown size={14} /></button></div>

          <section className="journey-search" aria-label="Find a route"><label className="search-field"><MapPin size={17} /><span className="search-label"><small>FROM</small><input aria-label="Search origin or destination" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Choose a park" /></span></label><button className="swap-button" type="button" aria-label="Swap origin and destination"><ArrowDownUp size={16} /></button><div className="search-divider" /><div className="destination-summary"><small>POPULAR ROUTES</small><strong>Across Lagos & Ogun</strong></div><button className="search-submit" type="button" onClick={() => document.getElementById("route-list")?.scrollIntoView({ behavior: "smooth", block: "start" })} aria-label="Find rides"><Search size={18} /></button></section>

          <div className="dashboard-grid">
            <div className="map-column"><div className="section-heading map-heading"><div><h2>Routes near you</h2><p>Explore active parks and departures</p></div><button className="text-button" type="button" onClick={() => setStateFilter("All routes")}>View all <ArrowRight size={15} /></button></div>{selectedTrip ? <SchematicMap selected={selectedTrip} /> : <div className="map-panel"><div className="map-grid" aria-hidden="true" /><div className="empty-routes"><strong>No active route to preview</strong><span>Live departures will appear when operators publish them.</span></div></div>}<div className="map-footer"><span><span className="live-dot" /> {filteredTrips.length} departures in the pilot area</span><button type="button" onClick={() => setStateFilter("All routes")}>Updated just now <ArrowRight size={13} /></button></div><div className="trust-strip"><span className="trust-icon"><ShieldCheck size={18} /></span><p><strong>Travel with a little more peace of mind.</strong><br />Verified operators. Clear fares. Support when you need it.</p><ArrowRight size={16} /></div></div>

            <section className="rides-column" id="route-list"><div className="section-heading rides-heading"><div><h2>Next departures</h2><p>Choose a ride that works for you</p></div><span className="live-tag"><span className="live-dot" /> LIVE</span></div><div className="state-filters" role="group" aria-label="Filter routes by state">{["All routes", "Lagos", "Ogun"].map((filter) => <button className={stateFilter === filter ? "filter-active" : ""} key={filter} onClick={() => setStateFilter(filter)} type="button">{filter}</button>)}</div><div className="trip-list">{filteredTrips.length ? filteredTrips.map((trip) => <TripCard key={trip.id} trip={trip} selected={selectedTrip?.id === trip.id} onSelect={(nextTrip) => { setSelectedTripId(nextTrip.id); setBookingTrip(nextTrip); }} />) : <div className="empty-routes"><Search size={20} /><strong>{tripError ? "Departures unavailable" : "No departures scheduled"}</strong><span>{tripError ? "Please try again shortly." : "Published operator schedules will appear here."}</span></div>}</div><p className="data-note">Departures and seat availability are loaded from the live operator schedule.</p></section>
          </div>
          <div className="mobile-nav" aria-label="Mobile navigation">{navItems.map(({ label, icon: Icon }) => <button key={label} className={activePage === label ? "mobile-nav-active" : ""} onClick={() => setActivePage(label)} type="button"><Icon size={19} /><span>{label === "Explore parks" ? "Explore" : label === "Profile & rank" ? "Profile" : label === "My tickets" ? "Tickets" : label === "Amebo AI" ? "Amebo" : "Bike hail"}</span></button>)}</div>
        </div> : <><div className="alternate-wrap">{activePage === "Amebo AI" ? <AmeboChat /> : activePage === "My tickets" ? <RiderTickets /> : activePage === "Profile & rank" ? <RiderProfile /> : <AlternatePanel page={activePage} />}<button className="button button-primary alternate-action" type="button" onClick={() => setActivePage("Explore parks")}>Explore available rides <ArrowRight size={16} /></button></div><div className="mobile-nav" aria-label="Mobile navigation">{navItems.map(({ label, icon: Icon }) => <button key={label} className={activePage === label ? "mobile-nav-active" : ""} onClick={() => setActivePage(label)} type="button"><Icon size={19} /><span>{label === "Explore parks" ? "Explore" : label === "Profile & rank" ? "Profile" : label === "My tickets" ? "Tickets" : label === "Amebo AI" ? "Amebo" : "Bike hail"}</span></button>)}</div></>}
      </div>
      {bookingTrip && <BookingDialog trip={bookingTrip} onClose={() => setBookingTrip(null)} />}
    </main>
  );
}
