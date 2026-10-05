import type { WoolworthsStoredDetail } from "@/types/grocer-detail";
import { useTranslations } from "next-intl";
import { DetailGrid, DetailItem, DetailSection, hasDetailValue, OriginalReference, shouldShowOriginal, TextList } from "./DetailPrimitives";
import { WoolworthsNutritionTable } from "./WoolworthsNutritionTable";

export function WoolworthsDetails({
  detail,
  originalDetail,
}: {
  detail: WoolworthsStoredDetail;
  originalDetail?: WoolworthsStoredDetail;
}) {
  const t = useTranslations("Product.detail");

  return (
    <div className="mt-section w-full">
      {typeof detail === "string" ? (
        <p className="text-label leading-6 text-foreground-muted">{t("unsupportedDetail")}</p>
      ) : (
        <WoolworthsProductDetails
          detail={detail}
          originalDetail={typeof originalDetail === "object" ? originalDetail : undefined}
        />
      )}
    </div>
  );
}

function WoolworthsProductDetails({
  detail,
  originalDetail,
}: {
  detail: Exclude<WoolworthsStoredDetail, string>;
  originalDetail?: Exclude<WoolworthsStoredDetail, string>;
}) {
  const t = useTranslations("Product.detail");
  const hasNutritionDetails =
    detail.nutrition?.some((table) => table && table.rows.length > 0) ?? false;
  const healthStarRating =
    detail.healthStarRating > 0 ? detail.healthStarRating / 2 : null;
  const hasIngredients = hasDetailValue([
    detail.ingredients?.ingredients,
    detail.origins,
    detail.servingSuggestion,
    detail.directions,
  ]);
  const hasAllergens = hasDetailValue([
    detail.allergens,
    detail.allergenMaybePresent,
    detail.warnings,
    detail.claims,
    detail.contents,
    detail.endorsements,
  ]);

  return (
    <>
      {hasIngredients ? (
        <DetailSection title={t("sections.ingredientsAndDirections")}>
          <DetailGrid>
            {hasDetailValue(detail.ingredients?.ingredients) ? (
              <DetailItem label={t("fields.ingredients")}>
                <div className="space-y-control-gap">
                  {detail.ingredients?.ingredients.map((ingredient, index) => (
                    <p
                      className="[&_sup]:align-baseline [&_sup]:text-[inherit] [&_sup]:leading-[inherit]"
                      dangerouslySetInnerHTML={{ __html: ingredient }}
                      key={`${index}-${ingredient}`}
                    />
                  ))}
                </div>
                {detail.ingredients?.footnotes?.length ? (
                  <div
                    aria-label={t("ingredientNotes")}
                    className="mt-copy-gap text-xs leading-5 text-foreground-muted"
                    role="note"
                  >
                    {detail.ingredients.footnotes.map((footnote, index) => (
                      <p key={`${index}-${footnote}`}>{footnote}</p>
                    ))}
                  </div>
                ) : null}
                {shouldShowOriginal(detail.ingredients, originalDetail?.ingredients) ? (
                  <OriginalReference>
                    <div className="space-y-control-gap">
                      {originalDetail?.ingredients?.ingredients.map((ingredient, index) => (
                        <p
                          className="[&_sup]:align-baseline [&_sup]:text-[inherit] [&_sup]:leading-[inherit]"
                          dangerouslySetInnerHTML={{ __html: ingredient }}
                          key={`${index}-${ingredient}`}
                        />
                      ))}
                    </div>
                    {originalDetail?.ingredients?.footnotes?.length ? (
                      <div className="mt-control-gap">
                        {originalDetail.ingredients.footnotes.map((footnote, index) => (
                          <p key={`${index}-${footnote}`}>{footnote}</p>
                        ))}
                      </div>
                    ) : null}
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
            {hasDetailValue(detail.origins) ? (
              <DetailItem label={t("fields.origin")}>
                <TextList items={detail.origins} />
                {shouldShowOriginal(detail.origins, originalDetail?.origins) ? (
                  <OriginalReference>
                    <TextList items={originalDetail?.origins} />
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
            {hasDetailValue(detail.servingSuggestion) ? (
              <DetailItem label={t("fields.servingSuggestion")}>
                {detail.servingSuggestion}
                {shouldShowOriginal(detail.servingSuggestion, originalDetail?.servingSuggestion) ? (
                  <OriginalReference>
                    {originalDetail?.servingSuggestion}
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
            {hasDetailValue(detail.directions) ? (
              <DetailItem label={t("fields.directions")}>
                {detail.directions}
                {shouldShowOriginal(detail.directions, originalDetail?.directions) ? (
                  <OriginalReference>
                    {originalDetail?.directions}
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
          </DetailGrid>
        </DetailSection>
      ) : null}

      {hasAllergens ? (
        <DetailSection title={t("sections.allergensAndClaims")}>
          <DetailGrid>
            {hasDetailValue(detail.allergens) ? (
              <DetailItem label={t("fields.allergens")}>
                <TextList items={detail.allergens} />
                {shouldShowOriginal(detail.allergens, originalDetail?.allergens) ? (
                  <OriginalReference>
                    <TextList items={originalDetail?.allergens} />
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
            {hasDetailValue(detail.allergenMaybePresent) ? (
              <DetailItem label={t("fields.mayContain")}>
                {detail.allergenMaybePresent}
                {shouldShowOriginal(detail.allergenMaybePresent, originalDetail?.allergenMaybePresent) ? (
                  <OriginalReference>
                    {originalDetail?.allergenMaybePresent}
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
            {hasDetailValue(detail.warnings) ? (
              <DetailItem label={t("fields.warnings")}>
                <TextList items={detail.warnings} />
                {shouldShowOriginal(detail.warnings, originalDetail?.warnings) ? (
                  <OriginalReference>
                    <TextList items={originalDetail?.warnings} />
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
            {hasDetailValue(detail.claims) ? (
              <DetailItem label={t("fields.claims")}>
                <TextList items={detail.claims} />
                {shouldShowOriginal(detail.claims, originalDetail?.claims) ? (
                  <OriginalReference>
                    <TextList items={originalDetail?.claims} />
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
            {hasDetailValue(detail.contents) ? (
              <DetailItem label={t("fields.contents")}>
                <TextList items={detail.contents} />
                {shouldShowOriginal(detail.contents, originalDetail?.contents) ? (
                  <OriginalReference>
                    <TextList items={originalDetail?.contents} />
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
            {hasDetailValue(detail.endorsements) ? (
              <DetailItem label={t("fields.endorsements")}>
                <TextList items={detail.endorsements} />
                {shouldShowOriginal(detail.endorsements, originalDetail?.endorsements) ? (
                  <OriginalReference>
                    <TextList items={originalDetail?.endorsements} />
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
          </DetailGrid>
        </DetailSection>
      ) : null}

      {hasNutritionDetails ? (
        <DetailSection title={t("sections.nutritionalInformation")}>
          <WoolworthsNutritionTable
            healthStarRating={healthStarRating}
            nutrition={detail.nutrition}
            originalNutrition={originalDetail?.nutrition}
          />
        </DetailSection>
      ) : null}
    </>
  );
}
