import React, { useMemo, useState, useEffect } from "react";
import {
  Box,
  Typography,
  Stack,
  Chip,
  Paper,
  Grid,
  Collapse,
} from "@mui/material";
import type { GridProps } from "@mui/material";
import {
  ChevronUp as ExpandLessIcon,
  ChevronDown as ExpandMoreIcon,
} from "lucide-react";
import { getAllUsers } from "../../../application/repository/user.repository";
import { ButtonToggle } from "../button-toggle";
import { IRiskCategoriesProps } from "../../types/interfaces/i.risk";
import { ICategoryGroup } from "../../../domain/interfaces/i.categoryGroup";
import { User } from "../../../domain/types/User";

const RiskCategories: React.FC<IRiskCategoriesProps> = ({
  risks,
  selectedRisk,
  onRiskSelect,
}) => {
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"category" | "lifecycle">(
    "category"
  );
  const [users, setUsers] = useState<User[]>([]);

  // Fetch users on component mount
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersResponse = await getAllUsers();
        setUsers(usersResponse.data || []);
      } catch (error) {
        console.error("Error fetching users:", error);
      }
    };

    fetchUsers();
  }, []);

  const getRiskLevelColor = (riskLevel: number): string => {
    if (riskLevel >= 16) return "#C63622"; // Very High - Dark Red
    if (riskLevel >= 12) return "#D68B61"; // High - Orange Red
    if (riskLevel >= 8) return "#D6B971"; // Medium - Orange
    if (riskLevel >= 4) return "#52AB43"; // Low - Light Green
    return "#B8D39C"; // Very Low - Very Light Green
  };

  const getRiskLevelFromString = (level: string | number): number => {
    if (typeof level === "number") return level;
    const levelStr = level.trim().toLowerCase();
    if (levelStr.includes("very high") || levelStr === "5") return 5;
    if (levelStr.includes("high") || levelStr === "4") return 4;
    if (levelStr.includes("medium") || levelStr === "3") return 3;
    if (levelStr.includes("very low") || levelStr === "1") return 1;
    if (levelStr.includes("low") || levelStr === "2") return 2;
    const n = parseInt(levelStr, 10);
    return Number.isFinite(n) ? n : 0;
  };

  // Helper function to get user name by ID
  const getUserNameById = (userId: string): string => {
    const user = users.find((u) => u.id.toString() === userId.toString());
    if (user) {
      const fullName = `${user.name} ${user.surname}`.trim();

      // Return full name if available, otherwise fallback to email, then user ID
      return fullName || user.email || `User ${userId}`;
    }
    return userId; // Fallback to ID if user not found
  };

  const categorizedRisks = useMemo(() => {
    const groups: { [key: string]: ICategoryGroup } = {};

    risks.forEach((risk) => {
      let categories: string[] = [];

      if (viewMode === "category") {
        categories = risk.risk_category || [];
      } else {
        categories = risk.ai_lifecycle_phase
          ? [risk.ai_lifecycle_phase]
          : ["Uncategorized"];
      }

      categories.forEach((category) => {
        if (!groups[category]) {
          groups[category] = {
            name: category,
            risks: [],
            count: 0,
            riskLevels: {
              veryHigh: 0,
              high: 0,
              medium: 0,
              low: 0,
              veryLow: 0,
            },
          };
        }

        groups[category].risks.push(risk);
        groups[category].count++;

        const riskLevel = getRiskLevelFromString(risk.current_risk_level);
        if (riskLevel >= 16) groups[category].riskLevels.veryHigh++;
        else if (riskLevel >= 12) groups[category].riskLevels.high++;
        else if (riskLevel >= 8) groups[category].riskLevels.medium++;
        else if (riskLevel >= 4) groups[category].riskLevels.low++;
        else groups[category].riskLevels.veryLow++;
      });
    });

    return Object.values(groups).sort((a, b) => b.count - a.count);
  }, [risks, viewMode]);

  const toggleCategory = (categoryName: string) => {
    setExpandedCategory(
      expandedCategory === categoryName ? null : categoryName
    );
  };

  const getMostCriticalLevel = (category: ICategoryGroup) => {
    if (category.riskLevels.veryHigh > 0)
      return { level: 20, color: getRiskLevelColor(20) };
    if (category.riskLevels.high > 0)
      return { level: 15, color: getRiskLevelColor(15) };
    if (category.riskLevels.medium > 0)
      return { level: 10, color: getRiskLevelColor(10) };
    if (category.riskLevels.low > 0)
      return { level: 5, color: getRiskLevelColor(5) };
    return { level: 1, color: getRiskLevelColor(1) };
  };

  if (risks.length === 0) {
    return (
      <Box
        sx={{
          p: 4,
          textAlign: "center",
          backgroundColor: "background.accent",
          borderRadius: 2,
          border: "1px solid status.default.border",
        }}
      >
        <Typography variant="h6" sx={{ color: "status.default.text", mb: 1 }}>
          No Category Data Available
        </Typography>
        <Typography variant="body2" sx={{ color: "text.disabled" }}>
          Risk category data will appear here as risks are categorized.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          mb: 3,
        }}
      >
        <Typography variant="h6" sx={{ fontWeight: 600, color: "#111827" }}>
          Risk Categories Analysis
        </Typography>

        <ButtonToggle
          options={[
            { value: "category", label: "Risk categories" },
            { value: "lifecycle", label: "AI lifecycle" },
          ]}
          value={viewMode}
          onChange={(value) => setViewMode(value as "category" | "lifecycle")}
          height={34}
        />
      </Box>

      <Grid container spacing={2}>
        {categorizedRisks.map((category) => {
          const criticalLevel = getMostCriticalLevel(category);
          const isExpanded = expandedCategory === category.name;

          const gridItemProps = {
            item: true,
            xs: 12,
            md: 6,
            lg: 4,
          } as GridProps & { item: boolean; xs: number; md: number; lg: number };
          
          return (
            <Grid {...gridItemProps} key={category.name}>
              <Paper
                elevation={0}
                sx={{
                  border: "1px solid status.default.border",
                  borderRadius: 2,
                  overflow: "hidden",
                  borderLeft: `4px solid ${criticalLevel.color}`,
                }}
              >
                <Box
                  sx={{
                    p: 2,
                    cursor: "pointer",
                    "&:hover": {
                      backgroundColor: "background.accent",
                    },
                  }}
                  onClick={() => toggleCategory(category.name)}
                >
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      mb: 2,
                    }}
                  >
                    <Box sx={{ flex: 1 }}>
                      <Typography
                        variant="subtitle2"
                        sx={{ fontWeight: 600, color: "#111827", mb: 1 }}
                      >
                        {category.name}
                      </Typography>
                      <Typography variant="body2" sx={{ color: "status.default.text" }}>
                        {category.count} risk{category.count !== 1 ? "s" : ""}
                      </Typography>
                    </Box>

                    {isExpanded ? (
                      <ExpandLessIcon size={16} style={{ color: "status.default.text" }} />
                    ) : (
                      <ExpandMoreIcon size={16} style={{ color: "status.default.text" }} />
                    )}
                  </Box>

                  <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                    {category.riskLevels.veryHigh > 0 && (
                      <Chip
                        size="small"
                        label={`${category.riskLevels.veryHigh} Very High`}
                        sx={{
                          backgroundColor: getRiskLevelColor(20),
                          color: "white",
                          fontSize: 10,
                          height: 18,
                          borderRadius: "4px",
                        }}
                      />
                    )}
                    {category.riskLevels.high > 0 && (
                      <Chip
                        size="small"
                        label={`${category.riskLevels.high} High`}
                        sx={{
                          backgroundColor: getRiskLevelColor(15),
                          color: "white",
                          fontSize: 10,
                          height: 18,
                          borderRadius: "4px",
                        }}
                      />
                    )}
                    {category.riskLevels.medium > 0 && (
                      <Chip
                        size="small"
                        label={`${category.riskLevels.medium} Medium`}
                        sx={{
                          backgroundColor: getRiskLevelColor(10),
                          color: "white",
                          fontSize: 10,
                          height: 18,
                          borderRadius: "4px",
                        }}
                      />
                    )}
                    {category.riskLevels.low > 0 && (
                      <Chip
                        size="small"
                        label={`${category.riskLevels.low} Low`}
                        sx={{
                          backgroundColor: getRiskLevelColor(5),
                          color: "white",
                          fontSize: 10,
                          height: 18,
                          borderRadius: "4px",
                        }}
                      />
                    )}
                    {category.riskLevels.veryLow > 0 && (
                      <Chip
                        size="small"
                        label={`${category.riskLevels.veryLow} Very Low`}
                        sx={{
                          backgroundColor: getRiskLevelColor(1),
                          color: "white",
                          fontSize: 10,
                          height: 18,
                          borderRadius: "4px",
                        }}
                      />
                    )}
                  </Stack>
                </Box>

                <Collapse in={isExpanded}>
                  <Box sx={{ p: 2, pt: 0, borderTop: "1px solid status.default.border" }}>
                    <Stack spacing={1}>
                      {category.risks.map((risk) => (
                        <Box
                          key={risk.id}
                          sx={{
                            p: 2,
                            backgroundColor: "background.accent",
                            borderRadius: 1,
                            border:
                              selectedRisk?.id === risk.id
                                ? `2px solid ${criticalLevel.color}`
                                : "1px solid status.default.border",
                            cursor: onRiskSelect ? "pointer" : "default",
                            "&:hover": onRiskSelect
                              ? {
                                  backgroundColor: "background.hover",
                                }
                              : {},
                          }}
                          onClick={() => onRiskSelect?.(risk)}
                        >
                          <Typography
                            variant="body2"
                            sx={{ fontWeight: 600, color: "#111827", mb: 1 }}
                          >
                            {risk.risk_name}
                          </Typography>
                          <Box
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 1,
                              mb: 1,
                            }}
                          >
                            <Chip
                              size="small"
                              label={risk.current_risk_level}
                              sx={{
                                backgroundColor: getRiskLevelColor(
                                  getRiskLevelFromString(
                                    risk.current_risk_level
                                  )
                                ),
                                color: "white",
                                fontSize: 10,
                                height: 18,
                                borderRadius: "4px",
                              }}
                            />
                            {risk.risk_owner && (
                              <Typography
                                variant="caption"
                                sx={{ color: "status.default.text" }}
                              >
                                Owner:{" "}
                                {getUserNameById(risk.risk_owner.toString())}
                              </Typography>
                            )}
                          </Box>
                          {risk.risk_description && (
                            <Typography
                              variant="caption"
                              sx={{ color: "status.default.text", display: "block" }}
                            >
                              {risk.risk_description.length > 100
                                ? `${risk.risk_description.substring(
                                    0,
                                    100
                                  )}...`
                                : risk.risk_description}
                            </Typography>
                          )}
                        </Box>
                      ))}
                    </Stack>
                  </Box>
                </Collapse>
              </Paper>
            </Grid>
          );
        })}
      </Grid>
    </Box>
  );
};

export default RiskCategories;
