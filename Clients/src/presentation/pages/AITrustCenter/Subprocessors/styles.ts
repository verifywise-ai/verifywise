import { keyframes } from "@mui/system";
import { SxProps, Theme } from '@mui/material';

// Flash animation
export const flashAnimation = keyframes`
  0% {
    background-color: transparent;
  }
  50% {
    background-color: rgba(82, 171, 67, 0.2); // Light green color
  }
  100% {
    background-color: transparent;
  }
`;

type StylesType = {
  description: SxProps<Theme>;
  container: SxProps<Theme>;
  subprocessorsHeader: SxProps<Theme>;
  title: SxProps<Theme>;
  headerControls: SxProps<Theme>;
  toggleRow: SxProps<Theme>;
  toggleLabel: SxProps<Theme>;
  tableWrapper: SxProps<Theme>;
  tableContainer: SxProps<Theme>;
  tableCell: SxProps<Theme>;
  tableRow: (isFlashing: boolean) => SxProps<Theme>;
  tableDataCell: SxProps<Theme>;
  emptyStateText: SxProps<Theme>;
  overlay: SxProps<Theme>;
  addButton: SxProps<Theme>;
  modal: SxProps<Theme>;
  modalHeader: SxProps<Theme>;
  modalTitle: SxProps<Theme>;
  modalButton: SxProps<Theme>;
  modalButtonDisabled: SxProps<Theme>;
};

export const useStyles = (theme: Theme): StylesType => ({
  description: {
    fontSize: theme.typography.body2.fontSize,
    color: theme.palette.text.secondary,
    lineHeight: 1.5,
    mb: 3,
  },

  container: {
    mt: 3,
  },

  subprocessorsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 3,
    mb: 2,
    padding: '10px 0',
  },

  title: {
    fontWeight: 600,
    fontSize: theme.typography.h6.fontSize,
    color: theme.palette.text.primary,
  },

  headerControls: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing(3),
    width: '100%',
  },

  toggleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },

  toggleLabel: {
    fontSize: theme.typography.body2.fontSize,
    color: theme.palette.text.primary,
    fontWeight: 600,
    ml:5,
  },

  tableWrapper: {
    position: 'relative',
    mb: 3,
  },

  tableContainer: {
    borderRadius: theme.shape.borderRadius,
    boxShadow: 'none',
    border: `1px solid ${theme.palette.divider}`,
  },

  tableCell: {
    fontSize: theme.typography.caption.fontSize,
    fontWeight: 600,
    color: theme.palette.text.secondary,
    backgroundColor: theme.palette.grey[50],
    borderBottom: `1px solid ${theme.palette.divider}`,
  },

  tableRow: (isFlashing: boolean) => ({
    '&:hover': {
      backgroundColor: theme.palette.grey[50],
    },
    '& .MuiTableCell-root': {
      padding: '8px 10px !important',
    },
    ...(isFlashing && {
      animation: `${flashAnimation} 2s ease-in-out`,
    }),
  }),

  tableDataCell: {
    fontSize: theme.typography.body2.fontSize,
    color: theme.palette.text.secondary,
  },

  emptyStateText: {
    fontSize: theme.typography.body2.fontSize,
    color: theme.palette.text.secondary,
    fontStyle: 'italic',
  },

  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    zIndex: 1,
  },

  addButton: {
    alignSelf: "flex-end",
    width: "fit-content",
    gap: 2,
    backgroundColor: 'brand.primary',
    border: `1px solid #13715B`,
  },

  // Modal styles
  modal: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    bgcolor: 'background.main',
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[4],
    p: 6,
    minWidth: 350,
    maxWidth: 400,
    width: '100%',
    outline: 'none',
  },

  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    mb: 4,
  },

  modalTitle: {
    fontSize: theme.typography.h6.fontSize,
    fontWeight: 600,
    color: theme.palette.text.primary,
  },

  modalButton: {
    mt: 2,
    alignSelf: 'flex-end',
    backgroundColor: 'brand.primary',
    border: '1px solid brand.primary',
    color: 'background.main',
    borderRadius: theme.shape.borderRadius,
    textTransform: 'none',
    fontWeight: 600,
    gap: 1,
    '&:hover': {
      backgroundColor: 'brand.primary',
    },
    '&:disabled': {
      backgroundColor: theme.palette.grey[300],
      border: `1px solid ${theme.palette.grey[300]}`,
      color: `${theme.palette.text.secondary} !important`,
    },
  },

  modalButtonDisabled: {
    backgroundColor: theme.palette.grey[300],
    border: `1px solid ${theme.palette.grey[300]}`,
  },
}); 