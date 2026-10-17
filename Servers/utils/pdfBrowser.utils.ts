/**
 * The server's one headless Chromium for HTML-to-PDF rendering.
 *
 * Launching Chromium takes far longer than rendering a page, so callers share
 * one browser and open and close only a page per render. Concurrent first
 * calls wait on the same launch rather than starting a browser each, and a
 * browser that has disconnected, or a launch that failed, is replaced on the
 * next call. Close it on shutdown with closeSharedBrowser.
 */
import { chromium, Browser } from "playwright";

let browserInstance: Browser | null = null;
let launching: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  return chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    ...(executablePath ? { executablePath } : {}),
  });
}

/** The shared browser, launched on first use or after it disconnects. */
export async function getSharedBrowser(): Promise<Browser> {
  if (browserInstance && browserInstance.isConnected()) return browserInstance;
  if (!launching) {
    launching = launchBrowser()
      .then((browser) => {
        browserInstance = browser;
        return browser;
      })
      .finally(() => {
        launching = null;
      });
  }
  return launching;
}

/**
 * Close the shared browser, if one is open. A launch still in flight is
 * awaited and closed too, so a browser started just before shutdown is not
 * left running. The next call launches again.
 */
export async function closeSharedBrowser(): Promise<void> {
  const pending = launching;
  const browser = browserInstance;
  browserInstance = null;
  if (browser) await browser.close();
  if (!pending) return;
  // A failed launch has nothing to close; its caller already sees the error.
  const launched = await pending.catch(() => null);
  if (!launched) return;
  if (browserInstance === launched) browserInstance = null;
  await launched.close();
}
