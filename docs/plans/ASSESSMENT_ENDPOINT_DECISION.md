# Decision Record: Stale Assessment Endpoints

## Context

`Servers/routes/assessment.route.ts` previously had five commented-out route registrations. The corresponding controller functions were checked in `Servers/controllers/assessment.ctrl.ts`:

| Route                                    | Handler                | Controller exists? | Tests exist? |
| ---------------------------------------- | ---------------------- | ------------------ | ------------ |
| `POST /api/assessments`                  | `createAssessment`     | Yes                | Yes          |
| `POST /api/assessments/saveAnswers`      | `saveAnswers`          | **No**             | No           |
| `PUT /api/assessments/:id`               | `updateAssessmentById` | Yes                | Yes          |
| `PUT /api/assessments/updateAnswers/:id` | `updateAnswers`        | **No**             | No           |
| `DELETE /api/assessments/:id`            | `deleteAssessmentById` | Yes                | Yes          |

The task brief referenced "4 assessment endpoints" that were documented but commented out. The exact count was ambiguous because the route documentation in `Servers/documentation/routes/assessment.md` was also stale (it described all routes as commented out, while the GET routes were already active).

## Decision

**Re-enable the three assessment endpoints that have existing, tested controller functions, and remove the two endpoints whose controllers do not exist.**

Re-enabled:

1. `POST /api/assessments` → `createAssessment`
2. `PUT /api/assessments/:id` → `updateAssessmentById`
3. `DELETE /api/assessments/:id` → `deleteAssessmentById`

Removed:

1. `POST /api/assessments/saveAnswers` → `saveAnswers` (no controller)
2. `PUT /api/assessments/updateAnswers/:id` → `updateAnswers` (no controller)

### Rationale

- Re-enabling endpoints with existing controllers is low-risk and makes the assessment router a complete CRUD surface.
- Endpoints without controllers would require inventing new behavior, which is out of scope for a documentation-unification initiative.
- Removing the stale commented-out code eliminates drift between the route file and the actual API surface.

## Implementation notes

- Removed the `multer`/`upload` import from `Servers/routes/assessment.route.ts` because the file-upload route was not re-enabled.
- After re-enabling, run the generator and drift check to confirm the endpoints are reflected in `swagger.yaml`.
- `Servers/documentation/routes/assessment.md` should be updated to reflect the active routes.
