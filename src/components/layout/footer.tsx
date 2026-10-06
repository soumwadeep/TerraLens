import Link from "next/link";
import { Logo } from "@/components/layout/logo";

const COLUMNS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  {
    title: "Explore",
    links: [
      { href: "/home", label: "Today" },
      { href: "/expeditions/new", label: "New expedition" },
      { href: "/journal", label: "Journal" },
      { href: "/score", label: "Grass Score" },
    ],
  },
  {
    title: "The open story",
    links: [
      { href: "/open", label: "Open innovation" },
      { href: "/lab", label: "Model lab" },
      { href: "/lab/architecture", label: "Architecture" },
      { href: "/judge", label: "Judge mode" },
    ],
  },
  {
    title: "Trust",
    links: [
      { href: "/privacy", label: "Privacy" },
      { href: "/about", label: "About" },
      { href: "/demo", label: "Demo mode" },
      { href: "/settings", label: "Settings" },
    ],
  },
];

/**
 * Shared footer for public pages (spec §75). Credits are phrased as
 * "Built with…" — accurate technology, no implied endorsement.
 */
export function Footer() {
  return (
    <footer className="mt-20 border-t bg-muted/40">
      <div className="container-page py-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_repeat(3,1fr)]">
          <div>
            <Link href="/" className="inline-flex items-center gap-2" aria-label="TerraLens home">
              <Logo className="h-7 w-7 text-forest" />
              <span className="font-display text-lg font-semibold tracking-tight">TerraLens</span>
            </Link>
            <p className="mt-3 max-w-xs text-pretty text-sm text-muted-foreground">
              An offline-first AI field companion that helps you notice more, explore farther, and
              spend less time looking at your screen.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Built for Hacktoberfest 2026 · DEV Open Source AI Challenge — Week 1: Touch Grass.
            </p>
          </div>

          {COLUMNS.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {column.title}
              </h2>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-sm text-foreground/80 transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-10 border-t pt-6">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-semibold text-foreground/80">Built with</span> Next.js, React,
            Gemma, Mastra, MongoDB Atlas, Temporal, TabPFN, Tiger Data, Backboard, SerpApi,
            ElevenLabs, Sentry, Tailwind CSS and Render.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            TerraLens is an independent open-source project. These are technologies it is built with
            — no sponsorship, partnership or endorsement by these projects is implied.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
            <span>© 2026 TerraLens contributors · MIT License</span>
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <a
              href="https://github.com/soumwadeep/TerraLens"
              className="hover:text-foreground"
              rel="noreferrer"
            >
              GitHub
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
