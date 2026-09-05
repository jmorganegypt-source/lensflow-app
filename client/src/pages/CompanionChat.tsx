import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { ArrowUpRight, Video, VideoOff, Volume2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

type ChatBubble = { id: number; role: string; content: string };
const ANAM_VIDEO_ID = "companion-anam-video";

const STARTERS = ["Hey — how's your day been?", "Tell me something about yourself.", "I've had a long one. Talk to me.", "What are you into?"];

export default function CompanionChat() {
  const { id } = useParams<{ id: string }>();
  const companionId = Number(id);
  const { isAuthenticated, loading: authLoading } = useAuth();
  // Public — so the companion's face/name/blurb show even before sign-in.
  const companionInfo = trpc.companions.get.useQuery({ companionId }, { enabled: Number.isFinite(companionId) });
  const messagesQuery = trpc.companions.getMessages.useQuery({ companionId }, { enabled: isAuthenticated && Number.isFinite(companionId) });
  const subscription = trpc.companions.subscription.useQuery(undefined, { enabled: isAuthenticated });
  const subscribe = trpc.companions.subscribe.useMutation();
  const sendMessage = trpc.companions.sendMessage.useMutation();
  const speak = trpc.companions.speak.useMutation();
  const startVideo = trpc.companions.startVideoSession.useMutation();
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<ChatBubble[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  const [videoToken, setVideoToken] = useState<string | null>(null);
  const [videoError, setVideoError] = useState("");
  const anamClientRef = useRef<any>(null);

  const messages: ChatBubble[] = [...(messagesQuery.data?.messages ?? []), ...pending];
  const subActive = subscription.data?.active === true;
  // Display info: the chat payload if we have it, else the public query.
  const companion = messagesQuery.data?.companion ?? companionInfo.data;

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.get("sub")) return;
    window.history.replaceState({}, "", window.location.pathname);
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      subscription.refetch();
      if (tries >= 6) clearInterval(timer);
    }, 2500);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToCheckout = () => subscribe.mutate(undefined, { onSuccess: ({ checkoutUrl }) => { if (checkoutUrl) window.location.href = checkoutUrl; } });

  const priceLabel = subscription.data
    ? `${(subscription.data.priceCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${subscription.data.currency.toUpperCase()}/week`
    : "A$8.99/week";

  useEffect(() => {
    if (!videoToken) return;
    let cancelled = false;
    (async () => {
      try {
        const { createClient } = await import("@anam-ai/js-sdk");
        if (cancelled) return;
        const client = createClient(videoToken);
        anamClientRef.current = client;
        await client.streamToVideoElement(ANAM_VIDEO_ID);
      } catch (error: any) {
        if (!cancelled) setVideoError(error?.message ?? "Couldn't start the video stream.");
        setVideoToken(null);
      }
    })();
    return () => {
      cancelled = true;
      try {
        anamClientRef.current?.stopStreaming?.();
      } catch {
        /* already torn down */
      }
      anamClientRef.current = null;
    };
  }, [videoToken]);

  const startVideoMode = () => {
    setVideoError("");
    startVideo.mutate({ companionId }, {
      onSuccess: ({ sessionToken }) => setVideoToken(sessionToken),
      onError: error => setVideoError(error.message),
    });
  };

  const send = (text: string) => {
    if (!text.trim() || sendMessage.isPending || !subActive) return;
    setDraft("");
    setPending(current => [...current, { id: -Date.now(), role: "user", content: text }]);
    sendMessage.mutate({ companionId, content: text }, {
      onSuccess: reply => {
        setPending(current => [...current, { id: -Date.now() - 1, role: "companion", content: reply }]);
        messagesQuery.refetch().then(() => setPending([]));
        const client = anamClientRef.current;
        if (client) {
          try {
            const stream = client.createTalkMessageStream();
            stream.streamMessageChunk(reply, true);
          } catch {
            /* stream not ready — text reply still shows */
          }
        }
      },
      onError: () => setPending(current => current.slice(0, -1)),
    });
  };

  const playVoice = (bubble: ChatBubble) => {
    if (playingId === bubble.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    setPlayingId(bubble.id);
    speak.mutate({ companionId, text: bubble.content }, {
      onSuccess: ({ audioDataUrl }) => {
        const audio = new Audio(audioDataUrl);
        audioRef.current = audio;
        audio.onended = () => setPlayingId(null);
        audio.play().catch(() => setPlayingId(null));
      },
      onError: () => setPlayingId(null),
    });
  };

  if (authLoading) return null;

  const CompanionHead = () => (
    <div className="companion-head">
      <div className="companion-head-photo">
        {companion?.avatarImageUrl ? <img src={companion.avatarImageUrl} alt={companion.name} /> : <span className="coming-soon-badge">·</span>}
      </div>
      <div className="companion-head-meta">
        <span className="eyebrow" style={{ color: "var(--magenta)" }}>{companion?.tagline ?? "Companion"}</span>
        <h1>{companion?.name ?? "Companion"}</h1>
        {companion?.personality && <p>{companion.personality}</p>}
      </div>
    </div>
  );

  if (!isAuthenticated) {
    return (
      <main className="site-shell">
        <header className="nav-wrap">
          <a className="brand" href="/companions" aria-label="Back to companions"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>LensFlow</span></a>
        </header>
        <section className="section-pad">
          <div className="chat-shell">
            <CompanionHead />
            <div className="companion-paywall">
              <h3>Sign in to talk to {companion?.name ?? "your companion"}</h3>
              <p>She remembers you across visits — that only works with an account. Then {priceLabel} for unlimited chat, voice and video with every companion.</p>
              <button className="button button-primary" onClick={() => startLogin()}>Sign in or create an account <ArrowUpRight size={16} /></button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  const videoLive = !!videoToken;

  return (
    <main className="site-shell">
      <header className="nav-wrap">
        <a className="brand" href="/companions" aria-label="Back to companions"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>{companion?.name ?? "Companion"}</span></a>
      </header>
      <section className="section-pad">
        {messagesQuery.isError && <p className="form-error">Couldn't load this companion. It may not be available to you.</p>}
        <div className="chat-shell">
          <CompanionHead />

          {companion && (companion as any).anamAvatarId && (companion as any).anamVoiceId && subActive && (
            <div className="companion-video">
              <video id={ANAM_VIDEO_ID} autoPlay playsInline hidden={!videoLive} />
              <div className="companion-video-controls">
                {!videoLive ? (
                  <button type="button" className="voice-toggle" onClick={startVideoMode} disabled={startVideo.isPending}>
                    <Video size={13} /> {startVideo.isPending ? "Starting…" : "Start video"}
                  </button>
                ) : (
                  <button type="button" className="voice-toggle playing" onClick={() => setVideoToken(null)}>
                    <VideoOff size={13} /> End video
                  </button>
                )}
                {videoLive && <span className="studio-status">{companion.name} will speak each reply.</span>}
              </div>
              {(videoError || startVideo.error) && <p className="form-error" style={{ marginTop: 6 }}>{videoError || startVideo.error?.message}</p>}
            </div>
          )}

          <div className="chat-thread" ref={threadRef}>
            {messagesQuery.isLoading && <p className="studio-status">Loading conversation…</p>}
            {!messagesQuery.isLoading && messages.length === 0 && (
              <div className="chat-empty">
                <p>Say hi to {companion?.name}. She'll remember it next time.</p>
                {subActive && (
                  <div className="starter-chips">
                    {STARTERS.map(s => <button key={s} type="button" className="voice-toggle" onClick={() => send(s)}>{s}</button>)}
                  </div>
                )}
              </div>
            )}
            {messages.map(message => (
              <div className={`chat-bubble chat-bubble-${message.role}`} key={message.id}>
                {message.content}
                {message.role === "companion" && companion && (companion as any).elevenlabsVoiceId && (
                  <button type="button" className={`voice-toggle${playingId === message.id ? " playing" : ""}`} style={{ marginTop: 8, display: "flex" }} onClick={() => playVoice(message)} disabled={speak.isPending && playingId !== message.id}>
                    <Volume2 size={13} /> {playingId === message.id ? "Playing…" : "Play voice"}
                  </button>
                )}
              </div>
            ))}
            {sendMessage.isPending && <div className="chat-bubble chat-bubble-companion chat-bubble-typing">…</div>}
          </div>

          {subscription.isLoading ? (
            <p className="studio-status">Checking your subscription…</p>
          ) : subActive ? (
            <>
              <form className="chat-input-row" onSubmit={e => { e.preventDefault(); send(draft); }}>
                <input value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Message ${companion?.name ?? "her"}…`} maxLength={4000} />
                <button className="button button-primary" type="submit" disabled={!draft.trim() || sendMessage.isPending}>Send</button>
              </form>
              {sendMessage.error && <p className="form-error">{sendMessage.error.message}</p>}
            </>
          ) : (
            <div className="companion-paywall">
              <h3>Chat with {companion?.name} and every other companion</h3>
              <p>Unlimited chat, voice, and video with every LensFlow companion — she remembers you between visits.</p>
              <button className="button button-primary" onClick={goToCheckout} disabled={subscribe.isPending}>
                {subscribe.isPending ? "Opening checkout…" : `Subscribe — ${priceLabel}`} <ArrowUpRight size={16} />
              </button>
              {subscribe.error && <p className="form-error">{subscribe.error.message}</p>}
              <p className="fine-print" style={{ marginTop: 4 }}>Billed weekly, cancel anytime. Secure checkout by Stripe.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
