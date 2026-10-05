import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProductImage } from "./_components/ProductImage";
import { BarcodeSummary } from "./_components/BarcodeSummary";
import { FoodstuffsDetails } from "./_components/FoodstuffsDetails";
import { WoolworthsDetails } from "./_components/WoolworthsDetails";
import {
  FoodstuffsSummaryTags,
  WoolworthsSummaryTags,
} from "./_components/ProductSummaryTags";
import {
  FoodstuffsProductDescription,
  WoolworthsProductDescription,
} from "./_components/ProductDescription";
import { getProductDetails } from "@/app/api/products/[product]/get-product-details";
import { getImageUrl } from "@/utils/get-image-url";
import { OriginalReference } from "./_components/DetailPrimitives";
import type {
  FoodstuffsProductDetail,
  WoolworthsStoredDetail,
} from "@/types/grocer-detail";

export default async function ProductPage({
  params,
}: PageProps<"/[locale]/product/[product]">) {
  const { locale, product: productParam } = await params;

  if (!/^\d+$/.test(productParam)) {
    notFound();
  }

  const product = await getProductDetails(Number(productParam), locale);

  if (!product) {
    notFound();
  }

  const t = await getTranslations("Product");
  const imageUrl = getImageUrl(product);
  const size = [product.size, product.unit].filter(Boolean).join(" ");
  const sourceDetail = product.detail?.detail;
  const originalSourceDetail = product.originalDetail?.detail;

  return (
    <div className="min-h-home bg-background pb-bottom-nav lg:pb-section">
      <article className="mx-auto w-full max-w-content px-page-x py-section">
        <header className="flex w-full flex-col gap-section lg:flex-row">
          <ProductImage
            key={imageUrl ?? product.barcodes.join(",")}
            src={imageUrl}
            alt={t("imageAlt", { name: product.name })}
            fallbackLabel={t("imageUnavailable")}
          />

          <div className="min-w-0 w-full max-w-reading">
            <h1 className="break-words text-display font-bold tracking-tight text-foreground">
              {product.name}
            </h1>
            {product.originalName ? (
              <OriginalReference>{product.originalName}</OriginalReference>
            ) : null}
            <p className="mt-copy-gap text-body text-foreground-muted">
              {product.brand || t("brandUnavailable")}
            </p>
            {product.source === "woolworths" &&
            sourceDetail !== undefined &&
            typeof sourceDetail !== "string" ? (
              <>
                <WoolworthsSummaryTags
                  detail={
                    sourceDetail as Exclude<WoolworthsStoredDetail, string>
                  }
                  originalDetail={
                    typeof originalSourceDetail === "object"
                      ? (originalSourceDetail as Exclude<
                          WoolworthsStoredDetail,
                          string
                        >)
                      : undefined
                  }
                />
                <WoolworthsProductDescription
                  detail={
                    sourceDetail as Exclude<WoolworthsStoredDetail, string>
                  }
                  originalDetail={
                    typeof originalSourceDetail === "object"
                      ? (originalSourceDetail as Exclude<
                          WoolworthsStoredDetail,
                          string
                        >)
                      : undefined
                  }
                />
              </>
            ) : product.source &&
              product.source !== "woolworths" &&
              sourceDetail !== undefined ? (
              <>
                <FoodstuffsSummaryTags
                  detail={sourceDetail as FoodstuffsProductDetail}
                  originalDetail={
                    typeof originalSourceDetail === "object"
                      ? (originalSourceDetail as FoodstuffsProductDetail)
                      : undefined
                  }
                />
                <FoodstuffsProductDescription
                  detail={sourceDetail as FoodstuffsProductDetail}
                  originalDetail={
                    typeof originalSourceDetail === "object"
                      ? (originalSourceDetail as FoodstuffsProductDetail)
                      : undefined
                  }
                />
              </>
            ) : null}
            {locale !== "en" && !product.translationAvailable ? (
              <p className="mt-control-gap text-label text-warning-foreground">
                {t("translationUnavailable")}
              </p>
            ) : null}

            <dl className="mt-8 grid gap-copy-gap border-y border-border py-copy-gap text-label sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-foreground-muted">
                  {t("size")}
                </dt>
                <dd className="mt-control-gap break-words text-foreground">
                  {size || t("notAvailable")}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground-muted">
                  {t("barcodes")}
                </dt>
                <dd className="mt-control-gap text-foreground">
                  <BarcodeSummary
                    barcodes={product.barcodes}
                    fallback={t("notAvailable")}
                  />
                </dd>
              </div>
            </dl>
          </div>
        </header>

        {product.source === "woolworths" && sourceDetail !== undefined ? (
          <WoolworthsDetails
            detail={sourceDetail as WoolworthsStoredDetail}
            originalDetail={
              originalSourceDetail as WoolworthsStoredDetail | undefined
            }
          />
        ) : product.source && sourceDetail !== undefined ? (
          <FoodstuffsDetails
            detail={sourceDetail as FoodstuffsProductDetail}
            originalDetail={
              typeof originalSourceDetail === "object"
                ? (originalSourceDetail as FoodstuffsProductDetail)
                : undefined
            }
          />
        ) : (
          <p className="mt-section text-body text-foreground-muted">
            {t("detailsUnavailable")}
          </p>
        )}
      </article>
    </div>
  );
}
