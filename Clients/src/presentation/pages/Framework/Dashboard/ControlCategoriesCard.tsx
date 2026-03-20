import { Box, Typography, Stack, CircularProgress } from "@mui/material";
import { useEffect, useState } from "react";
import {
  Building2,
  Crown,
  ClipboardList,
  Wrench,
  Settings,
  BarChart3,
  TrendingUp,
  Users,
  Target,
  Cog,
  Activity,
  Zap,
  ChevronRight
} from "lucide-react";
import {
  GetClausesByProjectFrameworkId,
  Iso27001GetClauseStructByFrameworkID
} from "../../../../application/repository/clause_struct_iso.repository";
import type { LucideIcon } from "lucide-react";
import { getStatusColor } from "../../ISO/style";
import { isISO42001, isISO27001 } from "../../../../application/constants/frameworks";
import {
  validateApiResponse,
  processSubItems,
  calculateItemPercentages,
  isValidClauseNumber,
  getClauseNumber,
  createErrorLogData,
  type BaseFrameworkData,
  type SubClauseData,
  type ClauseData
} from "../../../../application/utils/frameworkDataUtils";

interface ControlCategoriesCardProps {
  frameworksData: BaseFrameworkData[];
  onNavigate?: (frameworkName: string, section: string) => void;
}

interface CategoryData {
  id: number;
  number: string;
  name: string;
  icon: LucideIcon;
  subClauses: SubClauseData[];
  completionPercentage: number;
  assignmentPercentage: number;
}

// Predefined mappings for ISO 42001 clauses 4-10
const ISO42001_CLAUSE_MAPPINGS = {
  4: { number: "A.4", name: "Context of the organization", icon: Building2 },
  5: { number: "A.5", name: "Leadership", icon: Crown },
  6: { number: "A.6", name: "Planning", icon: ClipboardList },
  7: { number: "A.7", name: "Support", icon: Wrench },
  8: { number: "A.8", name: "Operation", icon: Settings },
  9: { number: "A.9", name: "Performance evaluation", icon: BarChart3 },
  10: { number: "A.10", name: "Improvement", icon: TrendingUp },
};

// Predefined mappings for ISO 27001 clauses 4-10
const ISO27001_CLAUSE_MAPPINGS = {
  4: { number: "A.4", name: "Context of the organization", icon: Building2 },
  5: { number: "A.5", name: "Leadership", icon: Crown },
  6: { number: "A.6", name: "Planning", icon: Target },
  7: { number: "A.7", name: "Support", icon: Users },
  8: { number: "A.8", name: "Operation", icon: Cog },
  9: { number: "A.9", name: "Performance evaluation", icon: Activity },
  10: { number: "A.10", name: "Improvement", icon: Zap },
};

