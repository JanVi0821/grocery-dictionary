import type { FoodstuffsProductDetail } from "@/types/grocer-detail";
import { useTranslations } from "next-intl";
import { DetailGrid, DetailItem, DetailSection, hasDetailValue, OriginalReference, shouldShowOriginal } from "./DetailPrimitives";
import { FoodstuffsNutritionTable } from "./FoodstuffsNutritionTable";
import { MarkdownContent } from "./MarkdownContent";

export function FoodstuffsDetails({
  detail,
  originalDetail,
}: {
  detail: FoodstuffsProductDetail;
  originalDetail?: FoodstuffsProductDetail;
}) {
  const t = useTranslations("Product.detail");
  const ingredients = detail.fsIngredientStatement ?? detail.ingredientStatement;
  const originalIngredients = originalDetail?.fsIngredientStatement ?? originalDetail?.ingredientStatement;
  const allergens = hasDetailValue(detail.fsContainsAllergenStatement)
    ? detail.fsContainsAllergenStatement
    : detail.allergenStatement;
  const originalAllergens = hasDetailValue(originalDetail?.fsContainsAllergenStatement)
    ? originalDetail?.fsContainsAllergenStatement
    : originalDetail?.allergenStatement;
  const hasIngredients = hasDetailValue([ingredients, detail.originStatement]);
  const hasAllergens = hasDetailValue([
    allergens,
    detail.fsSupplementaryAllergenStatement,
    detail.warningCopyDescription,
  ]);
  const hasNutrition = hasDetailValue(detail.nutritionalInfo?.nutrients);

  return (
    <div className="mt-section w-full">
      {hasIngredients ? (
        <DetailSection title={t("sections.ingredientsAndOrigin")}>
          <DetailGrid>
            {hasDetailValue(ingredients) ? (
              <DetailItem label={t("fields.ingredients")}>
                <MarkdownContent value={ingredients} />
                {shouldShowOriginal(ingredients, originalIngredients) ? (
                  <OriginalReference>
                    <MarkdownContent value={originalIngredients} />
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
            {hasDetailValue(detail.originStatement) ? (
              <DetailItem label={t("fields.origin")}>
                {detail.originStatement}
                {shouldShowOriginal(detail.originStatement, originalDetail?.originStatement) ? (
                  <OriginalReference>
                    {originalDetail?.originStatement}
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
          </DetailGrid>
        </DetailSection>
      ) : null}

      {hasAllergens ? (
        <DetailSection title={t("sections.allergensAndWarnings")}>
          <DetailGrid>
            {hasDetailValue(allergens) ? (
              <DetailItem label={t("fields.containsAllergens")}>
                <MarkdownContent value={allergens} />
                {shouldShowOriginal(allergens, originalAllergens) ? (
                  <OriginalReference>
                    <MarkdownContent value={originalAllergens} />
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
            {hasDetailValue(detail.fsSupplementaryAllergenStatement) ? (
              <DetailItem label={t("fields.mayContain")}>
                {detail.fsSupplementaryAllergenStatement}
                {shouldShowOriginal(detail.fsSupplementaryAllergenStatement, originalDetail?.fsSupplementaryAllergenStatement) ? (
                  <OriginalReference>
                    {originalDetail?.fsSupplementaryAllergenStatement}
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
            {hasDetailValue(detail.warningCopyDescription) ? (
              <DetailItem label={t("fields.warning")}>
                {detail.warningCopyDescription}
                {shouldShowOriginal(detail.warningCopyDescription, originalDetail?.warningCopyDescription) ? (
                  <OriginalReference>
                    {originalDetail?.warningCopyDescription}
                  </OriginalReference>
                ) : null}
              </DetailItem>
            ) : null}
          </DetailGrid>
        </DetailSection>
      ) : null}

      {hasNutrition ? (
        <DetailSection title={t("sections.nutritionalInformation")}>
          <FoodstuffsNutritionTable
            nutrition={detail.nutritionalInfo}
            originalNutrition={originalDetail?.nutritionalInfo}
          />
        </DetailSection>
      ) : null}

    </div>
  );
}
