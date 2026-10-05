"use client";

import { useCallback } from "react";
import {
  type ScanBarcodeResult,
  useScanBarcode,
} from "@/components/scan-barcode/scan-barcode-context";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { lookupProductByBarcode } from "@/utils/lookup-product-by-barcode";

export function ScanProductTrigger({
  children,
}: {
  children: React.ReactNode;
}) {
  const { scanBarcode } = useScanBarcode();
  const router = useRouter();

  const handleScanSuccess = useCallback(
    async (barcode: string): Promise<ScanBarcodeResult> => {
      const result = await lookupProductByBarcode(barcode);
      if (result.status !== "success") return result.status;

      router.push(`/product/${result.productId}`);
      return "success";
    },
    [router],
  );

  return (
    <button
      type="button"
      className={cn("cursor-pointer")}
      onClick={() => scanBarcode(handleScanSuccess)}
    >
      {children}
    </button>
  );
}
