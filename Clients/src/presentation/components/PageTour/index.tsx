import { Joyride, Step, TooltipRenderProps } from "react-joyride";
import React, { useEffect, useState } from "react";
import { CustomStepWrapper } from "./CustomStep";
import { Global } from "@emotion/react";
import { IPageTourProps } from "../../types/interfaces/i.tour";
import { brand } from "../../themes/palette";

const PageTour: React.FC<IPageTourProps> = ({
  steps,
  run,
  onFinish,
  tourKey,
}) => {
  const [shouldRun, setShouldRun] = useState(false);

  useEffect(() => {
    //always check if tour was seen first before running it
    const hasSeenTour = localStorage.getItem(tourKey);
    if (!hasSeenTour && run) {
      setShouldRun(true);
    }
  }, [run, tourKey]);

  const handleCallback = (data: any) => {
    const { status, action, type } = data;

    // Handle tour completion
    if (status === "finished" || status === "skipped") {
      localStorage.setItem(tourKey, "true");
      setShouldRun(false);
      if (onFinish) {
        onFinish();
      }
      return;
    }

    // Skip to next step if target is not mounted
    if (type === "error:target_not_found" && action === "update") {
      // Joyride will automatically skip to the next available step
      console.warn("[PageTour] Target not found, skipping to next step");
    }
  };

  const tooltipRenderer = (tooltipProps: TooltipRenderProps) => {
    return (
      <CustomStepWrapper
        {...tooltipProps}
        content={tooltipProps.step.content as any}
      />
    );
  };

  return (
    <>
      <Global
        styles={{
          ".__floater__arrow polygon": {
            fill: "#1f1f23 !important",
          },
          ".react-joyride__beacon": {
            zIndex: "900 !important",
          },
          ".react-joyride__spotlight": {
            zIndex: "900 !important",
          },
          ".react-joyride__tooltip": {
            filter: "drop-shadow(0 8px 32px rgba(0, 0, 0, 0.3))",
            animation: "fadeIn 0.3s ease-in-out",
          },
          "@keyframes fadeIn": {
            "0%": {
              opacity: 0,
              transform: "scale(0.95)",
            },
            "100%": {
              opacity: 1,
              transform: "scale(1)",
            },
          },
          "@keyframes fadeOut": {
            "0%": {
              opacity: 1,
              transform: "scale(1)",
            },
            "100%": {
              opacity: 0,
              transform: "scale(0.95)",
            },
          },
          ".react-joyride__tooltip--closing": {
            animation: "fadeOut 0.2s ease-in-out",
          },
        }}
      />
      {/* Cast props for compat with both old and new react-joyride versions */}
      <Joyride
        {...{
          steps: steps as unknown as Step[],
          run: shouldRun,
          continuous: true,
          hideCloseButton: true,
          showProgress: false,
          showSkipButton: false,
          callback: handleCallback,
          disableOverlayClose: true,
          disableScrolling: true,
          scrollToFirstStep: false,
          spotlightClicks: false,
          tooltipComponent: tooltipRenderer,
          locale: {
            last: "Finish",
            next: "Next",
            back: "Back",
            skip: "Skip",
          },
          options: {
            primaryColor: `${brand.primaryHover}`,
            zIndex: 900,
            beaconSize: 30,
          },
          styles: {
            overlay: {
              backgroundColor: "transparent",
            },
            tooltip: {
              borderRadius: "4px",
            },
            tooltipContainer: {
              textAlign: "left",
            },
            tooltipContent: {
              padding: 0,
            },
          },
        } as any}
        floaterProps={{
          styles: {
            arrow: {
              length: 8,
              spread: 12,
            } as any,
          },
        }}
      />
    </>
  );
};
export default PageTour;
