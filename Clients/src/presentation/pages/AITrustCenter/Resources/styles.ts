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
  resourcesHeader: SxProps<Theme>;
  title: SxProps<Theme>;
  toggleRow: SxProps<Theme>;
  toggleLabel: SxProps<Theme>;
  tableWrapper: SxProps<Theme>;
  tableContainer: SxProps<Theme>;
  tableCell: SxProps<Theme>;
  tableRow: (isFlashing: boolean) => SxProps<Theme>;
  resourceName: SxProps<Theme>;
  resourceType: SxProps<Theme>;
  visibilityIcon: SxProps<Theme>;
  visibilityOffIcon: SxProps<Theme>;
  emptyStateText: SxProps<Theme>;
  overlay: SxProps<Theme>;
  buttonContainer: SxProps<Theme>;
  addButton: SxProps<Theme>;
  modalPaper: SxProps<Theme>;
  modalTitle: SxProps<Theme>;
  modalContent: SxProps<Theme>;
  modalLabel: SxProps<Theme>;
  closeButton: SxProps<Theme>;
  fieldStyle: SxProps<Theme>;
  fileUploadButton: SxProps<Theme>;
  fileName: SxProps<Theme>;
  existingFileName: SxProps<Theme>;
  modalActionButton: SxProps<Theme>;
  modalCancelButton: SxProps<Theme>;
  successAlert: SxProps<Theme>;
  errorAlert: SxProps<Theme>;
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

  resourcesHeader: {
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

  resourceName: {
    fontSize: theme.typography.body2.fontSize,
    fontWeight: 500,
    color: theme.palette.text.primary,
  },

  resourceType: {
    fontSize: theme.typography.body2.fontSize,
    color: theme.palette.text.secondary,
  },

  visibilityIcon: {
    color: theme.palette.success.main,
    fontSize: 20,
  },

  visibilityOffIcon: {
    color: theme.palette.error.main,
    fontSize: 20,
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

  buttonContainer: {
    display: 'flex',
    justifyContent: 'flex-end',
  },

  addButton: {
    alignSelf: "flex-end",
    width: "fit-content",
    gap: 2,
    backgroundColor: 'brand.primary',
    border: `1px solid #13715B`,
  },

  // Modal styles
  modalPaper: {
    borderRadius: theme.shape.borderRadius,
    padding: 0,
    boxShadow: theme.shadows[4],
  },

  modalTitle: {
    fontSize: theme.typography.h6.fontSize,
    fontWeight: 600,
    color: theme.palette.text.primary,
    padding: '16px 24px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },

  modalContent: {
    padding: '24px',
  },

  modalLabel: {
    fontSize: theme.typography.body2.fontSize,
    fontWeight: 500,
    color: theme.palette.text.primary,
    mb: 1,
  },

  closeButton: {
    color: theme.palette.text.secondary,
    padding: 0,
    '&:hover': {
      backgroundColor: 'transparent',
      opacity: 0.8,
    },
  },

  fieldStyle: {
    backgroundColor: theme.palette.background.paper,
    '& input': {
      padding: '0 14px',
    },
  },

  fileUploadButton: {
    mt: 10,
    backgroundColor: 'brand.primary',
    border: `1px solid #13715B`,
    color: 'background.main',
  },

  fileName: {
    fontSize: theme.typography.body2.fontSize,
    color: theme.palette.success.main,
    fontWeight: 500,
    mt: 1,
    ml: 1,
  },

  existingFileName: {
    fontSize: theme.typography.body2.fontSize,
    color: theme.palette.text.secondary,
    fontWeight: 400,
    mt: 1,
    ml: 1,
    fontStyle: 'italic',
  },

  modalActionButton: {
    backgroundColor: 'brand.primary',
    border: `1px solid #13715B`,
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

  modalCancelButton: {
    border: `1px solid ${theme.palette.divider}`,
    color: theme.palette.text.primary,
    backgroundColor: theme.palette.background.paper,
    '&:hover': {
      backgroundColor: theme.palette.grey[50],
      border: `1px solid ${theme.palette.text.secondary}`,
    },
  },

  successAlert: {
    backgroundColor: theme.palette.success.light,
    color: theme.palette.success.dark,
    border: `1px solid ${theme.palette.success.main}`,
  },

  errorAlert: {
    backgroundColor: theme.palette.error.light,
    color: theme.palette.error.dark,
    border: `1px solid ${theme.palette.error.main}`,
  },
}); 