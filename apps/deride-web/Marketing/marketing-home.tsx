import Image from "next/image";
import Link from "next/link";
import { ArrowDown, ArrowRight, BusFront, CheckCircle2, MapPin, ShieldCheck, Sparkles, Ticket } from "lucide-react";

const logoImage = "https://hebbkx1anhila5yf.public.blob.vercel-storage.com/1794927085562-Kifc0QDotO89kvkek32R7QrEWNaGvX.jpg";

const benefits = [
  { icon: ShieldCheck, title: "Operators you can trust", copy: "Verified parks and transport operators, clearly marked before you book." },
  { icon: Ticket, title: "A seat, without the guesswork", copy: "See the departure, fare and seats left before you head to the park." },
  { icon: Sparkles, title: "Amebo on your side", copy: "A local travel companion for traffic gist, trip questions and road stories." },
];

export default function MarketingHome() {
  return (
    <main className="marketing-page">
      <header className="marketing-header">
        <a className="marketing-brand" href="#top" aria-label="DE RIDE home">
          <span className="marketing-brand-mark" aria-hidden="true" />
          <span><strong>DE RIDE</strong><small>MOVE WITH CONFIDENCE</small></span>
        </a>
        <nav className="marketing-nav" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#why-deride">Why DE RIDE</a>
          <Link className="marketing-nav-cta" href="/app">Open the app <ArrowRight size={15} /></Link>
        </nav>
      </header>

      <section className="marketing-hero" id="top">
        <div className="marketing-hero-content">
          <span className="marketing-eyebrow"><span /> LAGOS &amp; OGUN PILOT</span>
          <h1>Your next ride,<br /><em>with more certainty.</em></h1>
          <p>Find verified park departures, know your fare upfront, and book your seat before you set out.</p>
          <div className="marketing-actions">
            <Link className="marketing-button primary" href="/app">Explore available rides <ArrowRight size={17} /></Link>
            <a className="marketing-button secondary" href="#how-it-works">See how it works <ArrowDown size={15} /></a>
          </div>
          <div className="marketing-proof"><span><CheckCircle2 size={15} /> Verified operators</span><i /><span><MapPin size={15} /> Lagos ↔ Ogun</span></div>
        </div>
        <div className="marketing-visual">
          <Image src={logoImage} alt="DE RIDE brand artwork showing the transit logo and a ride-booking map on a phone" fill priority sizes="(max-width: 760px) 100vw, 52vw" className="marketing-hero-image" unoptimized />
          <div className="visual-caption"><span className="visual-caption-icon"><BusFront size={16} /></span><span><strong>From park to destination</strong><small>One clearer way to get there.</small></span></div>
        </div>
      </section>

      <section className="marketing-route-band" aria-label="Pilot routes">
        <div><span className="route-band-label">STARTING IN</span><strong>Lagos &amp; Ogun</strong></div>
        <span className="route-band-divider" />
        <div className="route-chips"><span>Berger</span><span>Ojota</span><span>Kuto, Abeokuta</span><span>Sagamu</span><span>Ijebu-Ode</span></div>
        <span className="route-band-note"><span /> Pilot routes</span>
      </section>

      <section className="marketing-how" id="how-it-works">
        <div className="marketing-section-intro"><span className="marketing-eyebrow">A BETTER WAY TO SET OUT</span><h2>Less uncertainty.<br />More room for the journey.</h2><p>DE RIDE brings park departures and practical trip details together, so you can make a more informed choice.</p></div>
        <div className="marketing-benefits" id="why-deride">{benefits.map(({ icon: Icon, title, copy }, index) => <article className="marketing-benefit" key={title}><span className="benefit-number">0{index + 1}</span><span className="benefit-icon"><Icon size={20} /></span><h3>{title}</h3><p>{copy}</p></article>)}</div>
      </section>

      <section className="marketing-bottom-cta"><div><span className="marketing-eyebrow">YOUR NEXT JOURNEY STARTS HERE</span><h2>Ready when you are.</h2><p>Explore current pilot routes across Lagos and Ogun.</p></div><Link className="marketing-button primary" href="/app">Find a ride <ArrowRight size={17} /></Link></section>
      <footer className="marketing-footer"><a className="marketing-brand" href="#top"><span className="marketing-brand-mark" aria-hidden="true" /><span><strong>DE RIDE</strong><small>MOVE WITH CONFIDENCE</small></span></a><span>Built for the road ahead.</span><a href="mailto:hello@deride.app">Contact the DE RIDE team</a></footer>
    </main>
  );
}
