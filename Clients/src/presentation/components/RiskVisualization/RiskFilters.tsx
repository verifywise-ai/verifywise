import React, { useState } from "react";
import { Box, Stack } from "@mui/material";
import Select from "../Inputs/Select";
import { getAllUsers } from "../../../application/repository/user.repository";
import { IRiskFiltersProps } from "../../types/interfaces/i.risk";
import { IFilterState } from "../../types/interfaces/i.filter";
import { User } from "../../../domain/types/User";

const initialFilterState: IFilterState = {
  riskLevel: "all",
  owner: "all",
  mitigationStatus: "all",
  deletionStatus: "active",
};

const RiskFilters: React.FC<IRiskFiltersProps> = ({ risks, onFilterChange }) => {
  const [filters, setFilters] = useState<IFilterState>(initialFilterState);
  const [users, setUsers] = useState<User[]>([]);

  // Fetch users on component mount
  React.useEffect(() => {
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

  // Apply initial filters when risks change
  React.useEffect(() => {
    if (risks.length > 0) {
      applyFilters(filters);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [risks]);

  const applyFilters = (newFilters: IFilterState) => {
    let filteredRisks = [...risks];

    // Risk level filter
    if (newFilters.riskLevel !== "all") {
      filteredRisks = filteredRisks.filter((risk) => {
        const currentRiskLevel = (
          risk.current_risk_level ||
          risk.risk_level_autocalculated ||
          ""
        ).toLowerCase();

        switch (newFilters.riskLevel) {
          case "veryHigh":
            return currentRiskLevel.includes("very high");
          case "high":
            return currentRiskLevel.includes("high") && !currentRiskLevel.includes("very high");
          case "medium":
            return currentRiskLevel.includes("medium");
          case "low":
            return currentRiskLevel.includes("low") && !currentRiskLevel.includes("very low");
          case "veryLow":
            return currentRiskLevel.includes("very low") || currentRiskLevel.includes("no risk");
          default:
            return true;
        }
      });
    }

    // Owner filter
    if (newFilters.owner !== "all") {
      filteredRisks = filteredRisks.filter((risk) => {
        return risk.risk_owner?.toString() === newFilters.owner;
      });
    }

    // Mitigation status filter
    if (newFilters.mitigationStatus !== "all") {
      filteredRisks = filteredRisks.filter((risk) => {
        const mitigationStatus = risk.mitigation_status?.toLowerCase();

        switch (newFilters.mitigationStatus) {
          case "completed":
            return mitigationStatus === "completed";
          case "in_progress":
            return mitigationStatus === "in progress";
          case "pending":
            return mitigationStatus === "not started" || !mitigationStatus;
          case "none":
            return !mitigationStatus;
          default:
            return true;
        }
      });
    }

    onFilterChange(filteredRisks, newFilters);
  };

  const handleFilterChange = (key: keyof IFilterState, value: string | number) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    applyFilters(newFilters);
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

  const getUniqueOwners = () => {
    const ownerIds = new Set<string>();
    risks.forEach((risk) => {
      if (risk.risk_owner) {
        ownerIds.add(risk.risk_owner.toString());
      }
    });

    return Array.from(ownerIds)
      .sort()
      .map((ownerId) => ({
        id: ownerId,
        name: getUserNameById(ownerId),
      }));
  };

  const uniqueOwners = getUniqueOwners();

  return (
    <Box>
      {/* Filter Dropdowns */}
      <Stack direction="row" gap="8px" alignItems="flex-end">
        <Select
          id="risk-level-filter"
          label="Risk level"
          value={filters.riskLevel}
          items={[
            { _id: "all", name: "All Levels" },
            { _id: "veryHigh", name: "Very High" },
            { _id: "high", name: "High" },
            { _id: "medium", name: "Medium" },
            { _id: "low", name: "Low" },
            { _id: "veryLow", name: "Very Low" },
          ]}
          onChange={(e) => handleFilterChange("riskLevel", e.target.value)}
          sx={{ width: 140 }}
          isFilterApplied={!!filters.riskLevel && filters.riskLevel !== "all"}
        />

        <Select
          id="owner-filter"
          label="Owner"
          value={filters.owner}
          items={[
            { _id: "all", name: "All Owners" },
            ...uniqueOwners.map((owner) => ({
              _id: owner.id,
              name: owner.name,
            })),
          ]}
          onChange={(e) => handleFilterChange("owner", e.target.value)}
          sx={{ width: 140 }}
          isFilterApplied={!!filters.owner && filters.owner !== "all"}
        />

        <Select
          id="mitigation-status-filter"
          label="Mitigation status"
          value={filters.mitigationStatus}
          items={[
            { _id: "all", name: "All Statuses" },
            { _id: "completed", name: "Completed" },
            { _id: "in_progress", name: "In Progress" },
            { _id: "pending", name: "Pending" },
            { _id: "none", name: "No Mitigations" },
          ]}
          onChange={(e) => handleFilterChange("mitigationStatus", e.target.value)}
          sx={{ width: 140 }}
          isFilterApplied={!!filters.mitigationStatus && filters.mitigationStatus !== "all"}
        />

        <Select
          id="deletion-status-filter"
          label="Risk status"
          value={filters.deletionStatus}
          items={[
            { _id: "active", name: "Active only" },
            { _id: "all", name: "Active + deleted" },
            { _id: "deleted", name: "Deleted only" },
          ]}
          onChange={(e) => handleFilterChange("deletionStatus", e.target.value)}
          sx={{ width: 140 }}
          isFilterApplied={!!filters.deletionStatus}
        />
      </Stack>
    </Box>
  );
};

export default RiskFilters;
