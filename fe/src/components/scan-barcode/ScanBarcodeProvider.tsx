"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ScanBarcodeContext,
  type ScanBarcodeCallback,
} from "./scan-barcode-context";

const ScanBarcodeDialog = dynamic(
  () =>
    import("./ScanBarcodeDialog").then((module) => module.ScanBarcodeDialog),
  { ssr: false },
);

type ScanBarcodeProviderProps = {
  children: ReactNode;
};

export function ScanBarcodeProvider({ children }: ScanBarcodeProviderProps) {
  const [hasOpened, setHasOpened] = useState(false);
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState(0);
  const onSuccessRef = useRef<ScanBarcodeCallback | null>(null);

  const scanBarcode = useCallback((onSuccess: ScanBarcodeCallback) => {
    onSuccessRef.current = onSuccess;
    setHasOpened(true);
    setSession((current) => current + 1);
    setOpen(true);
  }, []);

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    setOpen(nextOpen);

    if (!nextOpen) {
      onSuccessRef.current = null;
    }
  }, []);

  const handleScanSuccess = useCallback(async (barcode: string) => {
    const onSuccess = onSuccessRef.current;

    return onSuccess ? onSuccess(barcode) : "lookupFailed";
  }, []);

  const value = useMemo(() => ({ scanBarcode }), [scanBarcode]);

  return (
    <ScanBarcodeContext.Provider value={value}>
      {children}
      {hasOpened && (
        <ScanBarcodeDialog
          key={session}
          open={open}
          onOpenChange={handleOpenChange}
          onScanSuccess={handleScanSuccess}
        />
      )}
    </ScanBarcodeContext.Provider>
  );
}
