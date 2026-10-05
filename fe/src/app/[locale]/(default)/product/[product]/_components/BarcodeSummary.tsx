"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

type BarcodeSummaryProps = {
  barcodes: readonly string[];
  fallback: string;
};

export function BarcodeSummary({ barcodes, fallback }: BarcodeSummaryProps) {
  const uniqueBarcodes = [...new Set(barcodes)];
  const [firstBarcode, ...remainingBarcodes] = uniqueBarcodes;

  if (!firstBarcode) return <>{fallback}</>;

  return (
    <span className="inline-flex max-w-full items-center gap-control-gap">
      <span className="break-all">{firstBarcode}</span>
      {remainingBarcodes.length ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="focus-ring shrink-0 rounded-pill border border-border bg-surface-muted px-control-gap py-0.5 font-semibold text-foreground"
            >
              +{remainingBarcodes.length}
            </button>
          </TooltipTrigger>
          <TooltipContent
            className="max-w-[min(20rem,calc(100vw-2rem))] bg-surface text-foreground shadow-raised [&>svg]:bg-surface [&>svg]:fill-surface"
            sideOffset={8}
          >
            <ul className="space-y-control-gap">
              {remainingBarcodes.map((barcode) => (
                <li className="break-all" key={barcode}>{barcode}</li>
              ))}
            </ul>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </span>
  );
}
