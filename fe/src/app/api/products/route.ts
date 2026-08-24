import { supabase } from "@/lib/supabase/server";

const BARCODE_PATTERN = /^\d{4,32}$/;

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

  return Response.json({ productId: product.id });
}
