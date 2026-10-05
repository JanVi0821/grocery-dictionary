"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ScanBarcodeProvider } from "@/components/scan-barcode/ScanBarcodeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ScanBarcodeProvider>{children}</ScanBarcodeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
