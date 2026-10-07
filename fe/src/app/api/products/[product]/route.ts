import { routing } from "@/i18n/routing";
import { logError, requestLogContext } from "@/lib/observability";
import { getProductDetails } from "./get-product-details";

const PRODUCT_ID_PATTERN = /^[1-9]\d*$/;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ product: string }> },
) {
  const { product: productParam } = await params;
  const locale = new URL(request.url).searchParams.get("locale") ?? routing.defaultLocale;

  if (
    !PRODUCT_ID_PATTERN.test(productParam) ||
    !routing.locales.includes(locale as (typeof routing.locales)[number])
  ) {
    return Response.json({ error: "Invalid product request" }, { status: 400 });
  }

  try {
    const product = await getProductDetails(Number(productParam), locale);

    if (!product) {
      return Response.json({ error: "Product not found" }, { status: 404 });
    }

    return Response.json(product);
  } catch (error) {
    logError("product_details_lookup_failed", error, {
      ...requestLogContext(request),
      productId: Number(productParam),
      locale,
    });
    return Response.json({ error: "Product details lookup failed" }, { status: 502 });
  }
}
