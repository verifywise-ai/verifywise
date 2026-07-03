import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useAuth } from "../../hooks/useAuth";
import type { AuthValues } from "../../interfaces/appStates";

interface AuthContextValue {
  authValues: AuthValues;
  setAuthValues: Dispatch<SetStateAction<AuthValues>>;
  token: string | null;
  userRoleName: string;
  userId: number | null;
  organizationId: number | null;
}

export const AuthContext = createContext<AuthContextValue>({
  authValues: {},
  setAuthValues: () => {},
  token: null,
  userRoleName: "",
  userId: null,
  organizationId: null,
});

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [authValues, setAuthValues] = useState<AuthValues>({});
  const { token, userRoleName, userId, organizationId } = useAuth();

  const value = useMemo(
    () => ({ authValues, setAuthValues, token, userRoleName, userId, organizationId }),
    [authValues, setAuthValues, token, userRoleName, userId, organizationId],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuthContext = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
};
