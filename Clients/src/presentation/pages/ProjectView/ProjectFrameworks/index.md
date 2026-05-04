# ProjectFrameworks Component

## Overview

The ProjectFrameworks component is a React component that provides a framework selection interface with compliance and assessment tracking capabilities. It's designed to help users manage and track different AI frameworks (like EU AI Act and ISO 42001) within a project context.

## Features

- Framework selection tabs (EU AI Act, ISO 42001)
- Add new framework functionality
- Compliance and Assessment tracking tabs
- Modern, clean UI with consistent styling

## Component Structure

### Main Components

- Framework Selection Tabs
- Add Framework Button
- Tracker Tabs (Compliance/Assessment)

### Props

This component doesn't accept any props as it manages its own state internally.

### State Management

- `framework`: Tracks the currently selected framework ('eu-ai-act' | 'iso-42001')
- `tracker`: Tracks the active tracker tab ('compliance' | 'assessment')

## Styling

The component uses Material-UI (MUI) for styling and follows a consistent design system:

- Colors:
  - Primary: #13715B (Green)
  - Background: #F5F6F6 (Light Gray)
  - Border: #BFC9C5
  - Text: #232B3A
- Typography: Inter font family
- Consistent spacing and sizing

## Usage Example

```tsx
import ProjectFrameworks from "./ProjectFrameworks";

const YourComponent = () => {
  return <ProjectFrameworks />;
};
```

## Dependencies

- @mui/material
- @mui/lab
- React

## File Structure

- `index.tsx`: Main component file
- `styles.ts`: Styling definitions
- `index.md`: Documentation (this file)

## Future Improvements

- Add support for more frameworks
- Implement framework addition functionality
- Add content for compliance and assessment trackers
- Add loading states and error handling
- Implement data persistence
