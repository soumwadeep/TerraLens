"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";

const LINKS = [
  { href: "/open", label: "Open AI" },
  { href: "/lab", label: "Model lab" },
  { href: "/demo", label: "Demo" },
  { href: "/judge", label: "Judge" },
  { href: "/about", label: "About" },
] as const;

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Public-site header — quiet, paper-like, one job: get you into the app. */
export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="container-page flex h-14 items-center justify-between gap-3">
        <Link href="/" className="flex items-center gap-2" aria-label="TerraLens home">
          <Logo className="h-7 w-7 text-forest" />
          <span className="font-display text-lg font-semibold tracking-tight">TerraLens</span>
        </Link>

        <nav aria-label="Site" className="hidden items-center gap-1 md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={isActive(pathname, link.href) ? "page" : undefined}
              className={cn(
                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive(pathname, link.href)
                  ? "text-forest"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Button asChild size="sm">
            <Link href="/home">
              Open app
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      <nav aria-label="Site (compact)" className="border-t md:hidden">
        <ul className="scrollbar-none container-page flex items-stretch gap-1 overflow-x-auto py-1">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={isActive(pathname, link.href) ? "page" : undefined}
                className={cn(
                  "tap-target flex items-center whitespace-nowrap rounded-lg px-3 text-xs font-medium",
                  isActive(pathname, link.href)
                    ? "text-forest"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
