// Velvet Broadcast direction: asymmetric editorial landing page, deep aubergine, signal magenta, ivory type, human-first hierarchy.
import { useEffect, useState } from "react";
import { ArrowUpRight, Check, ChevronDown, CirclePlay, Instagram, Mic2, ShieldCheck, Sparkles, Video, WalletCards } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";

// Higher-resolution editorial photography replacing the old /manus-storage/*
// placeholders, which 403 in production (that path proxies to a Manus-only
// "Forge" storage backend that isn't configured on Render — see
// server/_core/storageProxy.ts). These are hosted on Gamma's CDN.
// Self-hosted in client/public/promo/ (cropped from the owner's marketing
// collages — see git history). The old Gamma-CDN hero was a man in
// silhouette; these are the creator-facing portraits instead.
const heroImage = "/promo/blonde.jpg";
const detailImage = "/promo/redhead.jpg";
const roomImage = "/promo/brunette.jpg";
// Empty-studio gear shot — still fine, no people in it.
const studioImage = "https://cdn.gamma.app/8qkii0anb5qk5wa/design-anything/HluI5aneNpFiqKMLVyc2g/DeJBFrM9mQ5K8vY89P3t_.jpg";

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

const MIN_CREATOR_BOXES = 8;

// Reads a File, downsamples it on a canvas, and returns a small JPEG data
// URL. Runs entirely client-side before the image ever reaches the server —
// keeps rows small in the temporary base64-in-Postgres storage (see
// drizzle/schema.ts creatorProfiles.avatarDataUrl) and keeps uploads fast on
// a creator's phone connection.
function resizeImageToDataUrl(file: File, maxDim = 640, quality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("Please choose an image file")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read that image"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) { reject(new Error("Your browser can't process images here")); return; }
        context.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

function RoomBooking() {
  const roomsQuery = trpc.rooms.listPublished.useQuery();
  const checkout = trpc.bookings.createCheckout.useMutation();
  const cryptoCheckout = trpc.bookings.createCryptoCheckout.useMutation();
  const [roomId, setRoomId] = useState<number | "">("");
  const [slotId, setSlotId] = useState<number | "">("");
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [boundaryAccepted, setBoundaryAccepted] = useState(false);
  const [duoCreatorId, setDuoCreatorId] = useState("");
  const [duoSplitPercent, setDuoSplitPercent] = useState("50");
  // Crypto checkout (Coinbase Commerce) is wired up server-side but held back
  // from the UI until a real processor account + API keys are in place. The
  // "crypto" branch of paymentMethod is unreachable for now — the toggle
  // button below is disabled — so this always resolves to card/Stripe.
  const [paymentMethod] = useState<"card" | "crypto">("card");
  const cryptoComingSoon = true;
  const selectedRoom = roomsQuery.data?.find(room => room.id === roomId);
  const roomDetail = trpc.rooms.get.useQuery({ roomId: typeof roomId === "number" ? roomId : 0 }, { enabled: typeof roomId === "number" });
  const activeCheckout = paymentMethod === "crypto" ? cryptoCheckout : checkout;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (typeof roomId !== "number" || typeof slotId !== "number" || !consentAccepted) return;
    const payload = { roomId, slotId, guestName, guestEmail, consentAccepted: true as const, duoCreatorId: duoCreatorId ? Number(duoCreatorId) : undefined, duoSplitPercent: Number(duoSplitPercent) };
    const mutation = paymentMethod === "crypto" ? cryptoCheckout : checkout;
    mutation.mutate(payload, { onSuccess: result => { if (result.checkoutUrl) window.open(result.checkoutUrl, "_blank", "noopener,noreferrer"); } });
  };

  return <section id="book-a-room" className="booking-section section-pad"><div className="section-label">PRIVATE ROOM OS <span>BOOK / LIVE</span></div><div className="booking-layout"><div><h2>Choose your<br /><span className="editorial-accent">private room.</span></h2><p className="booking-intro">Select a live format, choose a time, and arrive through a private link. No endless feed—just a room made for the moment.</p><div className="booking-note"><span className="live-dot" /> Secure checkout — card via Stripe. Crypto is coming soon.</div></div><form className="booking-form" onSubmit={submit}><label>Room<select value={roomId} onChange={event => { const value = event.target.value ? Number(event.target.value) : ""; setRoomId(value); setSlotId(""); }}><option value="">{roomsQuery.isLoading ? "Loading rooms…" : roomsQuery.data?.length ? "Select a room" : "No rooms published yet"}</option>{roomsQuery.data?.map(room => <option value={room.id} key={room.id}>{room.title} · {room.roomType === "avatar" ? "AI Avatar" : "Live Human"} · {room.durationMinutes} min · {(room.priceCents / 100).toFixed(2)} {room.currency}</option>)}</select></label><label>Time slot<select value={slotId} onChange={event => setSlotId(event.target.value ? Number(event.target.value) : "")} disabled={!selectedRoom || roomDetail.isLoading}><option value="">{roomDetail.isLoading ? "Loading times…" : "Select a time"}</option>{roomDetail.data?.slots.map(slot => <option value={slot.id} key={slot.id}>{new Date(slot.startsAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}</option>)}</select></label><div className="booking-fields"><label>Your name<input value={guestName} onChange={event => setGuestName(event.target.value)} required placeholder="Your name" /></label><label>Email<input type="email" value={guestEmail} onChange={event => setGuestEmail(event.target.value)} required placeholder="you@example.com" /></label></div><div className="booking-fields"><label>Co-host ID (optional)<input inputMode="numeric" value={duoCreatorId} onChange={event => setDuoCreatorId(event.target.value.replace(/\D/g, ""))} placeholder="Leave blank for solo" /></label><label>Co-host split %<input type="number" min="1" max="99" value={duoSplitPercent} onChange={event => setDuoSplitPercent(event.target.value)} disabled={!duoCreatorId} /></label></div><label>Pay with<div className="segmented" style={{ marginTop: 4 }}><button type="button" className="active">Card</button><button type="button" className="segmented-soon" disabled title="Crypto payments are coming soon">Crypto <span className="coming-soon-badge">Coming soon</span></button></div></label><label className="consent-check"><input type="checkbox" checked={consentAccepted} onChange={event => setConsentAccepted(event.target.checked)} required /><span>I agree to the applicable LensFlow creator and room terms.</span></label><label className="consent-check"><input type="checkbox" checked={boundaryAccepted} onChange={event => setBoundaryAccepted(event.target.checked)} required /><span>I understand this room follows creator-set boundaries and safety rules.</span></label><button className="button button-primary" type="submit" disabled={!selectedRoom || !slotId || !consentAccepted || !boundaryAccepted || activeCheckout.isPending}>{activeCheckout.isPending ? "Opening checkout…" : paymentMethod === "crypto" ? "Continue to crypto checkout" : "Continue to secure checkout"}<ArrowUpRight size={17} /></button>{activeCheckout.error && <p className="form-error">{activeCheckout.error.message}</p>}</form></div></section>;
}

// Public, front-page roster: minimum 8 boxes, always. Real creators (from
// trpc.creators.listFront — populated by whatever a creator has saved in
// their dashboard below) fill in first, live ones sorted first; anything
// short of 8 is padded with an empty "spot open" box rather than shrinking
// the grid, so the front page never looks thin.
function CreatorGrid() {
  const creatorsQuery = trpc.creators.listFront.useQuery({ limit: MIN_CREATOR_BOXES });
  const creators = creatorsQuery.data ?? [];
  const emptySlots = Math.max(0, MIN_CREATOR_BOXES - creators.length);

  return (
    <section id="creators" className="creators-section section-pad">
      <div className="section-label">MEET THE CREATORS <span>LIVE ROSTER</span></div>
      <div className="creators-heading"><h2>Real people.<br /><span className="editorial-accent">Live right now.</span></h2><p>Every box below is a real LensFlow creator, not a stock photo. The badge shows whether their room is open right now.</p></div>
      <div className="creators-grid">
        {creators.map(creator => <article className="creator-box" key={creator.id}><div className="creator-photo">{creator.avatarDataUrl ? <img src={creator.avatarDataUrl} alt={creator.displayName || "LensFlow creator"} /> : <div className="creator-photo-empty"><Video size={22} strokeWidth={1.5} /></div>}<span className={creator.isLive ? "creator-status live" : "creator-status off"}><i className="tiny-dot" />{creator.isLive ? "LIVE" : "OFF"}</span></div><div className="creator-name">{creator.displayName || "LensFlow creator"}</div></article>)}
        {Array.from({ length: emptySlots }).map((_, index) => <article className="creator-box creator-box-empty" key={`empty-${index}`}><div className="creator-photo creator-photo-empty"><Sparkles size={20} strokeWidth={1.5} /></div><div className="creator-name creator-name-muted">Creator spot open</div></article>)}
      </div>
      <a className="button button-outline" href="/login">Claim your spot <ArrowUpRight size={17} /></a>
    </section>
  );
}

function CreatorConsole() {
  const { isAuthenticated, user } = useAuth();
  const utils = trpc.useUtils();
  const rooms = trpc.rooms.mine.useQuery(undefined, { enabled: isAuthenticated });
  const ledger = trpc.bookings.ledger.useQuery(undefined, { enabled: isAuthenticated });
  const profile = trpc.creators.myProfile.useQuery(undefined, { enabled: isAuthenticated });
  const createRoom = trpc.rooms.create.useMutation({ onSuccess: () => rooms.refetch() });
  const logout = trpc.auth.logout.useMutation({ onSuccess: () => utils.auth.me.invalidate() });
  const upsertProfile = trpc.creators.upsertProfile.useMutation({ onSuccess: () => { profile.refetch(); utils.creators.listFront.invalidate(); } });
  const setLive = trpc.creators.setLive.useMutation({ onSuccess: () => { profile.refetch(); utils.creators.listFront.invalidate(); } });
  const [displayName, setDisplayName] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarError, setAvatarError] = useState("");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [payoutWalletAddress, setPayoutWalletAddress] = useState("");
  const [payoutWalletAsset, setPayoutWalletAsset] = useState("USDT-TRC20");
  useEffect(() => { if (profile.data) { setDisplayName(profile.data.displayName ?? ""); setAvatarPreview(profile.data.avatarDataUrl ?? null); setPayoutWalletAddress(profile.data.payoutWalletAddress ?? ""); setPayoutWalletAsset(profile.data.payoutWalletAsset ?? "USDT-TRC20"); } }, [profile.data]);
  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setAvatarError("");
    setAvatarUploading(true);
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setAvatarPreview(dataUrl);
      await upsertProfile.mutateAsync({ avatarDataUrl: dataUrl });
    } catch (error) {
      setAvatarError(error instanceof Error ? error.message : "Could not upload that photo");
    } finally {
      setAvatarUploading(false);
    }
  };
  const saveDisplayName = (event: React.FormEvent) => { event.preventDefault(); if (displayName.trim()) upsertProfile.mutate({ displayName: displayName.trim() }); };
  const saveWallet = (event: React.FormEvent) => { event.preventDefault(); if (payoutWalletAddress.trim().length >= 6) upsertProfile.mutate({ payoutWalletAddress: payoutWalletAddress.trim(), payoutWalletAsset: payoutWalletAsset as any }); };
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
  return <section id="creator-console" className="console-section section-pad"><div className="section-label">CREATOR DESK <span>PRIVATE ROOM OS</span></div><div className="console-layout"><div><h2>Set the room.<br /><span className="editorial-accent">Own the moment.</span></h2><p className="booking-intro">Create a live room and publish it to the booking flow. Add availability from your creator tools as you build the schedule.</p><a className="button button-outline" href="/studio"><Video size={16} /> Open Live Stage &amp; CGI studio</a><p className="studio-status" style={{ marginTop: 14 }}>Signed in as {user?.name || user?.email} · <button type="button" className="link-button" onClick={() => logout.mutate()}>Sign out</button></p><div className="console-avatar-row" style={{ marginTop: 24 }}><div className="console-avatar-preview">{avatarPreview ? <img src={avatarPreview} alt="Your front-page photo" /> : <Sparkles size={20} strokeWidth={1.5} />}</div><div><label className="upload-label" htmlFor="creator-avatar-input">{avatarUploading ? "Uploading…" : "Upload front-page photo"}</label><input id="creator-avatar-input" className="upload-input" type="file" accept="image/*" onChange={handleAvatarChange} disabled={avatarUploading} />{avatarError && <p className="form-error" style={{ marginTop: 8 }}>{avatarError}</p>}</div></div><form className="booking-fields" style={{ marginTop: 14, gridTemplateColumns: "1fr auto" }} onSubmit={saveDisplayName}><input value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Display name shown on the front page" maxLength={160} /><button className="button button-outline" disabled={upsertProfile.isPending}>{upsertProfile.isPending ? "Saving…" : "Save name"}</button></form><div className="console-live-toggle" style={{ marginTop: 14 }}><span><i className="tiny-dot" style={{ background: profile.data?.isLive ? "#e0454f" : "#655a64", boxShadow: "none", animation: "none" }} /> Front-page status: <b style={{ color: profile.data?.isLive ? "#ff9cbc" : "var(--soft)" }}>{profile.data?.isLive ? "LIVE" : "OFF"}</b></span><button type="button" className="button button-primary" onClick={() => setLive.mutate({ isLive: !profile.data?.isLive })} disabled={setLive.isPending}>{setLive.isPending ? "Updating…" : profile.data?.isLive ? "Go off-air" : "She's live"}</button></div><form className="booking-form slot-form" style={{ marginTop: 14 }} onSubmit={saveWallet}><div className="ledger-head"><span>PAYOUT WALLET</span><span>CRYPTO ONLY</span></div><div className="booking-fields"><label>Asset / network<select value={payoutWalletAsset} onChange={event => setPayoutWalletAsset(event.target.value)}><option value="USDT-TRC20">USDT · TRC-20</option><option value="USDT-ERC20">USDT · ERC-20</option><option value="USDC-ERC20">USDC · ERC-20</option><option value="USDC-SOL">USDC · Solana</option></select></label><label>Wallet address<input value={payoutWalletAddress} onChange={event => setPayoutWalletAddress(event.target.value.trim())} placeholder="Paste your wallet address" /></label></div><button className="button button-outline" disabled={upsertProfile.isPending || payoutWalletAddress.trim().length < 6}>{upsertProfile.isPending ? "Saving…" : "Save payout wallet"}</button><p className="mini-status">Where your show earnings get paid out — this only stores the address you give us, LensFlow doesn't move funds automatically yet.</p></form></div><div className="console-panel"><form className="booking-form" onSubmit={submit}><label>Room title<input value={title} onChange={event => setTitle(event.target.value)} required placeholder="The room after dark" /></label><label>Description<textarea value={description} onChange={event => setDescription(event.target.value)} required placeholder="What should guests expect?" /></label><div className="booking-fields"><label>Duration (min)<select value={duration} onChange={event => { setDuration(event.target.value); const suggested: Record<string, string> = { "5": "10", "10": "19.50", "20": "35", "40": "50" }; if (suggested[event.target.value]) setPrice(suggested[event.target.value]); }}><option value="5">5 · Spark (quick session)</option><option value="10">10 · Heat (most popular)</option><option value="20">20 · Peak (extended)</option><option value="40">40 · Marathon (full experience)</option></select></label><label>Price (AUD)<input type="number" min="0" step="0.01" value={price} onChange={event => setPrice(event.target.value)} required /></label></div><label>Room type<select value={roomType} onChange={event => setRoomType(event.target.value as "human" | "avatar")}><option value="human">Live human</option><option value="avatar">AI avatar</option></select></label><button className="button button-primary" disabled={createRoom.isPending}>{createRoom.isPending ? "Publishing…" : "Publish room"}<ArrowUpRight size={17} /></button></form><form className="booking-form slot-form" onSubmit={submitSlot}><div className="ledger-head"><span>ADD AVAILABILITY</span><span>UTC / LOCAL</span></div><label>Room<select value={slotRoomId} onChange={event => setSlotRoomId(event.target.value)} required><option value="">Select a room</option>{rooms.data?.map(room => <option value={room.id} key={room.id}>{room.title}</option>)}</select></label><div className="booking-fields"><label>Starts<input type="datetime-local" value={slotStart} onChange={event => setSlotStart(event.target.value)} required /></label><label>Ends<input type="datetime-local" value={slotEnd} onChange={event => setSlotEnd(event.target.value)} required /></label></div><button className="button button-outline" disabled={addSlot.isPending}>{addSlot.isPending ? "Adding…" : "Add open slot"}<ArrowUpRight size={17} /></button>{slotFormError && <p className="form-error">{slotFormError}</p>}</form><div className="ledger-preview"><div className="ledger-head"><span>YOUR ROOMS</span><span>{rooms.data?.length ?? 0}</span></div>{rooms.data?.slice(0, 3).map(room => <div className="ledger-row" key={room.id}><span>{room.title} · {room.durationMinutes}min · {room.roomType === "avatar" ? "AI Avatar" : "Live Human"}</span><b>{room.status}</b></div>)}<div className="ledger-head ledger-spaced"><span>SHOW LEDGER</span><span>{ledger.data?.length ?? 0}</span></div>{ledger.data?.slice(0, 3).map(item => <div className="ledger-row" key={item.id}><span>{item.status}{item.duoCreatorId ? ` · duo split ${item.duoSplitPercent}%` : ""}</span><b>{(item.creatorShareCents / 100).toFixed(2)} AUD</b></div>)}</div></div></div></section>;
}

