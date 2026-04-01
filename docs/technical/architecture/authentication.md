# Authentication & Authorization

## Overview

VerifyWise implements a JWT-based authentication system with refresh token rotation, role-based access control (RBAC), and multi-tenant security. The system uses separate secrets for access and refresh tokens, with refresh tokens stored in HTTP-only cookies for XSS protection.

## Authentication Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            LOGIN FLOW                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. User submits credentials                                                │
│         │                                                                   │
│         ▼                                                                   │
│  2. POST /api/users/login                                                   │
│         │                                                                   │
│         ▼                                                                   │
│  3. Validate credentials                                                    │
│     ├── Fetch user by email                                                 │
│     ├── Verify password (bcrypt)                                            │
│     └── Update last_login timestamp                                         │
│         │                                                                   │
│         ▼                                                                   │
│  4. Generate tokens                                                         │
│     ├── Access token (1 hour, JWT_SECRET)                                   │
│     └── Refresh token (30 days, REFRESH_TOKEN_SECRET)                       │
│         │                                                                   │
│         ▼                                                                   │
│  5. Set refresh token in HTTP-only cookie                                   │
│         │                                                                   │
│         ▼                                                                   │
│  6. Return access token + user metadata                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         AUTHENTICATED REQUEST FLOW                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Client includes: Authorization: Bearer <access_token>                   │
│         │                                                                   │
│         ▼                                                                   │
│  2. authMiddleware validates:                                               │
│     ├── JWT signature (HMAC-SHA256)                                         │
│     ├── Token expiration                                                    │
│     ├── Payload structure (id, roleName)                                    │
│     ├── Organization membership                                             │
│     ├── Role consistency (matches database)                                 │
│     └── Attach organizationId to request                                    │
│         │                                                                   │
│         ▼                                                                   │
│  3. Attach context to request:                                              │
│     req.userId, req.role, req.tenantId, req.organizationId                  │
│         │                                                                   │
│         ▼                                                                   │
│  4. contextMiddleware stores in AsyncLocalStorage                           │
│         │                                                                   │
│         ▼                                                                   │
│  5. Controller handles request with tenant context                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                         TOKEN REFRESH FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Access token expires (after 1 hour)                                     │
│         │                                                                   │
│         ▼                                                                   │
│  2. POST /api/users/refresh-token                                           │
│     (refresh token sent automatically via cookie)                           │
│         │                                                                   │
│         ▼                                                                   │
│  3. Validate refresh token                                                  │
│     ├── Verify signature (REFRESH_TOKEN_SECRET)                             │
│     └── Check expiration                                                    │
│         │                                                                   │
│         ▼                                                                   │
│  4. Generate new access token with same payload                             │
│         │                                                                   │
│         ▼                                                                   │
│  5. Return new access token                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Token Structure

### Access Token

```typescript
// File: Servers/utils/jwt.utils.ts

interface AccessTokenPayload {
  id: number;              // User ID
  email: string;           // User email
  name: string;            // First name
  surname: string;         // Last name
  roleName: string;        // Role (Admin, Editor, Reviewer, Auditor)
  organizationId: number;  // Organization ID (used for data isolation)
  tenantId: string;        // Legacy field (backward compat)
  expire: number;          // Expiration timestamp
}

// Token configuration
const ACCESS_TOKEN_EXPIRY = 3600000;  // 1 hour in milliseconds
const JWT_SECRET = process.env.JWT_SECRET;
const ALGORITHM = "HS256";  // HMAC-SHA256
```

### Refresh Token

```typescript
interface RefreshTokenPayload {
  id: number;
  email: string;
  name: string;
  surname: string;
  roleName: string;
  organizationId: number;
  tenantId: string;        // Legacy field
  expire: number;
}

// Token configuration
const REFRESH_TOKEN_EXPIRY = 2592000000;  // 30 days in milliseconds
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET;
```

### Cookie Configuration

```typescript
// File: Servers/utils/jwt.utils.ts

res.cookie("refreshToken", refreshToken, {
  httpOnly: true,                    // Not accessible via JavaScript
  secure: process.env.NODE_ENV === "production",  // HTTPS only in prod
  sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  path: "/api/users",                // Only sent to user routes
  maxAge: REFRESH_TOKEN_EXPIRY,      // 30 days
});
```

## Token Generation

