// Live Stage & CGI: a real, working browser-based virtual studio.
// Webcam capture + on-device AI background removal (MediaPipe Selfie
// Segmentation) composited against a chosen room, plus lightweight AR
// stickers (face-detected), a beauty filter, a lower-third overlay, live
// auto-captions (Web Speech API), and split-screen (a second local camera,
// or a remote duo co-host over the same LiveKit room). Everything up to
// compositing runs entirely in the browser. "Go Live" publishes the
// composited canvas + mic to a LiveKit room over WebRTC (see
// server/livekit.ts) — direct browser-to-cloud, no OBS, no relay server.
// Requires LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET configured
// server-side; if they're missing, Go Live will fail with a clear error
// instead of pretending to work.
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Camera, Copy, Mic, MicOff, Radio, Upload, Video } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { trpc } from "@/lib/trpc";

const WASM_BASE = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const SEGMENTER_MODEL = "https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite";
const FACE_DETECTOR_MODEL = "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";

type StagePreset = { id: string; label: string; kind: "image" | "gradient"; src?: string; colors?: [string, string] };

const STAGE_PRESETS: StagePreset[] = [
  { id: "bedroom-x", label: "Bedroom X", kind: "image", src: "/studio/bedroom-x.jpg" },
  { id: "dungeon", label: "Dungeon", kind: "gradient", colors: ["#1a0508", "#3a0a12"] },
  { id: "red-vip-lounge", label: "RedVIPLounge", kind: "gradient", colors: ["#2a0611", "#7a0f2e"] },
  { id: "penthouse", label: "Penthouse", kind: "gradient", colors: ["#0a0e1a", "#1f2a44"] },
];

type ArEffect = "none" | "sunglasses" | "cat-ears" | "wizard-hat";
type Resolution = "1080p" | "4k";
type SplitMode = "off" | "dualCamera" | "duoHost" | "duoGuest";

const RESOLUTION_DIMS: Record<Resolution, { width: number; height: number }> = {
  "1080p": { width: 1920, height: 1080 },
  "4k": { width: 3840, height: 2160 },
};

function drawGradientBackground(ctx: CanvasRenderingContext2D, width: number, height: number, colors: [string, string]) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, colors[0]);
  gradient.addColorStop(1, colors[1]);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawArSticker(ctx: CanvasRenderingContext2D, effect: ArEffect, box: { originX: number; originY: number; width: number; height: number }) {
  const centerX = box.originX + box.width / 2;
  const eyeLineY = box.originY + box.height * 0.42;
  if (effect === "sunglasses") {
    const lensW = box.width * 0.32;
    const lensH = box.height * 0.16;
    ctx.fillStyle = "rgba(10,10,14,0.92)";
    ctx.beginPath();
    ctx.ellipse(centerX - lensW * 0.55, eyeLineY, lensW / 2, lensH / 2, 0, 0, Math.PI * 2);
    ctx.ellipse(centerX + lensW * 0.55, eyeLineY, lensW / 2, lensH / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(241,90,168,0.9)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX - lensW * 0.15, eyeLineY);
    ctx.lineTo(centerX + lensW * 0.15, eyeLineY);
    ctx.stroke();
  } else if (effect === "cat-ears") {
    const earW = box.width * 0.22;
    const earH = box.height * 0.32;
    const topY = box.originY - earH * 0.55;
    ctx.fillStyle = "#1a1a1a";
    for (const side of [-1, 1]) {
      const x = centerX + side * box.width * 0.28;
      ctx.beginPath();
      ctx.moveTo(x - earW / 2, topY + earH);
      ctx.lineTo(x, topY);
      ctx.lineTo(x + earW / 2, topY + earH);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#f15aa8";
      ctx.beginPath();
      ctx.moveTo(x - earW / 4, topY + earH * 0.85);
      ctx.lineTo(x, topY + earH * 0.35);
      ctx.lineTo(x + earW / 4, topY + earH * 0.85);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1a1a1a";
    }
  } else if (effect === "wizard-hat") {
    const hatW = box.width * 0.9;
    const hatH = box.height * 0.9;
    const baseY = box.originY - hatH * 0.05;
    ctx.fillStyle = "#2a1440";
    ctx.beginPath();
    ctx.moveTo(centerX - hatW / 2, baseY);
    ctx.lineTo(centerX + hatW / 2, baseY);
    ctx.lineTo(centerX, baseY - hatH);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#f15aa8";
    ctx.fillRect(centerX - hatW / 2, baseY - 6, hatW, 10);
  }
}

