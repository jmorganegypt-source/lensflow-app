// Design your own companion: a synthetic portrait (nobody real — see
// server/imageGen.ts) plus a personality and voice, private to the user.
import { useState } from "react";
import { ArrowUpRight, Trash2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

const HAIR_COLOR = ["blonde", "light brown", "dark brown", "black", "auburn", "red", "silver"];
const HAIR_LENGTH = ["short", "shoulder-length", "long"];
const STYLE = ["natural and relaxed", "polished and elegant", "playful and casual", "soft and romantic", "cool and understated"];
const AGE = ["in her early twenties", "in her late twenties", "in her thirties"];
const SETTING = ["cosy sunlit room", "modern apartment at dusk", "warm candlelit bedroom", "bright cafe", "quiet library", "beach house"];

const VOICES = [
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — soft, warm" },
  { id: "9BWtsMINqrJLrRacOk9x", label: "Aria — expressive" },
  { id: "Xb7hH8MSUJpSbSDYk0k2", label: "Alice — confident, British" },
  { id: "FGY2WhTYpPnrIDTdsKH5", label: "Laura — upbeat" },
  { id: "pFZP5JQG7iQjIQuC4Bku", label: "Lily — gentle" },
  { id: "XrExE9yKIg1WjnnlVkGX", label: "Matilda — mature, warm" },
  { id: "cgSgspJ2msm6clmCkdW9", label: "Jessica — friendly" },
  { id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte — relaxed" },
];

export default function CreateCompanion() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const subscription = trpc.companions.subscription.useQuery(undefined, { enabled: isAuthenticated });
  const mine = trpc.companions.myDesigned.useQuery(undefined, { enabled: isAuthenticated });
  const design = trpc.companions.designCompanion.useMutation();
  const del = trpc.companions.deleteDesigned.useMutation();
  const subscribe = trpc.companions.subscribe.useMutation();

  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [personality, setPersonality] = useState("");
  const [hairColor, setHairColor] = useState(HAIR_COLOR[0]);
  const [hairLength, setHairLength] = useState(HAIR_LENGTH[2]);
  const [style, setStyle] = useState(STYLE[0]);
  const [age, setAge] = useState(AGE[1]);
  const [setting, setSetting] = useState(SETTING[0]);
  const [extra, setExtra] = useState("");
  const [voiceId, setVoiceId] = useState(VOICES[0].id);

  const subActive = subscription.data?.active === true;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (design.isPending) return;
    const look = `${age}, ${hairColor} ${hairLength} hair, ${style}, in a ${setting}.${extra.trim() ? " " + extra.trim() : ""}`;
    design.mutate(
      { name, tagline: tagline || undefined, personality, look, voiceId },
      { onSuccess: ({ companionId }) => { window.location.href = `/companions/${companionId}`; } }
    );
  };

  if (authLoading) return null;

  return (
    <main className="site-shell">
      <header className="nav-wrap">
        <a className="brand" href="/companions" aria-label="LensFlow Companions"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>LensFlow</span></a>
        <nav className="nav-links" aria-label="Main navigation"><a href="/companions">Companions</a><a href="/creators">Live rooms</a></nav>
      </header>

      <section className="section-pad">
        <div className="section-label">DESIGN YOUR OWN <span>CUSTOM COMPANION</span></div>
        <h2 style={{ marginTop: 24 }}>Make her<br /><span className="editorial-accent">exactly right.</span></h2>
        <p className="booking-intro" style={{ marginTop: 18, maxWidth: 520 }}>
          Pick her look, her personality, and her voice. The face is generated from scratch — a fictional person, not based on anyone real. She's private to your account.
        </p>

        {!isAuthenticated ? (
          <button className="button button-primary" style={{ marginTop: 28 }} onClick={() => startLogin()}>Sign in to start <ArrowUpRight size={16} /></button>
        ) : !subActive ? (
          <div className="companion-paywall" style={{ marginTop: 28, maxWidth: 560 }}>
            <h3>Designing a companion needs a subscription</h3>
            <p>Same {subscription.data ? `${(subscription.data.priceCents / 100).toFixed(2)} ${subscription.data.currency.toUpperCase()}/week` : "A$8.99/week"} that unlocks chat, voice and video with everyone.</p>
            <button className="button button-primary" onClick={() => subscribe.mutate(undefined, { onSuccess: ({ checkoutUrl }) => { if (checkoutUrl) window.location.href = checkoutUrl; } })} disabled={subscribe.isPending}>
              {subscribe.isPending ? "Opening…" : "Subscribe"} <ArrowUpRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <form className="booking-form" style={{ maxWidth: 560, marginTop: 34 }} onSubmit={submit}>
              <label>Her name<input value={name} onChange={e => setName(e.target.value)} maxLength={40} required placeholder="e.g. Noor" /></label>
              <label>Tagline (optional)<input value={tagline} onChange={e => setTagline(e.target.value)} maxLength={60} placeholder="e.g. The one who gets it" /></label>
              <div className="booking-fields">
                <label>Hair colour<select value={hairColor} onChange={e => setHairColor(e.target.value)}>{HAIR_COLOR.map(o => <option key={o}>{o}</option>)}</select></label>
                <label>Hair length<select value={hairLength} onChange={e => setHairLength(e.target.value)}>{HAIR_LENGTH.map(o => <option key={o}>{o}</option>)}</select></label>
              </div>
              <div className="booking-fields">
                <label>Age<select value={age} onChange={e => setAge(e.target.value)}>{AGE.map(o => <option key={o}>{o}</option>)}</select></label>
                <label>Style<select value={style} onChange={e => setStyle(e.target.value)}>{STYLE.map(o => <option key={o}>{o}</option>)}</select></label>
              </div>
              <label>Setting<select value={setting} onChange={e => setSetting(e.target.value)}>{SETTING.map(o => <option key={o}>{o}</option>)}</select></label>
              <label>Anything else about her look (optional)<input value={extra} onChange={e => setExtra(e.target.value)} maxLength={200} placeholder="e.g. freckles, green eyes, a warm smile" /></label>
              <label>Personality<textarea value={personality} onChange={e => setPersonality(e.target.value)} minLength={10} maxLength={600} required placeholder="How does she talk? What's she like? What does she care about?" /></label>
              <label>Voice<select value={voiceId} onChange={e => setVoiceId(e.target.value)}>{VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
              <button className="button button-primary" type="submit" disabled={design.isPending}>
                {design.isPending ? "Creating her… (this takes ~30s)" : "Create companion"} <ArrowUpRight size={17} />
              </button>
              {design.error && <p className="form-error">{design.error.message}</p>}
            </form>

            {(mine.data?.length ?? 0) > 0 && (
              <div style={{ marginTop: 46, maxWidth: 560 }}>
                <div className="section-label">YOUR COMPANIONS <span>{mine.data?.length}/5</span></div>
                <div className="companions-grid" style={{ marginTop: 20 }}>
                  {mine.data?.map(c => (
                    <div className="companion-card" key={c.id} style={{ position: "relative" }}>
                      <a href={`/companions/${c.id}`} style={{ color: "inherit" }}>
                        <div className="companion-avatar">{c.avatarImageUrl ? <img src={c.avatarImageUrl} alt={c.name} /> : <span className="coming-soon-badge">·</span>}</div>
                        <div className="companion-info"><span className="companion-name">{c.name}</span>{c.tagline && <span className="companion-tagline">{c.tagline}</span>}</div>
                      </a>
                      <button type="button" className="voice-toggle" style={{ position: "absolute", top: 8, right: 8 }} onClick={() => del.mutate({ companionId: c.id }, { onSuccess: () => mine.refetch() })} disabled={del.isPending}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
