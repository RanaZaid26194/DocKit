import { createFileRoute, Link } from "@tanstack/react-router";
import logo from "/logo.png?url";

const SITE_URL = "https://the-dockit.vercel.app";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DocKit — help renters send complete housing paperwork" },
      { name: "description", content: "A renter-controlled copilot that checks affordable-housing documents on-device before a human reviewer sees them. People decide eligibility, always." },
      { property: "og:title", content: "DocKit — complete housing paperwork, on the first try" },
      { property: "og:description", content: "Prevent one paperwork mistake from delaying an affordable-housing application for weeks." },
      { property: "og:url", content: SITE_URL },
    ],
    links: [{ rel: "canonical", href: SITE_URL }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "WebSite",
        name: "DocKit",
        url: SITE_URL,
      }),
    }],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <a href="/" className="flex items-center gap-2">
            <img src={logo} alt="DocKit logo" width={32} height={32} />
            <span className="text-lg font-semibold">DocKit</span>
          </a>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/auth" search={{ mode: "signin" }} className="rounded-md px-3 py-2 hover:bg-muted">Sign in</Link>
            <Link to="/auth" search={{ mode: "signup" }} className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground">Create free account</Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-3xl px-6 py-16 text-center">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Don't let one missing paper delay a home.
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">
            DocKit helps renters put together complete, current, correctly-matched
            housing paperwork — checked on their own phone, before it ever reaches your desk.
            Your team still makes every eligibility decision.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/auth" search={{ mode: "signup" }} className="rounded-md bg-primary px-6 py-3 text-base font-medium text-primary-foreground">
              Create a housing office account
            </Link>
            <a href="#how" className="rounded-md border border-input px-6 py-3 text-base font-medium">See how it works</a>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-5xl px-6 pb-16">
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              { h: "You set the requirements", p: "Pick a starting template (Section 8, LIHTC, public housing) and edit until it matches your program." },
              { h: "Renters upload on their phone", p: "Text reading and metadata checks run on the renter's device. Nothing gets sent to any AI service." },
              { h: "You review a clean packet", p: "You see per-document pass, fix, or flag notes — and you make the call." },
            ].map((c) => (
              <article key={c.h} className="rounded-lg border border-border bg-card p-5">
                <h2 className="text-lg font-semibold">{c.h}</h2>
                <p className="mt-2 text-sm text-muted-foreground">{c.p}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-border bg-muted/40">
          <div className="mx-auto max-w-3xl px-6 py-12 text-sm text-muted-foreground">
            <p><strong className="text-foreground">Privacy first.</strong> Document images are checked on the renter's phone using text recognition, then stored temporarily so your team can review them. Once a decision is made, the images are deleted automatically — only the pass/fix/flag record stays behind.</p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-muted-foreground">
          DocKit does not decide who qualifies for housing. It helps make sure paperwork is complete before a person reviews it.
        </div>
      </footer>
    </div>
  );
}
