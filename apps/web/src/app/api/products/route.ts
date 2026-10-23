import { supabase } from "@/lib/supabase/server";
import { logError, requestLogContext } from "@/lib/observability";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";
import { after } from "next/server";

const BARCODE_PATTERN = /^\d{4,32}$/;

type AuthSupabaseClient = Awaited<
  ReturnType<typeof createSupabaseAuthServerClient>
>;

async function writeSearchHistory(
  authSupabase: AuthSupabaseClient,
  productId: number,
  barcode: string,
) {
  try {
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();

    if (authError?.name === "AuthSessionMissingError") return;

    if (authError) {
      logError("product_history_authentication_failed", authError, {
        productId,
      });
      return;
    }
    if (!user) return;

    const { error } = await authSupabase
      .from("user_product_search_history")
      .insert({ user_id: user.id, product_id: productId, barcode });

    if (error) {
      logError("product_history_insert_failed", error, { productId });
    }
  } catch (error) {
    logError("product_history_write_failed", error, { productId });
  }
}

export async function GET(request: Request) {
  const barcode = new URL(request.url).searchParams.get("barcode")?.trim();

  if (!barcode || !BARCODE_PATTERN.test(barcode)) {
    return Response.json({ error: "Invalid barcode" }, { status: 400 });
  }

  const normalizedBarcode = barcode.length < 14 ? barcode.padStart(14, "0") : barcode;
  const { data, error } = await supabase
    .from("products")
    .select("id")
    .contains("barcodes", [normalizedBarcode])
    .limit(1);

  if (error) {
    logError("product_barcode_lookup_failed", error, requestLogContext(request));
    return Response.json({ error: "Product lookup failed" }, { status: 502 });
  }

  const product = data[0];

  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  const authSupabase = await createSupabaseAuthServerClient();
  after(() => writeSearchHistory(authSupabase, product.id, barcode));

  return Response.json({ productId: product.id });
}
