import { routing } from "@/i18n/routing";
import { logError, requestLogContext } from "@/lib/observability";
import { supabase } from "@/lib/supabase/server";
import { getImageUrl } from "@/utils/get-image-url";

const COLLECTION_ID_PATTERN = /^[1-9]\d*$/;
const PAGE_SIZE = 10;
const LOCALES = routing.locales as readonly string[];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ collection: string }> },
) {
  const { collection: collectionParam } = await params;
  const searchParams = new URL(request.url).searchParams;
  const afterParam = searchParams.get("after");
  const after = afterParam === null ? null : Number(afterParam);
  const locale = searchParams.get("locale") ?? routing.defaultLocale;

  if (
    !COLLECTION_ID_PATTERN.test(collectionParam) ||
    (after !== null && (!Number.isSafeInteger(after) || after < 1)) ||
    !LOCALES.includes(locale)
  ) {
    return Response.json({ error: "Invalid collection request" }, { status: 400 });
  }

  const collectionId = Number(collectionParam);

  try {
    const { data: collection, error: collectionError } = await supabase
      .from("collections")
      .select("id")
      .eq("id", collectionId)
      .maybeSingle();

    if (collectionError) throw collectionError;
    if (!collection) {
      return Response.json({ error: "Collection not found" }, { status: 404 });
    }

    const productsQuery = supabase
      .from("products")
      .select("id, brand, detail, grocer_id, name")
      .contains("collection_ids", [collectionId])
      .eq("deleted_from_grocer", false)
      .not("detail", "is", null)
      .order("id", { ascending: true })
      .limit(PAGE_SIZE);
    const { data: products, error: productsError } = await (
      after === null ? productsQuery : productsQuery.gt("id", after)
    );

    if (productsError) throw productsError;

    const rows = products ?? [];
    let translations = new Map<number, string>();

    if (locale !== routing.defaultLocale && rows.length > 0) {
      const { data, error } = await supabase
        .from("product_translations")
        .select("product_id, name")
        .eq("lang", locale)
        .in(
          "product_id",
          rows.map((product) => product.id),
        );

      if (error) throw error;
      translations = new Map(
        (data ?? []).map((translation) => [translation.product_id, translation.name]),
      );
    }

    const items = rows.map((product) => {
      const translatedName = translations.get(product.id);

      return {
        id: product.id,
        name: translatedName || product.name,
        originalName:
          translatedName && translatedName !== product.name ? product.name : null,
        brand: product.brand,
        imageUrl: getImageUrl(product),
      };
    });

    return Response.json({
      items,
      pageSize: PAGE_SIZE,
    });
  } catch (error) {
    logError("collection_products_query_failed", error, {
      ...requestLogContext(request),
      collectionId,
      locale,
      after,
    });
    return Response.json({ error: "Failed to load collection products" }, { status: 500 });
  }
}
