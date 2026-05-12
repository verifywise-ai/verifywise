import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Box,
  Typography,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Toolbar,
  IconButton,
  Tooltip,
} from "@mui/material";
import { Download, ShieldX } from "lucide-react";
import { ENV_VARs } from "../../../../env.vars";

/**
 * SharedView page component for displaying publicly shared data
 * Accessed via /shared/:resourceType/:token
 */
const SharedView: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [shareData, setShareData] = useState<any>(null);

  useEffect(() => {
    if (!token) {
      setError("Invalid share link");
      setLoading(false);
      return;
    }

    fetchSharedData();
  }, [token]);

  const fetchSharedData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`${ENV_VARs.URL}/api/shares/view/${token}`);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Failed to load shared data");
      }

      setShareData(result.data);
    } catch (err) {
      setError((err as Error).message || "Failed to load shared data");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    if (!shareData?.permissions?.allowDataExport) {
      return;
    }

    // Convert data to CSV
    const data = shareData.data;
    if (!data) return;

    let csv: string;

    if (Array.isArray(data)) {
      // Table view - array of records
      if (data.length === 0) return;

      const headers = Object.keys(data[0]).filter((key) => key !== "id");
      const rows = data.map((row: any) =>
        headers.map((key) => `"${String(row[key] ?? "").replace(/"/g, '""')}"`).join(","),
      );

      csv = [headers.join(","), ...rows].join("\n");
    } else {
      // Single record view - key-value pairs
      const headers = Object.keys(data);
      const values = Object.values(data);

      csv = [
        headers.join(","),
        values.map((v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`).join(","),
      ].join("\n");
    }

    // Download CSV
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `shared-${shareData.share_link.resource_type}-${new Date().toISOString()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          backgroundColor: "background.surface",
        }}
      >
        <Box sx={{ textAlign: "center" }}>
          <CircularProgress size={48} sx={{ color: "brand.primary", mb: 2 }} />
          <Typography variant="body1" color="textSecondary">
            Loading shared view...
          </Typography>
        </Box>
      </Box>
    );
  }

  if (error) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "100vh",
          backgroundColor: "background.surface",
          p: 3,
        }}
      >
        <Paper sx={{ p: 4, maxWidth: 600, textAlign: "center" }}>
          <Box
            sx={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              mb: 3,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 64,
                height: 64,
                borderRadius: "50%",
                backgroundColor: "#FFEBEE",
                mb: 2,
              }}
            >
              <ShieldX size={32} color="#C62828" />
            </Box>
            <Typography
              variant="h6"
              sx={{
                fontWeight: 600,
                color: "#C62828",
                mb: 1,
              }}
            >
              Access Forbidden
            </Typography>
            <Typography variant="body1" color="textSecondary" sx={{ mb: 2 }}>
              {error}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              This link may have expired or been revoked. Please contact the person who shared this
              link with you.
            </Typography>
          </Box>
        </Paper>
      </Box>
    );
  }

  if (!shareData) {
    return null;
  }

  const { share_link, data, permissions } = shareData;
  const isTableView = Array.isArray(data);

  // Define columns to show based on resource type and available data
  const getTableColumns = (_resourceType: string) => {
    // Show all columns that the backend returns (backend handles filtering based on shareAllFields setting)
    if (data && data.length > 0) {
      return Object.keys(data[0]).filter((key) => key !== "id");
    }
    // Fallback for empty tables
    return ["name", "created_at", "updated_at"];
  };

  const tableColumns = isTableView ? getTableColumns(share_link.resource_type) : [];

  // Format cell value based on field type
  const formatCellValue = (key: string, value: any) => {
    if (value === null || value === undefined) {
      return (
        <Typography variant="body2" color="textSecondary" fontStyle="italic">
          N/A
        </Typography>
      );
    }

    // Security assessment - show Yes/No with badge
    if (key === "security_assessment") {
      return (
        <Box
          component="span"
          sx={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: "12px",
            fontSize: "12px",
            fontWeight: 500,
            backgroundColor: value ? "#E8F5E9" : "#FFEBEE",
            color: value ? "#2E7D32" : "#C62828",
          }}
        >
          {value ? "Yes" : "No"}
        </Box>
      );
    }

    // Status - show with badge
    if (key === "status") {
      const statusColors: { [key: string]: { bg: string; text: string } } = {
        "Approved": { bg: "#E8F5E9", text: "#2E7D32" },
        "Pending": { bg: "#FFF3E0", text: "#E65100" },
        "Rejected": { bg: "#FFEBEE", text: "#C62828" },
        "Under Review": { bg: "#E3F2FD", text: "#1565C0" },
      };
      const colorScheme = statusColors[value] || { bg: "background.surface", text: "#666" };
      return (
        <Box
          component="span"
          sx={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: "12px",
            fontSize: "12px",
            fontWeight: 500,
            backgroundColor: colorScheme.bg,
            color: colorScheme.text,
          }}
        >
          {value}
        </Box>
      );
    }

    // Status date - format as readable date
    if (key === "status_date") {
      try {
        const date = new Date(value);
        return <Typography variant="body2">{date.toLocaleDateString()}</Typography>;
      } catch {
        return <Typography variant="body2">{String(value)}</Typography>;
      }
    }

    // Object values
    if (typeof value === "object") {
      return (
        <Typography variant="body2" component="pre" sx={{ fontFamily: "monospace", fontSize: 12 }}>
          {JSON.stringify(value, null, 2)}
        </Typography>
      );
    }

    // Boolean values
    if (typeof value === "boolean") {
      return <Typography variant="body2">{value ? "Yes" : "No"}</Typography>;
    }

    // Default string value
    return <Typography variant="body2">{String(value)}</Typography>;
  };

  return (
    <Box sx={{ minHeight: "100vh", backgroundColor: "background.surface", py: 4 }}>
      <Box sx={{ mx: "auto", px: 3 }}>
        {/* Header */}
        <Paper sx={{ p: 3, mb: 3 }}>
          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Box>
              <Typography variant="h6" sx={{ fontWeight: 600, color: "brand.primary", mb: 1 }}>
                Shared{" "}
                {share_link.resource_type.charAt(0).toUpperCase() +
                  share_link.resource_type.slice(1)}{" "}
                {isTableView ? "List" : "View"}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                This {isTableView ? "list" : "view"} has been shared with you.{" "}
                {!permissions.allowDataExport && "Export is disabled by the owner."}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", gap: 1 }}>
              {permissions.allowDataExport && (
                <Tooltip title="Export data">
                  <IconButton
                    onClick={handleExport}
                    sx={{
                      "color": "brand.primary",
                      "border": "1px solid brand.primary",
                      "&:hover": {
                        backgroundColor: "rgba(19, 113, 91, 0.1)",
                      },
                    }}
                  >
                    <Download size={20} />
                  </IconButton>
                </Tooltip>
              )}
            </Box>
          </Box>
        </Paper>

        {/* Data Display */}
        <Paper sx={{ overflow: "hidden" }}>
          <Toolbar
            sx={{
              backgroundColor: "#fafafa",
              borderBottom: "1px solid #e0e0e0",
              minHeight: "48px !important",
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
              {share_link.resource_type.charAt(0).toUpperCase() + share_link.resource_type.slice(1)}{" "}
              {isTableView ? "List" : "Details"}
            </Typography>
          </Toolbar>
          <TableContainer sx={{ maxHeight: "calc(100vh - 300px)", overflowX: "auto" }}>
            <Table>
              {isTableView ? (
                <>
                  {/* Table View: Display rows of data */}
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "background.surface" }}>
                      {tableColumns.map((key) => (
                        <TableCell
                          key={key}
                          sx={{ fontWeight: 600, textTransform: "uppercase", fontSize: "12px" }}
                        >
                          {key
                            .split("_")
                            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(" ")}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={Math.max(tableColumns.length, 1)}
                          align="center"
                          sx={{ py: 4 }}
                        >
                          <Typography variant="body2" color="textSecondary">
                            No records to display
                          </Typography>
                        </TableCell>
                      </TableRow>
                    ) : (
                      data.map((row: any, index: number) => (
                        <TableRow key={row.id || index} hover>
                          {tableColumns.map((key) => (
                            <TableCell key={key} sx={{ whiteSpace: "nowrap" }}>
                              {formatCellValue(key, row[key])}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </>
              ) : (
                <>
                  {/* Single Record View: Display key-value pairs */}
                  <TableHead>
                    <TableRow sx={{ backgroundColor: "background.surface" }}>
                      <TableCell sx={{ fontWeight: 600, width: "30%" }}>Field</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Value</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(data).map(([key, value]) => (
                      <TableRow key={key} hover>
                        <TableCell sx={{ fontWeight: 500, color: "#666" }}>
                          {key
                            .split("_")
                            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                            .join(" ")}
                        </TableCell>
                        <TableCell>
                          {value === null || value === undefined ? (
                            <Typography variant="body2" color="textSecondary" fontStyle="italic">
                              N/A
                            </Typography>
                          ) : typeof value === "object" ? (
                            <Typography
                              variant="body2"
                              component="pre"
                              sx={{ fontFamily: "monospace", fontSize: 12 }}
                            >
                              {JSON.stringify(value, null, 2)}
                            </Typography>
                          ) : typeof value === "boolean" ? (
                            <Typography variant="body2">{value ? "Yes" : "No"}</Typography>
                          ) : (
                            <Typography variant="body2">{String(value)}</Typography>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </>
              )}
            </Table>
          </TableContainer>
        </Paper>

        {/* Footer */}
        <Box sx={{ mt: 4, textAlign: "center" }}>
          <Typography variant="caption" color="textSecondary">
            Powered by{" "}
            <a
              href="https://verifywise.ai"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: "brand.primary", textDecoration: "none", fontWeight: 600 }}
            >
              VerifyWise
            </a>
          </Typography>
        </Box>
      </Box>
    </Box>
  );
};

export default SharedView;
