import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Stack,
  Typography,
  CircularProgress,
  IconButton,
  Popover,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  useTheme,
  Link,
} from "@mui/material";
import {
  FileText,
  Download,
  AlertTriangle,
  Eye,
  X,
  ExternalLink,
  Trash2,
  MoreVertical,
  Plus,
} from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import Alert from "../../components/Alert";
import Chip from "../../components/Chip";
import { PageHeader } from "../../components/Layout/PageHeader";
import HelperIcon from "../../components/HelperIcon";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import ReportConfigModal from "./ReportConfigModal";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import type { ReportConfig } from "./types";
import CustomAxios from "../../../infrastructure/api/customAxios";
import { getAllExperiments } from "../../../application/repository/deepEval.repository";
import { palette } from "../../themes/palette";
import singleTheme from "../../themes/v1SingleTheme";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import { countLabel } from "../../tools/countLabel";
import { useTranslation } from "../../../application/hooks/useTranslation";
import { fill } from "../../../i18n/fill";

interface ReportPageProps {
  projectId: string;
  projectName: string;
  orgId: string;
  orgName?: string;
}

interface StoredReport {
  id: string;
  title: string;
  format: string;
  fileSize: number;
  experiments: number;
  experimentIds: string[];
  projectId?: string;
  createdBy?: string;
  createdAt: string;
}

