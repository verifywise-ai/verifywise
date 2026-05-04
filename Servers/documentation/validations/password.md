# Password Validation Function Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Function Signature](#function-signature)
- [Implementation Details](#implementation-details)
- [Usage Example](#usage-example)

## Overview

The `passwordValidation` function evaluates passwords against specific security criteria, including character types, special characters, and length requirements.

## Dependencies

The function has no external dependencies and is implemented in TypeScript.

## Function Signature

```typescript
function passwordValidation(password: string): {
  isValid: boolean;
  hasSpecialChar: boolean;
  isMinLength: boolean;
  isMaxLength: boolean;
};
```

### Parameters

- `password` (string): The password to validate

### Return Value

Returns an object with the following properties:

```typescript
{
  isValid: boolean; // Meets all basic requirements
  hasSpecialChar: boolean; // Contains special characters
  isMinLength: boolean; // Meets minimum length (8 chars)
  isMaxLength: boolean; // Meets maximum length (20 chars)
}
```

## Implementation Details

The function uses the following validation criteria:

1. Password Regex Pattern: `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[a-zA-Z\d]{8,}$/`
   - Requires at least one lowercase letter
   - Requires at least one uppercase letter
   - Requires at least one digit
   - Minimum length of 8 characters

2. Special Characters Regex: `/[^a-zA-Z\d]/`
   - Checks for any non-alphanumeric characters

3. Length Requirements:
   - Minimum length: 8 characters
   - Maximum length: 20 characters

## Usage Example

```typescript
const result = passwordValidation("Password123");
// Returns:
// {
//   isValid: true,
//   hasSpecialChar: false,
//   isMinLength: true,
//   isMaxLength: true
// }

const result2 = passwordValidation("Weak");
// Returns:
// {
//   isValid: false,
//   hasSpecialChar: false,
//   isMinLength: false,
//   isMaxLength: true
// }
```
