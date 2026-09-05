// The companion picker: unlike the creator "avatar" room type (a booked time
// slot, see Home.tsx RoomBooking), a companion has no schedule — pick one and
// start talking any time. See server/companions.ts for the memory mechanics.
import { ArrowUpRight } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function Companions() {
  const { isAuthenticated } = useAuth();
  const companionsQuery = trpc.companions.listCurated.useQuery();
  const subscription = trpc.companions.subscription.useQuery(undefined, { enabled: isAuthenticated });
  const subscribe = trpc.companions.subscribe.useMutation();
  const manageBilling = trpc.companions.manageBilling.useMutation();

  const price = subscription.data
    ? `${(subscription.data.priceCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2 })} ${subscription.data.currency.toUpperCase()}/week`
    : "";

  return (
    <main className="site-shell">
      <header className="nav-wrap">
        <a className="brand" href="/" aria-label="LensFlow home"><span className="brand-mark" aria-hidden="true"><i /><b /></span><span>LensFlow</span></a>
        <nav className="nav-links" aria-label="Main navigation">
          <a href="/">Live rooms</a><a href="/companions">Companions</a>
        </nav>
        {!isAuthenticated && <a className="nav-cta" href="/login">Sign in <ArrowUpRight size={15} /></a>}
      </header>

      <section className="section-pad">
        <div className="section-label">LENSFLOW COMPANIONS <span>PICK ONE</span></div>
        <h2 style={{ marginTop: 24 }}>An AI companion<br /><span className="editorial-accent">that remembers you.</span></h2>
        <p className="booking-intro" style={{ marginTop: 18 }}>Pick a companion, start talking. It remembers your last conversation instead of resetting every time you close the app.</p>
        <a className="text-link" href="/companions/create-self-avatar" style={{ marginTop: 16 }}>Or build one that's actually you <ArrowUpRight size={15} /></a>

        {isAuthenticated && subscription.data && (
          subscription.data.active ? (
            <div className="companion-subbar">
              <span>Subscription active{subscription.data.currentPeriodEnd ? ` · renews ${new Date(subscription.data.currentPeriodEnd).toLocaleDateString()}` : ""}</span>
              {subscription.data.canManageBilling && (
                <button className="button button-outline" onClick={() => manageBilling.mutate(undefined, { onSuccess: ({ url }) => { if (url) window.location.href = url; } })} disabled={manageBilling.isPending}>Manage billing</button>
              )}
            </div>
          ) : (
            <div className="companion-subbar">
              <span>Chatting with a companion needs a subscription — {price}, cancel anytime.</span>
              <button className="button button-primary" onClick={() => subscribe.mutate(undefined, { onSuccess: ({ checkoutUrl }) => { if (checkoutUrl) window.location.href = checkoutUrl; } })} disabled={subscribe.isPending}>
                {subscribe.isPending ? "Opening…" : "Subscribe"}
              </button>
            </div>
          )
        )}

        <div className="companions-grid" style={{ marginTop: 46 }}>
          {companionsQuery.isLoading && <p className="studio-status">Loading companions…</p>}
          {companionsQuery.isError && <p className="form-error">Couldn't load companions right now.</p>}
          {companionsQuery.data?.map(companion => (
            <a className="companion-card" href={`/companions/${companion.id}`} key={companion.id}>
              <div className="companion-avatar">
                {companion.avatarImageUrl ? (
                  <img src={companion.avatarImageUrl} alt={companion.name} />
                ) : (
                  <span className="coming-soon-badge">Art coming soon</span>
                )}
              </div>
              <div className="companion-info">
                <span className="companion-name">{companion.name}</span>
                {companion.tagline && <span className="companion-tagline">{companion.tagline}</span>}
              </div>
            </a>
          ))}
        </div>
      </section>
    </main>
  );
}
