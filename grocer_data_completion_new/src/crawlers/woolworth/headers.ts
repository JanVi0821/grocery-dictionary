import type { PlaywrightCrawlingContext } from "crawlee";
import { wrapRetailerError } from "../errors.ts";
import { blockPageAssets } from "../../crawler.ts";

export const WW_ORIGIN = "https://www.woolworths.co.nz";

export function wwSearchUrl(name: string) {
  const url = new URL(`${WW_ORIGIN}/api/v1/products`);
  url.searchParams.set("target", "search");
  url.searchParams.set("search", name);
  url.searchParams.set("inStockProductsOnly", "false");
  url.searchParams.set("size", "48");
  return url.toString();
}

export async function captureHeaders(ctx: PlaywrightCrawlingContext) {
  const { page, session } = ctx;
  await blockPageAssets(page);
  await page.goto(WW_ORIGIN, { waitUntil: "domcontentloaded" });
  const cookies = await page.context().cookies();
  session!.userData.headers = {
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    accept: "application/json, text/plain, */*",
    origin: WW_ORIGIN,
    referer: page.url(),
    "user-agent": await page.evaluate(() => navigator.userAgent),
    "x-requested-with": "OnlineShopping.WebApp",
  };
}

export function headersExpired(body: unknown, statusCode?: number) {
  if (statusCode === 401 || statusCode === 403) return true;
  const errors = (body as { errors?: { field?: string }[] } | undefined)?.errors;
  return errors?.some((e) => e.field === "Header") ?? false;
}

export async function wwGet(ctx: PlaywrightCrawlingContext, url: string) {
  const fields = {
    source: "woolworths" as const,
    barcode: "",
    storeId: null,
    storeName: null,
    stage: "search" as const,
  };
  if (!ctx.session?.userData.headers) {
    try {
      await captureHeaders(ctx);
    } catch (err) {
      throw wrapRetailerError(err, fields);
    }
  }

  const once = () =>
    ctx.sendRequest({
      url,
      headers: ctx.session!.userData.headers,
      responseType: "json",
    });

  let res;
  try {
    res = await once();
  } catch (err) {
    throw wrapRetailerError(err, fields);
  }
  if (headersExpired(res.body, res.statusCode)) {
    try {
      await captureHeaders(ctx);
    } catch (err) {
      throw wrapRetailerError(err, fields);
    }
    try {
      res = await once();
    } catch (err) {
      throw wrapRetailerError(err, fields);
    }
  }
  if (headersExpired(res.body, res.statusCode)) {
    throw wrapRetailerError(
      new Error("woolworths headers still expired after refresh"),
      fields,
    );
  }
  return res.body;
}
