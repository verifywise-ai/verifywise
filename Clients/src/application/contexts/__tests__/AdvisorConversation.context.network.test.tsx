/**
 * AdvisorConversation context — network-backed error states.
 *
 * The sibling AdvisorConversation.context.test.tsx mocks the advisor repository,
 * so it never exercises the real request. This file drives the failures through
 * MSW, pairing with the conversation-CRUD tests on
 * Servers/controllers/advisor.ctrl.ts.
 *
 * The controller is asymmetric: conversation CRUD returns a RAW body on success
 * (`{ domain, conversations }`) but a STATUS_CODE-wrapped body on error. Both
 * sides are exercised here — the success test would fail if the provider
 * expected a wrapped body, and the error tests send the wrapped shape.
 *
 * The error contract is a reset, not a surfaced flag: `loadDomain` catches,
 * empties the domain and marks it loaded. These assert that, because the real
 * regression risk is a domain stuck in `isLoading`.
 */

import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { server } from "../../../test/mocks/server";
import { advisorErrors } from "../../../test/mocks/errorHandlers";
import { http, HttpResponse } from "msw";

import {
  AdvisorConversationProvider,
  useAdvisorConversation,
} from "../AdvisorConversation.context";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(AdvisorConversationProvider, null, children);
}

const DOMAIN = "risks";

describe("AdvisorConversationContext (network-backed)", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("reads the raw { domain, conversations } success body", async () => {
    server.use(
      http.get("/api/advisor/conversations/:domain", ({ params }) =>
        // Deliberately RAW - not STATUS_CODE-wrapped - matching the controller.
        HttpResponse.json({
          domain: params.domain,
          conversations: [{ id: 1, title: "First", last_message_at: null }],
        }),
      ),
      // loadDomain auto-opens the most recent conversation, so the detail
      // endpoint has to answer too - otherwise that request fails and the
      // same catch that handles errors wipes the list we just loaded.
      http.get("/api/advisor/conversations/:domain/:id", ({ params }) =>
        HttpResponse.json({
          domain: params.domain,
          conversation: {
            id: Number(params.id),
            title: "First",
            messages: [],
            last_message_at: null,
            created_at: null,
            updated_at: null,
          },
        }),
      ),
    );

    const { result } = renderHook(() => useAdvisorConversation(), { wrapper });
    await act(async () => {
      await result.current.loadDomain(DOMAIN as never);
    });

    await waitFor(() => expect(result.current.getConversations(DOMAIN as never)).toHaveLength(1));
    expect(result.current.isLoading(DOMAIN as never)).toBe(false);
  });

  it("resets the domain and stops loading on a 400", async () => {
    // Matches the controller's `Domain is required` / bad-id validation path.
    server.use(advisorErrors.validation("Domain is required"));

    const { result } = renderHook(() => useAdvisorConversation(), { wrapper });
    await act(async () => {
      await result.current.loadDomain(DOMAIN as never);
    });

    await waitFor(() => expect(result.current.isLoaded(DOMAIN as never)).toBe(true));
    expect(result.current.getConversations(DOMAIN as never)).toEqual([]);
    // The real risk is a domain wedged in isLoading forever.
    expect(result.current.isLoading(DOMAIN as never)).toBe(false);
    expect(console.error).toHaveBeenCalled();
  });

  it("resets the domain on a 403", async () => {
    server.use(advisorErrors.forbidden());

    const { result } = renderHook(() => useAdvisorConversation(), { wrapper });
    await act(async () => {
      await result.current.loadDomain(DOMAIN as never);
    });

    await waitFor(() => expect(result.current.isLoaded(DOMAIN as never)).toBe(true));
    expect(result.current.isLoading(DOMAIN as never)).toBe(false);
  });

  it("resets the domain on a transport failure", async () => {
    server.use(advisorErrors.transport());

    const { result } = renderHook(() => useAdvisorConversation(), { wrapper });
    await act(async () => {
      await result.current.loadDomain(DOMAIN as never);
    });

    await waitFor(() => expect(result.current.isLoaded(DOMAIN as never)).toBe(true));
    expect(result.current.isLoading(DOMAIN as never)).toBe(false);
  });
});
