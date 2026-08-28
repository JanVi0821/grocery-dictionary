import type { Json } from "@/types/generated/database.types";

export function getIngredientsText(ingredients: Json) {
  if (typeof ingredients === "string") {
    return ingredients.trim() || null;
  }

  if (!Array.isArray(ingredients)) {
    return null;
  }

  const names = ingredients.flatMap((ingredient) => {
    if (!ingredient || Array.isArray(ingredient) || typeof ingredient !== "object") {
      return [];
    }

    const text = ingredient.text;
    return typeof text === "string" && text.trim() ? [text.trim()] : [];
  });

  return names.length ? names.join(", ") : null;
}
