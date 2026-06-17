/**
 * Profile photo upload / get / delete service.
 *
 * The controllers used to mix authorization checks, file upload orchestration,
 * and DB updates inline; this module centralizes the work so the controllers
 * just translate the result into an HTTP response.
 */

import { Transaction } from "sequelize";
import {
  deleteUserProfilePhotoQuery,
  getUserByIdQuery,
  getUserProfilePhotoQuery,
  uploadUserProfilePhotoQuery,
} from "../../utils/user.utils";
import { uploadFile } from "../../utils/fileUpload.utils";

export type ProfilePhotoOutcome =
  | { ok: true; data: any }
  | { ok: false; status: 400 | 403 | 404 | 500; message: string };

async function assertUserBelongsToOrg(
  userId: number,
  organizationId: number,
): Promise<{ allowed: boolean }> {
  const user = await getUserByIdQuery(userId);
  return { allowed: user?.organization_id === organizationId };
}

export interface UploadProfilePhotoInput {
  targetUserId: number;
  organizationId: number;
  actorUserId: number;
  file: Express.Multer.File | undefined;
  transaction: Transaction;
}

export async function uploadProfilePhoto(input: UploadProfilePhotoInput): Promise<ProfilePhotoOutcome> {
  const { targetUserId, organizationId, actorUserId, file, transaction } = input;

  const access = await assertUserBelongsToOrg(targetUserId, organizationId);
  if (!access.allowed) {
    return { ok: false, status: 403, message: "Forbidden: Access to this user is denied" };
  }

  if (!file) {
    return { ok: false, status: 400, message: "No file provided" };
  }

  const uploaded = await uploadFile(
    file,
    actorUserId,
    null,
    "AI trust center group",
    organizationId,
    transaction,
  );
  const fileId = uploaded?.id;
  if (!fileId) {
    return { ok: false, status: 400, message: "File upload failed" };
  }

  const result = await uploadUserProfilePhotoQuery(
    targetUserId,
    fileId,
    organizationId,
    transaction,
  );
  if (!result) {
    return { ok: false, status: 500, message: "Failed to upload profile photo" };
  }

  return { ok: true, data: result };
}

export interface GetProfilePhotoInput {
  targetUserId: number;
  organizationId: number;
}

export async function getProfilePhoto(input: GetProfilePhotoInput): Promise<ProfilePhotoOutcome> {
  const { targetUserId, organizationId } = input;
  const access = await assertUserBelongsToOrg(targetUserId, organizationId);
  if (!access.allowed) {
    return { ok: false, status: 403, message: "Forbidden: Access to this user is denied" };
  }

  const photo = await getUserProfilePhotoQuery(targetUserId, organizationId);
  return { ok: true, data: { photo: photo ?? null } };
}

export interface DeleteProfilePhotoInput {
  targetUserId: number;
  organizationId: number;
  transaction: Transaction;
}

export async function deleteProfilePhoto(
  input: DeleteProfilePhotoInput,
): Promise<ProfilePhotoOutcome> {
  const { targetUserId, organizationId, transaction } = input;

  const access = await assertUserBelongsToOrg(targetUserId, organizationId);
  if (!access.allowed) {
    return { ok: false, status: 403, message: "Forbidden: Access to this user is denied" };
  }

  const isDeleted = await deleteUserProfilePhotoQuery(targetUserId, organizationId, transaction);
  if (!isDeleted) {
    return { ok: false, status: 500, message: "Failed to delete profile photo" };
  }

  return { ok: true, data: null };
}
