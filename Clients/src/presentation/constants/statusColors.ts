import { status, risk, text } from "../themes/palette";

export const MITIGATION_STATUS_COLORS: Record<string, string> = {
  'Not Started': text.disabled,
  'In Progress': status.info.text,
  'Completed': status.success.text,
  'On Hold': risk.high.text,
  'Deferred': status.warning.text,
  'Canceled': status.error.text,
  'Requires review': '#805AD5',
};

export const getMitigationStatusColor = (statusName: string): string =>
  MITIGATION_STATUS_COLORS[statusName] || text.disabled;
