import express, { NextFunction, Request, Response } from "express";
const router = express.Router();
import authenticateJWT from "../../middleware/auth.middleware";
import authorize from "../../middleware/accessControl.middleware";
import {
  validateCreateProjectV1,
  validateUpdateProjectV1,
} from "../../middleware/validators/project.validator";
import {
  validateRaciProjectId,
  validateRaciRoleChange,
} from "../../middleware/validators/raci.validator";
import {
  createProject,
  deleteProjectByIdV1,
  getRisksLinkedOnlyToProject,
  updateProjectById,
} from "../../controllers/project.ctrl";
import { STATUS_CODE } from "../../utils/statusCode.utils";
import { validateProjectIdParam } from "../../middleware/validators/project.validator";
import { requireProjectAccess } from "../../middleware/projectAccess.middleware";
import { getRaciMatrix, updateRaciUserRoles } from "../../controllers/raci.ctrl";
import {
  createAiAppFromUseCase,
  getCreateAiAppPreview,
  listUseCaseAiApps,
} from "../../controllers/aiAppProject.ctrl";

// Use case create and update with external owners (#5256). The legacy
// /api/projects contract is frozen, so only these two writes have a v1 version;
// other existing reads stay on the legacy router. The AI app links below (#5259)
// are new, so they start here.
const acceptExternalOwner = (_req: Request, res: Response, next: NextFunction) => {
  res.locals.acceptsExternalOwner = true;
  next();
};

router.post(
  "/",
  authenticateJWT,
  authorize("useCase.edit"),
  validateCreateProjectV1,
  acceptExternalOwner,
  createProject,
);
router.patch(
  "/:id",
  authenticateJWT,
  authorize("useCase.edit"),
  validateUpdateProjectV1,
  acceptExternalOwner,
  updateProjectById,
);

// What deleting the use case would reveal: its risks linked to no other use
// case. Same gate as DELETE /api/projects/:id (useCase.edit plus write access
// to this use case), since only someone who could delete it needs to know.
router.get(
  "/:id/risks-linked-only-here",
  authenticateJWT,
  authorize("useCase.edit"),
  validateProjectIdParam,
  requireProjectAccess("id", "params", "write"),
  getRisksLinkedOnlyToProject,
);

const ARCHIVE_FLAG = "archive_risks_linked_only_here";

/**
 * The delete's archive choice, required so an API caller decides what happens
 * to the risks linked only to this use case: "true" archives them (kept
 * private), "false" keeps them active (visible to everyone once unlinked).
 * Anything else, a missing or repeated value included, is a 400.
 */
const parseArchiveFlag = (req: Request, res: Response, next: NextFunction) => {
  const raw = req.query[ARCHIVE_FLAG];
  if (raw !== "true" && raw !== "false") {
    return res.status(400).json(STATUS_CODE[400](`${ARCHIVE_FLAG} must be "true" or "false"`));
  }
  res.locals.archiveRisksLinkedOnlyHere = raw === "true";
  return next();
};

// Archiving is the bulk risk archive, so it needs that route's permission too.
const requireRiskArchivePermission = authorize("risks.edit");
const requireRiskArchiveWhenAsked = (req: Request, res: Response, next: NextFunction) =>
  res.locals.archiveRisksLinkedOnlyHere ? requireRiskArchivePermission(req, res, next) : next();

// Delete a use case and, when asked, archive the risks linked only to it in
// the same transaction. Same gate as DELETE /api/projects/:id (useCase.edit
// plus write access), and risks.edit when archiving. The legacy route is
// frozen and never archives.
router.delete(
  "/:id",
  authenticateJWT,
  authorize("useCase.edit"),
  validateProjectIdParam,
  parseArchiveFlag,
  requireProjectAccess(),
  requireRiskArchiveWhenAsked,
  deleteProjectByIdV1,
);

router.get("/:id/raci", authenticateJWT, validateRaciProjectId, getRaciMatrix);
router.put(
  "/:id/raci/users/:userId",
  authenticateJWT,
  authorize("useCase.edit"),
  validateRaciRoleChange,
  updateRaciUserRoles,
);

router.get("/:id/ai-apps", authenticateJWT, listUseCaseAiApps);
router.get("/:id/create-ai-app", authenticateJWT, authorize("aiApp.edit"), getCreateAiAppPreview);
router.post("/:id/create-ai-app", authenticateJWT, authorize("aiApp.edit"), createAiAppFromUseCase);

export default router;
