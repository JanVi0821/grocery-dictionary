import { History, ScanBarcode, Settings } from "lucide-react";

export const navigationItems = [
  { href: "/", label: "scan", icon: ScanBarcode },
  { href: "/history", label: "history", icon: History },
  { href: "/settings", label: "settings", icon: Settings },
] as const;
