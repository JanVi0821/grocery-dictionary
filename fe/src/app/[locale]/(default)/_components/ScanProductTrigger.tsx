"use client";

import { useCallback } from "react";
import {
  type ScanBarcodeResult,
  useScanBarcode,
} from "@/components/scan-barcode/scan-barcode-context";
import { useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function ScanProductTrigger({
  children,
}: {
  children: React.ReactNode;
}) {
  const { scanBarcode } = useScanBarcode();
  const router = useRouter();

  const handleScanSuccess = useCallback(
    async (barcode: string): Promise<ScanBarcodeResult> => {
      try {
        const response = await fetch(
          `/api/products?barcode=${encodeURIComponent(barcode)}`,
          { cache: "no-store" },
        );

        if (response.status === 404) {
          return "notFound";
        }

        if (!response.ok) {
          return "lookupFailed";
        }

        const result: unknown = await response.json();

        if (
          typeof result !== "object" ||
          result === null ||
          !("productId" in result) ||
          typeof result.productId !== "number"
        ) {
          return "lookupFailed";
        }

        router.push(`/product/${result.productId}`);
        return "success";
      } catch {
        return "lookupFailed";
      }
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
