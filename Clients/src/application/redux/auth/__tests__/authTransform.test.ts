// Vitest 5 evaluates mock factories per importer module, so a vi.fn created
// inside the factory is a different instance for ../authTransform than for
// this test file. Capture the arguments in hoisted state, which is shared
// across every factory invocation.
const captured = vi.hoisted(() => ({ calls: [] as any[][] }));

vi.mock("redux-persist", async () => {
  const actual = await vi.importActual<typeof import("redux-persist")>("redux-persist");
  return {
    ...actual,
    createTransform: (...args: any[]) => {
      captured.calls.push(args);
      return (actual.createTransform as (...a: any[]) => unknown)(...args);
    },
  };
});

// Imported dynamically inside each test so evaluation happens against the
// mocked redux-persist.
const importAuthTransform = () => import("../authTransform");

describe("authTransform", () => {
  it("should be exported and defined", async () => {
    const { default: authTransform } = await importAuthTransform();
    expect(authTransform).toBeDefined();
  });

  it("should strip profileImage from inbound state", async () => {
    await importAuthTransform();
    const inboundFn = captured.calls[0][0];

    const state = {
      authToken: "token-123",
      user: "john",
      profileImage: "data:image/png;base64,abc123",
    };

    const result = inboundFn(state, "auth");

    expect(result).not.toHaveProperty("profileImage");
    expect(result).toEqual({ authToken: "token-123", user: "john" });
  });

  it("should preserve all other properties", async () => {
    await importAuthTransform();
    const inboundFn = captured.calls[0][0];

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

  it("should work when profileImage is not present", async () => {
    await importAuthTransform();
    const inboundFn = captured.calls[0][0];

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
