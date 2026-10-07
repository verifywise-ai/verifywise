import { screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router";
import { http, HttpResponse } from "msw/http";
import { server } from "../../../../test/mocks/server";
import { queryClient } from "../../../../application/config/queryClient";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ProtectedRoute from "../index";

/**
 * A valid-looking JWT token for tests (not cryptographically valid).
 * Just needs to be a non-empty string so ProtectedRoute treats the user as authenticated.
 */
const TEST_AUTH_TOKEN = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  btoa(
    JSON.stringify({
      id: 1,
      email: "test@verifywise.com",
      name: "Test",
      surname: "User",
      organizationId: 1,
      tenantId: "abc123",
      roleName: "Admin",
      expire: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
  ),
  "test-signature",
].join(".");

// Dummy components for test routes
const Dashboard = () => <div data-testid="dashboard">Dashboard</div>;
const LoginPage = () => <div data-testid="login-page">Login</div>;

/** Helper that renders ProtectedRoute within a <Routes> so redirects work. */
function renderProtected(options: { route?: string; authToken?: string }) {
  return renderWithProviders(
    <Routes>
      <Route path="/" element={<ProtectedRoute Component={Dashboard} />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/vendors"
        element={<ProtectedRoute Component={() => <div data-testid="vendors">Vendors</div>} />}
      />
    </Routes>,
    {
      route: options.route ?? "/",
      preloadedAuth: {
        authToken: options.authToken ?? "",
        userExists: true,
      },
    },
  );
}

describe("ProtectedRoute", () => {
  beforeEach(() => {
    // Suppress expected console.error from network errors in test environment
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const originalLocation = window.location;
  const mockAssign = vi.fn();

  beforeEach(() => {
    mockAssign.mockClear();
    // A forced logout loads /login as a new page, which jsdom cannot do.
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: { ...originalLocation, assign: mockAssign },
    });
  });

  afterEach(() => {
    // The query cache is a module singleton shared across tests.
    queryClient.clear();
    Object.defineProperty(window, "location", {
      configurable: true,
      writable: true,
      value: originalLocation,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to /login when there is no auth token", async () => {
    renderProtected({ route: "/", authToken: "" });

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });

  it("renders the protected component when a valid auth token exists", async () => {
    renderProtected({ route: "/", authToken: TEST_AUTH_TOKEN });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard")).toBeInTheDocument();
    });
  });

  it("redirects to /login for nested protected routes without token", async () => {
    renderProtected({ route: "/vendors", authToken: "" });

    await waitFor(() => {
      expect(screen.getByTestId("login-page")).toBeInTheDocument();
    });
  });

  it("renders nested protected route with valid token", async () => {
    renderProtected({ route: "/vendors", authToken: TEST_AUTH_TOKEN });

    await waitFor(() => {
      expect(screen.getByTestId("vendors")).toBeInTheDocument();
    });
  });

  it("clears auth and the query cache when the stored token fails validation", async () => {
    server.use(
      http.get("/api/users/:id", () =>
        HttpResponse.json({ message: "Unauthorized", data: "Invalid token" }, { status: 401 }),
      ),
    );
    queryClient.setQueryData(["projects"], [{ id: 1, name: "Previous user's project" }]);

    const { store } = renderProtected({ route: "/", authToken: TEST_AUTH_TOKEN });

    // A full page load, like every forced logout, so app-level state does
    // not reach the next user.
    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("/login"));
    expect(store.getState().auth.authToken).toBe("");
    expect(queryClient.getQueryData(["projects"])).toBeUndefined();
  });

  it("clears the session when the server rejects the token with 400", async () => {
    // The auth middleware answers 400 for "Token not found" and "Invalid token".
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      http.get("/api/users/:id", () =>
        HttpResponse.json({ message: "Bad Request", data: "Invalid token" }, { status: 400 }),
      ),
    );

    const { store } = renderProtected({ route: "/", authToken: TEST_AUTH_TOKEN });

    await waitFor(() => expect(mockAssign).toHaveBeenCalledWith("/login"));
    expect(store.getState().auth.authToken).toBe("");
  });

  it("keeps the session when token validation fails for a server error", async () => {
    // A 5xx or a network failure says nothing about the token: signing the
    // user out and wiping the cache for it would be wrong.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      http.get("/api/users/:id", () =>
        HttpResponse.json({ message: "Internal Server Error" }, { status: 500 }),
      ),
    );
    queryClient.setQueryData(["projects"], [{ id: 1, name: "This user's project" }]);

    const { store } = renderProtected({ route: "/", authToken: TEST_AUTH_TOKEN });

    await waitFor(() => {
      expect(screen.getByTestId("dashboard")).toBeInTheDocument();
    });
    // Let the validation settle before checking nothing was cleared.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(store.getState().auth.authToken).toBe(TEST_AUTH_TOKEN);
    expect(queryClient.getQueryData(["projects"])).toEqual([
      { id: 1, name: "This user's project" },
    ]);
  });

  it("keeps the session when token validation gets a 403 with a status", async () => {
    // Session-ending 403s are handled by the axios interceptor; a 403 that
    // reaches here with a status is e.g. the refresh call's CSRF check.
    vi.spyOn(console, "warn").mockImplementation(() => {});
    server.use(
      http.get("/api/users/:id", () =>
        HttpResponse.json(
          { message: "Forbidden", data: "CSRF token missing or invalid" },
          { status: 403 },
        ),
      ),
    );

    const { store } = renderProtected({ route: "/", authToken: TEST_AUTH_TOKEN });

    await waitFor(() => expect(screen.getByTestId("dashboard")).toBeInTheDocument());
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockAssign).not.toHaveBeenCalled();
    expect(store.getState().auth.authToken).toBe(TEST_AUTH_TOKEN);
  });
});