```typescript
// File: Servers/utils/jwt.utils.ts

export const generateToken = (data: TokenPayload): string => {
  const expire = Date.now() + ACCESS_TOKEN_EXPIRY;
  return Jwt.sign(
    { ...data, expire },
    process.env.JWT_SECRET as string
  );
};

export const generateRefreshToken = (data: TokenPayload): string => {
  const expire = Date.now() + REFRESH_TOKEN_EXPIRY;
  return Jwt.sign(
    { ...data, expire },
    process.env.REFRESH_TOKEN_SECRET as string
  );
};

// Combined generation for login
export const generateUserTokens = (user: UserModel, res: Response) => {
  const payload = {
    id: user.id!,
    email: user.email,
    name: user.name,
    surname: user.surname,
    roleName: user.roleName!,
    organizationId: user.organization_id!,
  };

  const accessToken = generateToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Set refresh token as HTTP-only cookie
  res.cookie("refreshToken", refreshToken, { /* config */ });

  return { accessToken, refreshToken };
};
```

## Authentication Middleware

The authentication middleware performs multi-layered validation:

```typescript
// File: Servers/middleware/auth.middleware.ts

export const authenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  // 1. Extract token from Authorization header
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(400).json({ message: "Access token missing" });
  }

  try {
    // 2. Verify JWT signature
    const decoded = getTokenPayload(token);

    // 3. Check expiration
    if (decoded.expire < Date.now()) {
      return res.status(406).json({ message: "Token expired" });
    }

    // 4. Validate payload structure
    if (typeof decoded.id !== "number" || decoded.id <= 0) {
      return res.status(400).json({ message: "Invalid user ID" });
    }
    if (typeof decoded.roleName !== "string") {
      return res.status(400).json({ message: "Invalid role" });
    }

    // 5. Verify organization membership
    const belongs = await doesUserBelongsToOrganizationQuery(
      decoded.id,
      decoded.organizationId
    );
    if (!belongs.belongs) {
      return res.status(403).json({
        message: "User does not belong to this organization"
      });
    }

    // 6. Verify role consistency with database
    const user = await getUserByIdQuery(decoded.id);
    if (user?.roleName !== decoded.roleName) {
      return res.status(403).json({
        message: "Role has changed, please re-authenticate"
      });
    }

    // 7. Attach context to request
    req.userId = decoded.id;
    req.role = decoded.roleName;
    req.organizationId = decoded.organizationId;

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};
```

## Role-Based Access Control (RBAC)

### Roles

| Role | ID | Permissions |
|------|-----|-------------|
| Admin | 1 | Full system access, user management, organization settings |
| Reviewer | 2 | Review and approve content, read access to most resources |
| Editor | 3 | Create and edit content, limited administrative access |
| Auditor | 4 | Read-only access for audit purposes |

### Role Model

```typescript
// File: Servers/domain.layer/models/role/role.model.ts

@Table({ tableName: "roles", timestamps: false })
export class RoleModel extends Model<RoleModel> implements IRole {
  @Column({
    type: DataType.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  })
  id?: number;

  @Column({ type: DataType.STRING })
  name!: string;

  @Column({ type: DataType.TEXT })
  description?: string;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  is_demo?: boolean;

  @Column({ type: DataType.DATE })
  created_at?: Date;
}
```

### Authorization Middleware

```typescript
// File: Servers/middleware/accessControl.middleware.ts

export const authorize = (allowedRoles: string[]) => {
  return (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    if (!req.role) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!allowedRoles.includes(req.role)) {
      return res.status(403).json({ message: "Access denied" });
    }

    return next();
  };
};
```

### Usage in Routes

```typescript
// File: Servers/routes/user.route.ts

// Admin-only routes
router.delete(
  "/:id",
  authenticateJWT,
  authorize(["Admin"]),
  deleteUserById
);

// Multiple roles allowed
router.patch(
  "/:id",
  authenticateJWT,
  authorize(["Admin", "Editor"]),
  updateUserById
);

// Any authenticated user
router.get(
  "/profile",
  authenticateJWT,
  getUserProfile
);
```

## Password Security

### Password Requirements

```typescript
// File: Servers/domain.layer/validations/password.valid.ts

interface PasswordValidation {
  minLength: 8;
  maxLength: 20;
  requireLowercase: true;
  requireUppercase: true;
  requireDigit: true;
  requireSpecial: false;  // Optional but tracked
}

export const validatePassword = (password: string): ValidationResult => {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters");
  }
  if (password.length > 20) {
    errors.push("Password must be at most 20 characters");
  }
  if (!/[a-z]/.test(password)) {
    errors.push("Password must contain a lowercase letter");
  }
  if (!/[A-Z]/.test(password)) {
    errors.push("Password must contain an uppercase letter");
  }
  if (!/\d/.test(password)) {
    errors.push("Password must contain a digit");
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};
```

