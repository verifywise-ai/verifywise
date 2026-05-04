# Unified Chip Component Implementation Plan

## Overview

Create a unified `Chip` component to replace all scattered chip/badge implementations across the codebase with a consistent light pastel style.

## Target Design

- Light pastel background with dark matching text
- Padding: 4px 8px
- Border radius: 4px
- Font size: 11px
- Font weight: 500
- Text transform: uppercase (default), lowercase option via prop
- Height: 24px or 34px (via prop)
- Width: content-determined

## Color Palette

### Risk Levels

| Level              | Background | Text    |
| ------------------ | ---------- | ------- |
| Critical/Very High | #FFD6D6    | #D32F2F |
| High               | #FFE5D0    | #E64A19 |
| Medium             | #FFF8E1    | #795548 |
| Low                | #E6F4EA    | #138A5E |
| Very Low           | #E0F7FA    | #00695C |

### Status Types

| Status                         | Background | Text    |
| ------------------------------ | ---------- | ------- |
| Approved/Success/Yes/Completed | #E6F4EA    | #138A5E |
| Pending/In Progress            | #FFF8E1    | #795548 |
| Restricted/Warning             | #FFE5D0    | #E64A19 |
| Blocked/Error/No/Rejected      | #FFD6D6    | #D32F2F |
| Draft/Default                  | #F3F4F6    | #6B7280 |

### Severity Levels

| Severity     | Background | Text    |
| ------------ | ---------- | ------- |
| Catastrophic | #FFD6D6    | #D32F2F |
| Major        | #FFE5D0    | #E64A19 |
| Moderate     | #FFF8E1    | #795548 |
| Minor        | #E6F4EA    | #138A5E |
| Negligible   | #E0F7FA    | #00695C |

---

## Phase 1: Create Chip Component

### Task 1.1: Create component file

- [ ] Create `src/presentation/components/Chip.tsx`
- [ ] Define props interface with:
  - `label`: string (required)
  - `variant`: predefined color variants (risk levels, status, severity, etc.)
  - `size`: "small" (24px) | "medium" (34px), default "small"
  - `uppercase`: boolean, default true
  - `backgroundColor`: string (optional override)
  - `textColor`: string (optional override)
- [ ] Implement color mapping function
- [ ] Export component

### Task 1.2: Create interface file

- [ ] Add interface to `src/domain/interfaces/i.chip.ts`

---

## Phase 2: Migrate RiskChip Usages

### Files to update:

- [ ] `src/presentation/pages/ModelInventory/ModelRisksTable.tsx` (line 180)
- [ ] `src/presentation/components/RiskLevel/index.tsx` (line 83-86)
- [ ] `src/presentation/components/Table/LinkedRisksTable.tsx`
- [ ] `src/presentation/components/Table/AuditRiskTable.tsx`
- [ ] `src/presentation/pages/ModelInventory/MLFlowDataTable.tsx`

### Post-migration:

- [ ] Remove or deprecate `RiskChip` component
- [ ] Update `src/presentation/components/RiskLevel/constants.ts` if needed

---

## Phase 3: Migrate Inline Badges

### ModelInventory Table

- [ ] `src/presentation/pages/ModelInventory/modelInventoryTable.tsx`
  - SecurityAssessmentBadge (line 89-96)
  - StatusBadge (line 83-87)

### VWProjectRisksTable

- [ ] `src/presentation/components/Table/VWProjectRisksTable/VWProjectRisksTableBody.tsx`
  - Severity chip (line 182-213)
  - Likelihood chip (line 225-257)
  - Mitigation Status chip (line 269-305)
  - Risk Level chip (line 317-349)

### IncidentManagement Table

- [ ] `src/presentation/pages/IncidentManagement/IncidentTable.tsx`
  - Severity, Status, Approval chips (line 46-101)

### PolicyTable

- [ ] `src/presentation/components/Policies/PolicyTable.tsx`
  - Status chip (line 21-49)

### TasksTable

- [ ] `src/presentation/components/Table/TasksTable/index.tsx`
  - Priority badge (line 30-52)

### TrainingRegistar Table

- [ ] `src/presentation/pages/TrainingRegistar/trainingTable.tsx`
  - Status badge

### ISO Framework Pages

- [ ] `src/presentation/pages/ISO/Clause/styles.ts`
- [ ] `src/presentation/pages/ISO/Annex/styles.ts`
- [ ] `src/presentation/pages/Framework/ISO27001/Clause/style.ts`

---

## Phase 4: Cleanup

- [ ] Remove unused style functions:
  - `statusBadgeStyle` from ModelInventory/style.ts
  - `securityAssessmentBadgeStyle` from ModelInventory/style.ts
  - `priorityBadgeStyle` from TasksTable
  - `getIncidentChipProps` from IncidentTable
- [ ] Update or remove `getRiskChipStyle` from RiskLevel/constants.ts
- [ ] Remove inline Chip styling from migrated components
- [ ] Run TypeScript check
- [ ] Run build to verify no errors

---

## Component API Design

```tsx
interface ChipProps {
  label: string;
  variant?: // Risk levels
    | "critical"
    | "high"
    | "medium"
    | "low"
    | "very-low"
    // Status
    | "success"
    | "warning"
    | "error"
    | "info"
    | "default"
    // Severity
    | "catastrophic"
    | "major"
    | "moderate"
    | "minor"
    | "negligible"
    // Boolean
    | "yes"
    | "no";
  size?: "small" | "medium"; // 24px | 34px
  uppercase?: boolean; // default true
  backgroundColor?: string; // override
  textColor?: string; // override
}
```

## Usage Examples

```tsx
// Risk level
<Chip label="High" variant="high" />

// Status
<Chip label="Approved" variant="success" />

// Boolean
<Chip label="Yes" variant="yes" />

// Custom
<Chip label="Custom" backgroundColor="#E8F5E9" textColor="#2E7D32" />

// Lowercase, medium size
<Chip label="In Progress" variant="warning" uppercase={false} size="medium" />
```