const ControlCategoriesCard = ({ frameworksData, onNavigate }: ControlCategoriesCardProps) => {
  const [loading, setLoading] = useState(true);
  const [iso42001CategoriesData, setIso42001CategoriesData] = useState<CategoryData[]>([]);
  const [iso27001CategoriesData, setIso27001CategoriesData] = useState<CategoryData[]>([]);

  useEffect(() => {
    const fetchControlCategoriesData = async () => {
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

        // Fetch ISO 42001 data if framework is present
        if (iso42001Framework) {
          try {
            const clausesResponse = await GetClausesByProjectFrameworkId({
              routeUrl: `/iso-42001/clauses/struct/byProjectId/${iso42001Framework.projectFrameworkId}`,
            });

            // Validate response using utility function
            const validation = validateApiResponse(clausesResponse, iso42001Framework.frameworkName, 'clauses');
            if (!validation.isValid) {
              console.warn(validation.error, {
                projectFrameworkId: iso42001Framework.projectFrameworkId,
                frameworkName: iso42001Framework.frameworkName
              });
              setIso42001CategoriesData([]);
              return;
            }

            const clauses: ClauseData[] = validation.data;

            // Filter clauses 4-10 only using utility function
            const targetClauses = clauses.filter(clause =>
              isValidClauseNumber(clause, iso42001Framework.frameworkName)
            );

            // Process ISO 42001 clauses
            const iso42001Categories = targetClauses.map((clause) => {
              const clauseNum = getClauseNumber(clause, iso42001Framework.frameworkName);
              const mapping = ISO42001_CLAUSE_MAPPINGS[clauseNum as keyof typeof ISO42001_CLAUSE_MAPPINGS];

              // Process subclauses using utility function
              const subClausesWithStatus = processSubItems(
                clause.subClauses,
                clause.clause_no,
                iso42001Framework.frameworkName
              );

              // Calculate percentages using utility function
              const { completionPercentage, assignmentPercentage } = calculateItemPercentages(subClausesWithStatus);

              return {
                id: clause.id,
                number: mapping?.number || clauseNum.toString(),
                name: mapping?.name || clause.title,
                icon: mapping?.icon || Building2,
                subClauses: subClausesWithStatus,
                completionPercentage,
                assignmentPercentage,
              };
            });

            setIso42001CategoriesData(iso42001Categories);
          } catch (error) {
            const errorData = createErrorLogData(error, {
              frameworkName: iso42001Framework.frameworkName,
              projectFrameworkId: iso42001Framework.projectFrameworkId,
              operation: 'fetching ISO 42001 categories data',
              routeUrl: `/iso-42001/clauses/struct/byProjectId/${iso42001Framework.projectFrameworkId}`
            });
            console.error("Error fetching ISO 42001 categories data:", errorData);
            setIso42001CategoriesData([]);
          }
        }

        // Fetch ISO 27001 data if framework is present
        if (iso27001Framework) {
          try {
            const clausesResponse = await Iso27001GetClauseStructByFrameworkID({
              routeUrl: `/iso-27001/clauses/struct/byProjectId/${iso27001Framework.projectFrameworkId}`,
            });

            // Validate response using utility function
            const validation = validateApiResponse(clausesResponse, iso27001Framework.frameworkName, 'clauses');
            if (!validation.isValid) {
              console.warn(validation.error, {
                projectFrameworkId: iso27001Framework.projectFrameworkId,
                frameworkName: iso27001Framework.frameworkName
              });
              setIso27001CategoriesData([]);
              return;
            }

            const clauses: ClauseData[] = validation.data;

            // Filter clauses 4-10 only using utility function
            const targetClauses = clauses.filter(clause =>
              isValidClauseNumber(clause, iso27001Framework.frameworkName)
            );

            // Process ISO 27001 clauses
            const iso27001Categories = targetClauses.map((clause: any) => {
              const clauseNum = getClauseNumber(clause, iso27001Framework.frameworkName);
              const mapping = ISO27001_CLAUSE_MAPPINGS[clauseNum as keyof typeof ISO27001_CLAUSE_MAPPINGS];

              // Process subclauses using utility function
              const subClausesWithStatus = processSubItems(
                clause.subClauses,
                clause.arrangement || clause.clause_no,
                iso27001Framework.frameworkName
              );

              // Calculate percentages using utility function
              const { completionPercentage, assignmentPercentage } = calculateItemPercentages(subClausesWithStatus);

              return {
                id: clause.id,
                number: mapping?.number || clauseNum.toString(),
                name: mapping?.name || clause.title,
                icon: mapping?.icon || Building2,
                subClauses: subClausesWithStatus,
                completionPercentage,
                assignmentPercentage,
              };
            });

            setIso27001CategoriesData(iso27001Categories);
          } catch (error) {
            const errorData = createErrorLogData(error, {
              frameworkName: iso27001Framework.frameworkName,
              projectFrameworkId: iso27001Framework.projectFrameworkId,
              operation: 'fetching ISO 27001 categories data',
              routeUrl: `/iso-27001/clauses/struct/byProjectId/${iso27001Framework.projectFrameworkId}`
            });
            console.error("Error fetching ISO 27001 categories data:", errorData);
            setIso27001CategoriesData([]);
          }
        }
      } catch (error) {
        console.error("Error fetching control categories data:", {
          error: error instanceof Error ? error.message : error,
          frameworksCount: frameworksData?.length || 0,
          frameworks: frameworksData?.map(f => ({
            id: f.frameworkId,
            name: f.frameworkName,
            projectFrameworkId: f.projectFrameworkId
          })) || []
        });
        setIso42001CategoriesData([]);
        setIso27001CategoriesData([]);
      } finally {
        setLoading(false);
      }
    };

    fetchControlCategoriesData();
  }, [frameworksData]);

  const renderMiniSquares = (subClauses: SubClauseData[]) => {
    if (subClauses.length === 0) {
      // Show a single empty placeholder if no subclauses
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

    // Create squares only for actual subclauses
    return subClauses.map((subClause, index) => (
      <Box
        key={index}
        sx={{
          width: 12,
          height: 12,
          borderRadius: "2px",
          backgroundColor: getStatusColor(subClause.status),
        }}
      />
    ));
  };

  const renderFrameworkSection = (categoriesData: CategoryData[], title: string, frameworkName: string) => {
    if (categoriesData.length === 0) return null;

    const handleCardClick = () => {
      if (onNavigate) {
        onNavigate(frameworkName, "clauses");
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
                    {renderMiniSquares(category.subClauses)}
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
                        {category.subClauses.filter(sub => sub.status === "Implemented").length}/
                        {category.subClauses.length}
                      </Typography>
                      <Typography
                        sx={{
                          fontSize: 12,
                          color: "#666666",
                        }}
                      >
                        subclauses implemented
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
                        {category.subClauses.filter(sub => sub.owner !== null && sub.owner !== undefined).length}/
                        {category.subClauses.length}
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
  if (iso42001CategoriesData.length === 0 && iso27001CategoriesData.length === 0) {
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
          No ISO framework clauses data available.
        </Typography>
      </Box>
    );
  }

  return (
    <Stack spacing={0}>
      {/* Render ISO 42001 section if data is available */}
      {renderFrameworkSection(iso42001CategoriesData, "ISO 42001 clauses overview", "ISO 42001")}

      {/* Add 16px spacing between sections when both are present */}
      {iso42001CategoriesData.length > 0 && iso27001CategoriesData.length > 0 && (
        <Box sx={{ height: "16px" }} />
      )}

      {/* Render ISO 27001 section if data is available */}
      {renderFrameworkSection(iso27001CategoriesData, "ISO 27001 clauses overview", "ISO 27001")}
    </Stack>
  );
};

export default ControlCategoriesCard;