import { store } from "../../store";
import { getAuthToken } from "../getAuthToken";

vi.mock("../../store", () => ({
  store: {
    getState: vi.fn(),
  },
}));

describe("getAuthToken", () => {
  it("should return authToken from store state", () => {
    const mockState = {
      auth: {
        authToken: "eyJhbGciOiJIUzI1NiJ9.test.sig",
      },
    };
    (store.getState as ReturnType<typeof vi.fn>).mockReturnValue(mockState);

    const token = getAuthToken();

    expect(token).toBe("eyJhbGciOiJIUzI1NiJ9.test.sig");
    expect(store.getState).toHaveBeenCalled();
  });

  it("should return empty string when no token is set", () => {
    const mockState = {
      auth: {
        authToken: "",
      },
    };
    (store.getState as ReturnType<typeof vi.fn>).mockReturnValue(mockState);

    const token = getAuthToken();

    expect(token).toBe("");
  });
});
