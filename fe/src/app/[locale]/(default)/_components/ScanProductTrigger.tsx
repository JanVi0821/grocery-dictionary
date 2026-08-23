"use client";

import {
  ScanBarcodeCallback,
  useScanBarcode,
} from "@/components/scan-barcode/scan-barcode-context";
import { cn } from "@/lib/utils";

export function ScanProductTrigger({
  children,
  onSuccess,
}: {
  children: React.ReactNode;
  onSuccess: ScanBarcodeCallback;
}) {
  const { scanBarcode } = useScanBarcode();

  return (
    <button
      type="button"
      className={cn("cursor-pointer")}
      onClick={() => scanBarcode(onSuccess)}
    >
      {children}
    </button>
  );
}
