
import { Router } from 'express';
import { PolicyController } from '../controllers/policy.ctrl';
import authenticateJWT from '../middleware/auth.middleware';
import multer from 'multer';
import { DOCX_MAX_FILE_SIZE_BYTES } from '../services/policies/policyImporter';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCX_MAX_FILE_SIZE_BYTES },
});

const router = Router();

// POST /policies/import/docx - Import DOCX and convert to HTML
router.post('/import/docx', authenticateJWT, upload.single('file'), PolicyController.importDocx);

// GET /policies - Get all policies
router.get('/', authenticateJWT, PolicyController.getAllPolicies);

// GET /policies/tags - Get available policy tags
router.get('/tags', authenticateJWT, PolicyController.getPolicyTags);

// GET /policies/:id/export/pdf - Export policy as PDF
router.get('/:id/export/pdf', authenticateJWT, PolicyController.exportPolicyPDF);

// GET /policies/:id/export/docx - Export policy as DOCX
router.get('/:id/export/docx', authenticateJWT, PolicyController.exportPolicyDOCX);

// GET /policies/:id - Get policy by ID
router.get('/:id', authenticateJWT, PolicyController.getPolicyById);

// POST /policies - Create new policy
router.post('/', authenticateJWT, PolicyController.createPolicy);

// PUT /policies/:id - Update policy
router.put('/:id', authenticateJWT, PolicyController.updatePolicy);

// DELETE /policies/:id - Delete policy by ID
router.delete('/:id', authenticateJWT, PolicyController.deletePolicyById);

// POST /policies/:id/review/request - Request review for a policy
router.post('/:id/review/request', authenticateJWT, PolicyController.requestReview);

// PUT /policies/:id/review/approve - Approve a policy review
router.put('/:id/review/approve', authenticateJWT, PolicyController.approveReview);

// PUT /policies/:id/review/reject - Reject a policy review (request changes)
router.put('/:id/review/reject', authenticateJWT, PolicyController.rejectReview);


export default router;