### Password Hashing

```typescript
// File: Servers/domain.layer/models/user/user.model.ts

// During user creation
const password_hash = await bcrypt.hash(password, 10);  // 10 rounds

// Password comparison (constant-time)
async comparePassword(password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password_hash);
}

// Password update
async updatePassword(newPassword: string): Promise<void> {
  this.password_hash = await bcrypt.hash(newPassword, 10);
  await this.save();
}
```

## Registration Flow

```typescript
// File: Servers/controllers/user.ctrl.ts

export const createNewUser = async (req: Request, res: Response) => {
  const transaction = await sequelize.transaction();

  try {
    // 1. Extract and validate user data
    const userData = req.body;
    const validationResult = validateUserData(userData);
    if (!validationResult.isValid) {
      return res.status(400).json({ errors: validationResult.errors });
    }

    // 2. Check email uniqueness
    const existingUser = await getUserByEmailQuery(userData.email);
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    // 3. Create user with hashed password
    const user = await UserModel.createUser({
      ...userData,
      password: userData.password,  // Hashed internally
    }, transaction);

    // 4. Commit transaction
    await transaction.commit();

    // 5. Return user (password excluded)
    return res.status(201).json(user.toSafeJSON());
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: "Registration failed" });
  }
};
```

## Login Flow

```typescript
// File: Servers/controllers/user.ctrl.ts

export const loginUser = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    // 1. Fetch user by email
    const user = await getUserByEmailQuery(email);
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 2. Verify password
    const isValidPassword = await user.comparePassword(password);
    if (!isValidPassword) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // 3. Update last login
    await user.updateLastLogin();

    // 4. Generate tokens
    const { accessToken } = generateUserTokens(user, res);

    // 5. Get onboarding status
    const org = await getOrganizationByIdQuery(user.organization_id!);

    // 6. Check if user is org creator
    const isOrgCreator = await isUserOrganizationCreatorQuery(
      user.id!,
      user.organization_id!
    );

    // 7. Return response
    return res.status(202).json({
      accessToken,
      user: user.toSafeJSON(),
      onboardingStatus: org?.onboarding_status,
      isOrgCreator,
    });
  } catch (error) {
    return res.status(500).json({ message: "Login failed" });
  }
};
```

## Token Refresh

```typescript
// File: Servers/controllers/user.ctrl.ts

export const refreshToken = async (req: Request, res: Response) => {
  // 1. Get refresh token from cookie
  const refreshToken = req.cookies.refreshToken;
  if (!refreshToken) {
    return res.status(401).json({ message: "Refresh token required" });
  }

  try {
    // 2. Verify refresh token
    const decoded = getRefreshTokenPayload(refreshToken);

    // 3. Check expiration
    if (decoded.expire < Date.now()) {
      return res.status(406).json({ message: "Refresh token expired" });
    }

    // 4. Generate new access token
    const newAccessToken = generateToken({
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
      surname: decoded.surname,
      roleName: decoded.roleName,
      organizationId: decoded.organizationId,
    });

    return res.status(200).json({ accessToken: newAccessToken });
  } catch (error) {
    return res.status(401).json({ message: "Invalid refresh token" });
  }
};
```

## Password Reset Flow

### Request Reset (Sends Email)

```typescript
// Route: POST /api/users/forgot-password

// 1. Validate email exists
// 2. Generate reset token (short-lived JWT)
// 3. Send email with reset link
// 4. Link contains token: /reset-password?token=xxx
```

### Complete Reset

```typescript
// File: Servers/controllers/user.ctrl.ts
// Route: POST /api/users/reset-password

export const resetPassword = async (req: Request, res: Response) => {
  const { email, newPassword } = req.body;
  const transaction = await sequelize.transaction();

  try {
    // 1. Token validated by resetPassword middleware
    // 2. Validate new password strength
    const validation = validatePassword(newPassword);
    if (!validation.isValid) {
      return res.status(400).json({ errors: validation.errors });
    }

    // 3. Get user and update password
    const user = await getUserByEmailQuery(email);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await user.updatePassword(newPassword);
    await transaction.commit();

    // 4. Log event for audit
    await logEvent({
      userId: user.id!,
      action: "password_reset",
      details: { email },
    });

    return res.status(200).json({ message: "Password reset successful" });
  } catch (error) {
    await transaction.rollback();
    return res.status(500).json({ message: "Password reset failed" });
  }
};
```

## Rate Limiting

