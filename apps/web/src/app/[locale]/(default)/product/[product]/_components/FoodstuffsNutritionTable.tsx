import type { FoodstuffsProductDetail } from "@/types/grocer-detail";
import { useTranslations } from "next-intl";
import { OriginalReference, shouldShowOriginal } from "./DetailPrimitives";

type NutritionInfo = NonNullable<FoodstuffsProductDetail["nutritionalInfo"]>;
type Nutrient = NonNullable<NutritionInfo["nutrients"]>[number];

type NutrientGroup = {
  key: string;
  measure?: Nutrient;
  name: string;
  serving?: Nutrient;
};

const unitLabels: Record<string, string> = {
  D70: "cal",
  E14: "kcal",
  GRM: "g",
  KGM: "kg",
  KJO: "kJ",
  MC: "µg",
  MGM: "mg",
  MLT: "mL",
  P1: "%",
};

function formatUnit(unit: string) {
  return unitLabels[unit] ?? unit;
}

function formatAmount(nutrient: Nutrient | undefined) {
  if (!nutrient) return "—";
  const prefix = nutrient.measurementPrecision === "APPROXIMATELY" ? "≈" : "";
  return `${prefix}${nutrient.qtyContained} ${formatUnit(nutrient.nutrientUom)}`;
}

function formatBasis(nutrient: Nutrient | undefined) {
  if (!nutrient) return null;
  return `${nutrient.nutrientBasisQty} ${formatUnit(nutrient.nutrientBasisQtyUom)}`;
}

function getDailyIntake(group: NutrientGroup) {
  const values = [group.serving?.dailyIntake, group.measure?.dailyIntake];
  return values.find((value) => value !== undefined && value > 0) ??
    values.find((value) => value !== undefined);
}

function groupNutrients(nutrients: Nutrient[] | undefined) {
  const groups = new Map<string, NutrientGroup>();

  for (const nutrient of nutrients ?? []) {
    const key = `${nutrient.nutrientType}:${nutrient.preparationState}`;
    const group = groups.get(key) ?? {
      key,
      name: nutrient.nutrientTypeDescription,
    };

    if (nutrient.nutrientBasisQuantityType === "BY_SERVING") {
      group.serving ??= nutrient;
    } else if (nutrient.nutrientBasisQuantityType === "BY_MEASURE") {
      group.measure ??= nutrient;
    }

    groups.set(key, group);
  }

  return [...groups.values()];
}

export function FoodstuffsNutritionTable({
  nutrition,
  originalNutrition,
}: {
  nutrition: FoodstuffsProductDetail["nutritionalInfo"];
  originalNutrition?: FoodstuffsProductDetail["nutritionalInfo"];
}) {
  const t = useTranslations("Product.detail.nutritionTable");
  const groups = groupNutrients(nutrition?.nutrients);
  const originalGroups = new Map(
    groupNutrients(originalNutrition?.nutrients).map((group) => [group.key, group]),
  );

  if (!groups.length) return null;

  const servingBasis = formatBasis(groups.find((group) => group.serving)?.serving);
  const measureBasis = formatBasis(groups.find((group) => group.measure)?.measure);
  const hasDailyIntake = groups.some((group) => {
    const dailyIntake = getDailyIntake(group);
    return dailyIntake !== undefined && dailyIntake > 0;
  });

  return (
    <div className="overflow-x-auto rounded-control border border-border">
      <table className="w-full min-w-[36rem] border-collapse text-left text-label leading-6">
        <thead className="bg-surface-muted text-foreground-muted">
          <tr>
            <th className="px-control-x py-control-gap font-semibold">
              {t("nutrient")}
            </th>
            <th className="px-control-x py-control-gap font-semibold">
              {t("perServing")}
              {servingBasis ? (
                <span className="block text-xs font-normal">{servingBasis}</span>
              ) : null}
            </th>
            <th className="px-control-x py-control-gap font-semibold">
              {t("perBasis")}
              {measureBasis ? (
                <span className="block text-xs font-normal">{measureBasis}</span>
              ) : null}
            </th>
            {hasDailyIntake ? (
              <th className="px-control-x py-control-gap font-semibold">
                {t("dailyIntake")}
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {groups.map((group) => {
            const originalName = originalGroups.get(group.key)?.name;
            const dailyIntake = getDailyIntake(group);

            return (
              <tr key={group.key}>
                <th className="px-control-x py-control-gap font-medium text-foreground">
                  {group.name}
                  {shouldShowOriginal(group.name, originalName) ? (
                    <OriginalReference>{originalName}</OriginalReference>
                  ) : null}
                </th>
                <td className="px-control-x py-control-gap text-foreground">
                  {formatAmount(group.serving)}
                </td>
                <td className="px-control-x py-control-gap text-foreground">
                  {formatAmount(group.measure)}
                </td>
                {hasDailyIntake ? (
                  <td className="px-control-x py-control-gap text-foreground">
                    {dailyIntake === undefined ? "—" : `${dailyIntake}%`}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
