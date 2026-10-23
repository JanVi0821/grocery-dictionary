import type { ReactNode } from "react";

export function hasDetailValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasDetailValue);
  return true;
}

export function shouldShowOriginal(value: unknown, originalValue: unknown) {
  if (!hasDetailValue(value) || !hasDetailValue(originalValue)) return false;
  return JSON.stringify(value) !== JSON.stringify(originalValue);
}

export function OriginalReference({ children }: { children: ReactNode }) {
  if (!hasDetailValue(children)) return null;

  return (
    <div className="mt-control-gap text-xs leading-5 text-foreground-muted">
      {children}
    </div>
  );
}

export function DetailSection({
  aside,
  children,
  title,
}: {
  aside?: ReactNode;
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="w-full py-copy-gap first:pt-0 last:pb-0">
      <div className="flex flex-col items-start gap-control-gap sm:flex-row sm:items-end sm:justify-between">
        <h3 className="text-base font-bold text-foreground">{title}</h3>
        {aside}
      </div>
      <div className="mt-copy-gap text-label leading-6">{children}</div>
    </section>
  );
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <dl className="grid w-full gap-y-copy-gap">{children}</dl>;
}

export function DetailItem({
  children,
  label,
}: {
  children: ReactNode;
  label: ReactNode;
}) {
  if (!hasDetailValue(children)) return null;

  return (
    <div className="min-w-0">
      <dt className="font-semibold text-foreground-muted">{label}</dt>
      <dd className="mt-control-gap break-words text-foreground">{children}</dd>
    </div>
  );
}

export function TextList({
  items,
}: {
  items: readonly string[] | null | undefined;
}) {
  if (!items?.length) return null;

  return (
    <ul className="space-y-control-gap">
      {items.map((item, index) => (
        <li
          key={`${index}-${item}`}
          dangerouslySetInnerHTML={{ __html: item }}
        />
      ))}
    </ul>
  );
}

export function formatNzd(value: number | null | undefined, cents = false) {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
  }).format(cents ? value / 100 : value);
}