```typescript
// File: Servers/middleware/rateLimit.middleware.ts

import rateLimit from "express-rate-limit";

// Login rate limiter
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 5,                // 5 attempts per window
  message: { message: "Too many login attempts, please try again later" },
});

// General auth rate limiter
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { message: "Too many requests, please try again later" },
});
```

### Applied Routes

```typescript
// File: Servers/routes/user.route.ts

router.post("/login", loginLimiter, loginUser);
router.post("/register", authLimiter, registerJWT, createNewUser);
router.post("/refresh-token", authLimiter, refreshToken);
router.post("/reset-password", authLimiter, resetPasswordMiddleware, resetPassword);
```

## Frontend Authentication

### Redux Auth Slice

```typescript
// File: Clients/src/application/redux/auth/authSlice.ts

interface AuthState {
  authToken: string;
  userExists: boolean;
  user: string;
  expirationDate: Date | null;
  onboardingStatus: string;
  isOrgCreator: boolean;
}

const authSlice = createSlice({
  name: "auth",
  initialState: {
    authToken: "",
    userExists: true,
    user: "",
    expirationDate: null,
    onboardingStatus: "completed",
    isOrgCreator: false,
  },
  reducers: {
    setAuthState: (state, action) => {
      state.authToken = action.payload.authToken;
      state.user = action.payload.user;
      state.expirationDate = action.payload.expirationDate;
      state.onboardingStatus = action.payload.onboardingStatus;
      state.isOrgCreator = action.payload.isOrgCreator;
    },
    clearAuthState: (state) => {
      state.authToken = "";
      state.userExists = true;
      state.user = "";
      state.expirationDate = null;
      state.onboardingStatus = "completed";
      state.isOrgCreator = false;
    },
  },
});
```

### Auth Repository

```typescript
// File: Clients/src/application/repository/auth.repository.ts

export const authRepository = {
  login: async (email: string, password: string) => {
    const response = await api.post("/users/login", { email, password });
    return response.data;
  },

  logout: async () => {
    // Clear local state, server doesn't invalidate tokens
    store.dispatch(clearAuthState());
  },

  refreshToken: async () => {
    const response = await api.post("/users/refresh-token");
    return response.data.accessToken;
  },

  register: async (userData: RegisterData) => {
    const response = await api.post("/users/register", userData);
    return response.data;
  },
};
```

### Axios Interceptor

```typescript
// File: Clients/src/infrastructure/api/customAxios.ts

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const token = store.getState().auth.authToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 406) {  // Token expired
      try {
        const newToken = await authRepository.refreshToken();
        store.dispatch(setAuthToken(newToken));

        // Retry original request
        error.config.headers.Authorization = `Bearer ${newToken}`;
        return api.request(error.config);
      } catch (refreshError) {
        store.dispatch(clearAuthState());
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
```

## Security Features Summary

| Feature | Implementation |
|---------|----------------|
| **Password Hashing** | bcrypt with 10 rounds |
| **Token Signing** | HMAC-SHA256 (HS256) |
| **Access Token Expiry** | 1 hour |
| **Refresh Token Expiry** | 30 days |
| **Refresh Token Storage** | HTTP-only cookie |
| **XSS Protection** | httpOnly cookie flag |
| **HTTPS Enforcement** | secure cookie flag (production) |
| **CSRF Protection** | SameSite cookie attribute |
| **Rate Limiting** | 5 login attempts/minute |
| **Multi-tenant Isolation** | organization_id in queries |
| **Role Verification** | Real-time DB check |

## Key Files

| File | Purpose |
|------|---------|
| `Servers/utils/jwt.utils.ts` | Token generation and verification |
| `Servers/middleware/auth.middleware.ts` | JWT authentication middleware |
| `Servers/middleware/accessControl.middleware.ts` | RBAC authorization middleware |
| `Servers/middleware/rateLimit.middleware.ts` | Rate limiting configuration |
| `Servers/controllers/user.ctrl.ts` | Login, register, password controllers |
| `Servers/domain.layer/models/user/user.model.ts` | User model with password methods |
| `Servers/domain.layer/models/role/role.model.ts` | Role model |
| `Servers/domain.layer/validations/password.valid.ts` | Password validation rules |
| `Clients/src/application/redux/auth/authSlice.ts` | Frontend auth state |
| `Clients/src/infrastructure/api/customAxios.ts` | Axios interceptors |

## Related Documentation

- [Architecture Overview](./overview.md)
- [Multi-tenancy](./multi-tenancy.md)
- [API Endpoints](../api/endpoints.md)
