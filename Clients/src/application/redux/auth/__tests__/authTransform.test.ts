import { createTransform } from "redux-persist";
import authTransform from "../authTransform";

vi.mock("redux-persist", async () => {
  const actual = await vi.importActual<typeof import("redux-persist")>("redux-persist");
  return {
    ...actual,
    createTransform: vi.fn(actual.createTransform),
  };
});

describe("authTransform", () => {
  it("should be exported and defined", () => {
    expect(authTransform).toBeDefined();
  });

  it("should strip profileImage from inbound state", () => {
    const inboundFn = (createTransform as ReturnType<typeof vi.fn>).mock.calls[0][0];

    const state = {
      authToken: "token-123",
      user: "john",
      profileImage: "data:image/png;base64,abc123",
    };

    const result = inboundFn(state, "auth");

    expect(result).not.toHaveProperty("profileImage");
    expect(result).toEqual({ authToken: "token-123", user: "john" });
  });

  it("should preserve all other properties", () => {
    const inboundFn = (createTransform as ReturnType<typeof vi.fn>).mock.calls[0][0];

    const state = {
      authToken: "tok",
      user: "jane",
      isLoading: false,
      success: true,
      message: "ok",
      profileImage: "big-blob",
    };

    const result = inboundFn(state, "auth");

    expect(result).toEqual({
      authToken: "tok",
      user: "jane",
      isLoading: false,
      success: true,
      message: "ok",
    });
  });

  it("should work when profileImage is not present", () => {
    const inboundFn = (createTransform as ReturnType<typeof vi.fn>).mock.calls[0][0];

    const state = {
      authToken: "token",
      user: "doe",
      isLoading: true,
    };

    const result = inboundFn(state, "auth");

    expect(result).toEqual({
      authToken: "token",
      user: "doe",
      isLoading: true,
    });
  });
});
