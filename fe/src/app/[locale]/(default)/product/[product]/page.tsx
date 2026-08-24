import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ProductImage } from "./_components/ProductImage";
import { getProductDetails } from "@/app/api/products/[product]/get-product-details";
import type { Json } from "@/types/generated/database.types";
import { getImageUrl } from "@/utils/get-image-url";

const NUTRIENT_KEYS = [
  ["energy-kcal_100g", "energy", "kcal"],
  ["fat_100g", "fat", "g"],
  ["saturated-fat_100g", "saturatedFat", "g"],
  ["carbohydrates_100g", "carbohydrates", "g"],
  ["sugars_100g", "sugars", "g"],
  ["proteins_100g", "protein", "g"],
  ["salt_100g", "salt", "g"],
] as const;

function getNutrients(nutriments: Json) {
  if (!nutriments || Array.isArray(nutriments) || typeof nutriments !== "object") {
    return [];
  }

  return NUTRIENT_KEYS.flatMap(([key, label, unit]) => {
    const value = nutriments[key];
    return typeof value === "number" ? [{ label, unit, value }] : [];
  });
}

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
  const name = product.product_name ?? product.generic_name ?? t("unnamed");
  const nutrients = getNutrients(product.nutriments);
  const numberFormat = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const imageUrl = getImageUrl(product);

  return (
    <div className="min-h-home bg-background pb-bottom-nav lg:pb-section">
      <article className="mx-auto w-full max-w-content px-page-x py-section">
        <header className="flex w-full flex-col gap-section lg:flex-row">
          <ProductImage
            key={imageUrl ?? product.barcodes.join(",")}
            src={imageUrl}
            alt={t("imageAlt", { name })}
            fallbackLabel={t("imageUnavailable")}
          />

          <div className="min-w-0 w-full max-w-reading">
            <h1 className="break-words text-display font-bold tracking-tight text-foreground">
              {name}
            </h1>
            <p className="mt-copy-gap text-body text-foreground-muted">
              {[product.brands?.join(", "), product.quantity]
                .filter(Boolean)
                .join(" · ") || t("detailsUnavailable")}
            </p>
            <dl className="mt-section grid gap-copy-gap border-y border-border py-copy-gap text-label sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-foreground-muted">{t("barcode")}</dt>
                <dd className="mt-control-gap break-all text-foreground">
                  {product.barcodes.join(", ")}
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-foreground-muted">{t("origin")}</dt>
                <dd className="mt-control-gap break-words text-foreground">
                  {product.origin || t("notAvailable")}
                </dd>
              </div>
            </dl>
            {locale !== "en" && product.language_code !== locale && (
              <p className="mt-copy-gap rounded-control bg-missing-background p-control-x text-label text-missing-foreground">
                {t("translationFallback")}
              </p>
            )}
          </div>
        </header>

        <div className="mt-section grid w-full max-w-content gap-section lg:grid-cols-2">
          <div className="min-w-0 space-y-section">
            <section aria-labelledby="ingredients-heading">
              <h2 id="ingredients-heading" className="text-body font-bold text-foreground">
                {t("ingredients")}
              </h2>
              <p className="mt-copy-gap break-words text-body text-foreground-muted">
                {product.ingredients_text || t("notAvailable")}
              </p>
            </section>

            <section aria-labelledby="allergens-heading">
              <h2 id="allergens-heading" className="text-body font-bold text-foreground">
                {t("allergens")}
              </h2>
              {product.allergens_tags?.length ? (
                <ul className="mt-copy-gap flex flex-wrap gap-control-gap">
                  {product.allergens_tags.map((allergen) => (
                    <li
                      key={allergen}
                      className="rounded-pill bg-danger-background px-control-x py-control-gap text-label font-semibold text-danger-foreground"
                    >
                      {allergen.replace(/^[a-z]{2}:/, "").replaceAll("-", " ")}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-copy-gap text-body text-foreground-muted">
                  {t("allergensUnavailable")}
                </p>
              )}
            </section>
          </div>

          <section className="min-w-0" aria-labelledby="nutrition-heading">
            <h2 id="nutrition-heading" className="text-body font-bold text-foreground">
              {t("nutritionPer100g")}
            </h2>
            {nutrients.length ? (
              <dl className="mt-copy-gap divide-y divide-border border-y border-border">
                {nutrients.map(({ label, unit, value }) => (
                  <div
                    key={label}
                    className="flex min-h-touch items-center justify-between gap-copy-gap py-control-gap text-body"
                  >
                    <dt className="text-foreground-muted">{t(`nutrients.${label}`)}</dt>
                    <dd className="shrink-0 font-semibold tabular-nums text-foreground">
                      {numberFormat.format(value)} {unit}
                    </dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="mt-copy-gap text-body text-foreground-muted">
                {t("notAvailable")}
              </p>
            )}
          </section>
        </div>
      </article>
    </div>
  );
}
