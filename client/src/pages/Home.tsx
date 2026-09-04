// Velvet Broadcast direction: asymmetric editorial landing page, deep aubergine, signal magenta, ivory type, human-first hierarchy.
import { useState } from "react";
import { ArrowUpRight, Check, ChevronDown, CirclePlay, Instagram, Mic2, ShieldCheck, Sparkles, Video, WalletCards } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";

// Higher-resolution editorial photography replacing the old /manus-storage/*
// placeholders, which 403 in production (that path proxies to a Manus-only
// "Forge" storage backend that isn't configured on Render — see
// server/_core/storageProxy.ts). These are hosted on Gamma's CDN.
const heroImage = "https://cdn.gamma.app/8qkii0anb5qk5wa/design-anything/KIEvBjAPE4ZQaSZEiTq8W/-qxK-VedvNljdHfd3Hihz.jpg";
const studioImage = "https://cdn.gamma.app/8qkii0anb5qk5wa/design-anything/WhIPRYaGmgFhpEPbhvfLt/4bPdVGTWDuI4f72IJX5vU.jpg";
const detailImage = "https://cdn.gamma.app/8qkii0anb5qk5wa/design-anything/kyD8UjsNcSPMqWIxdCdgp/WaoA2OGxmiPDHkzlPWV7k.jpg";
const roomImage = "https://cdn.gamma.app/8qkii0anb5qk5wa/design-anything/XmY84v48R0LhcgLtiDiyD/BxwL5KYPtA3Q1TW-wjeqO.jpg";

const steps = [
  { number: "01", title: "Create your room", body: "Set your tone, choose your availability, and shape a live space that feels like you.", icon: Video },
  { number: "02", title: "Go live on your terms", body: "Host private live shows when you want. Your audience arrives for the experience you make.", icon: Mic2 },
  { number: "03", title: "Keep your share", body: "Creators receive 81% of show revenue. LensFlow retains 19% to run the platform.", icon: WalletCards },
];

const faqs = [
  ["Who can apply?", "LensFlow is for adults 18+ who want to host private live shows. You must complete the creator onboarding process and agree to the platform terms."],
  ["How does the 81% share work?", "Creators receive 81% of show revenue, while LensFlow retains 19%. Review the applicable creator terms before going live."],
  ["Do I need a studio setup?", "No. Start with a quiet room, a phone or camera, and a reliable connection. You can grow your setup as your audience grows."],
];

