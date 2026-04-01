import { Box, Typography, Stack, CircularProgress } from "@mui/material";
import { useEffect, useState } from "react";
import {
  Shield,
  Map,
  Gauge,
  Settings,
  ChevronRight,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { getEntityById } from "../../../../application/repository/entity.repository";
import { getStatusColor } from "../../ISO/style";

interface FrameworkData {
  frameworkId: number;
  frameworkName: string;
  projectFrameworkId: number;
}

interface NISTFunctionsOverviewCardProps {
  frameworksData: FrameworkData[];
  onNavigate?: (frameworkName: string, section: string) => void;
}

interface SubcategoryData {
  id: number;
  title: string;
  status: string;
  owner: number | null;
}

interface CategoryData {
  id: number;
  title: string;
  subcategories: SubcategoryData[];
}

interface FunctionData {
  id: number;
  type: string;
  title: string;
  icon: LucideIcon;
  categories: CategoryData[];
}

// Icon mappings for NIST AI RMF functions
const NIST_FUNCTION_ICONS: { [key: string]: LucideIcon } = {
  "govern": Shield,
  "map": Map,
  "measure": Gauge,
  "manage": Settings,
};

const NISTFunctionsOverviewCard = ({ frameworksData, onNavigate }: NISTFunctionsOverviewCardProps) => {
  const [loading, setLoading] = useState(true);
  const [functionsData, setFunctionsData] = useState<FunctionData[]>([]);

  useEffect(() => {
    const fetchNISTOverviewData = async () => {
      setLoading(true);

      try {
        if (!frameworksData || frameworksData.length === 0) {
          return;
        }

        // Find NIST AI RMF framework
        const nistFramework = frameworksData.find((framework) =>
          framework.frameworkName.toLowerCase().includes("nist ai rmf")
        );

        if (!nistFramework) {
          setFunctionsData([]);
          return;
        }

        // Fetch NIST AI RMF overview data
        const overviewResponse = await getEntityById({
          routeUrl: `/nist-ai-rmf/overview`,
        });

        if (overviewResponse?.data?.functions) {
          const functions = overviewResponse.data.functions.map((func: any) => ({
            id: func.id,
            type: func.type,
            title: func.title,
            icon: NIST_FUNCTION_ICONS[func.type?.toLowerCase()] || Shield,
            categories: func.categories || [],
          }));
          setFunctionsData(functions);
        }
      } catch (error) {
        console.error("Error fetching NIST AI RMF overview data:", error);
        setFunctionsData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchNISTOverviewData();
  }, [frameworksData]);

  const renderMiniSquaresForCategory = (subcategories: SubcategoryData[]) => {
    if (subcategories.length === 0) {
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

    return subcategories.map((sub, index) => (
      <Box
        key={index}
        sx={{
          width: 12,
          height: 12,
          borderRadius: "2px",
          backgroundColor: getStatusColor(sub.status),
        }}
      />
    ));
  };

  // Render mini squares grouped by category with spacing between groups
  const renderMiniSquaresByCategory = (categories: CategoryData[]) => {
    return categories.map((category, catIndex) => (
      <Box
        key={category.id}
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: "3px",
          mr: catIndex < categories.length - 1 ? 8 : 0, // Add margin-right between category groups (64px)
        }}
      >
        {renderMiniSquaresForCategory(category.subcategories)}
      </Box>
    ));
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

  if (functionsData.length === 0) {
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
          No NIST AI RMF data available.
        </Typography>
      </Box>
    );
  }

  // Helper function to render a single function card
  const renderFunctionCard = (func: FunctionData) => {
    const IconComponent = func.icon;
    const allSubcategories = func.categories.flatMap(cat => cat.subcategories);
    const implementedCount = allSubcategories.filter(sub => sub.status === "Implemented").length;
    const assignedCount = allSubcategories.filter(sub => sub.owner !== null && sub.owner !== undefined).length;

    const handleCardClick = () => {
      if (onNavigate) {
        onNavigate("NIST AI RMF", func.type.toLowerCase());
      }
    };

    return (
      <Box
        sx={{
          border: "1px solid #d0d5dd",
          borderRadius: "4px",
          overflow: "hidden",
          backgroundColor: "background.main",
        }}
      >
        {/* Header Section */}
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
            <IconComponent size={14} style={{ color: "#666666" }} />
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: "text.black",
                lineHeight: "16px",
                m: 0,
                textTransform: "capitalize",
              }}
            >
              {func.type}
            </Typography>
          </Box>
          {onNavigate && (
            <Box
              onClick={handleCardClick}
              sx={{
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                p: "4px",
                borderRadius: "4px",
                "&:hover": {
                  backgroundColor: "rgba(0, 0, 0, 0.04)",
                },
              }}
            >
              <ChevronRight size={16} style={{ color: "#666666" }} />
            </Box>
          )}
        </Box>

        {/* Content Section */}
        <Box
          sx={{
            background: "linear-gradient(135deg, #FEFFFE 0%, #F8F9FA 100%)",
            p: "16px",
          }}
        >
          {/* Mini squares grid - grouped by category with spacing */}
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
            {renderMiniSquaresByCategory(func.categories)}
          </Box>

          {/* Statistics */}
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography
                sx={{
                  fontSize: 12,
                  color: "text.black",
                  fontWeight: 600,
                }}
              >
                {implementedCount}/{allSubcategories.length}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  color: "#666666",
                }}
              >
                subcategories implemented
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
                {assignedCount}/{allSubcategories.length}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12,
                  color: "#666666",
                }}
              >
                assigned
              </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    );
  };

  // Get functions by type for 2x2 grid layout
  const governFunc = functionsData.find(f => f.type.toLowerCase() === "govern");
  const mapFunc = functionsData.find(f => f.type.toLowerCase() === "map");
  const measureFunc = functionsData.find(f => f.type.toLowerCase() === "measure");
  const manageFunc = functionsData.find(f => f.type.toLowerCase() === "manage");

  return (
    <Stack spacing={0}>
      {/* Row 1: Govern and Map */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
          },
          gap: "16px",
        }}
      >
        {/* Govern */}
        {governFunc && (
          <Box>
            <Typography
              sx={{
                fontSize: 15,
                fontWeight: 600,
                color: "text.black",
                mb: 2,
                textTransform: "capitalize",
              }}
            >
              Govern
            </Typography>
            {renderFunctionCard(governFunc)}
          </Box>
        )}

        {/* Map */}
        {mapFunc && (
          <Box>
            <Typography
              sx={{
                fontSize: 15,
                fontWeight: 600,
                color: "text.black",
                mb: 2,
                textTransform: "capitalize",
              }}
            >
              Map
            </Typography>
            {renderFunctionCard(mapFunc)}
          </Box>
        )}
      </Box>

      {/* Spacing between rows */}
      <Box sx={{ height: "16px" }} />

      {/* Row 2: Measure and Manage */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(2, 1fr)",
          },
          gap: "16px",
        }}
      >
        {/* Measure */}
        {measureFunc && (
          <Box>
            <Typography
              sx={{
                fontSize: 15,
                fontWeight: 600,
                color: "text.black",
                mb: 2,
                textTransform: "capitalize",
              }}
            >
              Measure
            </Typography>
            {renderFunctionCard(measureFunc)}
          </Box>
        )}

        {/* Manage */}
        {manageFunc && (
          <Box>
            <Typography
              sx={{
                fontSize: 15,
                fontWeight: 600,
                color: "text.black",
                mb: 2,
                textTransform: "capitalize",
              }}
            >
              Manage
            </Typography>
            {renderFunctionCard(manageFunc)}
          </Box>
        )}
      </Box>
    </Stack>
  );
};

export default NISTFunctionsOverviewCard;
