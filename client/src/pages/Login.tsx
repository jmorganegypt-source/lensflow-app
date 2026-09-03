// Real, standalone sign-in / sign-up — email + password, no third party.
// This is what startLogin() in client/src/const.ts sends people to. See
// server/auth.ts and the `auth` router in server/routers.ts for the
// server-side half.
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { trpc } from "@/lib/trpc";

export default function Login() {
  const [mode, setMode] = useState<"signIn" | "signUp">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const utils = trpc.useUtils();

  const login = trpc.auth.login.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.href = "/";
    },
  });
  const register = trpc.auth.register.useMutation({
    onSuccess: async () => {
      await utils.auth.me.invalidate();
      window.location.href = "/";
    },
  });

  const pending = login.isPending || register.isPending;
  const error = mode === "signIn" ? login.error : register.error;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "signIn") {
      login.mutate({ email, password });
    } else {
      register.mutate({ email, password, name });
    }
  };

  return (
    <main className="site-shell">
      <section className="section-pad">
        <div className="section-label">CREATOR DESK <span>{mode === "signIn" ? "SIGN IN" : "SIGN UP"}</span></div>
        <h2>{mode === "signIn" ? "Welcome back." : "Create your account."}<br /><span className="editorial-accent">{mode === "signIn" ? "Sign in to your desk." : "Set up your creator desk."}</span></h2>

        <form className="booking-form" style={{ maxWidth: 440, marginTop: 30 }} onSubmit={submit}>
          {mode === "signUp" && (
            <label>Name<input value={name} onChange={event => setName(event.target.value)} required placeholder="Your name" /></label>
          )}
          <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} required placeholder="you@example.com" autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} required minLength={mode === "signUp" ? 8 : undefined} placeholder={mode === "signUp" ? "At least 8 characters" : "Your password"} autoComplete={mode === "signIn" ? "current-password" : "new-password"} /></label>
          <button className="button button-primary" type="submit" disabled={pending}>
            {pending ? "Please wait…" : mode === "signIn" ? "Sign in" : "Create account"} <ArrowUpRight size={15} />
          </button>
          {error && <p className="form-error">{error.message}</p>}
        </form>

        <p className="studio-status" style={{ marginTop: 20 }}>
          {mode === "signIn" ? "New to LensFlow?" : "Already have an account?"}{" "}
          <button type="button" className="link-button" onClick={() => setMode(mode === "signIn" ? "signUp" : "signIn")}>
            {mode === "signIn" ? "Create an account" : "Sign in instead"}
          </button>
        </p>
      </section>
    </main>
  );
}