function RoomBooking() {
  const roomsQuery = trpc.rooms.listPublished.useQuery();
  const checkout = trpc.bookings.createCheckout.useMutation();
  const [roomId, setRoomId] = useState<number | "">("");
  const [slotId, setSlotId] = useState<number | "">("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [boundaryAccepted, setBoundaryAccepted] = useState(false);
  const [duoCreatorId, setDuoCreatorId] = useState("");
  const [duoSplitPercent, setDuoSplitPercent] = useState("50");
  const selectedRoom = roomsQuery.data?.find(room => room.id === roomId);
  const roomDetail = trpc.rooms.get.useQuery({ roomId: typeof roomId === "number" ? roomId : 0 }, { enabled: typeof roomId === "number" });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (typeof roomId !== "number" || typeof slotId !== "number" || !consentAccepted) return;
    checkout.mutate({ roomId, slotId, guestName, guestEmail, consentAccepted: true, duoCreatorId: duoCreatorId ? Number(duoCreatorId) : undefined, duoSplitPercent: Number(duoSplitPercent) }, { onSuccess: result => { if (result.checkoutUrl) window.open(result.checkoutUrl, "_blank", "noopener,noreferrer"); } });
  };

  return <section id="book-a-room" className="booking-section section-pad"><div className="section-label">PRIVATE ROOM OS <span>BOOK / LIVE</span></div><div className="booking-layout"><div><h2>Choose your<br /><span className="editorial-accent">private room.</span></h2><p className="booking-intro">Select a live format, choose a time, and arrive through a private link. No endless feed—just a room made for the moment.</p><div className="booking-note"><span className="live-dot" /> Secure checkout powered by Stripe</div></div><form className="booking-form" onSubmit={submit}><label>Room<select value={roomId} onChange={event => { const value = event.target.value ? Number(event.target.value) : ""; setRoomId(value); setSlotId(""); }}><option value="">{roomsQuery.isLoading ? "Loading rooms…" : roomsQuery.data?.length ? "Select a room" : "No rooms published yet"}</option>{roomsQuery.data?.map(room => <option value={room.id} key={room.id}>{room.title} · {room.roomType === "avatar" ? "AI Avatar" : "Live Human"} · {room.durationMinutes} min · {(room.priceCents / 100).toFixed(2)} {room.currency}</option>)}</select></label><label>Time slot<select value={slotId} onChange={event => setSlotId(event.target.value ? Number(event.target.value) : "")} disabled={!selectedRoom || roomDetail.isLoading}><option value="">{roomDetail.isLoading ? "Loading times…" : "Select a time"}</option>{roomDetail.data?.slots.map(slot => <option value={slot.id} key={slot.id}>{new Date(slot.startsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</option>)}</select></label><div className="booking-fields"><label>Your name<input value={guestName} onChange={event => setGuestName(event.target.value)} required placeholder="Your name" /></label><label>Email<input type="email" value={guestEmail} onChange={event => setGuestEmail(event.target.value)} required placeholder="you@example.com" /></label></div><div className="booking-fields"><label>Co-host ID (optional)<input inputMode="numeric" value={duoCreatorId} onChange={event => setDuoCreatorId(event.target.value.replace(/\D/g, ""))} placeholder="Leave blank for solo" /></label><label>Co-host split %<input type="number" min="1" max="99" value={duoSplitPercent} onChange={event => setDuoSplitPercent(event.target.value)} disabled={!duoCreatorId} /></label></div><label className="consent-check"><input type="checkbox" checked={consentAccepted} onChange={event => setConsentAccepted(event.target.checked)} required /><span>I agree to the applicable LensFlow creator and room terms.</span></label><label className="consent-check"><input type="checkbox" checked={boundaryAccepted} onChange={event => setBoundaryAccepted(event.target.checked)} required /><span>I understand this room follows creator-set boundaries and safety rules.</span></label><button className="button button-primary" type="submit" disabled={!selectedRoom || !slotId || !consentAccepted || !boundaryAccepted || checkout.isPending}>{checkout.isPending ? "Opening checkout…" : "Continue to secure checkout"}<ArrowUpRight size={17} /></button>{checkout.error && <p className="form-error">{checkout.error.message}</p>}</form></div></section>;
}

function CreatorConsole() {
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const rooms = trpc.rooms.mine.useQuery(undefined, { enabled: isAuthenticated });
  const ledger = trpc.bookings.ledger.useQuery(undefined, { enabled: isAuthenticated });
  const createRoom = trpc.rooms.create.useMutation({ onSuccess: () => rooms.refetch() });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => utils.auth.me.invalidate() });
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("25");
  const [duration, setDuration] = useState("30");
  const [roomType, setRoomType] = useState<"human" | "avatar">("human");
  const [slotRoomId, setSlotRoomId] = useState("");
  const [slotStart, setSlotStart] = useState("");
  const [slotEnd, setSlotEnd] = useState("");
  const addSlot = trpc.rooms.addSlot.useMutation({ onSuccess: () => { setSlotStart(""); setSlotEnd(""); } });
  const [slotFormError, setSlotFormError] = useState("");
  const submitSlot = (event: React.FormEvent) => { event.preventDefault(); setSlotFormError(""); if (!slotRoomId || !slotStart || !slotEnd) return; const startsAt = new Date(slotStart); const endsAt = new Date(slotEnd); if (endsAt <= startsAt) { setSlotFormError("End time must be after the start time."); return; } addSlot.mutate({ roomId: Number(slotRoomId), startsAt, endsAt }, { onError: error => setSlotFormError(error.message) }); };
  const submit = (event: React.FormEvent) => { event.preventDefault(); createRoom.mutate({ title, description, roomType, durationMinutes: Number(duration), capacity: 1, priceCents: Math.round(Number(price) * 100), status: "published" }); };
  if (!isAuthenticated) return <section id="creator-console" className="console-section section-pad"><div className="section-label">CREATOR DESK <span>PRIVATE ROOM OS</span></div><div className="console-locked"><div><h2>Set the room.<br /><span className="editorial-accent">Own the moment.</span></h2><p>Sign in to create rooms, publish availability, and review your show ledger.</p></div><button className="button button-primary" onClick={() => startLogin()}>Sign in to creator desk <ArrowUpRight size={17} /></button></div></section>;
  return <section id="creator-console" className="console-section section-pad"><div className="section-label">CREATOR DESK <span>PRIVATE ROOM OS</span></div><div className="console-layout"><div><h2>Set the room.<br /><span className="editorial-accent">Own the moment.</span></h2><p className="booking-intro">Create a live room and publish it to the booking flow. Add availability from your creator tools as you build the schedule.</p><a className="button button-outline" href="/studio"><Video size={16} /> Open Live Stage &amp; CGI studio</a><p className="studio-status" style={{ marginTop: 14 }}>Signed in as {user?.name || user?.email} · <button type="button" className="link-button" onClick={() => logout.mutate()}>Sign out</button></p></div><div className="console-panel"><form className="booking-form" onSubmit={submit}><label>Room title<input value={title} onChange={event => setTitle(event.target.value)} required placeholder="The room after dark" /></label><label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} required placeholder="What should guests expect?" /></label><div className="booking-fields"><label>Duration (min)<select value={duration} onChange={event => { setDuration(event.target.value); const suggested: Record<string, string> = { "5": "10", "10": "19.50", "20": "35", "40": "50" }; if (suggested[event.target.value]) setPrice(suggested[event.target.value]); }}><option value="5">5 · Spark (quick session)</option><option value="10">10 · Heat (most popular)</option><option value="20">20 · Peak (extended)</option><option value="40">40 · Marathon (full experience)</option></select></label><label>Price (AUD)<input type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} required /></label></div><label>Room type<select value={roomType} onChange={event => setRoomType(event.target.value as "human" | "avatar")}><option value="human">Live human</option><option value="avatar">AI avatar</option></select></label><button className="button button-primary" disabled={createRoom.isPending}>{createRoom.isPending ? "Publishing…" : "Publish room"}<ArrowUpRight size={17} /></button></form><form className="booking-form slot-form" onSubmit={submitSlot}><div className="ledger-head"><span>ADD AVAILABILITY</span><span>UTC / LOCAL</span></div><label>Room<select value={slotRoomId} onChange={event => setSlotRoomId(event.target.value)} required><option value="">Select a room</option>{rooms.data?.map(room => <option value={room.id} key={room.id}>{room.title}</option>)}</select></label><div className="booking-fields"><label>Starts<input type="datetime-local" value={slotStart} onChange={event => setSlotStart(event.target.value)} required /></label><label>Ends<input type="datetime-local" value={slotEnd} onChange={event => setSlotEnd(event.target.value)} required /></label></div><button className="button button-outline" disabled={addSlot.isPending}>{addSlot.isPending ? "Adding…" : "Add open slot"}<ArrowUpRight size={17} /></button>{slotFormError && <p className="form-error">{slotFormError}</p>}</form><div className="ledger-preview"><div className="ledger-head"><span>YOUR ROOMS</span><span>{rooms.data?.length ?? 0}</span></div>{rooms.data?.slice(0, 3).map(room => <div className="ledger-row" key={room.id}><span>{room.title} · {room.durationMinutes}min · {room.roomType === "avatar" ? "AI Avatar" : "Live Human"}</span><b>{room.status}</b></div>)}<div className="ledger-head ledger-spaced"><span>SHOW LEDGER</span><span>{ledger.data?.length ?? 0}</span></div>{ledger.data?.slice(0, 3).map(item => <div className="ledger-row" key={item.id}><span>{item.status}{item.duoCreatorId ? ` · duo split ${item.duoSplitPercent}%` : ""}</span><b>{(item.creatorShareCents / 100).toFixed(2)} AUD</b></div>)}</div></div></div></section>;
}

