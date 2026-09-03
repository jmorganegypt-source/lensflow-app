// Live Stage & CGI: a real, working browser-based virtual studio.
// Webcam capture + on-device AI background removal (MediaPipe Selfie
// Segmentation) composited against a chosen room, plus lightweight AR
// stickers (face-detected), a beauty filter, and a lower-third overlay.
// Everything up to compositing runs entirely in the browser. "Go Live"
// publishes the composited canvas + mic to a LiveKit room over WebRTC (see
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

export default function Studio() {
  const { isAuthenticated } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: true });
      streamRef.current = stream;
      stream.getAudioTracks().forEach(track => { track.enabled = micOn; });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
      setStatus(modelsReady ? "Live preview running." : "Live preview running (AI models still loading — Overlay mode until ready).");
      renderLoop();
    } catch (error) {
      console.error("[Studio] Camera access failed", error);
      setStatus("Camera access was blocked or unavailable. Check your browser permissions.");
    }
  };

  const stopCamera = () => {
    if (isLive) handleEndLive();
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
      room.on(RoomEvent.Disconnected, () => { setIsLive(false); setLiveRoomName(null); liveRoomRef.current = null; });
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
    endLiveMutation.mutate();
    if (cameraOn) setStatus("Live preview running.");
  };

  useEffect(() => () => { cancelAnimationFrame(rafRef.current); streamRef.current?.getTracks().forEach(track => track.stop()); liveRoomRef.current?.disconnect(); }, []);

  const renderLoop = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState < 2) {
      rafRef.current = requestAnimationFrame(renderLoop);
      return;
    }
    const width = canvas.width;
    const height = canvas.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const useSegmentation = stageMode === "virtualBg" && modelsReady && segmenterRef.current;

    if (useSegmentation) {
      const preset = STAGE_PRESETS.find(item => item.id === presetId);
      // 1. Draw the background layer (virtual set, or a blur of the real scene for Privacy Blur).
      if (privacyBlur) {
        ctx.filter = "blur(18px)";
        ctx.drawImage(video, 0, 0, width, height);
        ctx.filter = "none";
      } else if (bgImageRef.current) {
        ctx.drawImage(bgImageRef.current, 0, 0, width, height);
      } else if (preset?.kind === "gradient" && preset.colors) {
        drawGradientBackground(ctx, width, height, preset.colors);
      } else {
        ctx.fillStyle = "#0a0a0f";
        ctx.fillRect(0, 0, width, height);
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
        const composite = ctx.getImageData(0, 0, width, height);
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
        ctx.putImageData(composite, 0, 0);
        result.close?.();
      }
    } else {
      // Overlay mode (or AI not ready yet): show the raw camera feed with optional beauty/AR/lower-third layered on top.
      ctx.filter = beauty > 0 ? `blur(${(beauty / 100) * 3}px) brightness(${1 + beauty / 400})` : "none";
      ctx.drawImage(video, 0, 0, width, height);
      ctx.filter = "none";
    }

    if (arEffect !== "none" && faceDetectorRef.current) {
      const detections = faceDetectorRef.current.detectForVideo(video, performance.now()).detections;
      for (const detection of detections ?? []) {
        const box = detection.boundingBox;
        if (box) drawArSticker(ctx, arEffect, { originX: (box.originX / video.videoWidth) * width, originY: (box.originY / video.videoHeight) * height, width: (box.width / video.videoWidth) * width, height: (box.height / video.videoHeight) * height });
      }
    }

    if (lowerThirdOn && (displayName || displayTitle)) {
      const barY = height - 64;
      ctx.fillStyle = "rgba(10,10,14,0.72)";
      ctx.fillRect(24, barY, Math.max(220, ctx.measureText(displayName).width + 48), 48);
      ctx.fillStyle = "#f15aa8";
      ctx.fillRect(24, barY, 4, 48);
      ctx.fillStyle = "#f5f0ea";
      ctx.font = "600 16px 'DM Sans', sans-serif";
      ctx.fillText(displayName || "Your Name", 40, barY + 20);
      ctx.fillStyle = "#c9c2d8";
      ctx.font = "400 12px 'DM Sans', sans-serif";
      ctx.fillText(displayTitle || "", 40, barY + 38);
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
              <canvas ref={canvasRef} width={960} height={540} className="studio-canvas" />
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
