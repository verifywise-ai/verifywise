# Error Handling

## Custom Exceptions

File: `Servers/domain.layer/exceptions/custom.exception.ts`

```typescript
import {
  ValidationException,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
  BusinessLogicException,
  DatabaseException,
  ExternalServiceException,
} from "../domain.layer/exceptions/custom.exception";

// Validation error (400)
throw new ValidationException("Invalid email format", "email", invalidValue);

// Not found (404)
throw new NotFoundException("Project not found", "project", projectId);

// Unauthorized (401)
throw new UnauthorizedException("Invalid token");

// Forbidden (403)
throw new ForbiddenException("Access denied", "project", "delete");

// Conflict (409)
throw new ConflictException("Email already exists", "user", "email");

// Business logic (422)
throw new BusinessLogicException(
  "Cannot delete project with active risks",
  "project_deletion",
  { riskCount: 5 }
);

// Database error (500)
throw new DatabaseException("Connection failed", "SELECT", "projects");

// External service (502)
throw new ExternalServiceException("Slack API error", "slack", "/api/chat.postMessage");
```

## Using in Controllers

```typescript
export async function getProject(req: Request, res: Response) {
  try {
    const project = await getProjectByIdQuery(id, tenantId);

    if (!project) {
      throw new NotFoundException("Project not found", "project", id);
    }

    return res.status(200).json(STATUS_CODE[200](project));
  } catch (error) {
    if (error instanceof ValidationException) {
      return res.status(400).json(STATUS_CODE[400]({ message: error.message }));
    }
    if (error instanceof NotFoundException) {
      return res.status(404).json(STATUS_CODE[404]({ message: error.message }));
    }
    return res.status(500).json(STATUS_CODE[500]((error as Error).message));
  }
}
```
