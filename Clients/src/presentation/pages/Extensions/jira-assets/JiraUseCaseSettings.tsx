/**
 * JIRA Use Case Settings
 * Shows all JIRA attributes in a two-column grid (matching native ProjectSettings)
 */

import React, { useEffect, useState } from "react";
import { Stack, Typography, Box, Chip, useTheme, CircularProgress } from "@mui/material";
import { Database } from "lucide-react";
import { apiServices } from "../../../../infrastructure/api/networkServices";

interface JiraUseCaseSettingsProps {
  project: {
    id?: number;
  } | null;
}

interface JiraAttributeSchema {
  id: string;
  name: string;
  position?: number;
  type?: number;
  description?: string;
}

const formatValue = (value: any): string => {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ") || "-";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value) || "-";
};

// Styles matching ProjectSettings exactly
const useStyles = () => {
  const theme = useTheme();
  const borderLight = (theme.palette as any).border?.light || "#E5E7EB";
  const borderDark = (theme.palette as any).border?.dark || "#D0D5DD";

  return {
    root: {
      display: "flex",
      flexDirection: "column" as const,
      gap: theme.spacing(4),
      fontSize: 13,
      width: "100%",
      margin: "0 auto",
    },
    card: {
      background: theme.palette.background.paper,
      border: `1.5px solid ${borderLight}`,
      borderRadius: theme.shape.borderRadius,
      padding: theme.spacing(5, 6),
      marginBottom: theme.spacing(4),
      boxShadow: "none",
      width: "100%",
    },
    sectionTitle: {
      fontWeight: 600,
      fontSize: 16,
      marginBottom: theme.spacing(10),
      color: theme.palette.text.primary,
    },
    // Two-column grid matching native ProjectSettings
    gridContainer: {
      display: "grid",
      gridTemplateColumns: "220px 1fr",
      rowGap: "25px",
      columnGap: "250px",
      alignItems: "start",
      mt: 2,
    },
    labelCell: {
      fontSize: 13,
      fontWeight: 500,
      color: theme.palette.text.primary,
    },
    // Clean value display box
    valueBox: {
      width: 400,
      padding: "10px 14px",
      backgroundColor: (theme.palette as any).background?.fill || "#F9FAFB",
      border: `1px solid ${borderDark}`,
      borderRadius: theme.shape.borderRadius,
      fontSize: 13,
      color: theme.palette.text.secondary,
      wordBreak: "break-word" as const,
      minHeight: "40px",
      display: "flex",
      alignItems: "center",
    },
    // Multiline value box
    valueBoxMultiline: {
      width: 400,
      padding: "10px 14px",
      backgroundColor: (theme.palette as any).background?.fill || "#F9FAFB",
      border: `1px solid ${borderDark}`,
      borderRadius: theme.shape.borderRadius,
      fontSize: 13,
      color: theme.palette.text.secondary,
      wordBreak: "break-word" as const,
      whiteSpace: "pre-wrap" as const,
      lineHeight: 1.5,
    },
  };
};

