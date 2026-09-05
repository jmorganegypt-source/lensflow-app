// Slim "Install LensFlow" affordance for the PWA (see client/public/sw.js +
// manifest.webmanifest). Chrome/Edge/Android fire `beforeinstallprompt` when
// the app is installable — we catch it, show a bar, and call prompt() on tap.
// iOS Safari has no such event, so on iOS we show a one-line "Add to Home
// Screen" hint instead. Dismissals are remembered in localStorage.
import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

const DISMISS_KEY = "lf-install-dismissed";

type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
}
function isStandalone() {
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as any).standalone === true;
}

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null);
  const [show, setShow] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* localStorage blocked — carry on */
    }

    const onBIP = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BIPEvent);
      setShow(true);
    };
    window.addEventListener("beforeinstallprompt", onBIP);
    window.addEventListener("appinstalled", () => setShow(false));

    // iOS never fires beforeinstallprompt — show the manual hint after a beat.
    let t: ReturnType<typeof setTimeout> | undefined;
    if (isIOS()) t = setTimeout(() => { setIosHint(true); setShow(true); }, 2500);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBIP);
      if (t) clearTimeout(t);
    };
  }, []);

  const dismiss = () => {
    setShow(false);
    try { localStorage.setItem(DISMISS_KEY, "1"); } catch { /* ignore */ }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="install-bar" role="dialog" aria-label="Install LensFlow">
      <Download size={16} />
      {iosHint ? (
        <span>Install LensFlow: tap <b>Share</b>, then <b>Add to Home Screen</b>.</span>
      ) : (
        <span>Add LensFlow to your home screen — full screen, one tap.</span>
      )}
      {!iosHint && <button className="button button-primary" onClick={install}>Install</button>}
      <button className="install-x" onClick={dismiss} aria-label="Dismiss"><X size={15} /></button>
    </div>
  );
}
