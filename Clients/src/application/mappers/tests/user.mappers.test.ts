import { UserModel } from "../../../domain/models/Common/user/user.model";
import {
  mapUserResponseDTOsToModels,
  mapUserResponseDTOsToUsers,
  mapUserResponseDTOToModel,
  mapUserResponseDTOToUser,
  mapUserToCreateDTO,
  mapUserToUpdateDTO,
} from "../user.mapper";
import { UserBuilder, UserResponseBuilder } from "./mocks/user.mappers.mocks";

describe("Test user mappers functions", () => {
  describe("mapUserResponseDTOToUser", () => {
    it("should map UserResponseDTO to User correctly", () => {
      const dto = new UserResponseBuilder().build();
      const user = mapUserResponseDTOToUser(dto);

      expect(user.id).toBe(dto.id);
      expect(user.name).toBe(dto.name);
      expect(user.surname).toBe(dto.surname);
      expect(user.email).toBe(dto.email);
      expect(user.password_hash).toBe(dto.password_hash);
      expect(user.roleId).toBe(dto.role_id);
      expect(user.created_at).toBeInstanceOf(Date);
      expect(user.last_login).toBeInstanceOf(Date);
      expect(user.created_at?.toISOString()).toBe(new Date(dto.created_at as string).toISOString());
      expect(user.last_login?.toISOString()).toBe(new Date(dto.last_login as string).toISOString());
      expect(user.is_demo).toBe(dto.is_demo);
      expect(user.organization_id).toBe(dto.organization_id);
      expect(user.pwd_set).toBe(dto.pwd_set);
    });
    it("should return undefined for created_at if it is not provided", () => {
      const dto = new UserResponseBuilder().withoutCreatedAt().build();
      const user = mapUserResponseDTOToUser(dto);

      expect(user.created_at).toBeUndefined();
    });
    it("should return undefined for last_login if it is not provided", () => {
      const dto = new UserResponseBuilder().withoutLastLogin().build();
      const user = mapUserResponseDTOToUser(dto);

      expect(user.last_login).toBeUndefined();
    });
  });
  describe("mapUserResponseDTOToModel", () => {
    it("should map UserResponseDTO to UserModel correctly", () => {
      const dto = new UserResponseBuilder().build();
      const userModel = mapUserResponseDTOToModel(dto);
      expect(userModel).toBeInstanceOf(UserModel);
      expect(userModel.id).toBe(dto.id);
      expect(userModel.name).toBe(dto.name);
      expect(userModel.surname).toBe(dto.surname);
      expect(userModel.email).toBe(dto.email);
      expect(userModel.password_hash).toBe(dto.password_hash);
      expect(userModel.role_id).toBe(dto.role_id);
      expect(userModel.roleId).toBe(dto.role_id);
      expect(userModel.created_at).toBeInstanceOf(Date);
      expect(userModel.last_login).toBeInstanceOf(Date);
      expect(userModel.created_at?.toISOString()).toBe(
        new Date(dto.created_at as string).toISOString(),
      );
      expect(userModel.last_login?.toISOString()).toBe(
        new Date(dto.last_login as string).toISOString(),
      );
    });
    it("should return undefined for created_at if it is not provided", () => {
      const dto = new UserResponseBuilder().withoutCreatedAt().build();
      const userModel = mapUserResponseDTOToModel(dto);
      expect(userModel.created_at).toBeUndefined();
    });
    it("should return undefined for last_login if it is not provided", () => {
      const dto = new UserResponseBuilder().withoutLastLogin().build();
      const userModel = mapUserResponseDTOToModel(dto);
      expect(userModel.last_login).toBeUndefined();
    });
  });
  describe("mapUserResponseDTOsToUsers", () => {
    it("should map array of UserResponseDTOs to array of Users correctly", () => {
      const dto1 = new UserResponseBuilder(1).build();
      const dto2 = new UserResponseBuilder(2).build();
      const users = mapUserResponseDTOsToUsers([dto1, dto2]);

      expect(users.length).toBe(2);
      expect(users[0].id).toBe(dto1.id);
      expect(users[1].id).toBe(dto2.id);
    });
  });
  describe("mapUserResponseDTOsToModels", () => {
    it("should map array of UserResponseDTOs to array of UserModels correctly", () => {
      const dto1 = new UserResponseBuilder(1).build();
      const dto2 = new UserResponseBuilder(2).build();
      const userModels = mapUserResponseDTOsToModels([dto1, dto2]);

      expect(userModels.length).toBe(2);
      userModels.forEach((model) => {
        expect(model).toBeInstanceOf(UserModel);
      });
      expect(userModels[0].id).toBe(dto1.id);
      expect(userModels[1].id).toBe(dto2.id);
    });
  });
  describe("mapUserToCreateDTO", () => {
    it("should receive a user and password and return CreateUserDTO correctly", () => {
      const user = new UserBuilder().build();
      const password = "plain_password";
      const createDTO = mapUserToCreateDTO(user, password);
      expect(createDTO.name).toBe(user.name);
      expect(createDTO.surname).toBe(user.surname);
      expect(createDTO.email).toBe(user.email);
      expect(createDTO.password).toBe(password);
      expect(createDTO.role_id).toBe(user.role_id);
      expect(createDTO.organization_id).toBe(user.organization_id);
    });
    it("should add empty string if name is not provided", () => {
      const user = new UserBuilder().withoutName().build();
      const password = "plain_password";
      const createDTO = mapUserToCreateDTO(user, password);
      expect(createDTO.name).toBe("");
    });
    it("should add empty string if surname is not provided", () => {
      const user = new UserBuilder().withoutSurname().build();
      const password = "plain_password";
      const createDTO = mapUserToCreateDTO(user, password);
      expect(createDTO.surname).toBe("");
    });
    it("should add empty string if email is not provided", () => {
      const user = new UserBuilder().withoutEmail().build();
      const password = "plain_password";
      const createDTO = mapUserToCreateDTO(user, password);
      expect(createDTO.email).toBe("");
    });
    it("should use roleId if role_id is not provided", () => {
      const user = new UserBuilder().withoutRoleId().build();
      const password = "plain_password";
      const createDTO = mapUserToCreateDTO(user, password);
      expect(user.role_id).toBeUndefined();
      expect(createDTO.role_id).toBe(user.roleId);
    });
  });
  describe("mapUserToUpdateDTO", () => {
    it("should receive a user and return UpdateUserDTO correctly", () => {
      const user = new UserBuilder().build();
      const updateDTO = mapUserToUpdateDTO(user);
      expect(updateDTO.name).toBe(user.name);
      expect(updateDTO.surname).toBe(user.surname);
      expect(updateDTO.email).toBe(user.email);
      expect(updateDTO.role_id).toBe(user.role_id);
      expect(updateDTO.organization_id).toBe(user.organization_id);
    });
    it("should use roleId if role_id is not provided", () => {
      const user = new UserBuilder().withoutRoleId().build();
      const updateDTO = mapUserToUpdateDTO(user);
      expect(user.role_id).toBeUndefined();
      expect(updateDTO.role_id).toBe(user.roleId);
    });
  });
});
