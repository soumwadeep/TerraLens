"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/lab", label: "Overview" },
  { href: "/lab/models", label: "Models" },
  { href: "/lab/evaluation", label: "Evaluation" },
  { href: "/lab/observability", label: "Observability" },
  { href: "/lab/offline", label: "Offline" },
  { href: "/lab/architecture", label: "Architecture" },
];

export function LabNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Model lab sections"
      className="scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
    >
      <ul className="flex w-max gap-1 rounded-xl border bg-card p-1">
        {TABS.map((tab) => {
          const active = pathname === tab.href;
          return (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-forest text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
