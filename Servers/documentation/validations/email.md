# Email Validation Function Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Function Signature](#function-signature)
- [Implementation Details](#implementation-details)
- [Usage Example](#usage-example)

## Overview

The `emailValidation` function provides email address validation functionality using regular expression pattern matching. It checks if a given string conforms to the standard email format: `local-part@domain`.

## Dependencies

The function has no external dependencies and is implemented in TypeScript.

## Function Signature

```typescript
function emailValidation(email: string): boolean;
```

### Parameters

- `email` (string): The email address to validate

### Return Value

- Returns `boolean`: `true` if the email is valid, `false` otherwise

## Implementation Details

The function uses the following regular expression pattern:

```typescript
/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
```

Pattern explanation:

- `^`: Start of string
- `[^\s@]+`: One or more characters that are not whitespace or @
- `@`: Literal @ symbol
- `[^\s@.]+`: One or more characters that are not whitespace, @, or dot
- `(?:\.[^\s@.]+)+`: One or more dot-separated domain labels
- `$`: End of string

The domain labels are separated by fixed `.` characters, so the regex engine
cannot partition the domain in multiple ways. This avoids polynomial-time
backtracking (ReDoS) on pathological inputs.

## Usage Example

```typescript
const email1 = "user@example.com";
const email2 = "invalid.email@";

emailValidation(email1); // Returns: true
emailValidation(email2); // Returns: false
```
