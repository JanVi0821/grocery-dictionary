import { supabase } from "@/lib/supabase/server";

const BARCODE_PATTERN = /^\d{4,32}$/;

export async function GET(request: Request) {
  const barcode = new URL(request.url).searchParams.get("barcode")?.trim();

  if (!barcode || !BARCODE_PATTERN.test(barcode)) {
    return Response.json({ error: "Invalid barcode" }, { status: 400 });
  }

  const equivalentBarcode =
    barcode.length === 12
      ? `0${barcode}`
      : barcode.length === 13 && barcode.startsWith("0")
        ? barcode.slice(1)
        : null;
  const barcodes = equivalentBarcode ? [barcode, equivalentBarcode] : [barcode];
  const { data, error } = await supabase
    .from("products")
    .select("id, code")
    .in("code", barcodes);

  if (error) {
    console.error("Product lookup failed", error);
    return Response.json({ error: "Product lookup failed" }, { status: 502 });
  }

  const product = data.find((item) => item.code === barcode) ?? data[0];

  if (!product) {
    return Response.json({ error: "Product not found" }, { status: 404 });
  }

  return Response.json({ productId: product.id });
}
