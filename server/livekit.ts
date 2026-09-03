// Server-side LiveKit integration — the real-time WebRTC broadcast backend
// for LensFlow's live rooms.
//
// History: this started as a Mux integration (RTMP/SRT-only ingest, so no
// browser-direct publish — see git history / the original write-up), then
// moved to Twilio Video (WebRTC-native, but its AccessToken/VideoGrant model
// can't restrict a token to "subscribe only" — any valid token can publish).
// LiveKit fixes that: its join-token grants (`canPublish` / `canSubscribe`)
// are enforced server-side per participant, so a fan's token can be issued
// genuinely publish-disabled, not just "the app happens not to call
// publish." That's why the creator's token below sets canPublish: true and
// the viewer's (in routers.ts) sets canPublish: false for real.
//
// Security: LIVEKIT_API_SECRET never reaches the client. This file only
// ever hands back short-lived, scoped Access Tokens (signed JWTs).
import { AccessToken, RoomServiceClient } from "livekit-server-sdk";
import { ENV } from "./_core/env";

function assertConfigured() {
  if (!ENV.livekitUrl || !ENV.livekitApiKey || !ENV.livekitApiSecret) {
    throw new Error("LiveKit is not configured — set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET");
  }
}

function getRoomService() {
  assertConfigured();
  // RoomServiceClient wants an https(s) URL, not the wss(s) one clients connect with.
  const httpUrl = ENV.livekitUrl.replace(/^ws/, "http");
  return new RoomServiceClient(httpUrl, ENV.livekitApiKey, ENV.livekitApiSecret);
}

/** Deterministic room name for a creator's persistent stage. */
export function creatorRoomName(creatorId: number) {
  return `lensflow-creator-${creatorId}`;
}

/** The wss:// URL the browser SDK connects to — safe to hand back in a tRPC response, not a secret by itself. */
export function livekitWsUrl() {
  assertConfigured();
  return ENV.livekitUrl;
}

/** Creates the room if it doesn't exist yet. LiveKit's CreateRoom is idempotent — calling it on an existing room just returns that room. */
export async function ensureRoom(roomName: string) {
  const service = getRoomService();
  return service.createRoom({ name: roomName, emptyTimeout: 10 * 60, departureTimeout: 60 });
}

/** Issues a short-lived Access Token scoped to one room for one participant identity, with real publish/subscribe enforcement. */
export async function createAccessToken(input: { identity: string; roomName: string; canPublish: boolean; name?: string }) {
  assertConfigured();
  const token = new AccessToken(ENV.livekitApiKey, ENV.livekitApiSecret, {
    identity: input.identity,
    name: input.name,
    ttl: "4h",
  });
  token.addGrant({
    roomJoin: true,
    room: input.roomName,
    canPublish: input.canPublish,
    canPublishData: input.canPublish,
    canSubscribe: true,
  });
  return token.toJwt();
}

/** Ends a creator's live session — disconnects everyone and deletes the room. */
export async function endRoom(roomName: string) {
  const service = getRoomService();
  await service.deleteRoom(roomName);
}

/** Best-effort status lookup (used by the UI to show "room is live" state). */
export async function getRoomStatus(roomName: string) {
  const service = getRoomService();
  const rooms = await service.listRooms([roomName]);
  const room = rooms[0];
  if (!room) return { exists: false as const, status: "none" as const };
  return { exists: true as const, status: "active" as const, participantCount: room.numParticipants };
}
