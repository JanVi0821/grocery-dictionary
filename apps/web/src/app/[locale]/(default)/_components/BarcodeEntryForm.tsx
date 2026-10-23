"use client";

import { useRouter } from "@/i18n/navigation";
import { lookupProductByBarcode } from "@/utils/lookup-product-by-barcode";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";

const EXAMPLE_BARCODE = "09420000251379";

export function BarcodeEntryForm() {
  const router = useRouter();
  const t = useTranslations("Home");
  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState<
    "idle" | "loading" | "notFound" | "lookupFailed"
  >("idle");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "loading") return;

    const queryBarcode = barcode || EXAMPLE_BARCODE;
    setBarcode(queryBarcode);
    setStatus("loading");
    const result = await lookupProductByBarcode(queryBarcode);

    if (result.status === "success") {
      router.push(`/product/${result.productId}`);
      return;
    }

    setStatus(result.status);
  }

  const message =
    status === "notFound"
      ? t("barcodeNotFound")
      : status === "lookupFailed"
        ? t("barcodeLookupFailed")
        : null;

  return (
    <form className="w-full max-w-barcode-control" onSubmit={handleSubmit}>
      <label className="sr-only" htmlFor="barcode-entry">
        {t("enterBarcode")}
      </label>
      <div className="flex min-h-touch overflow-hidden rounded-control border border-border bg-surface shadow-control focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-brand-butter">
        <input
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent px-control-x text-[12px] lg:text-label text-foreground outline-none placeholder:text-foreground-muted"
          disabled={status === "loading"}
          id="barcode-entry"
          inputMode="numeric"
          maxLength={14}
          onChange={(event) => {
            setBarcode(event.target.value.replace(/\D/g, "").slice(0, 14));
            setStatus("idle");
          }}
          pattern="[0-9]*"
          placeholder={t("barcodePlaceholder", { barcode: EXAMPLE_BARCODE })}
          value={barcode}
        />
        <button
          className="focus-ring flex min-w-touch cursor-pointer items-center justify-center bg-primary px-control-x text-primary-foreground disabled:cursor-not-allowed disabled:opacity-60"
          disabled={status === "loading"}
          type="submit"
        >
          <Search className="size-nav-icon" aria-hidden="true" />
        </button>
      </div>
      <div
        aria-live="polite"
        className="mt-control-gap min-h-5 text-center text-xs text-danger"
      >
        {status === "loading" ? (
          <span className="text-foreground-muted">{t("lookingUpBarcode")}</span>
        ) : (
          message
        )}
      </div>
    </form>
  );
}
