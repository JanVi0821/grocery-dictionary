"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ScanBarcodeProvider } from "@/components/scan-barcode/ScanBarcodeProvider";

type AppProvidersProps = {
  children: ReactNode;
};

export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(() => new QueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <ScanBarcodeProvider>{children}</ScanBarcodeProvider>
    </QueryClientProvider>
  );
}
