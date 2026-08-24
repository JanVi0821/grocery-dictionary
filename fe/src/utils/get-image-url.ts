import type { Tables } from "@/types/generated/database.types";

type ProductImageInput = Pick<Tables<"products">, "barcodes" | "image" | "source">;
type ImageUrlBuilder = (
  product: ProductImageInput,
  options?: GetImageUrlOptions,
) => string | null;

type GetImageUrlOptions = {
  isFullSize?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getOpenFoodFactsImageUrl(
  { barcodes, image }: ProductImageInput,
  options: GetImageUrlOptions = {},
) {
  const { isFullSize } = options;
  // The first item is the original Open Food Facts barcode; appended Grocer
  // barcodes must not change which Open Food Facts image directory we use.
  const primaryBarcode = barcodes[0];
  if (
    !primaryBarcode ||
    !/^\d{13,}$/.test(primaryBarcode) ||
    !isRecord(image) ||
    !isRecord(image.front)
  ) {
    return null;
  }

  const imageId = image.front.rev ?? image.front.imgid;
  const sizes = image.front.sizes;

  if (
    (typeof imageId !== "string" && typeof imageId !== "number") ||
    !isRecord(sizes)
  ) {
    return null;
  }

  const size = isFullSize
    ? "full"
    : Object.hasOwn(sizes, "400")
      ? "400"
      : Object.hasOwn(sizes, "200")
        ? "200"
        : "100";

  // A 13-digit code stored as GTIN-14 has exactly one leading padding zero.
  // Native 13-digit, native 14-digit, and longer codes keep their own digits.
  const imageBarcode =
    primaryBarcode.length === 14 && primaryBarcode.startsWith("0")
      ? primaryBarcode.slice(1)
      : primaryBarcode;

  // Open Food Facts image directories split the barcode as 3-3-3-remainder.
  const parts = imageBarcode.match(/^(\d{3})(\d{3})(\d{3})(\d+)$/);

  if (!parts) {
    return null;
  }

  return `https://images.openfoodfacts.org/images/products/${parts.slice(1).join("/")}/front_en.${imageId}.${size}.jpg`;
}

function getGrocerImageUrl({ image }: ProductImageInput) {
  if (!isRecord(image)) {
    return null;
  }

  const productId = image.id;
  if (
    (typeof productId !== "string" && typeof productId !== "number") ||
    !/^\d+$/.test(String(productId))
  ) {
    return null;
  }

  return `https://assets-prod.grocer.nz/public/product_images/product_${productId}.avif`;
}

const IMAGE_URL_BUILDERS: Record<string, ImageUrlBuilder> = {
  grocer: getGrocerImageUrl,
  openfoodfacts: getOpenFoodFactsImageUrl,
};

export function getImageUrl(
  product: ProductImageInput,
  options?: GetImageUrlOptions,
) {
  return (
    IMAGE_URL_BUILDERS[product.source.toLowerCase()]?.(
      product,
      options ?? {},
    ) ?? null
  );
}
