import { palette } from "../../themes/palette";

// PageHeaderExtended styles
export const pageHeaderSummaryCardsStyle = {
  mb: "-3px",
};

// ApprovalButton styles
export const approvalButtonStyle = {
  background: palette.background.hover,
  color: palette.text.secondary,
  fontWeight: 500,
  fontSize: '13px',
  height: '32px',
  minHeight: '32px',
  padding: '8px 16px',
  borderRadius: '4px',
  textTransform: 'none' as const,
  boxShadow: 'none !important',
  '&:hover': { color: palette.brand.primary },
  transition: 'all 0.2s ease',
};

export const approvalCountBadgeStyle = {
  backgroundColor: palette.background.hover,
  color: palette.text.secondary,
  px: '6px',
  py: '4px',
  ml: '8px',
  borderRadius: '12px',
  fontSize: '11px',
  fontWeight: 600,
  lineHeight: 1,
  display: 'inline-flex' as const,
  alignItems: 'center' as const,
  justifyContent: 'center' as const,
  minWidth: '20px',
  textAlign: 'center' as const,
};

// Ghost style - transparent with borders
export const actionButtonsStyles = {
  search: {
    backgroundColor: 'transparent',
    color: palette.text.tertiary,
    border: `1px solid ${palette.border.light}`,
    '&:hover': { backgroundColor: 'rgba(0, 0, 0, 0.04)', borderColor: palette.border.dark },
  },
  approval_workflows: {
    backgroundColor: 'transparent',
    color: palette.accent.primary.text,
    border: `1px solid ${palette.border.light}`,
    '&:hover': { backgroundColor: palette.accent.primary.bg, borderColor: palette.accent.primary.border },
  },
  integrations: {
    backgroundColor: 'transparent',
    color: palette.accent.purple.text,
    border: `1px solid ${palette.border.light}`,
    '&:hover': { backgroundColor: palette.accent.purple.bg, borderColor: palette.accent.purple.border },
    '&.Mui-disabled': { backgroundColor: 'transparent', color: palette.accent.purple.text, opacity: 0.5 },
  },
  automations: {
    backgroundColor: 'transparent',
    color: palette.accent.orange.text,
    border: `1px solid ${palette.border.light}`,
    '&:hover': { backgroundColor: palette.accent.orange.bg, borderColor: palette.accent.orange.border },
  },
};
