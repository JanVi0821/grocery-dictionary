import type {
  FoodstuffsProductDetail,
  WoolworthsProductDetail,
} from "@/types/grocer-detail";
import { Badge } from "@/components/ui/badge";
import { formatNzd, shouldShowOriginal } from "./DetailPrimitives";

function SummaryTag({
  originalValue,
  variant,
  value,
}: {
  originalValue?: string | null;
  variant: "butter" | "coral" | "neutral" | "teal";
  value: string | null | undefined;
}) {
  if (!value) return null;

  return (
    <Badge
      asChild
      className="max-w-full min-w-0 flex-wrap justify-start items-center gap-control-gap text-label"
      variant={variant}
    >
      <li>
        <span className="break-words">{value}</span>
        {shouldShowOriginal(value, originalValue) ? (
          <span className="break-words text-xs font-normal text-foreground-muted/65">
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
  return (detail.categories?.length ? detail.categories : categoryPaths)?.join(
    " · ",
  );
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
  const categories = foodstuffsCategories(detail);
  const unitPrice = foodstuffsUnitPrice(detail);

  return (
    <ul className="mt-copy-gap flex flex-wrap items-start gap-control-gap">
      <SummaryTag
        originalValue={
          originalDetail ? foodstuffsCategories(originalDetail) : null
        }
        variant="teal"
        value={categories}
      />
      <SummaryTag
        variant="butter"
        value={formatNzd(detail.nonLoyaltyCardPrice, true)}
      />
      <SummaryTag
        originalValue={
          originalDetail ? foodstuffsUnitPrice(originalDetail) : null
        }
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
  return (
    <ul className="mt-copy-gap flex flex-wrap items-start gap-control-gap">
      <SummaryTag
        originalValue={originalDetail?.genericName}
        value={detail.genericName}
        variant="teal"
      />
      <SummaryTag
        originalValue={originalDetail?.variety}
        value={detail.variety}
        variant="coral"
      />
      <SummaryTag
        originalValue={originalDetail?.size.packageType}
        value={detail.size.packageType}
        variant="neutral"
      />
      <SummaryTag
        variant="butter"
        value={formatNzd(detail.price.originalPrice)}
      />
    </ul>
  );
}
