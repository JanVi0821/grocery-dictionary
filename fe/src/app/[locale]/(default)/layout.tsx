import type { ReactNode } from "react";
import { MobileNavigation } from "./_components/MobileNavigation";
import { SiteHeader } from "./_components/SiteHeader";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-butter text-foreground">
      <SiteHeader />
      <main>{children}</main>
      <MobileNavigation />
    </div>
  );
}
