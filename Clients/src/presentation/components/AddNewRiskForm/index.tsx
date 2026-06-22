import { FC } from "react";
import { Box, Stack, Tab, Typography, useTheme } from "@mui/material";
import { TabContext, TabList, TabPanel } from "@mui/lab";
import { Save as SaveIcon, RotateCcw as UpdateIconSVGWhite } from "lucide-react";

import { AddNewRiskFormProps } from "../../types/riskForm.types";
import { CustomizableButton } from "../button/customizable-button";
import { HistorySidebar } from "../Common/HistorySidebar";
import CustomFieldsSection from "../CustomFieldsSection";
import { getTabStyle } from "./style";
import "./styles.module.css";
import QuantitativeRiskForm from "../QuantitativeRiskForm";
import { useRiskForm } from "./hooks/useRiskForm";

import RiskSection from "./RisksSection";
import MitigationSection from "./MitigationSection";

// Constants
const COMPONENT_CONSTANTS = {
  MAX_HEIGHT: 550,
  BUTTON_HEIGHT: 34,
  TAB_MARGIN_TOP: "30px",
  TAB_PADDING: "12px 0 0",
  TAB_GAP: "34px",
  MIN_TAB_HEIGHT: "20px",
  BORDER_RADIUS: 2,
  CONTENT_WIDTH: 985,
  COMPACT_CONTENT_WIDTH: 970,
} as const;

/**
 * AddNewRiskForm component allows users to add new risks and mitigations through a tabbed interface.
 * It is a thin orchestrator that delegates all state management, validation, and submission
 * to the useRiskForm hook.
 *
 * @component
 * @param {AddNewRiskFormProps} props - The component props
 * @returns {JSX.Element} The rendered AddNewRiskForm component
 */
