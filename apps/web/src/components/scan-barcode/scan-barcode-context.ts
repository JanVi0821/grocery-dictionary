"use client";

import { createContext, useContext } from "react";

export type ScanBarcodeResult = "success" | "notFound" | "lookupFailed";

export type ScanBarcodeCallback = (
  barcode: string,
) => Promise<ScanBarcodeResult>;

type ScanBarcodeContextValue = {
  scanBarcode: (onSuccess: ScanBarcodeCallback) => void;
};

export const ScanBarcodeContext = createContext<ScanBarcodeContextValue | null>(
  null,
);

export function useScanBarcode() {
  const context = useContext(ScanBarcodeContext);

  if (!context) {
    throw new Error("useScanBarcode must be used within ScanBarcodeProvider");
  }

  return context;
}
