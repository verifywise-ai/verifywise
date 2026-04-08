import { lazy, Suspense, useState } from "react";
import {
  Box,
  Popover,
  Typography,
} from "@mui/material";
import { ChevronDown, FileText, Building2 } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { brand, background } from "../../../themes/palette";
const GenerateReportPopup = lazy(
  () => import("../../../components/Reporting/GenerateReport")
);
const ReportStatus = lazy(() => import("./ReportStatus"));
import { styles } from "./styles";
import { useProjects } from "../../../../application/hooks/useProjects";

interface ReportTypeOption {
  id: "project" | "organization";
  label: string;
  description: string;
  icon: React.ReactNode;
}

const REPORT_TYPE_OPTIONS: ReportTypeOption[] = [
  {
    id: "project",
    label: "Use case report",
    description: "Generate a report for a specific AI use case with its associated risks, compliance status, and assessments.",
    icon: <FileText size={24} strokeWidth={1.5} />,
  },
  {
    id: "organization",
    label: "Organization report",
    description: "Generate a comprehensive report across all use cases, vendors, models, and organization-wide metrics.",
    icon: <Building2 size={24} strokeWidth={1.5} />,
  },
];

interface GenerateReportProps {
  onReportGenerated?: () => void;
}

const GenerateReport: React.FC<GenerateReportProps> = ({
  onReportGenerated,
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [selectedReportType, setSelectedReportType] = useState<
    "project" | "organization" | null
  >(null);
  const { data: projects } = useProjects();
  const isDisabled = projects?.length && projects?.length > 0 ? false : true;

  const handleButtonClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (!isDisabled) {
      setAnchorEl(event.currentTarget);
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleOptionSelect = (option: ReportTypeOption) => {
    setSelectedReportType(option.id);
    setIsModalOpen(true);
    handleClose();
  };

  const open = Boolean(anchorEl);
  const popoverId = open ? "generate-report-popover" : undefined;

  return (
    <>
      <Box sx={styles.container}>
        <span data-joyride-id="generate-report-button">
          <CustomizableButton
            variant="contained"
            onClick={handleButtonClick as (event: unknown) => void}
            isDisabled={isDisabled}
            endIcon={<ChevronDown size={16} />}
            sx={{
              ...styles.buttonStyle,
              width: "fit-content",
              border: isDisabled ? "1px solid #dddddd" : `1px solid ${brand.primary}`,
            }}
          >
            Generate report
          </CustomizableButton>
        </span>

        <Popover
          id={popoverId}
          open={open}
          anchorEl={anchorEl}
          onClose={handleClose}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "left",
          }}
          transformOrigin={{
            vertical: "top",
            horizontal: "left",
          }}
          sx={{
            mt: 1,
            "& .MuiPopover-paper": {
              borderRadius: "4px",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.12)",
              overflow: "visible",
              backgroundColor: `${background.main}`,
            },
          }}
        >
          <Box
            role="menu"
            aria-label="Generate report menu"
            sx={{
              p: 2,
              width: "420px",
            }}
          >
            <Box
              sx={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 2,
              }}
            >
              {REPORT_TYPE_OPTIONS.map((option) => (
                <Box
                  key={option.id}
                  role="menuitem"
                  tabIndex={0}
                  aria-label={option.label}
                  onClick={() => handleOptionSelect(option)}
                  onKeyDown={(e: React.KeyboardEvent) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleOptionSelect(option);
                    }
                  }}
                  sx={{
                    background: "linear-gradient(135deg, rgba(252, 252, 252, 1) 0%, rgba(248, 248, 248, 1) 100%)",
                    borderRadius: "4px",
                    padding: "20px 16px",
                    cursor: "pointer",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "flex-start",
                    gap: 1.5,
                    border: "1px solid rgba(0, 0, 0, 0.04)",
                    transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                    minHeight: "140px",
                    "&:hover": {
                      boxShadow: "0 2px 6px rgba(0, 0, 0, 0.06)",
                      border: "1px solid rgba(0, 0, 0, 0.08)",
                      background: "linear-gradient(135deg, rgba(255, 255, 255, 1) 0%, rgba(250, 250, 250, 1) 100%)",
                    },
                    "&:active": {
                      transform: "scale(0.98)",
                    },
                  }}
                >
                  <Box sx={{ color: `${brand.primary}` }}>{option.icon}</Box>
                  <Typography
                    variant="body2"
                    sx={{
                      fontWeight: 600,
                      fontSize: "13px",
                      color: "rgba(0, 0, 0, 0.85)",
                      textAlign: "center",
                    }}
                  >
                    {option.label}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      fontSize: "11px",
                      color: "rgba(0, 0, 0, 0.6)",
                      textAlign: "center",
                      lineHeight: 1.4,
                    }}
                  >
                    {option.description}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Popover>

        {/* Render generate report status */}
        <Suspense fallback={null}>
          <ReportStatus isDisabled={isDisabled} />
        </Suspense>
      </Box>

      {isModalOpen && (
        <Suspense fallback={null}>
          <GenerateReportPopup
            onClose={() => {
              setIsModalOpen(false);
              setSelectedReportType(null);
            }}
            onReportGenerated={onReportGenerated}
            reportType={selectedReportType}
          />
        </Suspense>
      )}
    </>
  );
};

export default GenerateReport;
