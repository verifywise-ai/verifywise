import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Stack,
  Typography,
  CircularProgress,
  Chip,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  useTheme,
} from "@mui/material";
import { FileText, Download, AlertTriangle, Eye, X, ExternalLink, Trash2 } from "lucide-react";
import { CustomizableButton } from "../../components/button/customizable-button";
import Alert from "../../components/Alert";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import ReportConfigModal from "./ReportConfigModal";
import ConfirmationModal from "../../components/Dialogs/ConfirmationModal";
import type { ReportConfig } from "./types";
import CustomAxios from "../../../infrastructure/api/customAxios";
import {
  getAllExperiments,
} from "../../../application/repository/deepEval.repository";
import { palette } from "../../themes/palette";
import singleTheme from "../../themes/v1SingleTheme";

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
  const theme = useTheme();
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
      const res = await CustomAxios.get(`/deepeval/reports?project_id=${encodeURIComponent(projectId)}`);
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
    const response = await CustomAxios.get(
      `/deepeval/reports/${reportId}/file`,
      { responseType: "blob", timeout: 30000 },
    );
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
        downloadBlob(blob, `${reportTitle.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_eval_report.csv`);
      }

      setAlert({ variant: "success", body: `Report generated successfully (${config.format.toUpperCase()})` });
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
      downloadBlob(blob, `${report.title.replace(/[^a-z0-9]/gi, "_").toLowerCase()}_eval_report.${ext}`);
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
      setReports(prev => prev.filter(r => r.id !== reportId));
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
      return new Date(iso).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return iso;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const completedCount = experiments.filter(e => e.status === "completed").length;

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", py: 10 }}>
        <CircularProgress size={28} />
      </Box>
    );
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3, width: "100%" }}>
      {alert && (
        <Alert
          variant={alert.variant}
          body={alert.body}
          isToast
          onClick={() => setAlert(null)}
        />
      )}

      {/* Header */}
      <Stack spacing={1}>
        <Typography variant="h6" sx={{ fontSize: 15, fontWeight: 600, color: palette.text.primary }}>
          Evaluation Reports
        </Typography>
        <Typography variant="body2" sx={{ color: "text.secondary", lineHeight: 1.8, fontSize: 13 }}>
          Generate evaluation reports from your experiment results.
          Reports follow the{" "}
          <Typography
            component="a"
            href="https://arxiv.org/abs/2206.11249"
            target="_blank"
            rel="noopener noreferrer"
            sx={{ fontSize: 13, color: palette.brand.primary, fontWeight: 600, textDecoration: "none", "&:hover": { textDecoration: "underline" } }}
          >
            EvalCards
          </Typography>{" "}
          standard for structured AI evaluation documentation.
        </Typography>
      </Stack>

      {/* Action Card / Progress */}
      <Box
        sx={{
          background: "#fff",
          border: "1px solid #d0d5dd",
          borderRadius: "4px",
          p: "24px",
        }}
      >
        {isGenerating ? (
          <Stack spacing={2} alignItems="center" sx={{ py: 3 }}>
            <CircularProgress size={32} sx={{ color: palette.brand.primary }} />
            <Typography sx={{ fontSize: 14, fontWeight: 600, color: palette.text.primary }}>
              Generating report...
            </Typography>
            <Typography sx={{ fontSize: 12, color: palette.text.secondary, textAlign: "center", maxWidth: 400 }}>
              Analyzing evaluation results and generating AI-powered summaries. This may take up to a minute.
            </Typography>
          </Stack>
        ) : (
          <>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Stack direction="row" alignItems="center" gap={2}>
                <Box
                  sx={{
                    width: 42,
                    height: 42,
                    borderRadius: "8px",
                    background: "linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <FileText size={20} strokeWidth={1.5} color={palette.brand.primary} />
                </Box>
                <Box>
                  <Typography sx={{ fontSize: 14, fontWeight: 600, color: palette.text.primary }}>
                    Generate new report
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: palette.text.secondary }}>
                    {completedCount} completed experiment{completedCount !== 1 ? "s" : ""} available
                  </Typography>
                </Box>
              </Stack>
              <CustomizableButton
                variant="contained"
                onClick={() => setConfigModalOpen(true)}
                disabled={completedCount === 0}
                icon={<Download size={14} />}
                text="Generate report"
                sx={{
                  height: "34px",
                  fontSize: 13,
                }}
              />
            </Stack>

            {completedCount === 0 && (
              <Box
                sx={{
                  mt: 2,
                  p: 2,
                  borderRadius: "6px",
                  backgroundColor: palette.status.warning.bg,
                  border: "1px solid #FDE68A",
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                }}
              >
                <AlertTriangle size={16} color={palette.status.warning.text} />
                <Typography sx={{ fontSize: 12, color: palette.status.warning.text }}>
                  No completed experiments yet. Run at least one experiment to generate a report.
                </Typography>
              </Box>
            )}
          </>
        )}
      </Box>

      {/* PDF Viewer */}
      {pdfBlobUrl && (
        <Box
          ref={pdfContainerRef}
          sx={{
            background: "#fff",
            border: "1px solid #d0d5dd",
            borderRadius: "4px",
            overflow: "hidden",
          }}
        >
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              px: 2.5,
              py: 1.5,
              borderBottom: "1px solid #E5E7EB",
              backgroundColor: palette.background.accent,
            }}
          >
            <Stack direction="row" alignItems="center" gap={1.5}>
              <Eye size={16} color={palette.brand.primary} />
              <Typography sx={{ fontSize: 13, fontWeight: 600, color: palette.text.primary }}>
                {pdfTitle}
              </Typography>
            </Stack>
            <Stack direction="row" alignItems="center" gap={0.5}>
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
              title="Report Preview"
              style={{ width: "100%", height: "100%", border: "none" }}
            />
          </Box>
        </Box>
      )}

      {/* Empty State — no reports yet */}
      {reports.length === 0 && !isGenerating && (
        <EmptyState
          message="No reports generated yet"
          icon={FileText}
          showBorder
        >
          <EmptyStateTip
            icon={FileText}
            title="About EvalCards"
            description="Reports are structured following the EvalCards standard — a structured documentation framework for AI evaluation results. Each report includes evaluation context, metric results, safety assessment, comparative analysis, and methodology."
          />
          <EmptyStateTip
            icon={Download}
            title="Generate your first report"
            description={`You have ${completedCount} completed experiment${completedCount !== 1 ? "s" : ""}. Click "Generate report" above to create a PDF or CSV report with AI-powered summaries.`}
          />
        </EmptyState>
      )}

      {/* Report History Table */}
      {reports.length > 0 && (
        <TableContainer sx={{ overflowX: "auto" }}>
          <Table sx={singleTheme.tableStyles.primary.frame}>
            <TableHead sx={{ backgroundColor: singleTheme.tableStyles.primary.header.backgroundColors }}>
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
                <TableCell sx={{ ...singleTheme.tableStyles.primary.header.cell, width: "15%", minWidth: 120 }}>
                  <Typography sx={{ fontWeight: 500, fontSize: 13 }}>Actions</Typography>
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {reports.map(report => (
                <TableRow
                  key={report.id}
                  onClick={() => report.format.toLowerCase() === "pdf" ? handleViewReport(report) : handleDownloadReport(report)}
                  sx={{ ...singleTheme.tableStyles.primary.body.row, cursor: "pointer", "&:hover": { backgroundColor: palette.background.accent } }}
                >
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Stack direction="row" alignItems="center" gap={1}>
                      <FileText size={14} strokeWidth={1.5} color={palette.brand.primary} />
                      <Typography sx={{ fontSize: 13, color: theme.palette.text.primary, fontWeight: 500 }}>
                        {report.title}
                      </Typography>
                    </Stack>
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Chip
                      label={report.format.toUpperCase()}
                      size="small"
                      sx={{
                        fontSize: 11,
                        height: 22,
                        fontWeight: 500,
                        backgroundColor: palette.status.success.bg,
                        color: palette.brand.primary,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      {report.experiments} exp{report.experiments !== 1 ? "s" : ""}
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
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell} onClick={(e) => e.stopPropagation()}>
                    <Stack direction="row" spacing="4px">
                      <Tooltip title="Download">
                        <IconButton
                          size="small"
                          onClick={() => handleDownloadReport(report)}
                          disabled={loadingReportId === report.id}
                          sx={{ padding: "4px" }}
                        >
                          <Download size={16} strokeWidth={1.5} color={theme.palette.text.secondary} />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="Delete">
                        <IconButton
                          size="small"
                          onClick={() => handleDeleteReport(report.id)}
                          sx={{ padding: "4px" }}
                        >
                          <Trash2 size={16} strokeWidth={1.5} color={theme.palette.text.secondary} />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

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
              Are you sure you want to delete &quot;{reports.find(r => r.id === showDeleteConfirm)?.title || "this report"}&quot;? This action cannot be undone.
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
    </Box>
  );
}
