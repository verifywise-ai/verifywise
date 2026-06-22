import reducer, {
  clearAuthState,
  setAuthToken,
  setExpiration,
  setUserExists,
  setOnboardingStatus,
  setIsOrgCreator,
  setIsSuperAdmin,
  setActiveOrganizationId,
} from "../authSlice";

const initialState = {
  isLoading: false,
  authToken: "",
  user: "",
  userExists: false,
  success: null,
  message: null,
  expirationDate: null,
  onboardingStatus: "completed",
  isOrgCreator: false,
  isSuperAdmin: false,
  activeOrganizationId: null,
};

describe("authSlice", () => {
  it("returns initial state", () => {
    const state = reducer(undefined, { type: "unknown" });
    expect(state).toEqual(initialState);
  });

  describe("clearAuthState", () => {
    it("resets auth state to logged out defaults", () => {
      const modified = {
        ...initialState,
        authToken: "some-token",
        user: "john",
        isSuperAdmin: true,
        activeOrganizationId: 5,
      };
      const state = reducer(modified, clearAuthState());
      expect(state.authToken).toBe("");
      expect(state.user).toBe("");
      expect(state.isSuperAdmin).toBe(false);
      expect(state.activeOrganizationId).toBeNull();
      expect(state.userExists).toBe(true);
      expect(state.message).toBe("Logged out successfully");
    });
  });

  describe("setAuthToken", () => {
    it("sets the auth token", () => {
      const state = reducer(initialState, setAuthToken("jwt-token"));
      expect(state.authToken).toBe("jwt-token");
    });
  });

  describe("setExpiration", () => {
    it("sets expiration date", () => {
      const state = reducer(initialState, setExpiration(1234567890));
      expect(state.expirationDate).toBe(1234567890);
    });

    it("sets expiration to null", () => {
      const withExpiry = { ...initialState, expirationDate: 1234567890 };
      const state = reducer(withExpiry, setExpiration(null));
      expect(state.expirationDate).toBeNull();
    });
  });

  describe("setUserExists", () => {
    it("sets userExists to true", () => {
      const state = reducer(initialState, setUserExists(true));
      expect(state.userExists).toBe(true);
    });
  });

  describe("setOnboardingStatus", () => {
    it("sets onboarding status", () => {
      const state = reducer(initialState, setOnboardingStatus("pending"));
      expect(state.onboardingStatus).toBe("pending");
    });
  });

  describe("setIsOrgCreator", () => {
    it("sets isOrgCreator to true", () => {
      const state = reducer(initialState, setIsOrgCreator(true));
      expect(state.isOrgCreator).toBe(true);
    });
  });

  describe("setIsSuperAdmin", () => {
    it("sets isSuperAdmin to true", () => {
      const state = reducer(initialState, setIsSuperAdmin(true));
      expect(state.isSuperAdmin).toBe(true);
    });
  });

  describe("setActiveOrganizationId", () => {
    it("sets activeOrganizationId", () => {
      const state = reducer(initialState, setActiveOrganizationId(3));
      expect(state.activeOrganizationId).toBe(3);
    });
  });
});
