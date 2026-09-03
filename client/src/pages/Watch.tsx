// Fan-facing live playback. Renders whatever Mux playback ID a live show is
// using, with Mux Data analytics wired in via VITE_MUX_DATA_ENV_KEY.
//
// IMPORTANT — what this page can and can't do yet:
// A playback ID only exists once a Mux *live stream* has been created via the
// Mux Video API (Access Token ID + Secret Key from Mux Dashboard -> Access
// Tokens), and once the Studio page's camera feed is actually being pushed to
// Mux (e.g. over WHIP). Neither of those exist in this project yet — only the
// Mux Data environment key was provided, which is analytics-only. Until the
// Video API keys are added server-side and a real ingest path is wired from
// /studio, there is no live playback ID to watch — this page is the receiving
// end, ready for when that exists.
import { useState } from "react";
import MuxPlayer from "@mux/mux-player-react";
import { ArrowUpRight } from "lucide-react";

const MUX_DATA_ENV_KEY = import.meta.env.VITE_MUX_DATA_ENV_KEY as string | undefined;

export default function Watch() {
  const params = new URLSearchParams(window.location.search);
  const [playbackId, setPlaybackId] = useState(params.get("playbackId") ?? "");
  const [submitted, setSubmitted] = useState(params.get("playbackId") ?? "");

  return (
    <main className="site-shell">
      <section className="section-pad">
        <div className="section-label">LIVE <span>WATCH</span></div>
        <h2>Tune in.<br /><span className="editorial-accent">No feed, just the room.</span></h2>
        <p className="booking-intro">Paste a Mux playback ID to preview what a fan sees. Once real live streams exist, a booking would land here automatically via a private link.</p>

        <form className="booking-form" style={{ maxWidth: 480, marginTop: 30 }} onSubmit={event => { event.preventDefault(); setSubmitted(playbackId.trim()); }}>
          <label>Playback ID<input value={playbackId} onChange={event => setPlaybackId(event.target.value)} placeholder="e.g. EcHgOK9coz5K4rjSwOkoE7Y7O01201YMIC200RI6lNxnhs" /></label>
          <button className="button button-primary" type="submit">Load stream <ArrowUpRight size={15} /></button>
        </form>

        {submitted ? (
          <div style={{ marginTop: 34, maxWidth: 900, border: "1px solid var(--line)" }}>
            <MuxPlayer playbackId={submitted} envKey={MUX_DATA_ENV_KEY} streamType="live" accentColor="#f15aa8" metadata={{ video_title: "LensFlow live room" }} style={{ width: "100%", aspectRatio: "16/9" }} />
          </div>
        ) : (
          <p className="studio-status" style={{ marginTop: 24 }}>No playback ID loaded yet — there's no live stream to show until one exists on Mux.</p>
        )}

        {!MUX_DATA_ENV_KEY && <p className="form-error" style={{ marginTop: 16 }}>VITE_MUX_DATA_ENV_KEY is not set — add it to your environment variables to enable Mux Data analytics on this player.</p>}
      </section>
    </main>
  );
}
