import { useSelector } from "react-redux";
import { Navigate, useLocation } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { useDispatch } from "react-redux";
import {
  setUserExists,
  clearAuthState,
} from "../../../application/redux/auth/authSlice";
import { getAllEntities } from "../../../application/repository/entity.repository";
import CustomizableToast from "../Toast";
import { extractUserToken } from "../../../application/tools/extractToken";
import { IProtectedRouteProps } from "../../types/widget.types";

const ProtectedRoute = ({ Component, ...rest }: IProtectedRouteProps) => {
  const authState = useSelector(
    (state: { auth: { authToken: string; userExists: boolean } }) => state.auth
  );
  const location = useLocation();
  const dispatch = useDispatch();
  const [loading, setLoading] = useState(true);

  // Track if we've already validated the token in this session
  const hasValidatedRef = useRef(false);
  const lastTokenRef = useRef<string | null>(null);

  // List of public routes that don't need authentication
  const publicRoutes = [
    "/login",
    "/user-reg",
    "/forgot-password",
    "/reset-password",
    "/set-new-password",
    "/reset-password-continue",
  ];
  const isPublicRoute = publicRoutes.includes(location.pathname);

  useEffect(() => {
    // Check if user exists in the database and validate token
    const checkUserExistsInDatabase = async () => {
      try {
        const response = await getAllEntities({
          routeUrl: "/users/check/exists",
        });
        const userExists = response ?? false;

        // If we have a token, validate it's still valid
        if (authState.authToken) {
          const user = extractUserToken(authState.authToken);
          try {
            // Test token validity with a simple API call
            await getAllEntities({
              routeUrl: `/users/${user?.id}`,
            });
          } catch (tokenError) {
            console.warn(
              "Token validation failed, clearing auth state:",
              tokenError
            );
            dispatch(clearAuthState());
            hasValidatedRef.current = false;
            return; // Exit early since token is invalid
          }
        }

        dispatch(setUserExists(userExists));
        hasValidatedRef.current = true;
        lastTokenRef.current = authState.authToken;
      } catch (error) {
        console.error("Error checking if user exists:", error);
        // If there's a network error but we have a token, don't clear it
        // Only clear on explicit auth failures
      } finally {
        setLoading(false);
      }
    };

    // Only run the check if:
    // 1. We're not on public auth pages
    // 2. We have a valid token
    // 3. We haven't already validated OR the token has changed
    const tokenChanged = lastTokenRef.current !== authState.authToken;
    const needsValidation = !hasValidatedRef.current || tokenChanged;

    if (!isPublicRoute && authState.authToken && needsValidation) {
      checkUserExistsInDatabase();
    } else {
      setLoading(false);
    }
  }, [dispatch, authState.authToken, isPublicRoute]);

  if (loading) {
    return <CustomizableToast title="Loading..." />; // Show a loading indicator while checking user existence
  }

  // Always allow access to login route
  if (location.pathname === "/login") {
    return <Component {...rest} />;
  }

  // If users exist and we have an auth token, allow access to protected routes
  if (authState.authToken) {
    return <Component {...rest} />;
  }

  // If users exist but no auth token, redirect to login
  // return <Navigate to="/login" replace state={{ from: location }} />;

  // Single-tenant authentication logic (only reached if not multi-tenant)
  if (authState.authToken && location.pathname === "/login") {
    return <Navigate to="/" replace />;
  }

  // Check authentication for protected routes (including root '/')
  if (!authState.authToken && !isPublicRoute) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // Allow access to public routes without authentication
  if (isPublicRoute) {
    return <Component {...rest} />;
  }

  return <Component {...rest} />;
};

export default ProtectedRoute;
