import {
  createContext,
  useContext,
  useState,
  useMemo,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import useUsers from "../../hooks/useUsers";
import type { User } from "../../../domain/types/User";

interface UsersContextValue {
  users: User[];
  refreshUsers: () => Promise<void>;
  photoRefreshFlag: boolean;
  setPhotoRefreshFlag: Dispatch<SetStateAction<boolean>>;
}

export const UsersContext = createContext<UsersContextValue>({
  users: [],
  refreshUsers: async () => {},
  photoRefreshFlag: false,
  setPhotoRefreshFlag: () => {},
});

export const UsersProvider = ({ children }: { children: ReactNode }) => {
  const { users, refreshUsers } = useUsers();
  const [photoRefreshFlag, setPhotoRefreshFlag] = useState(false);

  const value = useMemo(
    () => ({ users, refreshUsers, photoRefreshFlag, setPhotoRefreshFlag }),
    [users, refreshUsers, photoRefreshFlag, setPhotoRefreshFlag],
  );

  return <UsersContext.Provider value={value}>{children}</UsersContext.Provider>;
};

export const useUsersContext = () => {
  const context = useContext(UsersContext);
  if (!context) {
    throw new Error("useUsersContext must be used within a UsersProvider");
  }
  return context;
};