export default function Home() {
  return (
    <main className="site-shell">
      <header className="nav-wrap">
        <a className="brand" href="#top" aria-label="LensFlow home"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>LensFlow</span></a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a><a href="#your-share">Your share</a><a href="#book-a-room">Book a room</a><a href="#faq">FAQ</a>
        </nav>
        <a className="nav-cta" href="/login">Creator sign up <ArrowUpRight size={15} /></a>
      </header>

      <section id="top" className="hero section-pad">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> Creator Hub <span className="eyebrow-rule" /> LensFlow / 2026</div>
          <h1>Your room.<br /><span className="editorial-accent">Your audience.</span><br /><strong>Your share.</strong></h1>
          <p className="hero-lede">Host private live shows with a platform built around the person on camera. Make the connection feel personal—and keep <b>81% of show revenue.</b></p>
          <div className="hero-actions"><a className="button button-primary" href="/login">Apply as a creator <ArrowUpRight size={17} /></a><a className="text-link" href="#how-it-works"><CirclePlay size={17} /> See how it works</a></div>
          <div className="hero-notes"><span><ShieldCheck size={15} /> Adults only</span><span><Sparkles size={15} /> Private by design</span></div>
        </div>
        <div className="hero-visual">
          <div className="hero-image-frame"><img src={heroImage} alt="LensFlow creator in a bright studio holding a bottle" /><div className="image-caption"><span>CREATOR PROFILE / 001</span><span>LIVE READY <i className="tiny-dot" /></span></div></div>
          <div className="share-badge"><span>Creator share</span><strong>81%</strong><small>of show revenue</small></div>
        </div>
      </section>

      <section className="ticker" aria-label="LensFlow benefits"><div>PRIVATE LIVE SHOWS</div><div>81% CREATOR SHARE</div><div>NO GUARANTEED EARNINGS</div><div>18+ ONLY</div></section>

      <section id="your-share" className="share-section section-pad">
        <div className="section-label">THE DIFFERENCE <span>02 / 04</span></div>
        <div className="share-grid"><div><h2>Make your presence<br /><span className="editorial-accent">the product.</span></h2></div><div className="share-body"><p>LensFlow is for creators who want the live moment to feel direct, deliberate, and worth showing up for. No noisy feed. No vague promises. Just a private room, a real audience, and a clear split.</p><div className="split-line"><span><b>81%</b><small>Creator share</small></span><span className="split-separator">/</span><span><b>19%</b><small>LensFlow platform</small></span></div><p className="fine-print">Revenue share is subject to the applicable LensFlow creator terms. Earnings are not guaranteed.</p></div></div>
      </section>

      <section id="creator-terms" className="terms-section section-pad"><div className="section-label">BEFORE YOU APPLY <span>TERMS / 01</span></div><div className="terms-heading"><h2>Know the<br /><span className="editorial-accent">details.</span></h2><p>Clear expectations before you open your room. Review the current creator dashboard and applicable LensFlow terms before going live.</p></div><div className="terms-grid"><article className="term-card"><span className="term-index">01 / ELIGIBILITY</span><h3>18+ and ready to host</h3><p>Creators must be adults aged 18 or over, complete the LensFlow onboarding process, provide any required verification, and agree to the platform’s creator terms.</p></article><article className="term-card"><span className="term-index">02 / PAYOUT TIMING</span><h3>Check your dashboard</h3><p>Payout timing can depend on verification status, payment method, and the current processing schedule. Your Creator Dashboard is the source of truth for the latest payout information.</p><a href="#creator-console">View creator dashboard <ArrowUpRight size={15} /></a></article><article className="term-card"><span className="term-index">03 / CREATOR TERMS</span><h3>81% / 19% split</h3><p>Creators receive 81% of show revenue and LensFlow retains 19%. Earnings are not guaranteed; the applicable creator terms govern eligibility, conduct, payments, and platform use.</p><a href="/login">Review and apply <ArrowUpRight size={15} /></a></article></div><p className="terms-disclaimer">Information on this page is a summary for prospective creators, not a substitute for the current LensFlow creator agreement. Terms, eligibility, processing times, and availability may change.</p></section>

      <RoomBooking />

      <CreatorConsole />

      <section id="how-it-works" className="steps-section section-pad"><div className="section-label">THE FLOW <span>03 / 04</span></div><div className="steps-heading"><h2>Go live when<br /><span className="editorial-accent">you’re ready.</span></h2><p>A simpler path from first idea to your first private show.</p></div><div className="steps-list">{steps.map(({ number, title, body, icon: Icon }) => <article className="step-card" key={number}><div className="step-top"><span>{number}</span><Icon size={22} strokeWidth={1.5} /></div><h3>{title}</h3><p>{body}</p><a href="#creator-console">Explore step <ArrowUpRight size={15} /></a></article>)}</div></section>

      <section className="studio-section"><div className="studio-image"><img src={studioImage} alt="Cinematic LensFlow creator studio" /></div><div className="studio-copy"><div className="section-label">THE ROOM <span>04 / 04</span></div><h2>Build a room<br />people <span className="editorial-accent">remember.</span></h2><p>Lighting helps. A good microphone helps. But the thing that brings people back is the feeling that the room belongs to you.</p><a className="button button-outline" href="#creator-console">Open creator hub <ArrowUpRight size={17} /></a></div></section>

      <section className="detail-band section-pad"><div className="detail-copy"><span className="quote-mark">“</span><blockquote>The platform should get out of the way. Your voice is the reason people stay.</blockquote><span className="quote-credit">LENSFLOW / CREATOR PRINCIPLE</span></div><img src={detailImage} alt="Close-up of LensFlow creator broadcast equipment" /></section>

      <section id="faq" className="faq-section section-pad"><div className="section-label">STRAIGHT ANSWERS <span>FAQ</span></div><div className="faq-layout"><h2>Before you<br /><span className="editorial-accent">go live.</span></h2><div className="faq-list">{faqs.map(([q, a]) => <details key={q}><summary>{q}<ChevronDown size={18} /></summary><p>{a}</p></details>)}</div></div></section>

      <section className="final-cta section-pad"><div className="final-visual"><img src={roomImage} alt="LensFlow private live room" /><div className="final-overlay" /></div><div className="final-copy"><div className="eyebrow"><span className="live-dot" /> OPEN STUDIO</div><h2>There’s a room<br /><span className="editorial-accent">with your name on it.</span></h2><p>Bring your point of view. We’ll bring the private room, the tools, and a clear creator share.</p><a className="button button-primary" href="/login">Start your application <ArrowUpRight size={17} /></a></div></section>

      <footer className="footer"><div className="brand"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>LensFlow</span></div><p>Private live sessions. Cinematic rooms. Real voice.</p><div className="footer-right"><a href="#creator-console">Creator dashboard</a><a href="https://lensflow.com.au" target="_blank" rel="noreferrer">LensFlow.com.au</a><span><Instagram size={15} /> 18+ only</span></div></footer>
    </main>
  );
}
