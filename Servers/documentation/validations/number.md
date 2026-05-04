# Number Validation Function Documentation

## Table of Contents

- [Overview](#overview)
- [Dependencies](#dependencies)
- [Function Signature](#function-signature)
- [Implementation Details](#implementation-details)
- [Usage Example](#usage-example)

## Overview

The `numberValidation` function validates if a given input is a valid number and optionally checks if it falls within a specified range. It accepts both string and number inputs.

## Dependencies

The function has no external dependencies and is implemented in TypeScript.

## Function Signature

```typescript
function numberValidation(value: string | number, min?: number, max?: number): boolean;
```

### Parameters

- `value` (string | number): The value to validate as a number
- `min` (number, optional): The minimum allowed value
- `max` (number, optional): The maximum allowed value

### Return Value

- Returns `boolean`: `true` if the value is valid and within range, `false` otherwise

## Implementation Details

The function performs the following validations:

1. For number type inputs:
   - Checks if the value is within the specified range (if provided)

2. For string type inputs:
   - Validates using regex pattern: `/^[0-9]*$/`
   - Converts valid string to number using `parseInt`
   - Checks if the parsed number is within the specified range (if provided)

## Usage Example

```typescript
numberValidation("123"); // Returns: true
numberValidation("abc"); // Returns: false
numberValidation("50", 0, 100); // Returns: true
numberValidation(75, 0, 50); // Returns: false
numberValidation(100); // Returns: true
```
