// Server-side Mux Video integration. This is the only place the Mux Video
// secret credentials are used — never expose MUX_TOKEN_SECRET to the client.
//
// Ingest reality check (verified against Mux's current docs): Mux only
// accepts RTMP or SRT for publishing a live stream — there is no WHIP /
// direct WebRTC ingest today. That means a creator's browser (the /studio
// page) cannot push straight to Mux. The two real options are:
//   1. The creator uses broadcast software (OBS, etc.) pointed at the
//      returned RTMP URL + stream key — works today, zero extra
//      infrastructure, most live platforms actually recommend this path.
//   2. Build a relay server that receives the browser's WebRTC feed and
//      re-publishes it to Mux over RTMP (e.g. via an ffmpeg process) — a
//      real, separate infrastructure project, not implemented here.
import Mux from "@mux/mux-node";
import { ENV } from "./_core/env";

let _mux: Mux | null = null;

function getMux(): Mux {
  if (!ENV.muxTokenId || !ENV.muxTokenSecret) throw new Error("Mux Video is not configured — set MUX_TOKEN_ID and MUX_TOKEN_SECRET");
  if (!_mux) _mux = new Mux({ tokenId: ENV.muxTokenId, tokenSecret: ENV.muxTokenSecret });
  return _mux;
}

export async function createLiveStream(input: { title?: string } = {}) {
  const mux = getMux();
  const stream = await mux.video.liveStreams.create({
    playback_policy: ["public"],
    reconnect_window: 60,
    latency_mode: "low",
    new_asset_settings: { playback_policy: ["public"] },
    ...(input.title ? { meta: { title: input.title } } : {}),
  });
  const playbackId = stream.playback_ids?.[0]?.id;
  return {
    liveStreamId: stream.id!,
    streamKey: stream.stream_key!,
    playbackId,
    rtmpUrl: "rtmps://global-live.mux.com:443/app",
    playbackUrl: playbackId ? `https://stream.mux.com/${playbackId}.m3u8` : undefined,
    status: stream.status,
  };
}

export async function getLiveStreamStatus(liveStreamId: string) {
  const mux = getMux();
  const stream = await mux.video.liveStreams.retrieve(liveStreamId);
  return { status: stream.status, id: stream.id };
}

export async function deleteLiveStream(liveStreamId: string) {
  const mux = getMux();
  await mux.video.liveStreams.delete(liveStreamId);
}
