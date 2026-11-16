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
  getRisksLinkedOnlyToProject,
  updateProjectById,
} from "../../controllers/project.ctrl";
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
