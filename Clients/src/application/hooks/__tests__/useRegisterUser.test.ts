import { renderHook, act } from "@testing-library/react";
import useRegisterUser from "../useRegisterUser";

const mockCreateNewUser = vi.fn();
const mockLogEngine = vi.fn();

vi.mock("../../repository/user.repository", () => ({
  createNewUser: (...args: unknown[]) => mockCreateNewUser(...args),
}));

vi.mock("../../tools/log.engine", () => ({
  logEngine: (...args: unknown[]) => mockLogEngine(...args),
}));

const defaultUser = {
  id: "user-1",
  firstname: "John",
  lastname: "Doe",
  roleId: 2,
};

describe("useRegisterUser", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should handle successful registration (201)", async () => {
    mockCreateNewUser.mockResolvedValue({ status: 201 });

    const { result } = renderHook(() => useRegisterUser());

    const setIsSubmitting = vi.fn();
    let response: any;

    await act(async () => {
      response = await result.current.registerUser(
        {
          values: {
            email: "test@example.com",
            name: "John",
            surname: "Doe",
            password: "pass",
            confirmPassword: "pass",
          },
          user: defaultUser,
          setIsSubmitting,
        },
        "test-token",
      );
    });

    expect(mockCreateNewUser).toHaveBeenCalledWith(
      {
        userData: {
          email: "test@example.com",
          name: "John",
          surname: "Doe",
          password: "pass",
          confirmPassword: "pass",
          role_id: 2,
        },
      },
      { Authorization: "Bearer test-token" },
    );
    expect(mockLogEngine).toHaveBeenCalledWith({
      type: "info",
      message: "Account created successfully. Redirecting to login...",
    });
    expect(setIsSubmitting).toHaveBeenCalledWith(false);
    expect(response.isSuccess).toBe(201);
  });

  it("should handle bad request (400)", async () => {
    mockCreateNewUser.mockResolvedValue({ status: 400 });

    const { result } = renderHook(() => useRegisterUser());

    const setIsSubmitting = vi.fn();
    await act(async () => {
      await result.current.registerUser(
        { values: {} as any, user: defaultUser, setIsSubmitting },
        "token",
      );
    });

    expect(mockLogEngine).toHaveBeenCalledWith({
      type: "error",
      message: "Bad request. Please check your input.",
    });
    expect(setIsSubmitting).toHaveBeenCalledWith(false);
  });

  it("should handle unexpected status code", async () => {
    mockCreateNewUser.mockResolvedValue({ status: 999 });

    const { result } = renderHook(() => useRegisterUser());

    const setIsSubmitting = vi.fn();
    await act(async () => {
      await result.current.registerUser(
        { values: {} as any, user: defaultUser, setIsSubmitting },
        "token",
      );
    });

    expect(mockLogEngine).toHaveBeenCalledWith({
      type: "error",
      message: "Unexpected response. Please try again.",
    });
  });

  it("should handle network error (catch)", async () => {
    const testError = new Error("Network failure");
    mockCreateNewUser.mockRejectedValue(testError);

    const { result } = renderHook(() => useRegisterUser());

    const setIsSubmitting = vi.fn();
    let response: any;

    await act(async () => {
      response = await result.current.registerUser(
        { values: {} as any, user: defaultUser, setIsSubmitting },
        "token",
      );
    });

    expect(mockLogEngine).toHaveBeenCalledWith({
      type: "error",
      message: "An error occurred: Network failure",
    });
    expect(setIsSubmitting).toHaveBeenCalledWith(false);
    expect(response.isSuccess).toBe(false);
  });

  it("should register with default roleId when not provided", async () => {
    mockCreateNewUser.mockResolvedValue({ status: 201 });

    const { result } = renderHook(() => useRegisterUser());

    await act(async () => {
      await result.current.registerUser(
        {
          values: {
            email: "test@example.com",
            name: "A",
            surname: "B",
            password: "",
            confirmPassword: "",
          },
          user: { id: "u1", firstname: "A", lastname: "B", roleId: 0 },
          setIsSubmitting: vi.fn(),
        },
        null,
      );
    });

    expect(mockCreateNewUser).toHaveBeenCalledWith(
      {
        userData: {
          email: "test@example.com",
          name: "A",
          surname: "B",
          password: "",
          confirmPassword: "",
          role_id: 1,
        },
      },
      { Authorization: "Bearer " },
    );
  });
});