export const JiraUseCaseSettings: React.FC<JiraUseCaseSettingsProps> = ({ project }) => {
  const styles = useStyles();
  const [jiraData, setJiraData] = useState<Record<string, any> | null>(null);
  const [schema, setSchema] = useState<JiraAttributeSchema[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!project?.id) {
      setLoading(false);
      return;
    }

    const fetchJiraData = async () => {
      try {
        setLoading(true);

        let jd: Record<string, any> | null = null;
        const response: any = await apiServices.get(
          `/extensions/jira-assets/use-cases/${project.id}`,
        );
        const data = response.data?.data || response.data;
        jd = data?._jira_data || null;
        setJiraData(jd);

        // 2. Fetch the object type's full attribute schema so we can render
        // every attribute defined on the type, not just the ones JIRA
        // returned a value for. JIRA's GET /object/{id} omits unset
        // attributes — driving rendering off the schema gives users the
        // full governance picture with placeholders for unfilled fields.
        const otId = jd?.objectType?.id;
        if (otId) {
          try {
            let schemaList: JiraAttributeSchema[] = [];
            const r: any = await apiServices.get(
              `/extensions/jira-assets/object-types/${otId}/attributes`,
            );
            schemaList = (r.data?.data ?? r.data) || [];
            // Sort by JIRA's display position so the order matches the
            // JIRA UI rather than insertion order.
            schemaList = [...schemaList].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
            setSchema(schemaList);
          } catch {
            // Schema fetch is best-effort. On failure we fall back to
            // rendering only the attributes that have stored values
            // (i.e., the previous behaviour) so the page still works.
            setSchema([]);
          }
        }

        setError(null);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchJiraData();
  }, [project?.id]);

  if (!project) {
    return <Typography>No use case found</Typography>;
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (error) {
    return <Typography color="error">Error loading JIRA data: {error}</Typography>;
  }

  const attributes = jiraData?.attributes || {};

  // Schema-driven rendering: iterate the object type's full attribute list
  // so every defined attribute shows up, with a placeholder when the
  // current object hasn't filled it. Orphans (stored attributes that are
  // no longer in the schema — renamed/deleted on JIRA's side) are appended
  // at the end so we never silently drop persisted data. If the schema
  // fetch failed, fall back to the legacy value-only rendering so the
  // tab still works.
  const schemaRows = schema.map((s) => ({
    key: s.name,
    value: attributes[s.name],
    hasValue: s.name in attributes,
  }));
  const orphanRows = Object.entries(attributes)
    .filter(([k]) => !schema.some((s) => s.name === k))
    .map(([key, value]) => ({ key, value, hasValue: true }));
  const fallbackRows = Object.entries(attributes).map(([key, value]) => ({
    key,
    value,
    hasValue: true,
  }));
  const rows = schema.length > 0 ? [...schemaRows, ...orphanRows] : fallbackRows;
  const setCount = rows.filter((r) => r.hasValue).length;

  // Render a row in the two-column grid (label left, value right). Missing
  // values render as a dim italic em-dash so they read as "intentionally
  // empty" rather than "broken".
  const renderRow = (label: string, value: any, hasValue: boolean) => {
    const formattedValue = hasValue ? formatValue(value) : "—";
    const isMultiline = formattedValue.length > 80;

    return (
      <React.Fragment key={label}>
        {/* Label cell */}
        <Box>
          <Typography sx={styles.labelCell}>{label}</Typography>
        </Box>
        {/* Value cell */}
        <Box
          sx={{
            ...(isMultiline ? styles.valueBoxMultiline : styles.valueBox),
            opacity: hasValue ? 1 : 0.55,
            fontStyle: hasValue ? "normal" : "italic",
          }}
        >
          {formattedValue}
        </Box>
      </React.Fragment>
    );
  };

  return (
    <Stack sx={styles.root}>
      {/* JIRA Source Badge */}
      <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
        <Chip
          icon={<Database size={14} />}
          label="JIRA Assets Object"
          size="small"
          sx={{
            "backgroundColor": "#E3F2FD",
            "color": "#1565C0",
            "& .MuiChip-icon": { color: "#1565C0" },
          }}
        />
        <Typography sx={{ fontSize: 13, color: "#6B7280" }}>
          This use case is imported from JIRA and is read-only
        </Typography>
      </Box>

      {/* All Attributes - Two Column Grid */}
      <Box sx={styles.card}>
        <Typography sx={styles.sectionTitle}>
          JIRA Attributes ({rows.length}
          {schema.length > 0 ? ` — ${setCount} set` : ""})
        </Typography>
        {rows.length > 0 ? (
          <Box sx={styles.gridContainer}>
            {rows.map(({ key, value, hasValue }) => renderRow(key, value, hasValue))}
          </Box>
        ) : (
          <Typography sx={{ color: "#6B7280", fontStyle: "italic" }}>
            No attributes available
          </Typography>
        )}
      </Box>
    </Stack>
  );
};

export default JiraUseCaseSettings;