export default function ReportPage({
  projectId,
  projectName,
  orgId,
  orgName = "",
}: ReportPageProps) {
  const formatUserDate = useFormattedDate();
  const theme = useTheme();
  const { t } = useTranslation();
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingReportId, setLoadingReportId] = useState<string | null>(null);
  const [experiments, setExperiments] = useState<
    Array<{ id: string; name: string; model: string; status: string; config?: any }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [alert, setAlert] = useState<{
    variant: "success" | "error" | "warning";
    body: string;
  } | null>(null);
  const [reports, setReports] = useState<StoredReport[]>([]);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);

  // Dots menu state
  const [menuAnchorEl, setMenuAnchorEl] = useState<null | HTMLElement>(null);
  const [menuReport, setMenuReport] = useState<StoredReport | null>(null);

  const handleMenuOpen = (e: React.MouseEvent<HTMLElement>, report: StoredReport) => {
    e.stopPropagation();
    setMenuAnchorEl(e.currentTarget);
    setMenuReport(report);
  };
  const handleMenuClose = () => {
    setMenuAnchorEl(null);
    setMenuReport(null);
  };

  const [pdfBlobUrl, setPdfBlobUrl] = useState<string | null>(null);
  const [pdfTitle, setPdfTitle] = useState("");
  const pdfContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    };
  }, [pdfBlobUrl]);

  const loadExperiments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getAllExperiments({ project_id: projectId });
      const expList = (data.experiments || []).map((exp: any) => ({
        id: exp.id || exp._id,
        name: exp.name || exp.config?.name || exp.id,
        model: exp.config?.model?.model_name || exp.config?.model?.name || "Unknown",
        status: exp.status || "unknown",
        config: exp.config || {},
      }));
      setExperiments(expList);
    } catch (err) {
      console.error("Failed to load experiments for report:", err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const loadReports = useCallback(async () => {
    try {
      const res = await CustomAxios.get(
        `/deepeval/reports?project_id=${encodeURIComponent(projectId)}`,
      );
      setReports(res.data || []);
    } catch (err) {
      console.error("Failed to load reports:", err);
    }
  }, [projectId]);

  useEffect(() => {
    loadExperiments();
    loadReports();
  }, [loadExperiments, loadReports]);

  const fetchReportFile = async (reportId: string): Promise<Blob> => {
    const response = await CustomAxios.get(`/deepeval/reports/${reportId}/file`, {
      responseType: "blob",
      timeout: 30000,
    });
    return response.data;
  };

  const showPdf = (blob: Blob, title: string) => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    const url = URL.createObjectURL(blob);
    setPdfBlobUrl(url);
    setPdfTitle(title);
    setTimeout(() => {
      pdfContainerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleGenerate = async (config: ReportConfig) => {
    setConfigModalOpen(false);
    setIsGenerating(true);
    try {
      const response = await CustomAxios.post(
        "/deepeval/reports/generate",
        {
          title: config.title,
          format: config.format,
          experimentIds: config.experimentIds,
          sections: config.sections,
          includeDetailedSamples: config.includeDetailedSamples,
          includeArena: config.includeArena,
          projectId,
          orgName: orgName || orgId,
        },
        { timeout: 180000 },
      );

      const saved = response.data;
      await loadReports();

      const blob = await fetchReportFile(saved.id);
      const reportTitle = saved.title || config.title || `${projectName} - Evaluation Report`;

      if (config.format === "pdf") {
        showPdf(blob, reportTitle);
      } else {
        downloadBlob(
          blob,
          `${reportTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_eval_report.csv`,
        );
      }

      setAlert({
        variant: "success",
        body: `Report generated successfully (${config.format.toUpperCase()})`,
      });
      setTimeout(() => setAlert(null), 4000);
    } catch (err) {
      console.error("Report generation failed:", err);
      setAlert({
        variant: "error",
        body: `Failed to generate report: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      setTimeout(() => setAlert(null), 10000);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleViewReport = async (report: StoredReport) => {
    setLoadingReportId(report.id);
    try {
      const blob = await fetchReportFile(report.id);
      showPdf(blob, report.title);
    } catch (err) {
      console.error("Failed to load report:", err);
      setAlert({
        variant: "error",
        body: `Failed to load report: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      setTimeout(() => setAlert(null), 6000);
    } finally {
      setLoadingReportId(null);
    }
  };

  const handleDownloadReport = async (report: StoredReport) => {
    setLoadingReportId(report.id);
    try {
      const blob = await fetchReportFile(report.id);
      const ext = report.format.toLowerCase() === "csv" ? "csv" : "pdf";
      downloadBlob(
        blob,
        `${report.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_eval_report.${ext}`,
      );
    } catch (err) {
      console.error("Failed to download report:", err);
      setAlert({
        variant: "error",
        body: `Failed to download report: ${err instanceof Error ? err.message : "Unknown error"}`,
      });
      setTimeout(() => setAlert(null), 6000);
    } finally {
      setLoadingReportId(null);
    }
  };

  const handleDeleteReport = async (reportId: string) => {
    setShowDeleteConfirm(reportId);
  };

  const confirmDeleteReport = async () => {
    if (!showDeleteConfirm) return;
    const reportId = showDeleteConfirm;
    setShowDeleteConfirm(null);
    try {
      await CustomAxios.delete(`/deepeval/reports/${reportId}`);
      setReports((prev) => prev.filter((r) => r.id !== reportId));
      if (pdfBlobUrl) {
        closePdfViewer();
      }
    } catch (err) {
      console.error("Failed to delete report:", err);
      setAlert({
        variant: "error",
        body: "Failed to delete report",
      });
      setTimeout(() => setAlert(null), 6000);
    }
  };

  const handleDownloadCurrent = () => {
    if (!pdfBlobUrl) return;
    const a = document.createElement("a");
    a.href = pdfBlobUrl;
    a.download = `${pdfTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_eval_report.pdf`;
    a.click();
  };

  const handleOpenInNewTab = () => {
    if (pdfBlobUrl) window.open(pdfBlobUrl, "_blank");
  };

  const closePdfViewer = () => {
    if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
    setPdfBlobUrl(null);
    setPdfTitle("");
  };

  const formatDate = (iso: string) => {
    try {
      return formatUserDate(iso, { includeTime: true });
    } catch {
      return iso;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const completedCount = experiments.filter((e) => e.status === "completed").length;

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: "20px" }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Stack sx={{ width: "100%" }}>
      {alert && (
        <Alert variant={alert.variant} body={alert.body} isToast onClick={() => setAlert(null)} />
      )}

      <PageHeader
        title="Reports"
        description={
          <>
            Generate PDF or CSV reports from completed experiments. Reports follow the{" "}
            <Link
              href="https://arxiv.org/abs/2206.11249"
              target="_blank"
              rel="noopener noreferrer"
              underline="hover"
              sx={{ color: palette.brand.primary, fontWeight: 600 }}
            >
              EvalCards
            </Link>{" "}
            standard for AI evaluation documentation.
          </>
        }
        rightContent={<HelperIcon articlePath="llm-evals/reports" />}
      />

      {/* Controls row */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mt: "18px", marginBottom: "18px" }}
        gap="4px"
      >
        <Typography sx={{ fontSize: 13, color: palette.text.tertiary }}>
          {fill(
            t(
              completedCount === 1
                ? "{count} completed experiment available"
                : "{count} completed experiments available",
            ),
            { count: completedCount },
          )}
        </Typography>
        <CustomizableButton
          variant="contained"
          text="Generate report"
          icon={<Plus size={16} />}
          onClick={() => setConfigModalOpen(true)}
          isDisabled={completedCount === 0 || isGenerating}
          sx={{ gap: "4px" }}
        />
      </Stack>

      {completedCount === 0 && !isGenerating && (
        <Box
          sx={{
            mb: "18px",
            p: "12px",
            borderRadius: "4px",
            backgroundColor: palette.status.warning.bg,
            border: `1px solid ${palette.status.warning.border}`,
            display: "flex",
            alignItems: "center",
            gap: "8px",
          }}
        >
          <AlertTriangle size={16} color={palette.status.warning.text} />
          <Typography sx={{ fontSize: 13, color: palette.status.warning.text }}>
            No completed experiments yet. Run at least one experiment to generate a report.
          </Typography>
        </Box>
      )}

      {/* Generation progress */}
      {isGenerating && (
        <Stack
          spacing="4px"
          alignItems="center"
          sx={{
            mb: "18px",
            py: "24px",
            px: "16px",
            backgroundColor: palette.background.main,
            border: `1px solid ${palette.border.dark}`,
            borderRadius: "4px",
          }}
        >
          <CircularProgress size={32} sx={{ color: palette.brand.primary }} />
          <Typography sx={{ fontSize: 14, fontWeight: 600, color: palette.text.primary }}>
            Generating report...
          </Typography>
          <Typography
            sx={{
              fontSize: 12,
              color: palette.text.secondary,
              textAlign: "center",
              maxWidth: 400,
            }}
          >
            Analyzing evaluation results and generating AI-powered summaries. This may take up to a
            minute.
          </Typography>
        </Stack>
      )}

      {/* PDF Viewer */}
      {pdfBlobUrl && (
        <Box
          ref={pdfContainerRef}
          sx={{
            mb: "18px",
            background: palette.background.main,
            border: `1px solid ${palette.border.dark}`,
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: "5px",
              py: "3px",
              borderBottom: `1px solid ${palette.border.light}`,
              backgroundColor: palette.background.accent,
            }}
          >
            <Stack direction="row" alignItems="center" gap="3px">
              <Eye size={16} color={palette.brand.primary} />
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>
                {pdfTitle}
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" gap="1px">
              <IconButton size="small" onClick={handleDownloadCurrent} title="Download PDF">
                <Download size={16} color={palette.text.secondary} />
              </IconButton>
              <IconButton size="small" onClick={handleOpenInNewTab} title="Open in new tab">
                <ExternalLink size={16} color={palette.text.secondary} />
              </IconButton>
              <IconButton size="small" onClick={closePdfViewer} title="Close viewer">
                <X size={16} color={palette.text.secondary} />
              </IconButton>
            </Stack>
          </Box>
          <Box sx={{ width: "100%", height: "80vh", backgroundColor: "#525659" }}>
            <iframe
              src={pdfBlobUrl}
              title="Report preview"
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          </Box>
        </Box>
      )}

      {/* Empty State — no reports yet */}
      {reports.length === 0 && !isGenerating && (
        <EmptyState message="No reports generated yet" icon={FileText} showBorder>
          <EmptyStateTip
            icon={FileText}
            title="About EvalCards"
            description="Reports are structured following the EvalCards standard — a structured documentation framework for AI evaluation results. Each report includes evaluation context, metric results, safety assessment, comparative analysis, and methodology."
          />
          {completedCount > 0 && (
            <EmptyStateTip
              icon={Download}
              title="Generate your first report"
              description={fill(
                t(
                  completedCount === 1
                    ? 'You have {count} completed experiment. Click "Generate report" above to create a PDF or CSV report with AI-powered summaries.'
                    : 'You have {count} completed experiments. Click "Generate report" above to create a PDF or CSV report with AI-powered summaries.',
                ),
                { count: completedCount },
              )}
            />
          )}
        </EmptyState>
      )}

      {/* Report History Table */}
      {reports.length > 0 && (
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table sx={singleTheme.tableStyles.primary.frame}>
            <TableHead
              sx={{ backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors }}
            >
              <TableRow sx={singleTheme.tableStyles.primary.header.row}>
                <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "30%" }}>
                  <Typography sx={{ fontWeight: 500, fontSize: 13 }}>Report</Typography>
                </TableCell>
                <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "10%" }}>
                  <Typography sx={{ fontWeight: 500, fontSize: 13 }}>Format</Typography>
                </TableCell>
                <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "12%" }}>
                  <Typography sx={{ fontWeight: 500, fontSize: 13 }}>Experiments</Typography>
                </TableCell>
                <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "10%" }}>
                  <Typography sx={{ fontWeight: 500, fontSize: 13 }}>Size</Typography>
                </TableCell>
                <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "23%" }}>
                  <Typography sx={{ fontWeight: 500, fontSize: 13 }}>Generated</Typography>
                </TableCell>
                <TableCell
                  sx={{
                    ...singleTheme.tableStyles.primary.header.cell,
                    width: "60px",
                    minWidth: 60,
                    textAlign: "center",
                  }}
                >
                  <Typography sx={{ fontWeight: 500, fontSize: 13 }}>Actions</Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reports.map((report) => (
                <TableRow
                  key={report.id}
                  onClick={() =>
                    report.format.toLowerCase() === "pdf"
                      ? handleViewReport(report)
                      : handleDownloadReport(report)
                  }
                  sx={{
                    ...singleTheme.tableStyles.primary.body.row,
                    "cursor": "pointer",
                    "&:hover": { backgroundColor: palette.background.accent },
                  }}
                >
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Stack direction="row" alignItems="center" gap="2px">
                      <FileText size={14} strokeWidth={1.5} color={palette.brand.primary} />
                      <Typography
                        sx={{ fontSize: 13, color: theme.palette.text.primary, fontWeight: 500 }}
                      >
                        {report.title}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Chip label={report.format.toUpperCase()} variant="success" size="small" />
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      {countLabel(report.experiments, "exp")}
                    </Typography>
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      {formatFileSize(report.fileSize)}
                    </Typography>
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      {formatDate(report.createdAt)}
                    </Typography>
                  </TableCell>
                  <TableCell
                    sx={{
                      ...singleTheme.tableStyles.primary.body.cell,
                      textAlign: "center",
                      minWidth: 60,
                      maxWidth: 60,
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <IconButton
                      size="small"
                      onClick={(e) => handleMenuOpen(e, report)}
                      sx={{
                        "color": theme.palette.text.secondary,
                        "padding": "6px",
                        "&:hover": { backgroundColor: palette.background.accent },
                      }}
                    >
                      {loadingReportId === report.id ? (
                        <CircularProgress size={16} />
                      ) : (
                        <MoreVertical size={18} />
                      )}
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Dots action menu */}
      <Popover
        open={Boolean(menuAnchorEl)}
        anchorEl={menuAnchorEl}
        onClose={handleMenuClose}
        onClick={(e) => e.stopPropagation()}
        anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
        transformOrigin={{ horizontal: "right", vertical: "top" }}
        sx={{
          "& .MuiPopover-paper": {
            minWidth: 140,
            borderRadius: "4px",
            border: `1px solid ${palette.border.dark}`,
            boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
            overflow: "hidden",
            mt: "1px",
            p: "2px",
          },
        }}
      >
        <Stack spacing="2px">
          <CustomizableButton
            variant="outlined"
            onClick={() => {
              if (menuReport) handleDownloadReport(menuReport);
              handleMenuClose();
            }}
            startIcon={<Download size={14} />}
            sx={{
              "height": "34px",
              "fontSize": "13px",
              "fontWeight": 500,
              "color": palette.text.secondary,
              "borderColor": palette.border.dark,
              "backgroundColor": "transparent",
              "justifyContent": "flex-start",
              "&:hover": {
                backgroundColor: palette.background.accent,
                borderColor: palette.border.dark,
              },
            }}
          >
            Download
          </CustomizableButton>
          <CustomizableButton
            variant="outlined"
            onClick={() => {
              if (menuReport) handleDeleteReport(menuReport.id);
              handleMenuClose();
            }}
            startIcon={<Trash2 size={14} />}
            sx={{
              "height": "34px",
              "fontSize": "13px",
              "fontWeight": 500,
              "color": palette.status.error.text,
              "borderColor": palette.border.dark,
              "backgroundColor": "transparent",
              "justifyContent": "flex-start",
              "&:hover": {
                backgroundColor: palette.status.error.bg,
                borderColor: palette.status.error.text,
              },
            }}
          >
            Delete
          </CustomizableButton>
        </Stack>
      </Popover>

      {/* Config Modal */}
      <ReportConfigModal
        open={configModalOpen}
        onClose={() => setConfigModalOpen(false)}
        onGenerate={handleGenerate}
        experiments={experiments}
        projectName={projectName}
        isGenerating={isGenerating}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <ConfirmationModal
          isOpen={!!showDeleteConfirm}
          title="Delete report"
          body={
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              Are you sure you want to delete &quot;
              {reports.find((r) => r.id === showDeleteConfirm)?.title || "this report"}&quot;? This
              action cannot be undone.
            </Typography>
          }
          proceedText="Delete"
          cancelText="Cancel"
          onProceed={confirmDeleteReport}
          onCancel={() => setShowDeleteConfirm(null)}
          proceedButtonVariant="contained"
          proceedButtonColor="error"
          TitleFontSize={13}
        />
      )}
    </Stack>
  );
}