// Wraps text onto up to `maxLines` lines that fit `maxWidth` on the given
// (already-configured font) context, ellipsizing the last line if there's
// more text than that. Used for the live-caption bar.
function wrapCanvasText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
      if (lines.length === maxLines) { line = ""; break; }
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  if (lines.length >= maxLines && words.join(" ").length > lines.join(" ").length) {
    let last = lines[maxLines - 1] ?? "";
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines.slice(0, maxLines);
}

export default function Studio() {
  const { isAuthenticated, user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const workCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const segmenterRef = useRef<any>(null);
  const faceDetectorRef = useRef<any>(null);
  const rafRef = useRef<number>(0);
  const bgImageRef = useRef<HTMLImageElement | null>(null);

  const [cameraOn, setCameraOn] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [stageMode, setStageMode] = useState<"virtualBg" | "overlay">("virtualBg");
  const [presetId, setPresetId] = useState(STAGE_PRESETS[0].id);
  const [customBg, setCustomBg] = useState<string | null>(null);
  const [privacyBlur, setPrivacyBlur] = useState(false);
  const [arEffect, setArEffect] = useState<ArEffect>("none");
  const [beauty, setBeauty] = useState(0);
  const [lowerThirdOn, setLowerThirdOn] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [displayTitle, setDisplayTitle] = useState("");
  const [status, setStatus] = useState("Studio offline — click Start Secure Camera to launch.");
  const [modelsReady, setModelsReady] = useState(false);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [liveRoomName, setLiveRoomName] = useState<string | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [goingLive, setGoingLive] = useState(false);
  const liveRoomRef = useRef<any>(null);
  const goLive = trpc.live.goLive.useMutation();
  const endLiveMutation = trpc.live.endLive.useMutation();

  // --- Capture quality: 1080p by default, 4K opt-in. Camera constraints
  // are "ideal" hints — the browser/webcam falls back gracefully if 4K
  // isn't actually supported. The canvas' own pixel size (below, on the
  // <canvas> element) follows the same setting, since that's what actually
  // gets published. Restart the camera to apply a change mid-session.
  const [resolution, setResolution] = useState<Resolution>("1080p");
  const canvasDims = RESOLUTION_DIMS[resolution];

  // --- Live auto-captions (Web Speech API). Chrome/Edge only today — no
  // polyfill exists for Firefox/Safari, so the checkbox disables itself
  // there rather than pretending to work.
  const [captionsOn, setCaptionsOn] = useState(false);
  const [captionText, setCaptionText] = useState("");
  const [captionsSupported] = useState(() => typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition));
  const recognitionRef = useRef<any>(null);
  const captionsWantedRef = useRef(false);
  const captionClearTimerRef = useRef<number | undefined>(undefined);

  // --- Split screen: either a second local camera (one creator, two
  // sources), or a remote duo co-host publishing into the same LiveKit
  // room. Either way the actual compositing happens once, at the end of
  // renderLoop, onto whichever single canvas gets published.
  const [splitMode, setSplitMode] = useState<SplitMode>("off");
  const [cameraDevices, setCameraDevices] = useState<MediaDeviceInfo[]>([]);
  const [secondaryDeviceId, setSecondaryDeviceId] = useState("");
  const [secondaryOn, setSecondaryOn] = useState(false);
  const secondaryStreamRef = useRef<MediaStream | null>(null);
  const secondaryVideoRef = useRef<HTMLVideoElement>(null);
  const [coHostConnected, setCoHostConnected] = useState(false);
  const coHostVideoRef = useRef<HTMLVideoElement>(null);
  const coHostAudioRef = useRef<HTMLAudioElement>(null);
  const [coHostCode, setCoHostCode] = useState("");
  const [coHostJoined, setCoHostJoined] = useState(false);
  const [coHostConnecting, setCoHostConnecting] = useState(false);
  const [coHostError, setCoHostError] = useState<string | null>(null);
  const coHostRoomRef = useRef<any>(null);
  const hostPreviewVideoRef = useRef<HTMLVideoElement>(null);
  const hostPreviewAudioRef = useRef<HTMLAudioElement>(null);
  const coHostTokenMutation = trpc.live.coHostToken.useMutation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const visionModule = await import("@mediapipe/tasks-vision");
        const { FilesetResolver, ImageSegmenter, FaceDetector } = visionModule as any;
        const filesetResolver = await FilesetResolver.forVisionTasks(WASM_BASE);
        const segmenter = await ImageSegmenter.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: SEGMENTER_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        });
        const detector = await FaceDetector.createFromOptions(filesetResolver, {
          baseOptions: { modelAssetPath: FACE_DETECTOR_MODEL, delegate: "GPU" },
          runningMode: "VIDEO",
        });
        if (cancelled) return;
        segmenterRef.current = segmenter;
        faceDetectorRef.current = detector;
        setModelsReady(true);
      } catch (error) {
        console.error("[Studio] Failed to load on-device AI models", error);
        setStatus("AI background removal failed to load — you can still use Overlay mode.");
        setStageMode("overlay");
      }
    })();
    return () => {
      cancelled = true;
      segmenterRef.current?.close?.();
      faceDetectorRef.current?.close?.();
    };
  }, []);

  useEffect(() => {
    const preset = STAGE_PRESETS.find(item => item.id === presetId);
    if (customBg) {
      const image = new Image();
      image.src = customBg;
      image.onload = () => { bgImageRef.current = image; };
      return;
    }
    if (preset?.kind === "image" && preset.src) {
      const image = new Image();
      image.src = preset.src;
      image.onload = () => { bgImageRef.current = image; };
    } else {
      bgImageRef.current = null;
    }
  }, [presetId, customBg]);

  const startCamera = async () => {
    try {
      const dims = RESOLUTION_DIMS[resolution];
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: dims.width }, height: { ideal: dims.height } }, audio: true });
      streamRef.current = stream;
      stream.getAudioTracks().forEach(track => { track.enabled = micOn; });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.();
      setCameraOn(true);
      const gotDims = settings?.width && settings?.height ? ` (${settings.width}×${settings.height})` : "";
      setStatus(modelsReady ? `Live preview running${gotDims}.` : `Live preview running${gotDims} (AI models still loading — Overlay mode until ready).`);
      renderLoop();
    } catch (error) {
      console.error("[Studio] Camera access failed", error);
      setStatus("Camera access was blocked or unavailable. Check your browser permissions.");
    }
  };

  const restartCameraForResolutionChange = async (next: Resolution) => {
    setResolution(next);
    if (!cameraOn) return;
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    try {
      const dims = RESOLUTION_DIMS[next];
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: dims.width }, height: { ideal: dims.height } }, audio: true });
      streamRef.current = stream;
      stream.getAudioTracks().forEach(track => { track.enabled = micOn; });
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const track = stream.getVideoTracks()[0];
      const settings = track?.getSettings?.();
      const gotDims = settings?.width && settings?.height ? ` (${settings.width}×${settings.height})` : "";
      setStatus(`Live preview running${gotDims}.`);
    } catch (error) {
      console.error("[Studio] Camera restart failed", error);
      setStatus("Couldn't switch resolution — camera access failed.");
    }
  };

  const removeSecondaryCamera = () => {
    secondaryStreamRef.current?.getTracks().forEach(track => track.stop());
    secondaryStreamRef.current = null;
    if (secondaryVideoRef.current) secondaryVideoRef.current.srcObject = null;
    setSecondaryOn(false);
  };

  const handleLeaveCoHost = () => {
    coHostRoomRef.current?.disconnect();
    coHostRoomRef.current = null;
    setCoHostJoined(false);
    if (cameraOn) setStatus("Live preview running.");
  };

  const stopCamera = () => {
    if (isLive) handleEndLive();
    if (coHostJoined) handleLeaveCoHost();
    removeSecondaryCamera();
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setCameraOn(false);
    setStatus("Studio offline — click Start Secure Camera to launch.");
  };

  const handleGoLive = async () => {
    if (!cameraOn || !canvasRef.current || !streamRef.current) return;
    setGoingLive(true);
    setLiveError(null);
    try {
      const { roomName, token, wsUrl } = await goLive.mutateAsync();
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const room = new Room();
      room.on(RoomEvent.Disconnected, () => { setIsLive(false); setLiveRoomName(null); liveRoomRef.current = null; setCoHostConnected(false); });
      // A duo co-host publishes their own camera + mic into this same room
      // (see handleJoinAsCoHost / server live.coHostToken). Anything a
      // remote participant publishes here is treated as "the co-host" —
      // fine for the 2-person room this MVP assumes, not a multi-guest room.
      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        if (track.kind === "video") { if (coHostVideoRef.current) track.attach(coHostVideoRef.current); setCoHostConnected(true); }
        else if (track.kind === "audio") { if (coHostAudioRef.current) track.attach(coHostAudioRef.current); }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track: any) => { if (track.kind === "video") setCoHostConnected(false); });
      room.on(RoomEvent.ParticipantDisconnected, () => setCoHostConnected(false));
      await room.connect(wsUrl, token);
      const canvasStream = (canvasRef.current as any).captureStream(30) as MediaStream;
      const videoTrack = canvasStream.getVideoTracks()[0];
      await room.localParticipant.publishTrack(videoTrack, { name: "stage", source: Track.Source.Camera });
      const micTrack = streamRef.current.getAudioTracks()[0];
      if (micTrack) await room.localParticipant.publishTrack(micTrack, { name: "mic", source: Track.Source.Microphone });
      liveRoomRef.current = room;
      setIsLive(true);
      setLiveRoomName(roomName);
      setStatus("Live — broadcasting to LiveKit.");
    } catch (error) {
      console.error("[Studio] Go Live failed", error);
      setLiveError(error instanceof Error ? error.message : "Couldn't start the broadcast. Check that LiveKit is configured on the server.");
    } finally {
      setGoingLive(false);
    }
  };

  const handleEndLive = () => {
    liveRoomRef.current?.disconnect();
    liveRoomRef.current = null;
    setIsLive(false);
    setLiveRoomName(null);
    setCoHostConnected(false);
    endLiveMutation.mutate();
    if (cameraOn) setStatus("Live preview running.");
  };

  // --- Duo co-host: join someone else's room as a second publisher. Their
  // Studio composites *their own* virtual-background canvas (same pipeline
  // as Go Live) but publishes it into the host's room instead of their own,
  // under a scoped token from server/routers.ts live.coHostToken. The host
  // then draws that incoming feed into the right half of their canvas (see
  // renderLoop) — that composited canvas is what actually goes out.
  const handleJoinAsCoHost = async () => {
    if (!cameraOn || !canvasRef.current || !streamRef.current) { setCoHostError("Start your camera first."); return; }
    const hostUserId = Number(coHostCode.trim());
    if (!hostUserId) { setCoHostError("Enter the host's creator code (their numeric ID)."); return; }
    setCoHostConnecting(true);
    setCoHostError(null);
    try {
      const { roomName, token, wsUrl } = await coHostTokenMutation.mutateAsync({ hostUserId });
      const { Room, RoomEvent, Track } = await import("livekit-client");
      const room = new Room();
      room.on(RoomEvent.Disconnected, () => { coHostRoomRef.current = null; setCoHostJoined(false); if (cameraOn) setStatus("Live preview running."); });
      room.on(RoomEvent.TrackSubscribed, (track: any) => {
        if (track.kind === "video") { if (hostPreviewVideoRef.current) track.attach(hostPreviewVideoRef.current); }
        else if (track.kind === "audio") { if (hostPreviewAudioRef.current) track.attach(hostPreviewAudioRef.current); }
      });
      await room.connect(wsUrl, token);
      const canvasStream = (canvasRef.current as any).captureStream(30) as MediaStream;
      const videoTrack = canvasStream.getVideoTracks()[0];
      await room.localParticipant.publishTrack(videoTrack, { name: "cohost-stage", source: Track.Source.Camera });
      const micTrack = streamRef.current.getAudioTracks()[0];
      if (micTrack) await room.localParticipant.publishTrack(micTrack, { name: "cohost-mic", source: Track.Source.Microphone });
      coHostRoomRef.current = room;
      setCoHostJoined(true);
      setStatus(`Connected as co-host to ${roomName} — your host can now mix your camera in.`);
    } catch (error) {
      console.error("[Studio] Join as co-host failed", error);
      setCoHostError(error instanceof Error ? error.message : "Couldn't connect as co-host.");
    } finally {
      setCoHostConnecting(false);
    }
  };

  useEffect(() => () => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach(track => track.stop());
    secondaryStreamRef.current?.getTracks().forEach(track => track.stop());
    liveRoomRef.current?.disconnect();
    coHostRoomRef.current?.disconnect();
    stopRecognition();
  }, []);

  const renderLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(renderLoop);
      return;
    }
    const width = canvas.width;
    const height = canvas.height;

    // Everything up to the split-screen layout draws onto an offscreen
    // "work" canvas at full size — identical to the old single-canvas
    // pipeline. Only the final step decides whether that becomes the whole
    // frame (split off) or gets squeezed into the left half next to a
    // second source (split on).
    if (!workCanvasRef.current) workCanvasRef.current = document.createElement("canvas");
    const work = workCanvasRef.current;
    if (work.width !== width || work.height !== height) { work.width = width; work.height = height; }
    const wctx = work.getContext("2d");
    if (!wctx) return;

    const useSegmentation = stageMode === "virtualBg" && modelsReady && segmenterRef.current;

    if (useSegmentation) {
      const preset = STAGE_PRESETS.find(item => item.id === presetId);
      // 1. Draw the background layer (virtual set, or a blur of the real scene for Privacy Blur).
      if (privacyBlur) {
        wctx.filter = "blur(18px)";
        wctx.drawImage(video, 0, 0, width, height);
        wctx.filter = "none";
      } else if (bgImageRef.current) {
        wctx.drawImage(bgImageRef.current, 0, 0, width, height);
      } else if (preset?.kind === "gradient" && preset.colors) {
        drawGradientBackground(wctx, width, height, preset.colors);
      } else {
        wctx.fillStyle = "#0a0a0f";
        wctx.fillRect(0, 0, width, height);
      }

      // 2. Run segmentation and cut the person out on top of the background.
      const result = segmenterRef.current.segmentForVideo(video, performance.now());
      const mask = result.categoryMask?.getAsFloat32Array();
      if (mask) {
        const offscreen = document.createElement("canvas");
        offscreen.width = width;
        offscreen.height = height;
        const offCtx = offscreen.getContext("2d")!;
        offCtx.filter = beauty > 0 ? `blur(${(beauty / 100) * 4}px) brightness(${1 + beauty / 400})` : "none";
        offCtx.drawImage(video, 0, 0, width, height);
        const personFrame = offCtx.getImageData(0, 0, width, height);
        const composite = wctx.getImageData(0, 0, width, height);
        const maskW = result.categoryMask.width;
        const maskH = result.categoryMask.height;
        for (let y = 0; y < height; y++) {
          const my = Math.floor((y / height) * maskH);
          for (let x = 0; x < width; x++) {
            const mx = Math.floor((x / width) * maskW);
            const isPerson = mask[my * maskW + mx] === 0; // category 0 = person in the selfie segmenter
            if (isPerson) {
              const i = (y * width + x) * 4;
              composite.data[i] = personFrame.data[i];
              composite.data[i + 1] = personFrame.data[i + 1];
              composite.data[i + 2] = personFrame.data[i + 2];
              composite.data[i + 3] = 255;
            }
          }
        }
        wctx.putImageData(composite, 0, 0);
        result.close?.();
      }
    } else {
      // Overlay mode (or AI not ready yet): show the raw camera feed with optional beauty/AR/lower-third layered on top.
      // Also the lighter option at 4K — it skips the per-pixel segmentation loop above, which gets expensive at 3840×2160.
      wctx.filter = beauty > 0 ? `blur(${(beauty / 100) * 3}px) brightness(${1 + beauty / 400})` : "none";
      wctx.drawImage(video, 0, 0, width, height);
      wctx.filter = "none";
    }

    if (arEffect !== "none" && faceDetectorRef.current) {
      const detections = faceDetectorRef.current.detectForVideo(video, performance.now()).detections;
      for (const detection of detections ?? []) {
        const box = detection.boundingBox;
        if (box) drawArSticker(wctx, arEffect, { originX: (box.originX / video.videoWidth) * width, originY: (box.originY / video.videoHeight) * height, width: (box.width / video.videoWidth) * width, height: (box.height / video.videoHeight) * height });
      }
    }

    if (lowerThirdOn && (displayName || displayTitle)) {
      const barY = height - 64;
      wctx.fillStyle = "rgba(10,10,14,0.72)";
      wctx.fillRect(24, barY, Math.max(220, wctx.measureText(displayName).width + 48), 48);
      wctx.fillStyle = "#f15aa8";
      wctx.fillRect(24, barY, 4, 48);
      wctx.fillStyle = "#f5f0ea";
      wctx.font = "600 16px 'DM Sans', sans-serif";
      wctx.fillText(displayName || "Your Name", 40, barY + 20);
      wctx.fillStyle = "#c9c2d8";
      wctx.font = "400 12px 'DM Sans', sans-serif";
      wctx.fillText(displayTitle || "", 40, barY + 38);
    }

    // --- Final layout pass: split screen (if on) or a straight 1:1 copy. ---
    const visibleCtx = canvas.getContext("2d");
    if (!visibleCtx) return;
    const secondaryEl = splitMode === "dualCamera" ? secondaryVideoRef.current : splitMode === "duoHost" ? coHostVideoRef.current : null;
    const secondaryReady = splitMode === "dualCamera" ? secondaryOn && secondaryEl && secondaryEl.readyState >= 2 : splitMode === "duoHost" ? coHostConnected && secondaryEl && secondaryEl.readyState >= 2 : false;
    if (secondaryReady && secondaryEl) {
      visibleCtx.clearRect(0, 0, width, height);
      visibleCtx.drawImage(work, 0, 0, width, height, 0, 0, width / 2, height);
      const sw = secondaryEl.videoWidth || width;
      const sh = secondaryEl.videoHeight || height;
      visibleCtx.drawImage(secondaryEl, 0, 0, sw, sh, width / 2, 0, width / 2, height);
      visibleCtx.fillStyle = "rgba(241,90,168,0.65)";
      visibleCtx.fillRect(width / 2 - 1, 0, 2, height);
    } else {
      visibleCtx.drawImage(work, 0, 0);
    }

    // --- Live auto-captions: drawn last, full width, on top of everything (including the split). ---
    if (captionsOn && captionText) {
      visibleCtx.font = `600 ${Math.round(height / 27)}px 'DM Sans', sans-serif`;
      const maxWidth = width - 80;
      const lines = wrapCanvasText(visibleCtx, captionText, maxWidth, 2);
      const lineHeight = Math.round(height / 22);
      const boxHeight = lines.length * lineHeight + 20;
      const bottomMargin = lowerThirdOn && (displayName || displayTitle) ? Math.round(height * 0.14) : Math.round(height * 0.035);
      const boxY = height - bottomMargin - boxHeight;
      visibleCtx.fillStyle = "rgba(10,10,14,0.8)";
      visibleCtx.fillRect(width / 2 - maxWidth / 2 - 20, boxY, maxWidth + 40, boxHeight);
      visibleCtx.fillStyle = "#f6f1eb";
      visibleCtx.textAlign = "center";
      lines.forEach((line, index) => visibleCtx.fillText(line, width / 2, boxY + lineHeight - 2 + index * lineHeight));
      visibleCtx.textAlign = "left";
    }

    rafRef.current = requestAnimationFrame(renderLoop);
  };

  const toggleMic = () => {
    const next = !micOn;
    setMicOn(next);
    streamRef.current?.getAudioTracks().forEach(track => { track.enabled = next; });
  };

  const handleFilePick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setCustomBg(reader.result as string);
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const captureSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSnapshotUrl(canvas.toDataURL("image/png"));
  };

  // --- Split screen: solo dual-camera ---
  const loadCameraDevices = async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameraDevices(devices.filter(device => device.kind === "videoinput"));
    } catch (error) {
      console.error("[Studio] Could not list cameras", error);
    }
  };

  const addSecondaryCamera = async () => {
    if (!secondaryDeviceId) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: secondaryDeviceId } }, audio: false });
      secondaryStreamRef.current = stream;
      if (secondaryVideoRef.current) { secondaryVideoRef.current.srcObject = stream; await secondaryVideoRef.current.play(); }
      setSecondaryOn(true);
    } catch (error) {
      console.error("[Studio] Second camera failed", error);
      setStatus("Couldn't open that second camera.");
    }
  };

  // --- Live auto-captions: start/stop the recognizer ---
  const stopRecognition = () => {
    captionsWantedRef.current = false;
    try { recognitionRef.current?.stop?.(); } catch { /* already stopped */ }
    recognitionRef.current = null;
    window.clearTimeout(captionClearTimerRef.current);
    setCaptionText("");
  };

  const startRecognition = () => {
    const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;
    captionsWantedRef.current = true;
    const recognition = new SpeechRecognitionCtor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (event: any) => {
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) transcript += event.results[i][0].transcript;
      setCaptionText(transcript.trim());
      window.clearTimeout(captionClearTimerRef.current);
      captionClearTimerRef.current = window.setTimeout(() => setCaptionText(""), 6000);
    };
    recognition.onerror = (event: any) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setCaptionsOn(false);
        captionsWantedRef.current = false;
        setStatus("Mic access for captions was blocked — captions turned off.");
      }
    };
    recognition.onend = () => { if (captionsWantedRef.current) { try { recognition.start(); } catch { /* already running */ } } };
    recognitionRef.current = recognition;
    try { recognition.start(); } catch { /* ignore double-start */ }
  };

  useEffect(() => {
    if (captionsOn && cameraOn) startRecognition(); else stopRecognition();
    return () => stopRecognition();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [captionsOn, cameraOn]);

  if (!isAuthenticated) {
    return (
      <main className="site-shell">
        <section className="console-section section-pad">
          <div className="console-locked">
            <div>
              <h2>Live Stage &amp; CGI.<br /><span className="editorial-accent">Sign in to open your studio.</span></h2>
              <p>The camera studio, virtual sets, and AR tools are only available to creators.</p>
            </div>
            <button className="button button-primary" onClick={() => startLogin()}>Sign in to creator desk <ArrowUpRight size={17} /></button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="site-shell studio-shell">
      <section className="section-pad">
        <div className="section-label">CREATOR DESK <span>LIVE STAGE &amp; CGI</span></div>
        <h2>Set the room.<br /><span className="editorial-accent">Own the frame.</span></h2>
        <p className="booking-intro">On-device AI removes your real background and drops you into a virtual set — nothing leaves your browser. Upload your own set, add a light AR touch, and preview exactly what a fan would see.</p>

        <div className="studio-layout">
          <div className="studio-stage">
            <div className="studio-toolbar">
              <div className="studio-presets">
                {STAGE_PRESETS.map(preset => (
                  <button key={preset.id} type="button" className={`chip ${presetId === preset.id && !customBg ? "chip-active" : ""}`} onClick={() => { setPresetId(preset.id); setCustomBg(null); }}>{preset.label}</button>
                ))}
                <label className="chip chip-upload">
                  <Upload size={14} /> Pick file from PC
                  <input type="file" accept="image/*" onChange={handleFilePick} hidden />
                </label>
              </div>
              <div className="studio-actions">
                {!cameraOn ? (
                  <button className="button button-primary" onClick={startCamera}><Video size={16} /> Start secure camera</button>
                ) : (
                  <button className="button button-outline" onClick={stopCamera}>Stop camera</button>
                )}
                <button className="button button-outline" onClick={toggleMic} disabled={!cameraOn}>{micOn ? <Mic size={16} /> : <MicOff size={16} />} {micOn ? "Mic on" : "Muted"}</button>
                {!isLive ? (
                  <button className="button button-primary" onClick={handleGoLive} disabled={!cameraOn || goingLive}><Radio size={16} /> {goingLive ? "Starting…" : "Go live"}</button>
                ) : (
                  <button className="button button-outline" onClick={handleEndLive}><Radio size={16} color="#e0454f" /> End broadcast</button>
                )}
              </div>
            </div>

            <div className="studio-canvas-wrap">
              <video ref={videoRef} muted playsInline style={{ display: "none" }} />
              <video ref={secondaryVideoRef} muted playsInline style={{ display: "none" }} />
              <video ref={coHostVideoRef} muted playsInline style={{ display: "none" }} />
              <audio ref={coHostAudioRef} autoPlay style={{ display: "none" }} />
              <audio ref={hostPreviewAudioRef} autoPlay style={{ display: "none" }} />
              <canvas ref={canvasRef} width={canvasDims.width} height={canvasDims.height} className="studio-canvas" />
              {!cameraOn && <div className="studio-placeholder"><Camera size={28} /><span>{status}</span></div>}
              {isLive && <div className="studio-live-badge"><Radio size={12} /> LIVE</div>}
            </div>
            <p className="studio-status">{status}{!modelsReady && cameraOn ? " · loading AI models…" : ""}</p>
            {liveError && <p className="form-error">{liveError}</p>}
            {isLive && liveRoomName && (
              <div className="studio-live-link">
                <span>Share this with fans: <code>{`${window.location.origin}/live?room=${liveRoomName}`}</code></span>
                <button type="button" className="button button-outline" onClick={() => navigator.clipboard.writeText(`${window.location.origin}/live?room=${liveRoomName}`)}><Copy size={14} /> Copy link</button>
              </div>
            )}
          </div>

          <div className="studio-panel">
            <div className="panel-block">
              <span className="panel-label">Stage mode</span>
              <div className="segmented">
                <button className={stageMode === "virtualBg" ? "active" : ""} onClick={() => setStageMode("virtualBg")}>Virtual BG</button>
                <button className={stageMode === "overlay" ? "active" : ""} onClick={() => setStageMode("overlay")}>Overlay</button>
              </div>
            </div>
            <div className="panel-block">
              <label className="panel-checkbox"><input type="checkbox" checked={privacyBlur} onChange={event => setPrivacyBlur(event.target.checked)} /> Privacy blur (blur my real room instead)</label>
            </div>
            <div className="panel-block">
              <span className="panel-label">Camera quality</span>
              <div className="segmented">
                <button className={resolution === "1080p" ? "active" : ""} onClick={() => restartCameraForResolutionChange("1080p")}>1080p</button>
                <button className={resolution === "4k" ? "active" : ""} onClick={() => restartCameraForResolutionChange("4k")}>4K</button>
              </div>
              <p className="mini-status">Uses your webcam's best available match — most laptop cams max out well under 4K. {resolution === "4k" && stageMode === "virtualBg" && "4K + Virtual BG can lag on slower hardware — try Overlay mode if the preview stutters."}</p>
            </div>
            <div className="panel-block">
              <span className="panel-label">AR effects</span>
              <div className="segmented segmented-wrap">
                {(["none", "sunglasses", "cat-ears", "wizard-hat"] as ArEffect[]).map(effect => (
                  <button key={effect} className={arEffect === effect ? "active" : ""} onClick={() => setArEffect(effect)}>{effect === "none" ? "None" : effect.replace("-", " ")}</button>
                ))}
              </div>
            </div>
            <div className="panel-block">
              <span className="panel-label">Beauty filter {beauty}%</span>
              <input type="range" min={0} max={100} value={beauty} onChange={event => setBeauty(Number(event.target.value))} />
            </div>
            <div className="panel-block">
              <label className="panel-checkbox"><input type="checkbox" checked={lowerThirdOn} onChange={event => setLowerThirdOn(event.target.checked)} /> Lower-third</label>
              <input placeholder="Your name" value={displayName} onChange={event => setDisplayName(event.target.value)} />
              <input placeholder="Room / tagline" value={displayTitle} onChange={event => setDisplayTitle(event.target.value)} />
            </div>
            <div className="panel-block">
              <label className="panel-checkbox"><input type="checkbox" checked={captionsOn} onChange={event => setCaptionsOn(event.target.checked)} disabled={!captionsSupported} /> Auto captions (speech-to-text, burned into your feed)</label>
              {!captionsSupported && <p className="mini-status">Not supported in this browser — try Chrome or Edge.</p>}
              {captionsOn && captionsSupported && <p className="mini-status">{captionText ? `"${captionText}"` : "Listening…"}</p>}
            </div>
            <div className="panel-block">
              <span className="panel-label">Split screen</span>
              <div className="segmented segmented-wrap">
                <button className={splitMode === "off" ? "active" : ""} onClick={() => setSplitMode("off")}>Off</button>
                <button className={splitMode === "dualCamera" ? "active" : ""} onClick={() => setSplitMode("dualCamera")}>Two cameras (me)</button>
                <button className={splitMode === "duoHost" ? "active" : ""} onClick={() => setSplitMode("duoHost")}>Duo · I'm hosting</button>
                <button className={splitMode === "duoGuest" ? "active" : ""} onClick={() => setSplitMode("duoGuest")}>Duo · I'm joining</button>
              </div>

              {splitMode === "dualCamera" && (
                <div className="split-subpanel">
                  {!secondaryOn ? (
                    <>
                      <button type="button" className="button button-outline" onClick={loadCameraDevices}>Load camera list</button>
                      {cameraDevices.length > 0 && (
                        <>
                          <select value={secondaryDeviceId} onChange={event => setSecondaryDeviceId(event.target.value)}>
                            <option value="">Select a second camera</option>
                            {cameraDevices.map(device => <option value={device.deviceId} key={device.deviceId}>{device.label || `Camera ${device.deviceId.slice(0, 6)}`}</option>)}
                          </select>
                          <button type="button" className="button button-primary" onClick={addSecondaryCamera} disabled={!secondaryDeviceId}>Add second camera</button>
                        </>
                      )}
                    </>
                  ) : (
                    <button type="button" className="button button-outline" onClick={removeSecondaryCamera}>Remove second camera</button>
                  )}
                </div>
              )}

              {splitMode === "duoHost" && (
                <div className="split-subpanel">
                  {!isLive ? <p className="mini-status">Go live first, then share your code with your co-host.</p> : (
                    <>
                      <div className="code-badge">Your code: <b>{user?.id}</b> <button type="button" className="link-button" onClick={() => navigator.clipboard.writeText(String(user?.id ?? ""))}><Copy size={13} /></button></div>
                      <p className="mini-status">{coHostConnected ? "Co-host connected — mixed into your feed." : "Waiting for a co-host to join with this code…"}</p>
                    </>
                  )}
                </div>
              )}

              {splitMode === "duoGuest" && (
                <div className="split-subpanel">
                  {!coHostJoined ? (
                    <>
                      <input placeholder="Host's creator code" value={coHostCode} onChange={event => setCoHostCode(event.target.value.replace(/\D/g, ""))} />
                      <button type="button" className="button button-primary" onClick={handleJoinAsCoHost} disabled={!cameraOn || coHostConnecting}>{coHostConnecting ? "Connecting…" : "Join as co-host"}</button>
                      {coHostError && <p className="form-error">{coHostError}</p>}
                    </>
                  ) : (
                    <>
                      <video ref={hostPreviewVideoRef} autoPlay playsInline muted className="host-preview" />
                      <button type="button" className="button button-outline" onClick={handleLeaveCoHost}>Leave co-host session</button>
                    </>
                  )}
                </div>
              )}
              <p className="mini-status">"Two cameras" composites a second local source next to yours. "Duo" pairs two creators over the network — the host mixes the guest's camera into their own broadcast; the guest doesn't need to do anything else once connected.</p>
            </div>
            <button className="button button-outline" onClick={captureSnapshot} disabled={!cameraOn}><Camera size={16} /> Capture snapshot</button>
            {snapshotUrl && <a className="button button-primary" href={snapshotUrl} download="lensflow-snapshot.png">Download snapshot <ArrowUpRight size={15} /></a>}
            <div className="studio-note">
              <strong>About "Go Live":</strong> pressing it publishes this exact composited feed (canvas + mic) to a LiveKit room over WebRTC, straight from your browser — no OBS, no relay server. Fans join at the link shown above, which opens <a href="/live">/live</a>. Publish permission is enforced server-side: your token is issued with publish rights, a fan's token is issued without them — LiveKit rejects a publish attempt from a subscribe-only token, not just "the app doesn't call it." Server-side this needs LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET configured — if they're missing, Go Live will show an error rather than silently failing.
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
