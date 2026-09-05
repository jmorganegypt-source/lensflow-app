// Owner-only control room: platform metrics, the promo-credit pool, and
// curated-companion management. Every query/mutation here is an
// adminProcedure (server/routers.ts `admin`) — a non-admin session gets a
// FORBIDDEN error, and the page also gates on user.role client-side so it
// never flashes the dashboard.
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { startLogin } from "@/const";

function money(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat("en-AU", { style: "currency", currency: currency.toUpperCase() }).format((cents || 0) / 100);
  } catch {
    return `$${((cents || 0) / 100).toFixed(2)}`;
  }
}
const fmtDate = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "—");
const daysLeft = (d: string | Date | null | undefined) => {
  if (!d) return 0;
  return Math.max(0, Math.ceil((new Date(d).getTime() - Date.now()) / 86_400_000));
};

const STATUS_TONE: Record<string, string> = { active: "good", trialing: "good", past_due: "warn", incomplete: "warn", unpaid: "bad", canceled: "bad" };

export default function Admin() {
  const { user, isAuthenticated, loading } = useAuth();
  const isAdmin = user?.role === "admin";

  const overview = trpc.admin.overview.useQuery(undefined, { enabled: isAdmin });
  const users = trpc.admin.users.useQuery(undefined, { enabled: isAdmin });
  const grants = trpc.admin.promoGrants.useQuery(undefined, { enabled: isAdmin });
  const companions = trpc.admin.listCompanions.useQuery(undefined, { enabled: isAdmin });

  const grant = trpc.admin.grantCredits.useMutation();
  const createCompanion = trpc.admin.createCompanion.useMutation();
  const setPublic = trpc.admin.setCompanionPublic.useMutation();
  const del = trpc.admin.deleteCompanion.useMutation();

  const [gEmail, setGEmail] = useState("");
  const [gCredits, setGCredits] = useState("7");
  const [gNote, setGNote] = useState("");

  const [cName, setCName] = useState("");
  const [cTagline, setCTagline] = useState("");
  const [cPersonality, setCPersonality] = useState("");
  const [cLook, setCLook] = useState("");
  const [cImage, setCImage] = useState("");
  const [cVoice, setCVoice] = useState("");
  const [cAnamAvatar, setCAnamAvatar] = useState("");
  const [cAnamVoice, setCAnamVoice] = useState("");
  const [cPublic, setCPublic] = useState(true);
  const [confirmDel, setConfirmDel] = useState<number | null>(null);

  if (loading) return null;

  if (!isAuthenticated || !isAdmin) {
    return (
      <main className="site-shell">
        <div className="admin-gate">
          <div className="admin-group-label" style={{ justifyContent: "center", border: 0 }}>LENSFLOW ADMIN</div>
          <h1 className="admin-title" style={{ margin: 0 }}>{isAuthenticated ? "Not your room" : "Sign in"}</h1>
          <p className="admin-lede" style={{ margin: 0 }}>
            {isAuthenticated ? "This account isn't an admin. Sign in with the owner account." : "The control room is owner-only."}
          </p>
          {!isAuthenticated && <button className="button button-primary" onClick={() => startLogin()}>Sign in <ArrowUpRight size={16} /></button>}
          <a className="text-link" href="/companions" style={{ justifyContent: "center" }}>← Back to LensFlow</a>
        </div>
      </main>
    );
  }

  const o = overview.data;
  const currency = o?.companionSubscriptions.currency ?? "aud";
  const pool = o?.promo;
  const poolPct = pool ? Math.min(100, Math.round((pool.spent / pool.pool) * 100)) : 0;

  const submitGrant = (e: React.FormEvent) => {
    e.preventDefault();
    if (grant.isPending) return;
    grant.mutate(
      { email: gEmail.trim(), credits: parseInt(gCredits, 10) || 0, note: gNote.trim() || undefined },
      { onSuccess: () => { setGNote(""); overview.refetch(); grants.refetch(); users.refetch(); } }
    );
  };

  const submitCompanion = (e: React.FormEvent) => {
    e.preventDefault();
    if (createCompanion.isPending) return;
    createCompanion.mutate(
      {
        name: cName.trim(),
        tagline: cTagline.trim() || undefined,
        personality: cPersonality.trim(),
        look: cLook.trim() || undefined,
        imageUrl: cImage.trim() || undefined,
        elevenlabsVoiceId: cVoice.trim() || undefined,
        anamAvatarId: cAnamAvatar.trim() || undefined,
        anamVoiceId: cAnamVoice.trim() || undefined,
        isPublic: cPublic,
      },
      {
        onSuccess: () => {
          setCName(""); setCTagline(""); setCPersonality(""); setCLook(""); setCImage(""); setCVoice(""); setCAnamAvatar(""); setCAnamVoice("");
          companions.refetch(); overview.refetch();
        },
      }
    );
  };

  return (
    <main className="site-shell">
      <header className="nav-wrap">
        <a className="brand" href="/companions" aria-label="LensFlow"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>LensFlow</span></a>
        <nav className="nav-links" aria-label="Main navigation"><a href="/companions">Companions</a><a href="/creators">Live rooms</a><a href="/admin" style={{ color: "var(--ivory)" }}>Admin</a></nav>
      </header>

      <div className="admin-wrap">
        <div className="admin-group-label" style={{ border: 0, margin: "8px 0 0" }}>CONTROL ROOM</div>
        <h1 className="admin-title">Overview</h1>
        <p className="admin-lede">Signed in as {user?.email}. {overview.isLoading ? "Loading numbers…" : overview.error ? "Couldn't load metrics." : `Updated ${new Date().toLocaleTimeString("en-AU")}.`}</p>

        {/* --- Headline metrics --- */}
        <div className="admin-grid">
          <div className="admin-card">
            <p className="k">Users</p>
            <div className="v">{o ? o.users.total : "—"}</div>
            <p className="sub"><b>+{o?.users.new7d ?? 0}</b> in the last 7 days · {o?.users.admins ?? 0} admin</p>
          </div>
          <div className="admin-card">
            <p className="k">Creators</p>
            <div className="v">{o ? o.creators.profiles : "—"}</div>
            <p className="sub"><b>{o?.creators.live ?? 0}</b> live now · {o?.creators.publishedRooms ?? 0} published rooms</p>
          </div>
          <div className="admin-card">
            <p className="k">Companion subscribers</p>
            <div className="v">{o ? o.companionSubscriptions.paying : "—"}</div>
            <p className="sub">paying at {money(o?.companionSubscriptions.priceCents ?? 0, currency)}/wk</p>
          </div>
          <div className="admin-card">
            <p className="k">Companion revenue</p>
            <div className="v">{o ? money(o.companionSubscriptions.weeklyRecurringCents, currency) : "—"}<small> /wk</small></div>
            <p className="sub"><b>{o ? money(o.companionSubscriptions.annualRunRateCents, currency) : "—"}</b> annual run-rate</p>
          </div>
          <div className="admin-card">
            <p className="k">Booking revenue (gross)</p>
            <div className="v">{o ? money(o.bookings.grossCents, currency) : "—"}</div>
            <p className="sub"><b>{o?.bookings.paid ?? 0}</b> paid bookings</p>
          </div>
          <div className="admin-card">
            <p className="k">Platform cut (19%)</p>
            <div className="v">{o ? money(o.bookings.platformCutCents, currency) : "—"}</div>
            <p className="sub"><b>{o ? money(o.bookings.creatorPayoutsOwedCents, currency) : "—"}</b> owed to creators</p>
          </div>
          <div className="admin-card">
            <p className="k">Companions</p>
            <div className="v">{o ? o.companions.curated : "—"}</div>
            <p className="sub">{o?.companions.designed ?? 0} user-designed · {o?.companions.conversations ?? 0} chats · {o?.companions.messages ?? 0} messages</p>
          </div>
          <div className="admin-card">
            <p className="k">Promo pool left</p>
            <div className="v">{pool ? pool.remaining : "—"}<small> / {pool?.pool ?? 5000}</small></div>
            <p className="sub"><b>{pool?.activeNow ?? 0}</b> on comp access now · {pool?.recipients ?? 0} ever</p>
          </div>
        </div>

        {/* --- What packages paid --- */}
        <div className="admin-group-label">WHAT PACKAGES PAID <span>subscriptions by status + bookings</span></div>
        <div className="admin-two">
          <div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Companion subscription</th><th>Status</th><th>Count</th></tr></thead>
                <tbody>
                  {o && Object.keys(o.companionSubscriptions.byStatus).length === 0 && (
                    <tr><td colSpan={3} style={{ color: "#8f838f" }}>No subscriptions yet.</td></tr>
                  )}
                  {o && Object.entries(o.companionSubscriptions.byStatus).map(([status, n]) => (
                    <tr key={status}>
                      <td>Companions weekly — {money(o.companionSubscriptions.priceCents, currency)}</td>
                      <td><span className={`pill ${STATUS_TONE[status] ?? ""}`}>{status.replace("_", " ")}</span></td>
                      <td><b>{n}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>Creator bookings</th><th>Value</th></tr></thead>
                <tbody>
                  <tr><td>Paid bookings</td><td><b>{o?.bookings.paid ?? 0}</b></td></tr>
                  <tr><td>Gross booking volume</td><td><b>{o ? money(o.bookings.grossCents, currency) : "—"}</b></td></tr>
                  <tr><td>Platform share (19%)</td><td><b>{o ? money(o.bookings.platformCutCents, currency) : "—"}</b></td></tr>
                  <tr><td>Creator payouts still owed</td><td><b>{o ? money(o.bookings.creatorPayoutsOwedCents, currency) : "—"}</b></td></tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* --- Promo credits --- */}
        <div className="admin-group-label">PROMOTIONAL CREDITS <span>1 credit = 1 day of full Companions access</span></div>
        <div className="admin-two">
          <div className="admin-panel">
            <h3>Give credits</h3>
            <p className="hint">
              {pool ? <><b style={{ color: "var(--champagne)" }}>{pool.remaining}</b> of {pool.pool} credits left in the pool.</> : "Loading pool…"}
            </p>
            <div className="pool-meter"><i style={{ width: `${poolPct}%` }} /></div>
            <form className="admin-form" onSubmit={submitGrant}>
              <label>Recipient email<input type="email" required value={gEmail} onChange={e => setGEmail(e.target.value)} placeholder="them@example.com" /></label>
              <div className="row2">
                <label>Credits (days)<input type="number" min={1} max={pool?.remaining ?? 5000} required value={gCredits} onChange={e => setGCredits(e.target.value)} /></label>
                <label>Note (optional)<input value={gNote} onChange={e => setGNote(e.target.value)} maxLength={200} placeholder="e.g. launch promo" /></label>
              </div>
              <button className="button button-primary" type="submit" disabled={grant.isPending || (pool?.remaining ?? 0) <= 0}>
                {grant.isPending ? "Granting…" : "Grant credits"} <ArrowUpRight size={15} />
              </button>
              {grant.error && <p className="admin-msg err">{grant.error.message}</p>}
              {grant.data && <p className="admin-msg ok">Gave {grant.data.credits} credits to {grant.data.email} — access until {fmtDate(grant.data.accessUntil)}. {grant.data.poolRemaining} left.</p>}
            </form>
          </div>
          <div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th>When</th><th>Recipient</th><th>Credits</th><th>Note</th></tr></thead>
                <tbody>
                  {(grants.data?.length ?? 0) === 0 && <tr><td colSpan={4} style={{ color: "#8f838f" }}>No grants yet.</td></tr>}
                  {grants.data?.map(g => (
                    <tr key={g.id}>
                      <td>{fmtDate(g.createdAt)}</td>
                      <td>{g.email ?? `user #${g.userId}`}</td>
                      <td><b>{g.credits}</b></td>
                      <td style={{ color: "#8f838f" }}>{g.note ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* --- Create / manage curated companions --- */}
        <div className="admin-group-label">COMPANIONS <span>the public roster on /companions</span></div>
        <div className="admin-two">
          <div className="admin-panel">
            <h3>Create an avatar</h3>
            <p className="hint">Leave the image URL blank to generate a synthetic portrait from the look (needs OPENAI_API_KEY, ~30s). Or paste a <code>/companions/name.jpg</code> path or a data URL.</p>
            <form className="admin-form" onSubmit={submitCompanion}>
              <div className="row2">
                <label>Name<input required value={cName} onChange={e => setCName(e.target.value)} maxLength={80} /></label>
                <label>Tagline<input value={cTagline} onChange={e => setCTagline(e.target.value)} maxLength={160} /></label>
              </div>
              <label>Personality (seeds every chat)<textarea required minLength={10} maxLength={2000} value={cPersonality} onChange={e => setCPersonality(e.target.value)} placeholder="How she talks, what she's like, what she cares about." /></label>
              <label>Look — for generation<input value={cLook} onChange={e => setCLook(e.target.value)} maxLength={400} placeholder="late twenties, dark wavy hair, warm smile, cosy sunlit room" /></label>
              <label>…or image URL / path<input value={cImage} onChange={e => setCImage(e.target.value)} placeholder="/companions/nadia.jpg" /></label>
              <div className="row2">
                <label>ElevenLabs voice ID<input value={cVoice} onChange={e => setCVoice(e.target.value)} maxLength={64} placeholder="EXAVITQu4vr4xnSDxMaL" /></label>
                <label>Anam avatar ID<input value={cAnamAvatar} onChange={e => setCAnamAvatar(e.target.value)} maxLength={64} /></label>
              </div>
              <label>Anam voice ID<input value={cAnamVoice} onChange={e => setCAnamVoice(e.target.value)} maxLength={64} /></label>
              <label className="panel-checkbox" style={{ textTransform: "none", letterSpacing: 0 }}>
                <input type="checkbox" checked={cPublic} onChange={e => setCPublic(e.target.checked)} /> Show on the public roster immediately
              </label>
              <button className="button button-primary" type="submit" disabled={createCompanion.isPending}>
                {createCompanion.isPending ? (cImage.trim() ? "Creating…" : "Generating portrait… (~30s)") : "Create companion"} <ArrowUpRight size={15} />
              </button>
              {createCompanion.error && <p className="admin-msg err">{createCompanion.error.message}</p>}
              {createCompanion.data && <p className="admin-msg ok">Created companion #{createCompanion.data.companionId}.</p>}
            </form>
          </div>
          <div>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead><tr><th></th><th>Name</th><th>Live</th><th>Actions</th></tr></thead>
                <tbody>
                  {(companions.data?.length ?? 0) === 0 && <tr><td colSpan={4} style={{ color: "#8f838f" }}>No curated companions.</td></tr>}
                  {companions.data?.map(c => (
                    <tr key={c.id}>
                      <td>{c.avatarImageUrl ? <img className="admin-thumb" src={c.avatarImageUrl} alt="" /> : <div className="admin-thumb" />}</td>
                      <td><b style={{ color: "var(--ivory)" }}>{c.name}</b><br /><span style={{ color: "#8f838f", fontSize: 11 }}>{c.tagline}</span></td>
                      <td>{c.isPublic ? <span className="pill good">live</span> : <span className="pill">hidden</span>}</td>
                      <td>
                        <div className="admin-row-actions">
                          <button className="admin-mini" disabled={setPublic.isPending} onClick={() => setPublic.mutate({ companionId: c.id, isPublic: !c.isPublic }, { onSuccess: () => { companions.refetch(); overview.refetch(); } })}>
                            {c.isPublic ? "Hide" : "Publish"}
                          </button>
                          {confirmDel === c.id ? (
                            <button className="admin-mini" style={{ borderColor: "rgba(255,156,188,.6)", color: "#ff9cbc" }} disabled={del.isPending} onClick={() => del.mutate({ companionId: c.id }, { onSuccess: () => { setConfirmDel(null); companions.refetch(); overview.refetch(); } })}>
                              Confirm delete
                            </button>
                          ) : (
                            <button className="admin-mini" onClick={() => setConfirmDel(c.id)}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* --- Recent users --- */}
        <div className="admin-group-label">RECENT SIGNUPS <span>newest 50</span></div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead><tr><th>Joined</th><th>Name</th><th>Email</th><th>Role</th><th>Comp access</th><th>Last seen</th></tr></thead>
            <tbody>
              {(users.data?.length ?? 0) === 0 && <tr><td colSpan={6} style={{ color: "#8f838f" }}>No users.</td></tr>}
              {users.data?.map(u => (
                <tr key={u.id}>
                  <td>{fmtDate(u.createdAt)}</td>
                  <td style={{ color: "var(--ivory)" }}>{u.name ?? "—"}</td>
                  <td>{u.email ?? "—"}</td>
                  <td>{u.role === "admin" ? <span className="pill warn">admin</span> : "user"}</td>
                  <td>{daysLeft(u.companionAccessUntil) > 0 ? <span className="pill good">{daysLeft(u.companionAccessUntil)}d left</span> : (u.promoCredits > 0 ? <span style={{ color: "#8f838f" }}>expired</span> : "—")}</td>
                  <td style={{ color: "#8f838f" }}>{fmtDate(u.lastSignedIn)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="admin-lede" style={{ marginTop: 40 }}><a className="text-link" href="/companions">← Back to LensFlow</a></p>
      </div>
    </main>
  );
}
