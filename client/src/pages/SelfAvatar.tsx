// Self-avatar creation. IMPORTANT — read server/selfAvatar.ts before
// changing this: real liveness verification (proving a live person is
// capturing this right now, not replaying someone else's photo) isn't
// wired up yet, on purpose. The camera capture below is a placeholder for
// where a vendor's guided liveness SDK (AWS Rekognition Face Liveness,
// Persona, Onfido) will eventually replace this exact step. Submitting
// today always surfaces the server's "not configured" error — that's
// expected, not a bug.
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Camera } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

export default function SelfAvatar() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const myCompanionQuery = trpc.companions.myCompanion.useQuery(undefined, { enabled: isAuthenticated });
  const createSelfAvatar = trpc.companions.createSelfAvatar.useMutation();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [captured, setCaptured] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState("");

  useEffect(() => {
    return () => stream?.getTracks().forEach(track => track.stop());
  }, [stream]);

  const startCamera = async () => {
    setCameraError("");
    try {
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
      setStream(media);
      if (videoRef.current) videoRef.current.srcObject = media;
    } catch {
      setCameraError("Couldn't access your camera — check your browser's camera permission for this site.");
    }
  };

  const capture = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    setCaptured(canvas.toDataURL("image/jpeg", 0.9));
    stream?.getTracks().forEach(track => track.stop());
    setStream(null);
  };

  const retake = () => {
    setCaptured(null);
    startCamera();
  };

  const submit = () => {
    // There's no real vendor session yet (see the file header) — this
    // reference is a placeholder so the full request/response wiring is
    // exercised end to end even though verifyLiveness always rejects it.
    createSelfAvatar.mutate({ sessionReference: "placeholder-capture" });
  };

  if (authLoading) return null;

  if (!isAuthenticated) {
    return (
      <main className="site-shell">
        <section className="section-pad">
          <div className="section-label">SELF-AVATAR <span>SIGN IN</span></div>
          <h2 style={{ marginTop: 24 }}>Sign in to<br /><span className="editorial-accent">build your own.</span></h2>
          <button className="button button-primary" style={{ marginTop: 24 }} onClick={() => startLogin()}>Sign in <ArrowUpRight size={17} /></button>
        </section>
      </main>
    );
  }

  return (
    <main className="site-shell">
      <header className="nav-wrap">
        <a className="brand" href="/companions" aria-label="Back to companions"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>LensFlow</span></a>
      </header>
      <section className="section-pad">
        <div className="section-label">SELF-AVATAR <span>VERIFIED ONLY</span></div>
        <h2 style={{ marginTop: 24 }}>A companion<br /><span className="editorial-accent">that's actually you.</span></h2>
        <p className="booking-intro" style={{ marginTop: 18, maxWidth: 480 }}>
          Built only from a live capture of your own face, verified in the moment — never an uploaded photo of anyone else. This keeps the feature usable at all: Stripe, Google Play, and Meta ads all ban companions built from unverified likenesses.
        </p>

        {myCompanionQuery.data ? (
          <div className="selfie-status" style={{ marginTop: 30 }}>
            You already have a self-avatar companion. <a href={`/companions/${myCompanionQuery.data.id}`} style={{ color: "var(--magenta)" }}>Open it <ArrowUpRight size={13} style={{ display: "inline", verticalAlign: "middle" }} /></a>
          </div>
        ) : (
          <div className="selfie-capture" style={{ marginTop: 34 }}>
            <div className="selfie-frame">
              {captured ? (
                <img src={captured} alt="Your captured selfie" />
              ) : (
                <video ref={videoRef} autoPlay playsInline muted />
              )}
            </div>
            <canvas ref={canvasRef} style={{ display: "none" }} />

            {!stream && !captured && (
              <button className="button button-primary" onClick={startCamera}><Camera size={16} /> Start camera</button>
            )}
            {stream && !captured && (
              <div className="selfie-actions">
                <button className="button button-primary" onClick={capture}>Capture</button>
              </div>
            )}
            {captured && (
              <div className="selfie-actions">
                <button className="button button-outline" onClick={retake} disabled={createSelfAvatar.isPending}>Retake</button>
                <button className="button button-primary" onClick={submit} disabled={createSelfAvatar.isPending}>{createSelfAvatar.isPending ? "Verifying…" : "Verify & create companion"}</button>
              </div>
            )}

            {cameraError && <p className="form-error">{cameraError}</p>}
            {createSelfAvatar.error && <p className="form-error">{createSelfAvatar.error.message}</p>}
            <p className="selfie-status">Liveness verification isn't switched on yet in this deployment — submitting above will show a clear "not configured" error rather than silently accepting the photo. See server/selfAvatar.ts.</p>
          </div>
        )}
      </section>
    </main>
  );
}
