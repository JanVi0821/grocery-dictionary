import { ApiError } from "@/requests/fetch";
import { requestProductByBarcode } from "@/requests/products";

export type BarcodeLookupResult =
  | { status: "success"; productId: number }
  | { status: "notFound" | "lookupFailed" };

export async function lookupProductByBarcode(
  barcode: string,
): Promise<BarcodeLookupResult> {
  try {
    const result = await requestProductByBarcode(barcode);

    if (typeof result.productId !== "number") {
      return { status: "lookupFailed" };
    }

    return { status: "success", productId: result.productId };
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      return { status: "notFound" };
    }
    return { status: "lookupFailed" };
  }
}
