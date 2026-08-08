import { Box, Typography, Stack, CircularProgress } from "@mui/material";
import { useEffect, useState } from "react";
import { ChevronRight, LayoutList } from "lucide-react";
import { getEntityById } from "../../../../application/repository/entity.repository";
import { getStatusColor } from "../../ISO/style";
import { pluralizeEntityType } from "../../../tools/pluralizeEntityType";

interface GenericFrameworkOverviewCardProps {
  frameworkId: number;
  projectId: number;
  frameworkName: string;
  onNavigate?: (frameworkName: string) => void;
}

interface L2Row {
  impl_id: number | null;
  status: string | null;
  owner: number | null;
}

interface L1Section {
  id: number;
  number: string;
  title: string;
  l2Rows: L2Row[];
  implemented: number;
  assigned: number;
}

interface TreeResponse {
  framework: {
    entity_types: { l2_impl: string; l3_impl?: string | null };
  };
  tree: Array<{
    id: number;
    title: string;
    order_no: number | null;
    children: Array<{
      impl_id: number | null;
      status: string | null;
      owner: number | null;
    }>;
  }>;
}

const GenericFrameworkOverviewCard = ({
  frameworkId,
  projectId,
  frameworkName,
  onNavigate,
}: GenericFrameworkOverviewCardProps) => {
  const [loading, setLoading] = useState(true);
  const [sections, setSections] = useState<L1Section[]>([]);
  const [entityLabel, setEntityLabel] = useState<string>("items");

  useEffect(() => {
    const abortController = new AbortController();

    const fetchTree = async () => {
      setLoading(true);
      try {
        const response = await getEntityById({
          routeUrl: `/frameworks/${frameworkId}/tree/${projectId}`,
          signal: abortController.signal,
        });
        const data = response?.data as TreeResponse | undefined;
        if (!data) {
          setSections([]);
          return;
        }

        setEntityLabel(pluralizeEntityType(data.framework.entity_types.l2_impl).toLowerCase());

        const built: L1Section[] = data.tree.map((l1, index) => {
          const l2Rows: L2Row[] = (l1.children || []).map((l2) => ({
            impl_id: l2.impl_id,
            status: l2.status,
            owner: l2.owner,
          }));
          const implemented = l2Rows.filter((r) => r.status === "Implemented").length;
          const assigned = l2Rows.filter((r) => r.owner != null).length;
          return {
            id: l1.id,
            number: String(l1.order_no ?? index + 1),
            title: l1.title,
            l2Rows,
            implemented,
            assigned,
          };
        });
        setSections(built);
      } catch (error) {
        if (!abortController.signal.aborted) {
          console.error(
            `Error fetching tree for framework ${frameworkName} (${frameworkId}):`,
            error instanceof Error ? error.message : error,
          );
          setSections([]);
        }
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchTree();
    return () => abortController.abort();
  }, [frameworkId, projectId, frameworkName]);

  const renderMiniSquares = (rows: L2Row[]) => {
    if (rows.length === 0) {
      return (
        <Box
          sx={{
            width: 12,
            height: 12,
            borderRadius: "2px",
            backgroundColor: "status.default.border",
            border: "1px solid #D1D5DB",
          }}
        />
      );
    }
    return rows.map((row, index) => (
      <Box
        key={index}
        sx={{
          width: 12,
          height: 12,
          borderRadius: "2px",
          backgroundColor: getStatusColor(row.status || "Not started"),
        }}
      />
    ));
  };

  const handleCardClick = () => {
    if (onNavigate) {
      onNavigate(frameworkName);
    }
  };

  if (loading) {
    return (
      <Box
        sx={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          minHeight: "200px",
        }}
      >
        <CircularProgress />
      </Box>
    );
  }

  if (sections.length === 0) {
    return (
      <Box
        sx={{
          textAlign: "center",
          py: 4,
          backgroundColor: "background.accent",
          borderRadius: 2,
          border: "1px solid #d0d5dd",
        }}
      >
        <Typography variant="body1" color="text.secondary">
          No data available for {frameworkName}.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={2}>
      <Typography
        sx={{
          fontSize: 15,
          fontWeight: 600,
          color: "text.black",
        }}
      >
        {frameworkName} overview
      </Typography>

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(3, 1fr)",
          },
          gap: "16px",
        }}
      >
        {sections.map((section) => (
          <Box
            key={section.id}
            sx={{
              border: "1px solid #d0d5dd",
              borderRadius: "4px",
              overflow: "hidden",
              backgroundColor: "background.main",
            }}
          >
            <Box
              sx={{
                backgroundColor: "#F1F3F4",
                p: "10px 16px",
                borderBottom: "1px solid #d0d5dd",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                <LayoutList size={14} style={{ color: "#666666" }} />
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 600,
                    color: "text.black",
                    lineHeight: "16px",
                    m: 0,
                  }}
                >
                  {section.number}. {section.title}
                </Typography>
              </Box>
              {onNavigate && (
                <Box
                  onClick={handleCardClick}
                  sx={{
                    "cursor": "pointer",
                    "display": "flex",
                    "alignItems": "center",
                    "p": "4px",
                    "borderRadius": "4px",
                    "&:hover": {
                      backgroundColor: "rgba(0, 0, 0, 0.04)",
                    },
                  }}
                >
                  <ChevronRight size={16} style={{ color: "#666666" }} />
                </Box>
              )}
            </Box>

            <Box
              sx={{
                background: "linear-gradient(135deg, #FEFFFE 0%, #F8F9FA 100%)",
                p: "16px",
              }}
            >
              <Box
                sx={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "3px",
                  mb: 3,
                  maxWidth: "100%",
                  minHeight: "36px",
                }}
              >
                {renderMiniSquares(section.l2Rows)}
              </Box>

              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "text.black",
                      fontWeight: 600,
                    }}
                  >
                    {section.implemented}/{section.l2Rows.length}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: "#666666" }}>
                    {entityLabel} implemented
                  </Typography>
                </Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "text.black",
                      fontWeight: 600,
                    }}
                  >
                    {section.assigned}/{section.l2Rows.length}
                  </Typography>
                  <Typography sx={{ fontSize: 12, color: "#666666" }}>assigned</Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Stack>
  );
};

export default GenericFrameworkOverviewCard;
