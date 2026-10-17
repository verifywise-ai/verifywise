const launch = jest.fn();
jest.mock("playwright", () => ({ chromium: { launch } }));

import { closeSharedBrowser, getSharedBrowser } from "./pdfBrowser.utils";

function fakeBrowser(connected = true) {
  return { isConnected: jest.fn(() => connected), close: jest.fn() };
}

afterEach(async () => {
  await closeSharedBrowser();
  launch.mockReset();
});

describe("shared PDF browser", () => {
  it("launches one browser and hands it to every caller", async () => {
    const browser = fakeBrowser();
    launch.mockResolvedValue(browser);
    const [a, b] = await Promise.all([getSharedBrowser(), getSharedBrowser()]);
    const c = await getSharedBrowser();
    expect(a).toBe(browser);
    expect(b).toBe(browser);
    expect(c).toBe(browser);
    expect(launch).toHaveBeenCalledTimes(1);
  });

  it("launches headless with the container-safe flags and the configured executable", async () => {
    const before = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = "/opt/chromium";
    try {
      launch.mockResolvedValue(fakeBrowser());
      await getSharedBrowser();
      expect(launch).toHaveBeenCalledWith(
        expect.objectContaining({
          headless: true,
          executablePath: "/opt/chromium",
          args: expect.arrayContaining(["--no-sandbox", "--disable-dev-shm-usage"]),
        }),
      );
    } finally {
      if (before === undefined) delete process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
      else process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH = before;
    }
  });

  it("launches a new browser when the shared one has disconnected", async () => {
    const dead = fakeBrowser(false);
    const fresh = fakeBrowser();
    launch.mockResolvedValueOnce(dead).mockResolvedValueOnce(fresh);
    await getSharedBrowser();
    await expect(getSharedBrowser()).resolves.toBe(fresh);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("retries the launch on the next call after a failed one", async () => {
    const browser = fakeBrowser();
    launch.mockRejectedValueOnce(new Error("no chromium")).mockResolvedValueOnce(browser);
    await expect(getSharedBrowser()).rejects.toThrow("no chromium");
    await expect(getSharedBrowser()).resolves.toBe(browser);
  });

  it("closes the shared browser, and the next call launches again", async () => {
    const first = fakeBrowser();
    launch.mockResolvedValueOnce(first).mockResolvedValueOnce(fakeBrowser());
    await getSharedBrowser();
    await closeSharedBrowser();
    expect(first.close).toHaveBeenCalled();
    await getSharedBrowser();
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it("closes a browser whose launch was still pending, and does not keep it", async () => {
    const late = fakeBrowser();
    let finishLaunch!: (browser: unknown) => void;
    launch.mockReturnValueOnce(new Promise((resolve) => (finishLaunch = resolve)));
    const pendingCall = getSharedBrowser();
    const closing = closeSharedBrowser();
    finishLaunch(late);
    await pendingCall;
    await closing;
    expect(late.close).toHaveBeenCalledTimes(1);

    const next = fakeBrowser();
    launch.mockResolvedValueOnce(next);
    await expect(getSharedBrowser()).resolves.toBe(next);
  });

  it("closes nothing when the pending launch fails", async () => {
    launch.mockRejectedValueOnce(new Error("no chromium"));
    const pendingCall = getSharedBrowser();
    await expect(closeSharedBrowser()).resolves.toBeUndefined();
    await expect(pendingCall).rejects.toThrow("no chromium");
  });
});
