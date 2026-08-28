import { Configuration, PlaywrightCrawler, createPlaywrightRouter } from "crawlee";
import type { Page } from "playwright";

export const router = createPlaywrightRouter();

const routed = new WeakSet<Page>();

export async function blockPageAssets(page: Page) {
  if (routed.has(page)) return;
  routed.add(page);
  await page.route("**/*", (route) => {
    const type = route.request().resourceType();
    if (type === "image" || type === "media" || type === "font") {
      return route.abort();
    }
    return route.continue();
  });
}

export const crawler = new PlaywrightCrawler(
  {
    requestHandler: router,
    useSessionPool: true,
    persistCookiesPerSession: true,
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 120,
    sessionPoolOptions: { maxPoolSize: 1 },
    browserPoolOptions: {
      maxOpenPagesPerBrowser: 1,
      closeInactiveBrowserAfterSecs: 10,
      retireBrowserAfterPageCount: 50,
    },
    preNavigationHooks: [
      async ({ page }) => {
        await blockPageAssets(page);
      },
    ],
  },
  new Configuration({ persistStorage: false }),
);
