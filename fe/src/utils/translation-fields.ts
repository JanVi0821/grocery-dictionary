export const MAX_TRANSLATION_FIELD_LENGTH = 20000;

export type TranslationField = {
  key: string;
  value: string;
};

const SEGMENT = /^[A-Za-z_][A-Za-z0-9_]*$/;
const INDEX = /^\d+$/;

export function parseTranslationFieldKey(key: unknown) {
  if (typeof key !== "string" || key.length === 0 || key.length > 200)
    return null;

  const parts = key.split(".");
  if (parts.length > 12) return null;
  if (
    !parts.every((part, index) =>
      index === 0 ? SEGMENT.test(part) : SEGMENT.test(part) || INDEX.test(part),
    )
  ) {
    return null;
  }
  if (parts[0] === "name") return parts.length === 1 ? parts : null;
  if (parts.some((part) => part === "source")) return null;
  return parts;
}

export function translationFields(
  name: string,
  detail: unknown,
): TranslationField[] {
  const fields: TranslationField[] = [];
  if (name.trim()) fields.push({ key: "name", value: name });
  collectStrings(detail, [], fields);

  return fields;
}

function collectStrings(
  value: unknown,
  path: string[],
  fields: TranslationField[],
) {
  if (typeof value === "string") {
    const key = path.join(".");
    if (
      !key ||
      !value.trim() ||
      /^https?:\/\//i.test(value.trim()) ||
      !/\p{L}/u.test(value)
    ) {
      return;
    }
    fields.push({ key, value });
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectStrings(item, [...path, String(index)], fields),
    );
    return;
  }

  if (value === null || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if (key === "source") continue;
    collectStrings(child, [...path, key], fields);
  }
}
