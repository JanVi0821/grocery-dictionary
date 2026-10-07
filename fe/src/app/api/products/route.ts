import { supabase } from "@/lib/supabase/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createSupabaseAuthServerClient } from "@/lib/supabase/auth-server";

const BARCODE_PATTERN = /^\d{4,32}$/;

async function writeSearchHistory(productId: number, barcode: string) {
  try {
    const authSupabase = await createSupabaseAuthServerClient();
    const { data: { user }, error: authError } = await authSupabase.auth.getUser();

    if (authError) {
      console.error("Product search history authentication failed", authError);
      return;
    }
    if (!user) return;

    const { error } = await authSupabase
      .from("user_product_search_history")
      .insert({ user_id: user.id, product_id: productId, barcode });

    if (error) console.error("Product search history insert failed", error);
  } catch (error) {
    console.error("Product search history request failed", error);
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
    console.error("Product lookup failed", error);
    return Response.json({ error: "Product lookup failed" }, { status: 502 });
  }

  const product = data[0];

  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  const historyTask = writeSearchHistory(product.id, barcode);
  try {
    getCloudflareContext().ctx.waitUntil(historyTask);
  } catch {
    // In local Next.js dev there may be no Cloudflare execution context.
    void historyTask;
  }

  return Response.json({ productId: product.id });
}
