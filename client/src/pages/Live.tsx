// Fan-facing live viewing — the real receiving end for a creator's /studio
// broadcast, over LiveKit (WebRTC). Join with a room link/name, and this
// subscribes to whatever the creator is publishing and renders it. The
// token this page gets is issued with canPublish: false — enforced by
// LiveKit server-side, so this page genuinely cannot publish even if the
// code below tried to.
//
// This only works once a creator has actually pressed "Go Live" on /studio
// with LiveKit credentials configured server-side (LIVEKIT_URL,
// LIVEKIT_API_KEY, LIVEKIT_API_SECRET) — otherwise there's nothing to
// subscribe to and this page will just say so.
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Volume2, VolumeX } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Live() {
  const params = new URLSearchParams(window.location.search);
  const [roomName, setRoomName] = useState(params.get("room") ?? "");
  const [guestName, setGuestName] = useState("");
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("Paste the room link your creator shared, then join.");
  const [muted, setMuted] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<any>(null);

  const viewerToken = trpc.live.viewerToken.useMutation();
  const roomStatus = trpc.live.status.useQuery({ roomName }, { enabled: roomName.trim().length > 0 && !connected, refetchInterval: 8000 });

  const attach = (track: any) => {
    if (!stageRef.current) return;
    if (track.kind !== "video" && track.kind !== "audio") return;
    const el = track.attach();
    if (track.kind === "audio") (el as HTMLMediaElement).muted = muted;
    if (track.kind === "video") { el.style.width = "100%"; el.style.height = "100%"; el.style.objectFit = "cover"; }
    stageRef.current.appendChild(el);
  };

  const detach = (track: any) => {
    track.detach?.().forEach((el: HTMLMediaElement) => el.remove());
  };

  const join = async () => {
    const trimmed = roomName.trim();
    if (!trimmed) return;
    setStatus("Connecting…");
    try {
      const { token, wsUrl } = await viewerToken.mutateAsync({ roomName: trimmed, guestName: guestName || undefined });
      const { Room, RoomEvent } = await import("livekit-client");
      const room = new Room();
      room.on(RoomEvent.TrackSubscribed, (track: any) => { attach(track); setStatus("Connected."); });
      room.on(RoomEvent.TrackUnsubscribed, (track: any) => detach(track));
      room.on(RoomEvent.Disconnected, () => {
        setConnected(false);
        setStatus("Disconnected from the room.");
        if (stageRef.current) stageRef.current.innerHTML = "";
      });
      await room.connect(wsUrl, token);
      roomRef.current = room;
      setConnected(true);
      setStatus("Connected — waiting for the creator's feed…");
      // Pick up anything already published before we joined.
      room.remoteParticipants.forEach((participant: any) => {
        participant.trackPublications.forEach((publication: any) => { if (publication.track) attach(publication.track); });
      });
    } catch (error) {
      console.error("[Live] Failed to join room", error);
      setConnected(false);
      setStatus("Couldn't connect — the room may not be live yet, or the link is wrong.");
    }
  };

  const leave = () => {
    roomRef.current?.disconnect();
    roomRef.current = null;
    if (stageRef.current) stageRef.current.innerHTML = "";
    setConnected(false);
    setStatus("Left the room.");
  };

  useEffect(() => () => { roomRef.current?.disconnect(); }, []);

  useEffect(() => {
    if (!stageRef.current) return;
    stageRef.current.querySelectorAll("audio").forEach(el => { (el as HTMLMediaElement).muted = muted; });
  }, [muted]);

  const isLive = roomStatus.data?.exists === true;

  return (
    <main className="site-shell">
      <section className="section-pad">
        <div className="section-label">LIVE <span>WATCH</span></div>
        <h2>Tune in.<br /><span className="editorial-accent">Real-time, straight from their browser.</span></h2>
        <p className="booking-intro">This connects directly to the creator's live camera feed over WebRTC (LiveKit) — no delay, no recording, just the room.</p>

        {!connected ? (
          <form className="booking-form" style={{ maxWidth: 480, marginTop: 30 }} onSubmit={event => { event.preventDefault(); join(); }}>
            <label>Room link or name<input value={roomName} onChange={event => setRoomName(event.target.value)} placeholder="lensflow-creator-12" /></label>
            <label>Your name (optional)<input value={guestName} onChange={event => setGuestName(event.target.value)} placeholder="Fan name shown to no one but you" /></label>
            <button className="button button-primary" type="submit" disabled={!roomName.trim() || viewerToken.isPending}>
              {viewerToken.isPending ? "Connecting…" : "Join room"} <ArrowUpRight size={15} />
            </button>
            {roomName.trim() && !roomStatus.isLoading && (
              <p className="studio-status">{isLive ? "This room looks live right now." : "This room isn't live yet — you can still try to join once your creator starts."}</p>
            )}
          </form>
        ) : (
          <div style={{ marginTop: 34, maxWidth: 900 }}>
            <div ref={stageRef} style={{ width: "100%", aspectRatio: "16/9", background: "#0a0a0f", border: "1px solid var(--line)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              <span className="studio-status">{status}</span>
            </div>
            <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
              <button className="button button-outline" onClick={() => setMuted(current => !current)}>{muted ? <VolumeX size={16} /> : <Volume2 size={16} />} {muted ? "Unmute" : "Mute"}</button>
              <button className="button button-outline" onClick={leave}>Leave room</button>
            </div>
          </div>
        )}
        <p className="studio-status" style={{ marginTop: 16 }}>{status}</p>
      </section>
    </main>
  );
}
