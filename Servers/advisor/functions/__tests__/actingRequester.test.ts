import { describe, it, expect } from "@jest/globals";
import { actingRequesterId } from "../actingRequester";

describe("actingRequesterId", () => {
  it("prefers the requester, else the user the gateway runs for", () => {
    expect(actingRequesterId({ _requesterId: 7, _userId: 3 })).toBe(7);
    expect(actingRequesterId({ _userId: 3 })).toBe(3);
    expect(actingRequesterId({ _requesterId: "7" })).toBe(7);
    expect(actingRequesterId({ _requesterId: "abc", _userId: 3 })).toBe(3);
  });

  it("is undefined for a missing, zero or negative id", () => {
    expect(actingRequesterId({})).toBeUndefined();
    expect(actingRequesterId({ _requesterId: 0, _userId: 0 })).toBeUndefined();
    expect(actingRequesterId({ _requesterId: -1, _userId: 3 })).toBeUndefined();
    expect(actingRequesterId({ _userId: -5 })).toBeUndefined();
  });
});
