import { routing } from "@/i18n/routing";
import { logError, requestLogContext } from "@/lib/observability";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { supabase } from "@/lib/supabase/server";
import { getImageUrl } from "@/utils/get-image-url";

const PAGE_SIZE = 20;
const LOCALES = routing.locales as readonly string[];

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const requestedPage = Number(searchParams.get("page"));
  const locale = searchParams.get("locale") ?? routing.defaultLocale;

  if (
    !Number.isSafeInteger(requestedPage) ||
    requestedPage < 1 ||
    !LOCALES.includes(locale)
  ) {
    return Response.json({ error: "Invalid history request" }, { status: 400 });
  }

  try {
    const authSupabase = await createSupabaseAuthServerClient();
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const { count, error: countError } = await authSupabase
      .from("user_product_search_history")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);

    if (countError) throw countError;

    const totalCount = count ?? 0;
    const pageCount = Math.ceil(totalCount / PAGE_SIZE);
    const currentPage = Math.min(requestedPage, Math.max(pageCount, 1));
    const { data: historyRows, error: historyError } = await authSupabase
      .from("user_product_search_history")
      .select("id, product_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE - 1);

    if (historyError) throw historyError;

    const productIds = [...new Set((historyRows ?? []).map((row) => row.product_id))];
    let items: {
      id: number;
      productId: number;
      createdAt: string;
      name: string | null;
      originalName: string | null;
      brand: string | null;
      imageUrl: string | null;
    }[] = [];

    if (productIds.length > 0) {
      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("id, brand, detail, grocer_id, name")
        .in("id", productIds);

      if (productsError) throw productsError;

      let translations: { product_id: number; name: string }[] = [];
      if (locale === "zh") {
        const { data, error } = await supabase
          .from("product_translations")
          .select("product_id, name")
          .eq("lang", locale)
          .in("product_id", productIds);

        if (error) throw error;
        translations = data ?? [];
      }

      const productById = new Map((products ?? []).map((product) => [product.id, product]));
      const translationByProductId = new Map(
        translations.map((translation) => [translation.product_id, translation.name]),
      );

      items = (historyRows ?? []).map((row) => {
        const product = productById.get(row.product_id);
        const translatedName = product
          ? translationByProductId.get(product.id)
          : undefined;

        return {
          id: row.id,
          productId: row.product_id,
          createdAt: row.created_at,
          name: product ? translatedName ?? product.name : null,
          originalName:
            product && translatedName && translatedName !== product.name
              ? product.name
              : null,
          brand: product?.brand ?? null,
          imageUrl: product ? getImageUrl(product) : null,
        };
      });
    }

    return Response.json({ items, totalCount, pageCount, currentPage });
  } catch (error) {
    logError("product_history_query_failed", error, {
      ...requestLogContext(request),
      locale,
      requestedPage,
    });
    return Response.json({ error: "Failed to load product search history" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const historyId = Number(new URL(request.url).searchParams.get("id"));

  if (!Number.isSafeInteger(historyId) || historyId <= 0) {
    return Response.json({ error: "Invalid history record" }, { status: 400 });
  }

  try {
    const authSupabase = await createSupabaseAuthServerClient();
    const {
      data: { user },
      error: authError,
    } = await authSupabase.auth.getUser();

    if (authError || !user) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const { error } = await authSupabase
      .from("user_product_search_history")
      .delete()
      .eq("id", historyId)
      .eq("user_id", user.id);

    if (error) throw error;
    return new Response(null, { status: 204 });
  } catch (error) {
    logError("product_history_delete_failed", error, {
      ...requestLogContext(request),
      historyId,
    });
    return Response.json({ error: "Failed to delete history record" }, { status: 500 });
  }
}
