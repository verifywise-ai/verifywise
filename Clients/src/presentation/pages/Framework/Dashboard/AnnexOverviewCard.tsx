import { Box, Typography, Stack, CircularProgress } from "@mui/material";
import { useEffect, useState } from "react";
import {
  Shield,
  Users,
  Lock,
  Eye,
  Database,
  Network,
  Building,
  UserCheck,
  Settings,
  AlertTriangle,
  Zap,
  FileText,
  Laptop,
  ChevronRight
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GetAnnexesByProjectFrameworkId } from "../../../../application/repository/annex_struct_iso.repository";
import { getStatusColor } from "../../ISO/style";
import { isISO42001, isISO27001 } from "../../../../application/constants/frameworks";
import {
  processAnnexNumber,
  calculateItemPercentages,
  clampValue
} from "../../../../application/utils/frameworkDataUtils";

interface FrameworkData {
  frameworkId: number;
  frameworkName: string;
  projectFrameworkId: number;
}

interface AnnexOverviewCardProps {
  frameworksData: FrameworkData[];
  onNavigate?: (frameworkName: string, section: string) => void;
}

// Sub-structure for annex controls/categories
interface AnnexItemData {
  id: number;
  title: string;
  status: string;
  owner?: number | null;
}

// Main annex data structure
interface AnnexData {
  id: number;
  title: string;
  annex_no?: string; // ISO 27001 might use this
  arrangement?: string; // Alternative field name
  annexcontrols?: AnnexItemData[]; // ISO 27001 (lowercase)
  annexCategories?: AnnexItemData[]; // ISO 42001
  annexControls?: AnnexItemData[]; // ISO 27001 (camelCase - actual API field)
}

// Processed category data for display
interface CategoryData {
  id: number;
  number: string;
  name: string;
  icon: LucideIcon;
  items: AnnexItemData[];
  completionPercentage: number;
  assignmentPercentage: number;
}

// Icon mappings for common annex categories (ISO 27001)
const ISO27001_ANNEX_MAPPINGS: { [key: string]: { icon: LucideIcon } } = {
  "information security policies": { icon: FileText },
  "organization of information security": { icon: Building },
  "human resource security": { icon: Users },
  "asset management": { icon: Database },
  "access control": { icon: Lock },
  "cryptography": { icon: Shield },
  "physical and environmental security": { icon: Building },
  "operations security": { icon: Settings },
  "communications security": { icon: Network },
  "system acquisition": { icon: Laptop },
  "supplier relationships": { icon: UserCheck },
  "information security incident management": { icon: AlertTriangle },
  "business continuity": { icon: Zap },
  "compliance": { icon: Eye }
};

// Icon mappings for ISO 42001 annex categories
const ISO42001_ANNEX_MAPPINGS: { [key: string]: { icon: LucideIcon } } = {
  "organizational policies and governance": { icon: Building },
  "internal organization": { icon: Users },
  "resources for ai systems": { icon: Database },
  "ai system lifecycle": { icon: Settings },
  "data for ai systems": { icon: Database },
  "ict": { icon: Network },
  "third-party relationships": { icon: UserCheck }
};

// Default icon for unmapped categories
const getAnnexIcon = (title: string, frameworkName: string) => {
  const lowercaseTitle = title.toLowerCase();
  const isISO27001 = frameworkName.toLowerCase().includes("iso 27001");
  const mappings = isISO27001 ? ISO27001_ANNEX_MAPPINGS : ISO42001_ANNEX_MAPPINGS;

  // Find matching mapping based on partial title match
  for (const [key, value] of Object.entries(mappings)) {
    if (lowercaseTitle.includes(key) || key.includes(lowercaseTitle)) {
      return value.icon;
    }
  }

  // Default icons based on common keywords
  if (lowercaseTitle.includes("security")) return Shield;
  if (lowercaseTitle.includes("access") || lowercaseTitle.includes("control")) return Lock;
  if (lowercaseTitle.includes("data") || lowercaseTitle.includes("information")) return Database;
  if (lowercaseTitle.includes("human") || lowercaseTitle.includes("people")) return Users;
  if (lowercaseTitle.includes("system") || lowercaseTitle.includes("technical")) return Settings;
  if (lowercaseTitle.includes("network") || lowercaseTitle.includes("communication")) return Network;
  if (lowercaseTitle.includes("physical") || lowercaseTitle.includes("environmental")) return Building;
  if (lowercaseTitle.includes("incident") || lowercaseTitle.includes("risk")) return AlertTriangle;
  if (lowercaseTitle.includes("compliance") || lowercaseTitle.includes("audit")) return Eye;

  return Shield; // Default fallback icon
};

