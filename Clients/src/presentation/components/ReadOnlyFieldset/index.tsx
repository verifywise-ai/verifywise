import React from "react";
import { Box } from "@mui/material";

interface ReadOnlyFieldsetProps {
  /** When true, every form control inside is disabled and cannot be focused or clicked. */
  readOnly: boolean;
  children: React.ReactNode;
}

/**
 * Makes a block of form controls view-only for roles that cannot edit.
 * Native inputs follow the fieldset's disabled state, and `inert` keeps custom
 * controls (selects, date pickers) from being opened by mouse or keyboard.
 * When editable it renders the children unwrapped, so layout is unchanged.
 *
 * @example
 * <ReadOnlyFieldset readOnly={!canEdit}>{formContent}</ReadOnlyFieldset>
 */
const ReadOnlyFieldset: React.FC<ReadOnlyFieldsetProps> = ({ readOnly, children }) => {
  if (!readOnly) return <>{children}</>;
  return (
    <Box component="fieldset" disabled inert sx={{ border: 0, m: 0, p: 0, minWidth: 0 }}>
      {children}
    </Box>
  );
};

export default ReadOnlyFieldset;
