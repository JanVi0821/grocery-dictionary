export type BarcodeLookupResult =
  | { status: "success"; productId: number }
  | { status: "notFound" | "lookupFailed" };

export async function lookupProductByBarcode(
  barcode: string,
): Promise<BarcodeLookupResult> {
  try {
    const response = await fetch(
      `/api/products?barcode=${encodeURIComponent(barcode)}`,
      { cache: "no-store" },
    );

    if (response.status === 404) return { status: "notFound" };
    if (!response.ok) return { status: "lookupFailed" };

    const result: unknown = await response.json();

    if (
      typeof result !== "object" ||
      result === null ||
      !("productId" in result) ||
      typeof result.productId !== "number"
    ) {
      return { status: "lookupFailed" };
    }

    return { status: "success", productId: result.productId };
  } catch {
    return { status: "lookupFailed" };
  }
}
