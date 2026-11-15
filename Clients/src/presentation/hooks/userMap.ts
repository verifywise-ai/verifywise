/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useMemo } from "react";
import { getAllEntities } from "../../application/repository/entity.repository";
import { buildUserSortNames } from "../../application/utils/userSort";

export interface User {
  id: number;
  name: string;
  surname: string;
  [key: string]: any;
}

export const useUserMap = () => {
  const [users, setUsers] = useState<User[]>([]);

  // Fetch users
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await getAllEntities({ routeUrl: "/users" });
        if (res?.data) setUsers(res.data);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };

    fetchUsers();
  }, []);

  // User id (as a string) to full name, built the way the table sorts build it.
  const userMap = useMemo(() => buildUserSortNames(users), [users]);

  return { users, userMap };
};
