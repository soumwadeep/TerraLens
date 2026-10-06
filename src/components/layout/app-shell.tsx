"use client";

/**
 * Mobile-first application shell: quiet top bar + bottom tab navigation.
 * Designed so the app is usable one-handed at 360px width (spec §62).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Footprints, Leaf, Settings, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo, Wordmark } from "@/components/layout/logo";
import { NetworkBadge } from "@/components/layout/network-badge";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const NAV_ITEMS = [
  { href: "/home", label: "Today", icon: Footprints },
  { href: "/journal", label: "Journal", icon: BookOpen },
  { href: "/score", label: "Score", icon: Leaf },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-[100dvh] flex-col">
      <header className="safe-top sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
        <div className="container-page flex h-14 items-center justify-between gap-3">
          <Link href="/home" className="flex items-center gap-2" aria-label="TerraLens home">
            <Logo className="h-7 w-7 text-forest" />
            <Wordmark className="text-lg" />
          </Link>
          <div className="flex items-center gap-1.5">
            <NetworkBadge />
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main id="main" className="container-page flex-1 pb-24 pt-4">
        {children}
      </main>

      <nav
        aria-label="Primary"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75"
      >
        <ul className="container-page flex h-16 items-stretch justify-between">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isActive(pathname, href);
            return (
              <li key={href} className="flex-1">
                <Link
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "tap-target flex h-full flex-col items-center justify-center gap-1 rounded-lg text-xs font-medium transition-colors",
                    active ? "text-forest" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className={cn("h-5 w-5", active && "stroke-[2.25]")} aria-hidden />
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

/**
 * Standard page heading used across shell pages.
 */
export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-3">
      <div>
        <h1 className="text-balance font-display text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? (
          <p className="mt-1 text-pretty text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
