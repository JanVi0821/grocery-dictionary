import type { ReactNode } from "react";
import { MobileNavigation } from "../../../components/layouts/MobileNavigation";
import { SiteHeader } from "@/components/layouts/SiteHeader";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-brand-butter text-foreground">
      <SiteHeader />
      <main>{children}</main>
      <MobileNavigation />
    </div>
  );
}
