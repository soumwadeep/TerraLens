import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

/**
 * Public site shell: landing, /open, /about, /privacy, /judge, /demo, /lab/*.
 * The installed app lives under the (shell) group instead.
 */
export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] flex-col">
      <SiteHeader />
      <div id="main" className="flex-1">
        {children}
      </div>
      <Footer />
    </div>
  );
}
