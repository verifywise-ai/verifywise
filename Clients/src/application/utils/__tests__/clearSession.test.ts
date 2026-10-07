const mockClearInflightGets = vi.fn();
vi.mock("../../../infrastructure/api/inflightGet", () => ({
  clearInflightGets: () => mockClearInflightGets(),
}));

import { configureStore } from "@reduxjs/toolkit";
import authReducer from "../../redux/auth/authSlice";
import { queryClient } from "../../config/queryClient";
import { clearSession, discardToken, startSession } from "../clearSession";

function createStore() {
  return configureStore({
    reducer: { auth: authReducer },
    preloadedState: {
      auth: {
        isLoading: false,
        authToken: "some-token",
        user: "user-data",
        userExists: true,
        success: true,
        message: null,
        expirationDate: Date.now() + 3600000,
        onboardingStatus: "completed",
        isOrgCreator: false,
        isSuperAdmin: false,
      },
    },
  });
}

describe("clearSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it("clears the auth state and every cached query", () => {
    const store = createStore();
    queryClient.setQueryData(["projects"], [{ id: 1, name: "Previous user's project" }]);

    clearSession(store.dispatch);

    expect(store.getState().auth.authToken).toBe("");
    expect(store.getState().auth.user).toBe("");
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });

  it("clears auth before the cache so a refetch has no token to send", () => {
    const store = createStore();
    let tokenWhenCleared: string | undefined;
    vi.spyOn(queryClient, "clear").mockImplementation(() => {
      tokenWhenCleared = store.getState().auth.authToken;
    });

    clearSession(store.dispatch);

    expect(tokenWhenCleared).toBe("");
  });

  it("drops the result of a fetch that was in flight when the session was cleared", async () => {
    const store = createStore();
    let resolveFetch: (value: string[]) => void = () => {};
    const fetching = queryClient.fetchQuery({
      queryKey: ["projects"],
      queryFn: () => new Promise<string[]>((resolve) => (resolveFetch = resolve)),
    });

    clearSession(store.dispatch);
    resolveFetch(["Previous user's project"]);
    await fetching.catch(() => undefined);

    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
  });
});

describe("startSession", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    queryClient.clear();
  });

  it("empties the cache, then stores the new token", () => {
    // A tab that never logged out (expired session, another user signing in)
    // must not show the previous session's cached data to the new user.
    const store = createStore();
    queryClient.setQueryData(["projects"], [{ id: 1, name: "Previous user's project" }]);
    let tokenWhenCleared: string | undefined;
    const clear = queryClient.clear.bind(queryClient);
    vi.spyOn(queryClient, "clear").mockImplementation(() => {
      tokenWhenCleared = store.getState().auth.authToken;
      clear();
    });

    startSession(store.dispatch, "new-token");

    expect(tokenWhenCleared).toBe("some-token");
    expect(store.getState().auth.authToken).toBe("new-token");
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
  });
});

describe("in-flight GETs", () => {
  afterEach(() => {
    mockClearInflightGets.mockClear();
    queryClient.clear();
  });

  it("are dropped when a session ends or starts", () => {
    const store = createStore();
    clearSession(store.dispatch);
    startSession(store.dispatch, "new-token");

    expect(mockClearInflightGets).toHaveBeenCalledTimes(2);
  });
});

describe("discardToken", () => {
  afterEach(() => {
    mockClearInflightGets.mockClear();
    queryClient.clear();
  });

  it("drops the token and cached data but leaves the rest of the auth state", () => {
    // Registration pages drop any session without the logout reset
    // (userExists, message, flags), as they did before.
    const store = createStore();
    queryClient.setQueryData(["projects"], [{ id: 1 }]);

    discardToken(store.dispatch);

    const auth = store.getState().auth;
    expect(auth.authToken).toBe("");
    expect(auth.user).toBe("user-data");
    expect(auth.userExists).toBe(true);
    expect(auth.message).toBeNull();
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
    expect(mockClearInflightGets).toHaveBeenCalledTimes(1);
  });
});
