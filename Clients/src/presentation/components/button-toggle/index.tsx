import React, { memo, useRef, useEffect, useState } from "react";
import { Box, Theme, useTheme } from "@mui/material";
import { ButtonToggleProps } from "../../types/interfaces/i.button";

const frameworkTabsContainerStyle = (height: number) => ({
  position: "relative",
  display: "flex",
  border: (theme: Theme) => `1px solid ${theme.palette.divider}`,
  borderRadius: "4px",
  overflow: "hidden",
  height,
  bgcolor: "action.hover",
  width: "fit-content",
  padding: "2px",
  gap: "2px",
});

const getFrameworkTabStyle = () => ({
  cursor: "pointer",
  px: 5,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  height: "100%",
  color: "text.primary",
  fontFamily: (theme: Theme) => theme.typography.fontFamily ?? "inherit",
  fontSize: "13px",
  fontWeight: (theme: Theme) => theme.typography.body2.fontWeight ?? 400,
  userSelect: "none",
  width: "fit-content",
  minWidth: "120px",
  position: "relative",
  zIndex: 1,
  transition: "color 0.3s ease",
});

interface SliderPosition {
  left: number;
  width: number;
}

const getSliderStyle = (position: SliderPosition) => ({
  position: "absolute",
  top: "2px",
  height: "calc(100% - 4px)",
  bgcolor: "background.paper",
  border: (theme: Theme) => `1px solid ${theme.palette.divider}`,
  borderRadius: "4px",
  transition: "left 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
  left: `${position.left}px`,
  width: `${position.width}px`,
  zIndex: 0,
});

const ButtonToggle = memo(function ButtonToggle({
  options,
  value,
  onChange,
  height = 34,
}: ButtonToggleProps) {
  const theme = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [sliderPosition, setSliderPosition] = useState<SliderPosition>({ left: 2, width: 120 });

  const activeIndex = options.findIndex((option) => option.value === value);

  // Update slider position when active tab changes
  useEffect(() => {
    const updateSliderPosition = () => {
      const activeTab = tabRefs.current[activeIndex];
      const container = containerRef.current;
      if (activeTab && container) {
        const containerRect = container.getBoundingClientRect();
        const tabRect = activeTab.getBoundingClientRect();
        setSliderPosition({
          left: tabRect.left - containerRect.left,
          width: tabRect.width,
        });
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(updateSliderPosition, 10);
    return () => clearTimeout(timer);
  }, [activeIndex, options.length]);

  return (
    <Box
      ref={containerRef}
      role="tablist"
      aria-label="Toggle options"
      sx={frameworkTabsContainerStyle(height)}
    >
      {/* Sliding background */}
      <Box sx={getSliderStyle(sliderPosition)} />

      {/* Button options */}
      {options.map((option, index) => (
        <Box
          key={option.value}
          ref={(el: HTMLDivElement | null) => {
            tabRefs.current[index] = el;
          }}
          role="tab"
          aria-selected={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onChange(option.value);
            }
          }}
          sx={getFrameworkTabStyle()}
        >
          {option.label}
          {option.count !== undefined && (
            <Box
              component="span"
              sx={{
                ml: 2,
                px: 1.5,
                py: 0.25,
                borderRadius: "10px",
                bgcolor: option.value === value ? theme.palette.grey[100] : theme.palette.grey[200],
                color: theme.palette.text.primary,
                fontSize: "11px",
                fontWeight: 500,
                minWidth: "20px",
                textAlign: "center",
              }}
            >
              {option.count}
            </Box>
          )}
        </Box>
      ))}
    </Box>
  );
});

ButtonToggle.displayName = "ButtonToggle";

export { ButtonToggle };
