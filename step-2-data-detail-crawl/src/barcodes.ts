export function normalizeBarcode(barcode: unknown) {
  return String(barcode).replace(/^0+/, "");
}

export function uniqueBarcodes(codes: unknown[] = []) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const code of codes) {
    const n = normalizeBarcode(code);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}
