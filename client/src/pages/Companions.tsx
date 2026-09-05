// The companion product's front door: a proper landing page (hero, why,
// how, FAQ) wrapped around the picker grid. Structure adapted from the
// marketing mockups; every CTA points at the real working product.
import { ArrowUpRight, BrainCircuit, ChevronDown, Mic2, ShieldCheck, Sparkles } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

const whyCards = [
  {
    icon: BrainCircuit,
    title: "She remembers you",
    body: "Your last conversation, your stories, what matters to you. Close the app, come back tomorrow — she picks up where you left off. Not a chatbot that resets.",
  },
  {
    icon: Mic2,
    title: "Voice and video, not just text",
    body: "Hear her voice. Watch her react as you talk — a real face, real expression, in real time.",
  },
  {
    icon: Sparkles,
    title: "A personality that's actually hers",
    body: "Eight companions, each with her own voice, mood, and way of caring. Find the one that clicks.",
  },
  {
    icon: ShieldCheck,
    title: "Built by real people",
    body: "Every companion traces back to a real, consenting creator — never a stranger's photo. That's a promise, and here it's the law.",
  },
];

const steps = [
  { n: "01", title: "Take a selfie", body: "Verified live, in the moment — so the companion is provably you and nobody else." },
  { n: "02", title: "Pick a voice", body: "Choose how she sounds. You can change it later." },
  { n: "03", title: "Start talking", body: "She's yours, private to your account, and she remembers every conversation." },
];

const faqs: [string, string][] = [
  ["What is a LensFlow Companion?", "An AI you talk to by text, voice, or video. Each one has a consistent personality and remembers you between visits — your mood, your stories, the things you've told her before."],
  ["How does the memory work?", "Every conversation adds to what she knows about you. It's folded into a running summary so she stays current without ever forgetting the important things."],
  ["Can I make my own companion?", "Yes — from a live, verified selfie of yourself. You cannot upload a photo of someone else; a companion built from a face that isn't yours or a consenting creator's is not allowed, and in Australia it's a criminal offence."],
  ["What does it cost?", "A$8.99 per week for unlimited chat, voice, and video with every companion. Browsing is free, and you can cancel anytime."],
  ["Is my data private?", "Your conversations are tied to your account and used only to give your companion memory. They aren't shared with other users."],
];

