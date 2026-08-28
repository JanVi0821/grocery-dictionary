import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProductImage } from "./_components/ProductImage";
import { getProductDetails } from "@/app/api/products/[product]/get-product-details";
import { getImageUrl } from "@/utils/get-image-url";

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
            <p className="mt-copy-gap text-body text-foreground-muted">
              {product.brand || t("brandUnavailable")}
            </p>

            <dl className="mt-section grid gap-copy-gap border-y border-border py-copy-gap text-label sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-foreground-muted">{t("size")}</dt>
                <dd className="mt-control-gap break-words text-foreground">
                  {size || t("notAvailable")}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground-muted">{t("barcodes")}</dt>
                <dd className="mt-control-gap break-all text-foreground">
                  {product.barcodes.join(", ")}
                </dd>
              </div>
            </dl>
          </div>
        </header>
      </article>
    </div>
  );
}
