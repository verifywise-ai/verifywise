import { test, expect } from "./fixtures/auth.fixture";

/**
 * Service worker smoke test (issue #4679-c).
 *
 * FINDING (2026-10-20): the VerifyWise client does NOT register a service
 * worker. Verified by grepping Clients/ for `navigator.serviceWorker`,
 * `serviceWorker.register`, `workbox`, and `vite-plugin-pwa` — no matches;
 * `Clients/public/` contains no `sw.js`/`service-worker.js`. The PWA
 * app-shell/offline behaviour this spec guards therefore cannot be tested
 * and the test skips with a clear message.
 *
 * When a service worker IS introduced, the assertions below activate:
 *   1. Offline app-shell: after `context.setOffline(true)`, a reload must
 *      still render the app shell (client-side routing, cached statics).
 *   2. API isolation: no response under `/api/**` may ever be present in
 *      any Cache Storage bucket — API data must always come from the
 *      network so users never see stale compliance/risk data.
 */

async function getSwRegistrations(page: import("@playwright/test").Page) {
  await page.goto("/");
  return page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return [];
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.map((r) => r.scope);
  });
}

test.describe("Service worker smoke", () => {
  test("offline app-shell renders and /api responses are never cached", async ({
    authedPage: page,
    context,
  }) => {
    const scopes = await getSwRegistrations(page);
    test.skip(
      scopes.length === 0,
      "No service worker is registered in the VerifyWise client " +
        "(verified 2026-10-20: no navigator.serviceWorker registration, " +
        "no sw.js in public/, no workbox/vite-plugin-pwa). Offline " +
        "app-shell caching is not implemented; nothing to smoke-test. " +
        "Re-enable this spec when a service worker lands.",
    );

    // --- 1. Wait for the service worker to be active, then go offline ---
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator("body")).not.toBeEmpty({ timeout: 15_000 });
    await expect(
      page
        .getByRole("heading")
        .or(page.locator('[class*="sidebar" i]'))
        .or(page.getByRole("navigation"))
        .first(),
    ).toBeVisible({ timeout: 15_000 });

    // --- 2. Assert /api responses are never in any Cache Storage bucket ---
    const apiCached = await page.evaluate(async () => {
      for (const cacheName of await caches.keys()) {
        const cache = await caches.open(cacheName);
        const requests = await cache.keys();
        if (requests.some((r) => new URL(r.url).pathname.startsWith("/api/"))) {
          return true;
        }
      }
      return false;
    });
    expect(
      apiCached,
      "Service worker cached an /api response — compliance data must never be served from cache",
    ).toBe(false);

    await context.setOffline(false);
  });
});
