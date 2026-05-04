# Onboarding Component

## Testing Locally

To reset and test the onboarding flow again:

### Option 1: Browser Console

Open browser DevTools console and run:

```javascript
// Clear onboarding state for current user
const userId = /* your user ID */;
localStorage.removeItem(`verifywise_onboarding_${userId}`);
```

### Option 2: Clear All VerifyWise LocalStorage

```javascript
// Clear all VerifyWise data
Object.keys(localStorage).forEach((key) => {
  if (key.startsWith("verifywise_")) {
    localStorage.removeItem(key);
  }
});
```

### Option 3: Application > Local Storage

1. Open DevTools (F12)
2. Go to Application tab
3. Expand "Local Storage" in the left sidebar
4. Click on your domain (e.g., `http://localhost:5173`)
5. Find keys starting with `verifywise_onboarding_`
6. Right-click and delete

### Option 4: Quick Reset via Console

```javascript
// One-liner to clear and reload
localStorage.removeItem(Object.keys(localStorage).find((k) => k.includes("onboarding")));
location.reload();
```

## Configuration

The onboarding modal shows:

- **Only on first login** (when `isComplete` is false)
- **Only on dashboard route** (`/`)
- Can be skipped at any time
- State is stored in localStorage per user: `verifywise_onboarding_{userId}`