const AddNewRiskForm: FC<AddNewRiskFormProps> = (props) => {
  const theme = useTheme();
  const disableRipple = theme.components?.MuiButton?.defaultProps?.disableRipple ?? false;

  const {
    value,
    handleTabChange,
    riskValues,
    setRiskValues,
    mitigationValues,
    setMitigationValues,
    quantitativeValues,
    setQuantitativeValues,
    riskValidateRef,
    mitigateValidateRef,
    customFieldsRef,
    customFieldsGate,
    riskFormSubmitHandler,
    usersLoading,
    userRoleName,
    isEditingDisabled,
    isCreatingDisabled,
    isQuantitative,
  } = useRiskForm(props);

  const { onSubmitRef, popupStatus, entityId, compactMode } = props;

  // Show loading state while users are being fetched
  if (usersLoading) {
    return (
      <Stack
        className="AddNewRiskForm"
        sx={{ p: 3, textAlign: "center" }}
        role="status"
        aria-busy="true"
        aria-label="Loading form data"
      >
        <Typography>Loading form data...</Typography>
      </Stack>
    );
  }

  const tabBarWidth = compactMode
    ? COMPONENT_CONSTANTS.COMPACT_CONTENT_WIDTH
    : COMPONENT_CONSTANTS.CONTENT_WIDTH;

  const tabStyle = getTabStyle(theme);

  return (
    <Stack
      className="AddNewRiskForm"
      aria-label="Risk form"
      sx={{ width: "100%", maxWidth: tabBarWidth }}
    >
      <TabContext value={value}>
        <Box sx={{ borderBottom: 1, borderColor: "divider", width: "100%" }}>
          <TabList
            onChange={handleTabChange}
            aria-label="Add new risk tabs"
            TabIndicatorProps={{
              style: { backgroundColor: theme.palette.primary.main },
            }}
            sx={{
              "minHeight": COMPONENT_CONSTANTS.MIN_TAB_HEIGHT,
              "& .MuiTabs-flexContainer": {
                columnGap: COMPONENT_CONSTANTS.TAB_GAP,
              },
            }}
          >
            <Tab label="Risks" value="risks" sx={tabStyle} disableRipple={disableRipple} />
            <Tab
              label="Mitigation"
              value="mitigation"
              sx={tabStyle}
              disableRipple={disableRipple}
            />
            {isQuantitative && (
              <Tab
                label="Quantitative"
                value="quantitative"
                sx={tabStyle}
                disableRipple={disableRipple}
              />
            )}
            <Tab
              label="Custom fields"
              value="custom-fields"
              sx={tabStyle}
              disableRipple={disableRipple}
            />
            {popupStatus === "edit" && entityId && (
              <Tab label="Activity" value="activity" sx={tabStyle} disableRipple={disableRipple} />
            )}
          </TabList>
        </Box>
        <TabPanel
          value="risks"
          keepMounted
          sx={{
            p: COMPONENT_CONSTANTS.TAB_PADDING,
            ...(onSubmitRef
              ? {}
              : { maxHeight: COMPONENT_CONSTANTS.MAX_HEIGHT, overflowY: "auto" }),
          }}
        >
          <RiskSection
            riskValues={riskValues}
            setRiskValues={setRiskValues}
            validateRef={riskValidateRef}
            userRoleName={userRoleName}
            disableInternalScroll={!!onSubmitRef}
            compactMode={compactMode}
          />
        </TabPanel>
        <TabPanel
          value="mitigation"
          keepMounted
          sx={{
            p: COMPONENT_CONSTANTS.TAB_PADDING,
            ...(onSubmitRef
              ? {}
              : { maxHeight: COMPONENT_CONSTANTS.MAX_HEIGHT, overflowY: "auto" }),
          }}
        >
          <MitigationSection
            mitigationValues={mitigationValues}
            setMitigationValues={setMitigationValues}
            validateRef={mitigateValidateRef}
            userRoleName={userRoleName}
            disableInternalScroll={!!onSubmitRef}
            compactMode={compactMode}
          />
        </TabPanel>
        {isQuantitative && (
          <TabPanel
            value="quantitative"
            sx={{
              p: COMPONENT_CONSTANTS.TAB_PADDING,
              ...(onSubmitRef ? {} : { maxHeight: COMPONENT_CONSTANTS.MAX_HEIGHT }),
              overflowY: "auto",
            }}
          >
            <QuantitativeRiskForm
              values={quantitativeValues}
              onChange={setQuantitativeValues}
              disabled={popupStatus === "new" ? isCreatingDisabled : isEditingDisabled}
            />
          </TabPanel>
        )}
        <TabPanel value="custom-fields" sx={{ p: 0 }}>
          <CustomFieldsSection
            ref={customFieldsRef}
            entityType="project_risk"
            entityId={popupStatus === "edit" ? (entityId ?? null) : null}
          />
        </TabPanel>
        {popupStatus === "edit" && entityId && (
          <TabPanel value="activity" sx={{ p: 0 }}>
            <HistorySidebar inline isOpen={true} entityType="risk" entityId={entityId} />
          </TabPanel>
        )}
        {!onSubmitRef && (
          <Box sx={{ display: "flex" }}>
            <CustomizableButton
              sx={{
                "alignSelf": "flex-end",
                "width": "fit-content",
                "backgroundColor": theme.palette.primary.main,
                "border": `1px solid ${theme.palette.primary.main}`,
                "gap": 2,
                "borderRadius": COMPONENT_CONSTANTS.BORDER_RADIUS,
                "maxHeight": COMPONENT_CONSTANTS.BUTTON_HEIGHT,
                "textTransform": "inherit",
                "boxShadow": "none",
                "ml": "auto",
                "mr": 0,
                "mt": COMPONENT_CONSTANTS.TAB_MARGIN_TOP,
                "&:hover": { boxShadow: "none" },
              }}
              icon={
                popupStatus === "new" ? <SaveIcon size={16} /> : <UpdateIconSVGWhite size={16} />
              }
              variant="contained"
              onClick={riskFormSubmitHandler}
              text={popupStatus === "new" ? "Save" : "Update"}
              isDisabled={
                customFieldsGate.blocked ||
                (popupStatus === "new" ? isCreatingDisabled : isEditingDisabled)
              }
              aria-label={popupStatus === "new" ? "Save new risk" : "Update risk"}
            />
          </Box>
        )}
      </TabContext>
    </Stack>
  );
};

export default AddNewRiskForm;
