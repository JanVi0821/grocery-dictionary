import type {
  WoolworthsProductDetail,
  WoolworthsNutritionRow,
} from "@/types/grocer-detail";
import { localizeNutritionLabel } from "@/utils/nutrition-label";
import { CircleHelp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { OriginalReference, shouldShowOriginal } from "./DetailPrimitives";
import { HealthStarRating } from "./HealthStarRating";

function NutritionRows({
  locale,
  originalRows,
  rows,
}: {
  locale: string;
  originalRows?: WoolworthsNutritionRow[] | null;
  rows: WoolworthsNutritionRow[];
}) {
  return (
    <>
      {rows.map((row, index) => (
        <NutritionRow
          key={`${index}-${row.columns.join("-")}`}
          locale={locale}
          originalRow={originalRows?.[index]}
          row={row}
        />
      ))}
    </>
  );
}

function NutritionRow({
  locale,
  originalRow,
  row,
}: {
  locale: string;
  originalRow?: WoolworthsNutritionRow;
  row: WoolworthsNutritionRow;
}) {
  return (
    <>
      <tr>
        {row.columns.map((column, index) => {
          const originalColumn = originalRow?.columns[index];
          const displayColumn =
            index === 0 && column
              ? localizeNutritionLabel(locale, originalColumn, column)
              : column;

          return (
            <td
              className="px-control-x py-control-gap text-foreground"
              key={index}
            >
              {displayColumn ?? "—"}
              {shouldShowOriginal(displayColumn, originalColumn) ? (
                <OriginalReference>{originalColumn}</OriginalReference>
              ) : null}
            </td>
          );
        })}
      </tr>
      {row.rows ? (
        <NutritionRows
          locale={locale}
          originalRows={originalRow?.rows}
          rows={row.rows}
        />
      ) : null}
    </>
  );
}

export function WoolworthsNutritionTable({
  healthStarRating,
  nutrition,
  originalNutrition,
}: {
  healthStarRating?: number | null;
  nutrition: WoolworthsProductDetail["nutrition"];
  originalNutrition?: WoolworthsProductDetail["nutrition"];
}) {
  const locale = useLocale();
  const detailT = useTranslations("Product.detail");
  const t = useTranslations("Product.detail.nutritionTable");
  const tables =
    nutrition
      ?.map((table, index) => ({
        originalTable: originalNutrition?.[index] ?? null,
        table,
      }))
      .filter(
        (
          entry,
        ): entry is {
          originalTable: NonNullable<typeof entry.originalTable> | null;
          table: NonNullable<typeof entry.table>;
        } => entry.table !== null,
      ) ?? [];
  if (!tables.length) return null;

  return (
    <div className="space-y-copy-gap">
      {tables.map(({ originalTable, table }, index) => (
        <div
          className="overflow-x-auto rounded-control border border-border"
          key={index}
        >
          <table className="w-full min-w-[36rem] border-collapse text-left text-label leading-6">
            <caption className="caption-top px-control-x py-control-gap text-left font-semibold text-foreground">
              <div className="flex items-start justify-between gap-copy-gap">
                <div>
                  {table.servings || t("information")}
                  {shouldShowOriginal(
                    table.servings,
                    originalTable?.servings,
                  ) ? (
                    <OriginalReference>
                      {originalTable?.servings}
                    </OriginalReference>
                  ) : null}
                </div>
                {index === 0 &&
                healthStarRating !== null &&
                healthStarRating !== undefined ? (
                  <div className="flex flex-col shrink-0 items-end">
                    <a
                      aria-label={detailT("healthStarExplanation")}
                      className="focus-ring inline-flex items-center gap-control-gap rounded-control text-primary underline underline-offset-2"
                      href="https://www.healthstarrating.gov.au/about"
                      rel="noreferrer"
                      target="_blank"
                    >
                      {detailT("fields.healthStarRating")}
                      <CircleHelp className="size-[1em]" aria-hidden="true" />
                    </a>
                    <HealthStarRating value={healthStarRating} />
                  </div>
                ) : null}
              </div>
            </caption>
            <thead className="bg-surface-muted text-foreground-muted">
              <tr>
                {table.columnHeaders.map((header, headerIndex) => {
                  const originalHeader =
                    originalTable?.columnHeaders[headerIndex];
                  const displayHeader = [
                    localizeNutritionLabel(
                      locale,
                      originalHeader?.name,
                      header.name,
                    ),
                    header.suffix,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const originalHeaderText = [
                    originalHeader?.name,
                    originalHeader?.suffix,
                  ]
                    .filter(Boolean)
                    .join(" ");

                  return (
                    <th
                      className="px-control-x py-control-gap font-semibold"
                      key={headerIndex}
                    >
                      {displayHeader}
                      {shouldShowOriginal(displayHeader, originalHeaderText) ? (
                        <OriginalReference>
                          {originalHeaderText}
                        </OriginalReference>
                      ) : null}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              <NutritionRows
                locale={locale}
                originalRows={originalTable?.rows}
                rows={table.rows}
              />
            </tbody>
          </table>
          {table.footnotes.length ? (
            <ul className="border-t border-border px-control-x py-control-gap text-xs text-foreground-muted">
              {table.footnotes.map((footnote, footnoteIndex) => (
                <li key={footnoteIndex}>
                  <div
                    dangerouslySetInnerHTML={{
                      __html: [footnote.prefix, footnote.displayText]
                        .filter(Boolean)
                        .join(" "),
                    }}
                  />
                  {shouldShowOriginal(
                    footnote,
                    originalTable?.footnotes[footnoteIndex],
                  ) ? (
                    <OriginalReference>
                      <div
                        dangerouslySetInnerHTML={{
                          __html: [
                            originalTable?.footnotes[footnoteIndex]?.prefix,
                            originalTable?.footnotes[footnoteIndex]
                              ?.displayText,
                          ]
                            .filter(Boolean)
                            .join(" "),
                        }}
                      />
                    </OriginalReference>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
    </div>
  );
}
