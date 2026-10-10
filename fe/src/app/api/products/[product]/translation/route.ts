import { routing } from "@/i18n/routing";
import { logError, requestLogContext } from "@/lib/observability";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { supabase } from "@/lib/supabase/server";
import {
  MAX_TRANSLATION_FIELD_LENGTH,
  parseTranslationFieldKey,
  translationFields,
} from "@/utils/translation-fields";

const PRODUCT_ID_PATTERN = /^[1-9]\d*$/;

function parseProductId(productParam: string) {
  return PRODUCT_ID_PATTERN.test(productParam) ? Number(productParam) : null;
}

function parseLocale(locale: unknown) {
  return typeof locale === "string" &&
    locale !== routing.defaultLocale &&
    routing.locales.includes(locale as (typeof routing.locales)[number])
    ? locale
    : null;
}

async function loadTranslation(productId: number, locale: string) {
  const { data, error } = await supabase
    .from("product_translations")
    .select("name, detail")
    .eq("product_id", productId)
    .eq("lang", locale)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ product: string }> },
) {
  const { product: productParam } = await params;
  const productId = parseProductId(productParam);
  const locale = parseLocale(new URL(request.url).searchParams.get("locale"));

  if (!productId || !locale) {
    return Response.json({ error: "Invalid translation request" }, { status: 400 });
  }

  try {
    const translation = await loadTranslation(productId, locale);
    if (!translation) {
      return Response.json({ error: "Translation not found" }, { status: 404 });
    }

    return Response.json({
      fields: translationFields(translation.name, translation.detail),
    });
  } catch (error) {
    logError("product_translation_fields_failed", error, {
      ...requestLogContext(request),
      productId,
      locale,
    });
    return Response.json({ error: "Translation lookup failed" }, { status: 502 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ product: string }> },
) {
  const { product: productParam } = await params;
  const productId = parseProductId(productParam);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid translation request" }, { status: 400 });
  }

  const record = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : null;
  const locale = parseLocale(record?.locale);
  const path = parseTranslationFieldKey(record?.key);
  const value = record?.value;

  if (
    !productId ||
    !locale ||
    !path ||
    typeof value !== "string" ||
    value.length > MAX_TRANSLATION_FIELD_LENGTH ||
    (path[0] === "name" && !value.trim())
  ) {
    return Response.json({ error: "Invalid translation request" }, { status: 400 });
  }

  const authClient = await createSupabaseAuthServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();
  if (!user) {
    return Response.json({ error: "Authentication required" }, { status: 401 });
  }

  try {
    const { data: updated, error } = await authClient.rpc(
      "set_product_translation_field",
      {
        target_product_id: productId,
        target_lang: locale,
        field_path: path,
        field_value: value,
      },
    );

    if (error) throw error;
    if (!updated) {
      return Response.json({ error: "Translation field not found" }, { status: 404 });
    }

    return Response.json({ key: path.join("."), value });
  } catch (error) {
    logError("product_translation_update_failed", error, {
      ...requestLogContext(request),
      productId,
      locale,
    });
    return Response.json({ error: "Translation update failed" }, { status: 502 });
  }
}
