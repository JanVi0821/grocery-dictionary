import type {
  FoodstuffsProductDetail,
  WoolworthsProductDetail,
} from "@/types/grocer-detail";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { formatNzd, shouldShowOriginal } from "./DetailPrimitives";

function SummaryTag({
  label,
  originalValue,
  variant,
  value,
}: {
  label: string;
  originalValue?: string | null;
  variant: "butter" | "coral" | "neutral" | "teal";
  value: string | null | undefined;
}) {
  if (!value) return null;

  return (
    <Badge asChild className="max-w-full items-center gap-control-gap text-label" variant={variant}>
      <li aria-label={label}>
        <span className="min-w-0 break-words">{value}</span>
        {shouldShowOriginal(value, originalValue) ? (
          <span className="min-w-0 break-words text-xs font-normal text-foreground-muted/65">
            {originalValue}
          </span>
        ) : null}
      </li>
    </Badge>
  );
}

function foodstuffsCategories(detail: FoodstuffsProductDetail) {
  const categoryPaths = detail.categoryTrees?.map((tree) =>
    [tree.level0, tree.level1, tree.level2].filter(Boolean).join(" › "),
  );
  return (detail.categories?.length ? detail.categories : categoryPaths)?.join(" · ");
}

function foodstuffsUnitPrice(detail: FoodstuffsProductDetail) {
  return detail.comparativePricePerUnit === undefined
    ? null
    : `${formatNzd(detail.comparativePricePerUnit, true)} per ${detail.comparativeUnitQuantity ?? ""} ${detail.comparativeUnitQuantityUoM ?? detail.comparativeUnitMeasureDescription ?? ""}`.trim();
}

export function FoodstuffsSummaryTags({
  detail,
  originalDetail,
}: {
  detail: FoodstuffsProductDetail;
  originalDetail?: FoodstuffsProductDetail;
}) {
  const t = useTranslations("Product.detail.fields");
  const categories = foodstuffsCategories(detail);
  const unitPrice = foodstuffsUnitPrice(detail);

  return (
    <ul className="mt-copy-gap flex flex-wrap items-start gap-control-gap">
      <SummaryTag
        label={t("category")}
        originalValue={originalDetail ? foodstuffsCategories(originalDetail) : null}
        variant="teal"
        value={categories}
      />
      <SummaryTag
        label={t("regularPrice")}
        variant="butter"
        value={formatNzd(detail.nonLoyaltyCardPrice, true)}
      />
      <SummaryTag
        label={t("unitPrice")}
        originalValue={originalDetail ? foodstuffsUnitPrice(originalDetail) : null}
        variant="coral"
        value={unitPrice}
      />
    </ul>
  );
}

export function WoolworthsSummaryTags({
  detail,
  originalDetail,
}: {
  detail: WoolworthsProductDetail;
  originalDetail?: WoolworthsProductDetail;
}) {
  const t = useTranslations("Product.detail.fields");

  return (
    <ul className="mt-copy-gap flex flex-wrap items-start gap-control-gap">
      <SummaryTag label={t("type")} originalValue={originalDetail?.genericName} value={detail.genericName} variant="teal" />
      <SummaryTag label={t("variety")} originalValue={originalDetail?.variety} value={detail.variety} variant="coral" />
      <SummaryTag label={t("package")} originalValue={originalDetail?.size.packageType} value={detail.size.packageType} variant="neutral" />
      <SummaryTag
        label={t("originalPrice")}
        variant="butter"
        value={formatNzd(detail.price.originalPrice)}
      />
    </ul>
  );
}