const AnnexOverviewCard = ({ frameworksData, onNavigate }: AnnexOverviewCardProps) => {
  const [loading, setLoading] = useState(true);
  const [iso42001AnnexesData, setIso42001AnnexesData] = useState<CategoryData[]>([]);
  const [iso27001AnnexesData, setIso27001AnnexesData] = useState<CategoryData[]>([]);

  useEffect(() => {
    const fetchAnnexOverviewData = async () => {
      setLoading(true);

      try {
        if (!frameworksData || frameworksData.length === 0) {
          return;
        }

        // Find both frameworks
        const iso42001Framework = frameworksData.find((framework) =>
          isISO42001(framework.frameworkId, framework.frameworkName)
        );

        const iso27001Framework = frameworksData.find((framework) =>
          isISO27001(framework.frameworkId, framework.frameworkName)
        );

        // Fetch ISO 42001 annexes data if framework is present
        if (iso42001Framework) {
          try {
            const annexesResponse = await GetAnnexesByProjectFrameworkId({
              routeUrl: `/iso-42001/annexes/struct/byProjectId/${iso42001Framework.projectFrameworkId}`,
            });

            const annexes: AnnexData[] = annexesResponse.data || annexesResponse;

            // Process ISO 42001 annexes
            const iso42001Categories = annexes.map((annex) => {
              const annexItems: AnnexItemData[] = annex.annexCategories || [];

              // Use shared utility functions for calculations and processing
              const { completionPercentage, assignmentPercentage } = calculateItemPercentages(annexItems);
              const { displayNumber, cleanTitle } = processAnnexNumber(annex, iso42001Framework.frameworkName);

              return {
                id: annex.id,
                number: displayNumber,
                name: cleanTitle,
                icon: getAnnexIcon(cleanTitle, iso42001Framework.frameworkName),
                items: annexItems,
                completionPercentage: clampValue(completionPercentage),
                assignmentPercentage: clampValue(assignmentPercentage),
              };
            });

            setIso42001AnnexesData(iso42001Categories);
          } catch (error) {
            console.error("Error fetching ISO 42001 annexes data:", error);
            setIso42001AnnexesData([]);
          }
        }

        // Fetch ISO 27001 annexes data if framework is present
        if (iso27001Framework) {
          try {
            const annexesResponse = await GetAnnexesByProjectFrameworkId({
              routeUrl: `/iso-27001/annexes/struct/byProjectId/${iso27001Framework.projectFrameworkId}`,
            });

            // Handle different response structure for ISO 27001
            const annexes: AnnexData[] = annexesResponse.data?.data || annexesResponse.data || annexesResponse;

            // Process ISO 27001 annexes
            const iso27001Categories = annexes.map((annex) => {
              // ISO 27001 API returns annexControls (camelCase) not annexcontrols
              const annexItems: AnnexItemData[] = annex.annexControls || annex.annexcontrols || [];

              // Use shared utility functions for calculations and processing
              const { completionPercentage, assignmentPercentage } = calculateItemPercentages(annexItems);
              const { displayNumber, cleanTitle } = processAnnexNumber(annex, iso27001Framework.frameworkName);

              return {
                id: annex.id,
                number: displayNumber,
                name: cleanTitle,
                icon: getAnnexIcon(cleanTitle, iso27001Framework.frameworkName),
                items: annexItems,
                completionPercentage: clampValue(completionPercentage),
                assignmentPercentage: clampValue(assignmentPercentage),
              };
            });

            setIso27001AnnexesData(iso27001Categories);
          } catch (error) {
            console.error("Error fetching ISO 27001 annexes data:", error);
            setIso27001AnnexesData([]);
          }
        }
      } catch (error) {
        console.error("Error fetching annex overview data:", error);
        setIso42001AnnexesData([]);
        setIso27001AnnexesData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchAnnexOverviewData();
  }, [frameworksData]);

  const renderMiniSquares = (items: AnnexItemData[]) => {
    if (items.length === 0) {
      // Show a single empty placeholder if no items
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

    // Create squares only for actual items
    return items.map((item, index) => (
      <Box
        key={index}
        sx={{
          width: 12,
          height: 12,
          borderRadius: "2px",
          backgroundColor: getStatusColor(item.status),
        }}
      />
    ));
  };

  const renderFrameworkSection = (categoriesData: CategoryData[], title: string, frameworkName: string) => {
    if (categoriesData.length === 0) return null;

    const handleCardClick = () => {
      if (onNavigate) {
        onNavigate(frameworkName, "annexes");
      }
    };

    return (
      <Stack spacing={2}>
        <Typography
          sx={{
            fontSize: 15,
            fontWeight: 600,
            color: "text.black",
          }}
        >
          {title}
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
          {categoriesData.map((category) => {
            const IconComponent = category.icon;
            return (
              <Box
                key={category.id}
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
                      }}
                    >
                      {category.number}. {category.name}
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
                  {/* Mini squares grid */}
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "3px",
                      mb: 3,
                      maxWidth: "100%",
                      minHeight: "36px", // Allow for 3 rows minimum
                    }}
                  >
                    {renderMiniSquares(category.items)}
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
                        {category.items.filter(item => item.status === "Implemented").length}/
                        {category.items.length}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: "#666666",
                        }}
                      >
                        controls implemented
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
                        {category.items.filter(item => item.owner !== null && item.owner !== undefined).length}/
                        {category.items.length}
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
          })}
        </Box>
      </Stack>
    );
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

  // If no data for either framework
  if (iso42001AnnexesData.length === 0 && iso27001AnnexesData.length === 0) {
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
          No ISO framework annexes data available.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={0}>
      {/* Render ISO 42001 section if data is available */}
      {renderFrameworkSection(iso42001AnnexesData, "ISO 42001 annexes overview", "ISO 42001")}

      {/* Add 16px spacing between sections when both are present */}
      {iso42001AnnexesData.length > 0 && iso27001AnnexesData.length > 0 && (
        <Box sx={{ height: "16px" }} />
      )}

      {/* Render ISO 27001 section if data is available */}
      {renderFrameworkSection(iso27001AnnexesData, "ISO 27001 annexes overview", "ISO 27001")}
    </Stack>
  );
};

export default AnnexOverviewCard;