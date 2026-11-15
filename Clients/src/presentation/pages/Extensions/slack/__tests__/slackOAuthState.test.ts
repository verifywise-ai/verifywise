import { beforeEach, describe, expect, it } from "vitest";
import {
  SLACK_OAUTH_STATE_KEY,
  buildSlackAuthorizeUrl,
  consumeSlackOAuthState,
  createSlackOAuthState,
  generateSlackOAuthState,
  readSlackOAuthReturn,
} from "../slackOAuthState";

describe("Slack OAuth state", () => {
  beforeEach(() => sessionStorage.clear());

  it("generates a different 64-character hex state each time", () => {
    const first = generateSlackOAuthState();
    const second = generateSlackOAuthState();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });

  it("stores the state it creates", () => {
    const state = createSlackOAuthState();
    expect(state).toBeTruthy();
    expect(sessionStorage.getItem(SLACK_OAUTH_STATE_KEY)).toBe(state);
  });

  it("accepts the matching state once and removes it", () => {
    const state = createSlackOAuthState();
    expect(consumeSlackOAuthState(state)).toBe(true);
    expect(sessionStorage.getItem(SLACK_OAUTH_STATE_KEY)).toBeNull();
    expect(consumeSlackOAuthState(state)).toBe(false);
  });

  it("refuses a different state and still removes the stored one", () => {
    createSlackOAuthState();
    expect(consumeSlackOAuthState("not-the-state")).toBe(false);
    expect(sessionStorage.getItem(SLACK_OAUTH_STATE_KEY)).toBeNull();
  });

  it("refuses a missing state, and any state when none was stored", () => {
    createSlackOAuthState();
    expect(consumeSlackOAuthState(null)).toBe(false);
    expect(consumeSlackOAuthState("anything")).toBe(false);
  });

  it("returns null when there is no storage", () => {
    expect(createSlackOAuthState(null)).toBeNull();
    expect(consumeSlackOAuthState("x", null)).toBe(false);
  });
});

describe("readSlackOAuthReturn", () => {
  it("reads the code and state", () => {
    expect(readSlackOAuthReturn("?code=abc&state=s1")).toEqual({
      kind: "code",
      code: "abc",
      state: "s1",
    });
  });

  it("reads a code without a state", () => {
    expect(readSlackOAuthReturn("?code=abc")).toEqual({ kind: "code", code: "abc", state: null });
  });

  it("reads an error before a code", () => {
    expect(readSlackOAuthReturn("?error=access_denied&state=s1")).toEqual({
      kind: "error",
      error: "access_denied",
    });
  });

  it("reports nothing for an ordinary visit", () => {
    expect(readSlackOAuthReturn("")).toEqual({ kind: "none" });
  });
});

describe("buildSlackAuthorizeUrl", () => {
  it("sends the client id, scope, redirect URI and state", () => {
    const url = new URL(
      buildSlackAuthorizeUrl({
        baseUrl: "https://slack.com/oauth/v2/authorize",
        clientId: "client-1",
        origin: "https://app.example.com",
        state: "s1",
      }),
    );
    expect(url.origin + url.pathname).toBe("https://slack.com/oauth/v2/authorize");
    expect(url.searchParams.get("client_id")).toBe("client-1");
    expect(url.searchParams.get("scope")).toBe("incoming-webhook,chat:write");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/extensions/slack/settings",
    );
    expect(url.searchParams.get("state")).toBe("s1");
  });
});
