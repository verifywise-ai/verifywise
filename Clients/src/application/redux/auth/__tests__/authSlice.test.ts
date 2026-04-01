import authReducer, {
  clearAuthState,
  setAuthToken,
  setExpiration,
  setUserExists,
  setOnboardingStatus,
  setIsOrgCreator,
} from "../authSlice";

describe("authSlice", () => {
  const initialState = {
    isLoading: false,
    authToken: "",
    user: "",
    userExists: false,
    success: null as boolean | null,
    message: null as string | null,
    expirationDate: null as number | null,
    onboardingStatus: "completed",
    isOrgCreator: false,
    isSuperAdmin: false,
    activeOrganizationId: null as number | null,
  };

  it("should return initial state on unknown action", () => {
    const state = authReducer(undefined, { type: "unknown" });
    expect(state).toEqual(initialState);
  });

  describe("setAuthToken", () => {
    it("should set the auth token", () => {
      const token = "eyJhbGciOiJIUzI1NiJ9.test.sig";
      const state = authReducer(initialState, setAuthToken(token));
      expect(state.authToken).toBe(token);
    });

    it("should overwrite existing token", () => {
      const stateWithToken = { ...initialState, authToken: "old-token" };
      const state = authReducer(stateWithToken, setAuthToken("new-token"));
      expect(state.authToken).toBe("new-token");
    });
  });

  describe("clearAuthState", () => {
    it("should reset auth state to logged-out defaults", () => {
      const loggedInState = {
        ...initialState,
        authToken: "some-token",
        user: "user-data",
        isLoading: true,
        success: true as boolean | null,
        expirationDate: 123456 as number | null,
        onboardingStatus: "pending",
        isOrgCreator: true,
      };

      const state = authReducer(loggedInState, clearAuthState());

      expect(state.authToken).toBe("");
      expect(state.user).toBe("");
      expect(state.isLoading).toBe(false);
      expect(state.success).toBe(true);
      expect(state.message).toBe("Logged out successfully");
      expect(state.userExists).toBe(true);
      expect(state.expirationDate).toBeNull();
      expect(state.onboardingStatus).toBe("completed");
      expect(state.isOrgCreator).toBe(false);
    });
  });

  describe("setExpiration", () => {
    it("should set expiration date", () => {
      const expiration = Date.now() + 3600000;
      const state = authReducer(initialState, setExpiration(expiration));
      expect(state.expirationDate).toBe(expiration);
    });

    it("should allow null to clear expiration", () => {
      const stateWithExp = { ...initialState, expirationDate: 123 as number | null };
      const state = authReducer(stateWithExp, setExpiration(null));
      expect(state.expirationDate).toBeNull();
    });
  });

  describe("setUserExists", () => {
    it("should set userExists to true", () => {
      const state = authReducer(initialState, setUserExists(true));
      expect(state.userExists).toBe(true);
    });

    it("should set userExists to false", () => {
      const stateWithUser = { ...initialState, userExists: true };
      const state = authReducer(stateWithUser, setUserExists(false));
      expect(state.userExists).toBe(false);
    });
  });

  describe("setOnboardingStatus", () => {
    it("should set onboarding status", () => {
      const state = authReducer(initialState, setOnboardingStatus("pending"));
      expect(state.onboardingStatus).toBe("pending");
    });
  });

  describe("setIsOrgCreator", () => {
    it("should set isOrgCreator flag", () => {
      const state = authReducer(initialState, setIsOrgCreator(true));
      expect(state.isOrgCreator).toBe(true);
    });
  });

  describe("async thunk pending states", () => {
    it("should not mutate other fields on unknown action", () => {
      const state = authReducer(initialState, { type: "unknown" });
      expect(state.isLoading).toBe(false);
      expect(state.success).toBeNull();
      expect(state.message).toBeNull();
    });
  });
});
