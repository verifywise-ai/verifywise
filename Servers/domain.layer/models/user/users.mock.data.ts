import { IUser } from "../../interfaces/user.type";

export const users = (role1: number, role2: number, _role3: number, _role4: number): IUser[] => {
  return [
    {
      id: 1,
      name: "Alice",
      surname: "Smith",
      email: "alice.smith@example.com",
      password_hash: "$2b$10$c7Mtd3kRpMjr6VexlxuAleT8Sy3SwPcT.YLCazH5QWBgnATDo5N6O",
      role_id: role1, // Admin
      created_at: new Date("2024-01-01"),
      last_login: new Date("2024-10-01"),
      is_demo: false,
    },
    {
      id: 2,
      name: "Bob",
      surname: "Johnson",
      email: "bob.johnson@example.com",
      password_hash: "$2b$10$MBmkOR9yReYBIPfR2pE0QOwT4sGHjYV/Za3B/wfmZW2gQszqVod1G",
      role_id: role2, // Reviewer
      created_at: new Date("2024-02-15"),
      last_login: new Date("2024-09-25"),
      is_demo: false,
    },
  ];
};
