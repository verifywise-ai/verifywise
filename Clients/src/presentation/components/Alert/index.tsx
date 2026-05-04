/**
 * @fileoverview Alert component for displaying various types of messages.
 *
 * This component renders an alert box with different styles based on the variant prop.
 * It supports displaying icons, titles, and body text, and can function as a toast notification.
 *
 * @package
 */

import "./index.css";
import React, { type JSX } from "react";
import { Box, IconButton, Stack, Typography } from "@mui/material";
import { useTheme } from "@mui/material";
import singleTheme from "../../themes/v1SingleTheme";
import { AlertProps } from "../../types/alert.types";
import { closeIconStyles, iconButtonStyles } from "./style";
import { CloseIconProps } from "../../../domain/interfaces/i.widget";
import AlertBody from "./AlertBody";

import {
  Info as BlueInfoIcon,
  CheckCircle as GreenSuccessIcon,
  AlertTriangle as OrangeWarningIcon,
  XCircle as RedErrorIcon,
  X as CloseGreyIcon,
} from "lucide-react";

/**
 * Mapping of alert variants to their respective icons.
 *
 * @constant
 * @type {object}
 */
const icons: { [s: string]: JSX.Element } = {
  success: <GreenSuccessIcon size={20} />, // #079455
  info: <BlueInfoIcon size={20} />, // #0288d1
  error: <RedErrorIcon size={20} />, // #f04438
  warning: <OrangeWarningIcon size={20} />, // #DC6803
};

/**
 * CloseButton component for rendering the close icon.
 *
 * @param {CloseIconProps} props - The props for the CloseButton component.
 * @returns {JSX.Element} The rendered CloseButton component.
 */
const CloseButton: React.FC<CloseIconProps> = ({ text }: CloseIconProps): JSX.Element => (
  <CloseGreyIcon size={16} style={closeIconStyles(text)} />
);

/**
 * Alert component for displaying various types of messages.
 *
 * @param {AlertProps} props - The props for the Alert component.
 * @returns {JSX.Element} The rendered Alert component.
 */
const Alert: React.FC<AlertProps> = ({
  variant,
  title,
  body,
  isToast,
  hasIcon = true,
  onClick,
  sx,
}: AlertProps): JSX.Element => {
  const theme = useTheme();
  const { text, bg } = singleTheme.alertStyles[variant];
  const icon = icons[variant];

  return (
    <Stack
      role="alert"
      aria-live="polite"
      aria-atomic="true"
      className="alert row-stack"
      direction={"row"}
      justifyContent={"flex-start"}
      alignItems={"center"}
      gap={theme.spacing(8)}
      sx={{
        position: "fixed",
        top: theme.spacing(5),
        right: theme.spacing(5),
        zIndex: 9999,
        padding: hasIcon ? theme.spacing(8) : `${theme.spacing(4)} ${theme.spacing(8)}`,
        backgroundColor: bg,
        border: `1px solid ${text}`,
        borderRadius: theme.shape.borderRadius,
        ...sx,
      }}
    >
      {hasIcon && (
        <Box sx={{ color: text, maxHeight: "22.28px" }} aria-hidden="true">
          {" "}
          {icon}{" "}
        </Box>
      )}
      <Stack direction={"column"} gap={"2px"} sx={{ flex: 1 }}>
        {title && <Typography sx={{ fontWeight: 700, color: text }}>{title}</Typography>}
        {body && <AlertBody body={body} textColor={text} />}
      </Stack>
      {isToast && (
        <IconButton
          disableRipple
          onClick={onClick}
          aria-label="Close notification"
          sx={iconButtonStyles(hasIcon)}
        >
          <CloseButton text={text} />
        </IconButton>
      )}
    </Stack>
  );
};

export default Alert;
