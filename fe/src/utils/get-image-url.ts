import type { Tables } from "@/types/generated/database.types";

type ProductImageInput = Pick<Tables<"products">, "code" | "image" | "source">;
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
  { code, image }: ProductImageInput,
  options: GetImageUrlOptions = {},
) {
  const { isFullSize } = options;
  if (!/^\d{1,13}$/.test(code) || !isRecord(image) || !isRecord(image.front)) {
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

  const barcode = code.padStart(13, "0");
  const parts = barcode.match(/^(\d{3})(\d{3})(\d{3})(\d{4})$/);

  if (!parts) {
    return null;
  }

  return `https://images.openfoodfacts.org/images/products/${parts.slice(1).join("/")}/front_en.${imageId}.${size}.jpg`;
}

const IMAGE_URL_BUILDERS: Record<string, ImageUrlBuilder> = {
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
