import { routing } from "@/i18n/routing";
import { cachedJson, cacheRequest, withCache } from "@/lib/cache";
import { logError, requestLogContext } from "@/lib/observability";
import { supabase } from "@/lib/supabase/server";
import { getImageUrl } from "@/utils/get-image-url";

const COLLECTION_ID_PATTERN = /^[1-9]\d*$/;
const COLLECTION_CACHE_SECONDS = 60 * 60 * 12;
const PAGE_SIZE = 10;
const LOCALES = routing.locales as readonly string[];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ collection: string }> },
) {
  const { collection: collectionParam } = await params;
  const searchParams = new URL(request.url).searchParams;
  const requestedPage = Number(searchParams.get("page") ?? 1);
  const locale = searchParams.get("locale") ?? routing.defaultLocale;

  if (
    !COLLECTION_ID_PATTERN.test(collectionParam) ||
    !Number.isSafeInteger(requestedPage) ||
    requestedPage < 1 ||
    !LOCALES.includes(locale)
  ) {
    return Response.json(
      { error: "Invalid collection request" },
      { status: 400 },
    );
  }

  const collectionId = Number(collectionParam);

  try {
    return await withCache(
      cacheRequest(request, {
        collection: String(collectionId),
        locale,
        page: String(requestedPage),
      }),
      () => loadCollectionProducts(collectionId, requestedPage, locale),
    );
  } catch (error) {
    logError("collection_products_query_failed", error, {
      ...requestLogContext(request),
      collectionId,
      locale,
      requestedPage,
    });
    return Response.json(
      { error: "Failed to load collection products" },
      { status: 500 },
    );
  }
}

async function loadCollectionProducts(
  collectionId: number,
  requestedPage: number,
  locale: string,
) {
  const { data: collection, error: collectionError } = await supabase
    .from("collections")
    .select("id")
    .eq("id", collectionId)
    .maybeSingle();

  if (collectionError) throw collectionError;
  if (!collection) {
    return Response.json({ error: "Collection not found" }, { status: 404 });
  }

  const { count, error: countError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .contains("collection_ids", [collectionId])
    .eq("deleted_from_grocer", false)
    .not("detail", "is", null);

  if (countError) throw countError;

  const totalCount = count ?? 0;
  const pageCount = Math.ceil(totalCount / PAGE_SIZE);
  const currentPage = Math.min(requestedPage, Math.max(pageCount, 1));
  const { data: products, error: productsError } = await supabase
    .from("products")
    .select("id, brand, detail, grocer_id, name")
    .contains("collection_ids", [collectionId])
    .eq("deleted_from_grocer", false)
    .not("detail", "is", null)
    .order("id", { ascending: true })
    .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

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
      (data ?? []).map((translation) => [
        translation.product_id,
        translation.name,
      ]),
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

  return cachedJson(
    {
      items,
      totalCount,
      pageCount,
      currentPage,
    },
    COLLECTION_CACHE_SECONDS,
  );
}
