import { User } from "../../../../domain/types/User";
import { UserResponseDTO } from "../../../../application/dtos";

const userDto: UserResponseDTO = {
  id: 1,
  name: "John",
  surname: "Doe",
  email: "john.doe@email.com",
  password_hash: "hashed_password",
  role_id: 2,
  created_at: "2024-01-01T12:00:00Z",
  last_login: "2024-06-01T08:30:00Z",
  is_demo: false,
  organization_id: 10,
  pwd_set: true,
};

export class UserResponseBuilder {
  private readonly dto: UserResponseDTO;

  constructor(id: number = 1) {
    this.dto = { ...userDto };
    this.dto.id = id;
  }

  withoutCreatedAt(): this {
    this.dto.created_at = undefined;
    return this;
  }

  withoutLastLogin(): this {
    this.dto.last_login = undefined;
    return this;
  }

  build(): UserResponseDTO {
    return this.dto;
  }
}

const user: User = {
  id: 1,
  name: "John",
  surname: "Doe",
  email: "john.doe@email.com",
  password_hash: "hashed_password",
  role_id: 2,
  roleId: undefined,
  created_at: new Date("2024-01-01T12:00:00Z"),
  last_login: new Date("2024-06-01T08:30:00Z"),
  is_demo: false,
  organization_id: 10,
  pwd_set: true,
};

export class UserBuilder {
  private readonly user: Partial<User>;

  constructor(id: number = 1) {
    this.user = { ...user };
    this.user.id = id;
  }

  withoutName(): this {
    this.user.name = undefined;
    return this;
  }

  withoutSurname(): this {
    this.user.surname = undefined;
    return this;
  }

  withoutEmail(): this {
    this.user.email = undefined;
    return this;
  }

  withoutRoleId(): this {
    this.user.role_id = undefined;
    this.user.roleId = 2;
    return this;
  }

  build(): Partial<User> {
    return this.user;
  }
}
