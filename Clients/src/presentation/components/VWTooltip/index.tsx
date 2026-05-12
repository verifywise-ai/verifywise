/**
 * VWTooltip - A VerifyWise tooltip component that supports HTML/JSX content
 *
 * @component
 * @example
 * // Basic usage with simple text
 * <VWTooltip content="Simple tooltip text">
 *   <Button>Hover me</Button>
 * </VWTooltip>
 *
 * @example
 * // Advanced usage with HTML content and header
 * <VWTooltip
 *   header="Important Information"
 *   content={
 *     <>
 *       <p>Main description text</p>
 *       <ul>
 *         <li>First item</li>
 *         <li>Second item</li>
 *       </ul>
 *     </>
 *   }
 *   maxWidth={500}
 *   placement="right"
 * >
 *   <InfoIcon />
 * </VWTooltip>
 */

import React from "react";
import { Tooltip, TooltipProps, Box, Typography } from "@mui/material";
import { background } from "../../themes/palette";

interface VWTooltipProps {
  /** Optional header text displayed at the top (15px font) */
  header?: string;

  /** The content to display in the tooltip. Can be string or JSX/HTML */
  content: React.ReactNode;

  /** The element that triggers the tooltip on hover */
  children: React.ReactElement;

  /** Maximum width of the tooltip (default: 400px) */
  maxWidth?: number;

  /** Placement of the tooltip relative to the child element */
  placement?: TooltipProps["placement"];

  /** Background color of the tooltip (default: #1F2937) */
  backgroundColor?: string;

  /** Whether to show an arrow pointing to the trigger element (default: true) */
  arrow?: boolean;
}

const VWTooltip: React.FC<VWTooltipProps> = ({
  header,
  content,
  children,
  maxWidth = 400,
  placement = "top",
  backgroundColor = "#1F2937",
  arrow = true,
}) => {
  return (
    <Tooltip
      title={
        <Box>
          {header && (
            <Typography
              sx={{
                fontSize: "15px",
                fontWeight: 600,
                lineHeight: 1.5,
                marginBottom: "8px",
                color: `${background.main}`,
                wordBreak: "break-word",
                whiteSpace: "normal",
                overflow: "visible",
                textOverflow: "clip",
              }}
            >
              {header}
            </Typography>
          )}
          <Box
            sx={{
              "fontSize": "13px",
              "lineHeight": 1.5,
              "color": `${background.main}`,
              "& p": {
                "margin": 0,
                "marginBottom": "8px",
                "fontSize": "13px",
                "&:last-child": {
                  marginBottom: 0,
                },
              },
              "& ul, & ol": {
                margin: 0,
                paddingLeft: "20px",
                fontSize: "13px",
              },
              "& li": {
                "marginBottom": "4px",
                "fontSize": "13px",
                "&:last-child": {
                  marginBottom: 0,
                },
              },
              "& span, & div, & a": {
                fontSize: "13px",
              },
            }}
          >
            {content}
          </Box>
        </Box>
      }
      arrow={arrow}
      placement={placement}
      slotProps={{
        tooltip: {
          sx: {
            "maxWidth": maxWidth,
            "backgroundColor": backgroundColor,
            "padding": "12px 16px",
            "borderRadius": "4px",
            "& *": {
              overflow: "visible !important",
              textOverflow: "clip !important",
              whiteSpace: "normal !important",
            },
          },
        },
        arrow: {
          sx: {
            color: backgroundColor,
          },
        },
      }}
    >
      {children}
    </Tooltip>
  );
};

export default VWTooltip;