export default function Companions() {
  const { isAuthenticated } = useAuth();
  const companionsQuery = trpc.companions.listCurated.useQuery();
  const subscription = trpc.companions.subscription.useQuery(undefined, { enabled: isAuthenticated });
  const subscribe = trpc.companions.subscribe.useMutation();
  const manageBilling = trpc.companions.manageBilling.useMutation();

  const price = subscription.data
    ? `${(subscription.data.priceCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${subscription.data.currency.toUpperCase()}/week`
    : "A$8.99/week";
  const startCheckout = () => subscribe.mutate(undefined, { onSuccess: ({ checkoutUrl }) => { if (checkoutUrl) window.location.href = checkoutUrl; } });

  return (
    <main className="site-shell">
      <header className="nav-wrap">
        <a className="brand" href="/companions" aria-label="LensFlow Companions"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>LensFlow</span></a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="#companions">Companions</a><a href="#how">Your own</a><a href="#faq">FAQ</a><a href="/creators">Live rooms</a>
        </nav>
        {!isAuthenticated && <a className="nav-cta" href="/login">Sign in <ArrowUpRight size={15} /></a>}
      </header>

      <section className="hero section-pad" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="live-dot" /> LensFlow Companions <span className="eyebrow-rule" /> 2026</div>
          <h1>A companion<br /><span className="editorial-accent">who knows you.</span></h1>
          <p className="hero-lede">Talk to someone who actually remembers — your mood, your stories, your world. She listens, learns, and grows with you. By text, by voice, face to face.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#companions">Meet your companion <ArrowUpRight size={17} /></a>
            <a className="text-link" href="#how"><Sparkles size={17} /> Or build one that's you</a>
          </div>
          <div className="hero-notes"><span><ShieldCheck size={15} /> Adults only</span><span><Sparkles size={15} /> {price} · cancel anytime</span></div>
        </div>
        <div className="hero-visual">
          <div className="hero-image-frame">
            {companionsQuery.data?.[0]?.avatarImageUrl
              ? <img src={companionsQuery.data[0].avatarImageUrl} alt={companionsQuery.data[0].name} />
              : <div className="creator-photo-empty" style={{ aspectRatio: "1.75/1" }}>Loading…</div>}
            <div className="image-caption"><span>COMPANION / {companionsQuery.data?.[0]?.name?.toUpperCase() ?? "001"}</span><span>LIVE MEMORY <i className="tiny-dot" /></span></div>
          </div>
        </div>
      </section>

      <section className="ticker" aria-label="What makes it different"><div>PERSISTENT MEMORY</div><div>REAL VOICE &amp; VIDEO</div><div>NEVER A STRANGER'S PHOTO</div><div>18+ ONLY</div></section>

      <section className="section-pad" id="companions">
        <div className="section-label">THE ROSTER <span>PICK ONE</span></div>
        <h2 style={{ marginTop: 24 }}>Eight companions.<br /><span className="editorial-accent">Find your match.</span></h2>
        <p className="booking-intro" style={{ marginTop: 18 }}>Each has a distinct voice, personality, and way of caring. Browsing is free — pick one to start.</p>

        {isAuthenticated && subscription.data && (
          subscription.data.active ? (
            <div className="companion-subbar">
              <span>Subscription active{subscription.data.currentPeriodEnd ? ` · renews ${new Date(subscription.data.currentPeriodEnd).toLocaleDateString()}` : ""}</span>
              {subscription.data.canManageBilling && (
                <button className="button button-outline" onClick={() => manageBilling.mutate(undefined, { onSuccess: ({ url }) => { if (url) window.location.href = url; } })} disabled={manageBilling.isPending}>Manage billing</button>
              )}
            </div>
          ) : (
            <div className="companion-subbar">
              <span>Unlimited chat, voice, and video with every companion — {price}, cancel anytime.</span>
              <button className="button button-primary" onClick={startCheckout} disabled={subscribe.isPending}>{subscribe.isPending ? "Opening…" : "Subscribe"}</button>
            </div>
          )
        )}

        <div className="companions-grid" style={{ marginTop: 46 }}>
          {companionsQuery.isLoading && <p className="studio-status">Loading companions…</p>}
          {companionsQuery.isError && <p className="form-error">Couldn't load companions right now.</p>}
          {companionsQuery.data?.map(companion => (
            <a className="companion-card" href={`/companions/${companion.id}`} key={companion.id}>
              <div className="companion-avatar">
                {companion.avatarImageUrl
                  ? <img src={companion.avatarImageUrl} alt={companion.name} />
                  : <span className="coming-soon-badge">Art coming soon</span>}
              </div>
              <div className="companion-info">
                <span className="companion-name">{companion.name}</span>
                {companion.tagline && <span className="companion-tagline">{companion.tagline}</span>}
              </div>
            </a>
          ))}
        </div>
      </section>

      <section className="steps-section section-pad">
        <div className="section-label">WHY LENSFLOW <span>THE DIFFERENCE</span></div>
        <div className="steps-heading"><h2>Not just a<br /><span className="editorial-accent">chatbot.</span></h2><p>Four things most AI companion apps get wrong — and we don't.</p></div>
        <div className="steps-list">
          {whyCards.map(({ icon: Icon, title, body }) => (
            <article className="step-card" key={title}>
              <div className="step-top"><Icon size={22} strokeWidth={1.5} /></div>
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="terms-section section-pad" id="how">
        <div className="section-label">MAKE YOUR OWN <span>SELF-AVATAR</span></div>
        <div className="terms-heading">
          <h2>A companion<br /><span className="editorial-accent">that's you.</span></h2>
          <p>Build one from a live, verified selfie — your face, your voice, private to your account. You can't use anyone else's photo: that's the line, and it's what keeps this legal.</p>
        </div>
        <div className="terms-grid">
          {steps.map(step => (
            <article className="term-card" key={step.n}>
              <span className="term-index">{step.n}</span>
              <h3>{step.title}</h3>
              <p>{step.body}</p>
            </article>
          ))}
        </div>
        <p className="terms-disclaimer">Self-avatar creation is gated behind live liveness verification. Uploading a photo of another person — an ex, a public figure, anyone — is prohibited and, in Australia, a criminal offence as of February 2026.</p>
      </section>

      <section className="faq-section section-pad" id="faq">
        <div className="section-label">STRAIGHT ANSWERS <span>FAQ</span></div>
        <div className="faq-layout">
          <h2>Before you<br /><span className="editorial-accent">say hello.</span></h2>
          <div className="faq-list">
            {faqs.map(([q, a]) => (
              <details key={q}><summary>{q}<ChevronDown size={18} /></summary><p>{a}</p></details>
            ))}
          </div>
        </div>
      </section>

      <section className="final-cta section-pad">
        <div className="final-copy">
          <div className="eyebrow"><span className="live-dot" /> ONE TAP AWAY</div>
          <h2>Your companion<br /><span className="editorial-accent">is waiting.</span></h2>
          <p>Browsing is free. {price} for unlimited chat, voice, and video with all eight — cancel whenever.</p>
          <a className="button button-primary" href="#companions">Meet your companion <ArrowUpRight size={17} /></a>
        </div>
      </section>

      <footer className="footer">
        <div className="brand"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>LensFlow</span></div>
        <p>AI companions with memory. Real voice, real face. 18+ only.</p>
        <div className="footer-right">
          <a href="/creators">For creators</a>
          <a href="#faq">FAQ</a>
        </div>
      </footer>
    </main>
  );
}
