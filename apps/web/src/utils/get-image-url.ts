import type { Tables } from "@/types/generated/database.types";

type ProductImageInput = Pick<Tables<"products">, "grocer_id">;

type ProductDetailInput = ProductImageInput & { detail?: unknown };

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asUrl(value: unknown): string | null {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
}

function getDetailImageUrl({ detail }: ProductDetailInput) {
  const storedDetail = asRecord(detail);
  const sourceDetail = asRecord(storedDetail?.detail);
  if (!sourceDetail) return null;

  const directImage = asUrl(sourceDetail.bigImageUrl) ?? asUrl(sourceDetail.smallImageUrl);
  if (directImage) return directImage;

  const images = asRecord(sourceDetail.images);
  const primaryImages = asRecord(images?.primaryImages);
  const foodstuffsImage =
    asUrl(primaryImages?.["500px"]) ??
    asUrl(primaryImages?.["400px"]) ??
    asUrl(primaryImages?.["300px"]);
  if (foodstuffsImage) return foodstuffsImage;

  if (Array.isArray(sourceDetail.images)) {
    const woolworthsImage = sourceDetail.images
      .map(asRecord)
      .find((image) => image && (asUrl(image.big) ?? asUrl(image.small)));
    if (woolworthsImage) return asUrl(woolworthsImage.big) ?? asUrl(woolworthsImage.small);
  }

  const alternateImages = Array.isArray(images?.alternateImages)
    ? images.alternateImages
    : [];
  return alternateImages.map(asRecord).map((image) => asUrl(image?.url)).find(Boolean) ?? null;
}

function getGrocerImageUrl({ grocer_id }: ProductImageInput) {
  if (!grocer_id) return null;

  const productId = grocer_id;
  if (
    (typeof productId !== "string" && typeof productId !== "number") ||
    !/^\d+$/.test(String(productId))
  ) {
    return null;
  }

  return `https://assets-prod.grocer.nz/public/product_images/product_${productId}.avif`;
}

export function getImageUrl(product: ProductDetailInput) {
  return getDetailImageUrl(product) ?? getGrocerImageUrl(product);
}
