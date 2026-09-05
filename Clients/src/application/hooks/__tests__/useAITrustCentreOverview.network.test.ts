/**
 * useAITrustCentreOverview — network-backed error states.
 *
 * The sibling useAITrustCentreOverview.test.ts mocks the repository and rejects
 * with `new Error("Fetch failed")`. That never exercises the real failure path:
 * no HTTP status, no axios interceptor, and none of the `{ message, data }`
 * envelope the controller actually sends. This file leaves the repository real
 * and drives MSW instead, so the message the hook surfaces is the one a user
 * would really see.
 *
 * Precedence worth knowing: `extractErrorMessage` (networkServices.ts) reads the
 * envelope's `data` first and only falls back to `message`, so the DETAIL is
 * what reaches `error`, not the HTTP reason phrase.
 */

import { act, renderHook, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { server } from "../../../test/mocks/server";
import { aiTrustCentreErrors } from "../../../test/mocks/errorHandlers";

import { useAITrustCentreOverview } from "../useAITrustCentreOverview";

describe("useAITrustCentreOverview (network-backed)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("surfaces the envelope detail on a 500, not the reason phrase", async () => {
    server.use(aiTrustCentreErrors.serverError("Overview lookup failed"));

    const { result } = renderHook(() => useAITrustCentreOverview());
    await act(async () => {
      await expect(result.current.fetchOverview()).rejects.toBeTruthy();
    });

    await waitFor(() => expect(result.current.error).toBe("Overview lookup failed"));
    // "Internal Server Error" is the envelope's `message`; the hook must not
    // show that in place of the detail.
    expect(result.current.error).not.toBe("Internal Server Error");
    expect(result.current.loading).toBe(false);
  });

  it("surfaces the detail on a 403", async () => {
    server.use(aiTrustCentreErrors.forbidden("Access denied"));

    const { result } = renderHook(() => useAITrustCentreOverview());
    await act(async () => {
      await expect(result.current.fetchOverview()).rejects.toBeTruthy();
    });

    await waitFor(() => expect(result.current.error).toBe("Access denied"));
  });

  it("clears loading after a transport failure", async () => {
    server.use(aiTrustCentreErrors.transport());

    const { result } = renderHook(() => useAITrustCentreOverview());
    await act(async () => {
      await expect(result.current.fetchOverview()).rejects.toBeTruthy();
    });

    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.loading).toBe(false);
  });

  it("reports the detail when an update is rejected", async () => {
    server.use(
      // The hook fetches on mount, and there is no default handler for this
      // endpoint - without this the mount request fails and `error` would hold
      // that failure instead of the one under test.
      http.get("/api/aiTrustCentre/overview", () =>
        HttpResponse.json({ data: { overview: { title: "Existing" } } }),
      ),
      aiTrustCentreErrors.updateOverview.validation("Title is required"),
    );

    const { result } = renderHook(() => useAITrustCentreOverview());
    await act(async () => {
      await expect(result.current.updateOverview({})).rejects.toBeTruthy();
    });

    await waitFor(() => expect(result.current.error).toBe("Title is required"));
  });
});