export default function Home() {
  return (
    <main className="site-shell">
      <header className="nav-wrap">
        <a className="brand" href="#top" aria-label="LensFlow home"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>LensFlow</span></a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#creators">Creators</a><a href="/companions">Companions</a><a href="#how-it-works">How it works</a><a href="#your-share">Your share</a><a href="#book-a-room">Book a room</a><a href="#faq">FAQ</a>
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
          <div className="hero-image-frame" style={{ aspectRatio: "4/5" }}><img src={heroImage} alt="A LensFlow creator" style={{ objectPosition: "center top" }} /><div className="image-caption"><span>CREATOR PROFILE / 001</span><span>LIVE READY <i className="tiny-dot" /></span></div></div>
          <div className="share-badge"><span>Creator share</span><strong>81%</strong><small>of show revenue</small></div>
        </div>
      </section>

      <section className="ticker" aria-label="LensFlow benefits"><div>PRIVATE LIVE SHOWS</div><div>81% CREATOR SHARE</div><div>NO GUARANTEED EARNINGS</div><div>18+ ONLY</div></section>

      <CreatorGrid />

      <section id="your-share" className="share-section section-pad">
        <div className="section-label">THE DIFFERENCE <span>02 / 04</span></div>
        <div className="share-grid"><div><h2>Make your presence<br /><span className="editorial-accent">the product.</span></h2></div><div className="share-body"><p>LensFlow is for creators who want the live moment to feel direct, deliberate, and worth showing up for. No noisy feed. No vague promises. Just a private room, a real audience, and a clear split.</p><div className="split-line"><span><b>81%</b><small>Creator share</small></span><span className="split-separator">/</span><span><b>19%</b><small>LensFlow platform</small></span></div><p className="fine-print">Revenue share is subject to the applicable LensFlow creator terms. Earnings are not guaranteed.</p></div></div>
      </section>

      <section id="creator-terms" className="terms-section section-pad"><div className="section-label">BEFORE YOU APPLY <span>TERMS / 01</span></div><div className="terms-heading"><h2>Know the<br /><span className="editorial-accent">details.</span></h2><p>Clear expectations before you open your room. Review the current creator dashboard and applicable LensFlow terms before going live.</p></div><div className="terms-grid"><article className="term-card"><span className="term-index">01 / ELIGIBILITY</span><h3>18+ and ready to host</h3><p>Creators must be adults aged 18 or over, complete the LensFlow onboarding process, provide any required verification, and agree to the platform’s creator terms.</p></article><article className="term-card"><span className="term-index">02 / PAYOUT TIMING</span><h3>Check your dashboard</h3><p>Payout timing can depend on verification status, payment method, and the current processing schedule. Your Creator Dashboard is the source of truth for the latest payout information.</p><a href="#creator-console">View creator dashboard <ArrowUpRight size={15} /></a></article><article className="term-card"><span className="term-index">03 / CREATOR TERMS</span><h3>81% / 19% split</h3><p>Creators receive 81% of show revenue and LensFlow retains 19%. Earnings are not guaranteed; the applicable creator terms govern eligibility, conduct, payments, and platform use.</p><a href="/login">Review and apply <ArrowUpRight size={15} /></a></article></div><p className="terms-disclaimer">Information on this page is a summary for prospective creators, not a substitute for the current LensFlow creator agreement. Terms, eligibility, processing times, and availability may change.</p></section>

      <RoomBooking />

      <CreatorConsole />

      <section id="how-it-works" className="steps-section section-pad"><div className="section-label">THE FLOW <span>03 / 04</span></div><div className="steps-heading"><h2>Go live when<br /><span className="editorial-accent">you’re ready.</span></h2><p>A simpler path from first idea to your first private show.</p></div><div className="steps-list">{steps.map(({ number, title, body, icon: Icon }) => <article className="step-card" key={number}><div className="step-top"><span>{number}</span><Icon size={22} strokeWidth={1.5} /></div><h3>{title}</h3><p>{body}</p><a href="#creator-console">Explore step <ArrowUpRight size={15} /></a></article>)}</div></section>

      <section className="studio-section"><div className="studio-image"><img src={studioImage} alt="Cinematic LensFlow creator studio" /></div><div className="studio-copy"><div className="section-label">THE ROOM <span>04 / 04</span></div><h2>Build a room<br />people <span className="editorial-accent">remember.</span></h2><p>Lighting helps. A good microphone helps. But the thing that brings people back is the feeling that the room belongs to you.</p><a className="button button-outline" href="#creator-console">Open creator hub <ArrowUpRight size={17} /></a></div></section>

      <section className="detail-band section-pad"><div className="detail-copy"><span className="quote-mark">“</span><blockquote>The platform should get out of the way. Your voice is the reason people stay.</blockquote><span className="quote-credit">LENSFLOW / CREATOR PRINCIPLE</span></div><img src={detailImage} alt="A LensFlow creator, close up" /></section>

      <section id="faq" className="faq-section section-pad"><div className="section-label">STRAIGHT ANSWERS <span>FAQ</span></div><div className="faq-layout"><h2>Before you<br /><span className="editorial-accent">go live.</span></h2><div className="faq-list">{faqs.map(([q, a]) => <details key={q}><summary>{q}<ChevronDown size={18} /></summary><p>{a}</p></details>)}</div></div></section>

      <section className="final-cta section-pad"><div className="final-visual"><img src={roomImage} alt="A LensFlow creator" /><div className="final-overlay" /></div><div className="final-copy"><div className="eyebrow"><span className="live-dot" /> OPEN STUDIO</div><h2>There’s a room<br /><span className="editorial-accent">with your name on it.</span></h2><p>Bring your point of view. We’ll bring the private room, the tools, and a clear creator share.</p><a className="button button-primary" href="/login">Start your application <ArrowUpRight size={17} /></a></div></section>

      <footer className="footer"><div className="brand"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>LensFlow</span></div><p>Private live sessions. Cinematic rooms. Real voice.</p><div className="footer-right"><a href="#creator-console">Creator dashboard</a><a href="https://lensflow.com.au" target="_blank" rel="noreferrer">LensFlow.com.au</a><span><Instagram size={15} /> 18+ only</span></div></footer>
    </main>
  );
}
