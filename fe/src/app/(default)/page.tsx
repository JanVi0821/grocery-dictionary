import { Barcode, Scan } from "lucide-react";
import Link from "next/link";

export default function Home() {
  return (
    <div className="bg-brand-butter">
      <section
        className="mx-auto flex min-h-home w-full max-w-content flex-col items-center justify-center gap-section px-page-x pb-bottom-nav pt-section lg:pb-section"
        aria-labelledby="home-heading"
      >
        <div className="w-full max-w-reading text-center">
          <h1
            id="home-heading"
            className="text-display font-bold tracking-tight text-foreground"
          >
            Your grocery assistant.
          </h1>
          <p className="mt-copy-gap text-body font-medium text-foreground-muted">
            Scan a barcode to check ingredients, allergens, and nutrition.
          </p>
        </div>

        <div className="flex w-full flex-col items-center gap-page-x">
          <Link
            href="/scan"
            className="focus-ring flex aspect-square w-full max-w-scan-control flex-col items-center justify-center gap-page-x rounded-page bg-primary p-page-x text-primary-foreground shadow-raised"
            aria-label="Scan product"
          >
            <span
              className="relative flex size-scan-mark items-center justify-center"
              aria-hidden="true"
            >
              <Scan
                className="size-scan-mark text-brand-coral"
                strokeWidth={3}
              />
              <Barcode
                className="absolute size-logo text-primary-foreground"
                strokeWidth={3}
              />
            </span>
            <span className="text-body font-bold">Scan product</span>
          </Link>

          <Link
            href="/barcode"
            className="focus-ring flex min-h-touch w-full max-w-manual-control items-center justify-center rounded-control border border-border bg-surface px-page-x text-label font-semibold text-foreground shadow-control lg:max-w-manual-control-desktop"
          >
            Enter barcode manually
          </Link>
        </div>
      </section>
    </div>
  );
}
