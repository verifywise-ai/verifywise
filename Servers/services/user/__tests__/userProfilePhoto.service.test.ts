import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../../utils/user.utils", () => ({
  getUserByIdQuery: jest.fn<any>(),
  uploadUserProfilePhotoQuery: jest.fn<any>(),
  getUserProfilePhotoQuery: jest.fn<any>(),
  deleteUserProfilePhotoQuery: jest.fn<any>(),
}));

jest.mock("../../../utils/fileUpload.utils", () => ({
  uploadFile: jest.fn<any>(),
}));

import {
  uploadProfilePhoto,
  getProfilePhoto,
  deleteProfilePhoto,
} from "../userProfilePhoto.service";
import {
  getUserByIdQuery,
  uploadUserProfilePhotoQuery,
  getUserProfilePhotoQuery,
  deleteUserProfilePhotoQuery,
} from "../../../utils/user.utils";
import { uploadFile } from "../../../utils/fileUpload.utils";

const mockGetUser = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockUploadFile = uploadFile as jest.MockedFunction<typeof uploadFile>;
const mockUploadPhoto = uploadUserProfilePhotoQuery as jest.MockedFunction<
  typeof uploadUserProfilePhotoQuery
>;
const mockGetPhoto = getUserProfilePhotoQuery as jest.MockedFunction<typeof getUserProfilePhotoQuery>;
const mockDeletePhoto = deleteUserProfilePhotoQuery as jest.MockedFunction<
  typeof deleteUserProfilePhotoQuery
>;

const fakeTransaction = {} as any;

describe("uploadProfilePhoto", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 403 when target user belongs to a different org", async () => {
    mockGetUser.mockResolvedValueOnce({ organization_id: 7 } as any);
    const result = await uploadProfilePhoto({
      targetUserId: 1,
      organizationId: 99,
      actorUserId: 2,
      file: { originalname: "p.jpg" } as any,
      transaction: fakeTransaction,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("returns 400 when no file is provided", async () => {
    mockGetUser.mockResolvedValueOnce({ organization_id: 99 } as any);
    const result = await uploadProfilePhoto({
      targetUserId: 1,
      organizationId: 99,
      actorUserId: 2,
      file: undefined,
      transaction: fakeTransaction,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns 400 when file upload yields no id", async () => {
    mockGetUser.mockResolvedValueOnce({ organization_id: 99 } as any);
    mockUploadFile.mockResolvedValueOnce({ id: undefined } as any);
    const result = await uploadProfilePhoto({
      targetUserId: 1,
      organizationId: 99,
      actorUserId: 2,
      file: { originalname: "p.jpg" } as any,
      transaction: fakeTransaction,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("returns success when full upload chain succeeds", async () => {
    mockGetUser.mockResolvedValueOnce({ organization_id: 99 } as any);
    mockUploadFile.mockResolvedValueOnce({ id: 5 } as any);
    mockUploadPhoto.mockResolvedValueOnce({ profile_photo_id: 5 } as any);
    const result = await uploadProfilePhoto({
      targetUserId: 1,
      organizationId: 99,
      actorUserId: 2,
      file: { originalname: "p.jpg" } as any,
      transaction: fakeTransaction,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toEqual({ profile_photo_id: 5 });
  });
});

describe("getProfilePhoto", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when target user belongs to a different org", async () => {
    mockGetUser.mockResolvedValueOnce({ organization_id: 7 } as any);
    const result = await getProfilePhoto({ targetUserId: 1, organizationId: 99 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("returns photo: null when none is set", async () => {
    mockGetUser.mockResolvedValueOnce({ organization_id: 99 } as any);
    mockGetPhoto.mockResolvedValueOnce(undefined as any);
    const result = await getProfilePhoto({ targetUserId: 1, organizationId: 99 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.photo).toBeNull();
  });

  it("returns the photo object when present", async () => {
    mockGetUser.mockResolvedValueOnce({ organization_id: 99 } as any);
    mockGetPhoto.mockResolvedValueOnce({ id: 1, filename: "p.jpg" } as any);
    const result = await getProfilePhoto({ targetUserId: 1, organizationId: 99 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.photo).toEqual({ id: 1, filename: "p.jpg" });
  });
});

describe("deleteProfilePhoto", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns 403 when target user belongs to a different org", async () => {
    mockGetUser.mockResolvedValueOnce({ organization_id: 7 } as any);
    const result = await deleteProfilePhoto({
      targetUserId: 1,
      organizationId: 99,
      transaction: fakeTransaction,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  it("returns 500 when the delete query returns false", async () => {
    mockGetUser.mockResolvedValueOnce({ organization_id: 99 } as any);
    mockDeletePhoto.mockResolvedValueOnce(false as any);
    const result = await deleteProfilePhoto({
      targetUserId: 1,
      organizationId: 99,
      transaction: fakeTransaction,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(500);
  });

  it("returns success when the delete query returns true", async () => {
    mockGetUser.mockResolvedValueOnce({ organization_id: 99 } as any);
    mockDeletePhoto.mockResolvedValueOnce(true as any);
    const result = await deleteProfilePhoto({
      targetUserId: 1,
      organizationId: 99,
      transaction: fakeTransaction,
    });
    expect(result.ok).toBe(true);
  });
});
