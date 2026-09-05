import { useEffect, useRef, useState } from "react";
import { useParams } from "wouter";
import { ArrowUpRight, Volume2 } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

type ChatBubble = { id: number; role: string; content: string };

export default function CompanionChat() {
  const { id } = useParams<{ id: string }>();
  const companionId = Number(id);
  const { isAuthenticated, loading: authLoading } = useAuth();
  const messagesQuery = trpc.companions.getMessages.useQuery({ companionId }, { enabled: isAuthenticated && Number.isFinite(companionId) });
  const sendMessage = trpc.companions.sendMessage.useMutation();
  const speak = trpc.companions.speak.useMutation();
  const [playingId, setPlayingId] = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [draft, setDraft] = useState("");
  // Optimistic local echo of the in-flight exchange — cleared once the
  // refetch below brings back the real, persisted messages.
  const [pending, setPending] = useState<ChatBubble[]>([]);
  const threadRef = useRef<HTMLDivElement>(null);

  const messages: ChatBubble[] = [...(messagesQuery.data?.messages ?? []), ...pending];

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || sendMessage.isPending) return;
    setDraft("");
    setPending(current => [...current, { id: -Date.now(), role: "user", content: text }]);
    sendMessage.mutate(
      { companionId, content: text },
      {
        onSuccess: reply => {
          setPending(current => [...current, { id: -Date.now() - 1, role: "companion", content: reply }]);
          messagesQuery.refetch().then(() => setPending([]));
        },
        onError: () => setPending(current => current.slice(0, -1)),
      }
    );
  };

  const playVoice = (bubble: ChatBubble) => {
    if (playingId === bubble.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    setPlayingId(bubble.id);
    speak.mutate(
      { companionId, text: bubble.content },
      {
        onSuccess: ({ audioDataUrl }) => {
          const audio = new Audio(audioDataUrl);
          audioRef.current = audio;
          audio.onended = () => setPlayingId(null);
          audio.play().catch(() => setPlayingId(null));
        },
        onError: () => setPlayingId(null),
      }
    );
  };

  if (authLoading) return null;

  if (!isAuthenticated) {
    return (
      <main className="site-shell">
        <section className="section-pad">
          <div className="section-label">COMPANION CHAT <span>SIGN IN</span></div>
          <h2 style={{ marginTop: 24 }}>Sign in to<br /><span className="editorial-accent">keep talking.</span></h2>
          <p className="booking-intro" style={{ marginTop: 18 }}>Your companion remembers you across visits — that only works once you're signed in.</p>
          <button className="button button-primary" style={{ marginTop: 24 }} onClick={() => startLogin()}>Sign in <ArrowUpRight size={17} /></button>
        </section>
      </main>
    );
  }

  const companion = messagesQuery.data?.companion;

  return (
    <main className="site-shell">
      <header className="nav-wrap">
        <a className="brand" href="/companions" aria-label="Back to companions"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>{companion?.name ?? "Companion"}</span></a>
      </header>
      <section className="section-pad">
        {messagesQuery.isLoading && <p className="studio-status">Loading conversation…</p>}
        {messagesQuery.isError && <p className="form-error">Couldn't load this companion. It may not be available to you.</p>}
        {companion && (
          <div className="chat-shell">
            <div className="section-label">{companion.name} <span>{companion.tagline}</span></div>
            <div className="chat-thread" ref={threadRef}>
              {messages.length === 0 && <p className="studio-status">Say hello to {companion.name} to start.</p>}
              {messages.map(message => (
                <div className={`chat-bubble chat-bubble-${message.role}`} key={message.id}>
                  {message.content}
                  {message.role === "companion" && companion.elevenlabsVoiceId && (
                    <button type="button" className={`voice-toggle${playingId === message.id ? " playing" : ""}`} style={{ marginTop: 8, display: "flex" }} onClick={() => playVoice(message)} disabled={speak.isPending && playingId !== message.id}>
                      <Volume2 size={13} /> {playingId === message.id ? "Playing…" : "Play voice"}
                    </button>
                  )}
                </div>
              ))}
              {sendMessage.isPending && <div className="chat-bubble chat-bubble-companion chat-bubble-typing">…</div>}
            </div>
            <form className="chat-input-row" onSubmit={submit}>
              <input value={draft} onChange={event => setDraft(event.target.value)} placeholder={`Message ${companion.name}…`} maxLength={4000} />
              <button className="button button-primary" type="submit" disabled={!draft.trim() || sendMessage.isPending}>Send</button>
            </form>
            {sendMessage.error && <p className="form-error">{sendMessage.error.message}</p>}
          </div>
        )}
      </section>
    </main>
  );
}
