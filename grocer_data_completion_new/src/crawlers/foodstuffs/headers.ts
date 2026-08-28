import type { PlaywrightCrawlingContext } from "crawlee";
import { blockPageAssets } from "../../crawler.ts";
import type { FoodstuffsPlatform } from "./types.ts";

export function platformCookieUrls(platform: Pick<FoodstuffsPlatform, "origin" | "api">) {
  return [platform.origin, platform.api];
}

export async function captureFoodstuffsHeaders(
  ctx: PlaywrightCrawlingContext,
  platform: FoodstuffsPlatform,
) {
  const { page, session } = ctx;
  await blockPageAssets(page);
  const pending = page.waitForRequest(
    (r) => r.url().startsWith(platform.api),
    { timeout: 20_000 },
  );
  await page.goto(platform.origin, { waitUntil: "domcontentloaded" });
  const apiReq = await pending;
  const h = apiReq.headers();
  const cookies = await page.context().cookies(platformCookieUrls(platform));
  session!.userData[platform.headerKey] = {
    authorization: h.authorization ?? "",
    cookie: cookies.map((c) => `${c.name}=${c.value}`).join("; "),
    accept: "application/json",
    origin: platform.origin,
    referer: page.url(),
    "user-agent":
      h["user-agent"] ?? (await page.evaluate(() => navigator.userAgent)),
  };
}
