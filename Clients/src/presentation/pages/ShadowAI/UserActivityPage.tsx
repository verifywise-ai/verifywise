/**
 * Shadow AI User Activity Page
 *
 * Shows user-level activity, department breakdown, and user detail view.
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Stack,
  Typography,
  Skeleton,
  SelectChangeEvent,
  IconButton,
  Table,
  TableBody,
  TableRow,
  TableCell,
  TableContainer,
  TablePagination,
  TableFooter,
  Box,
  useTheme,
} from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import { ArrowLeft, Mail, Building2, Users, Activity, TrendingUp } from "lucide-react";
import TabBar from "../../components/TabBar";
import TablePaginationActions from "../../components/TablePagination";
import singleTheme from "../../themes/v1SingleTheme";
import Select from "../../components/Inputs/Select";
import {
  getUsers,
  getUserDetail,
  getDepartmentActivity,
  GetUsersParams,
} from "../../../application/repository/shadowAi.repository";
import {
  ShadowAiUserActivity,
  ShadowAiDepartmentActivity,
} from "../../../domain/interfaces/i.shadowAi";
import { EmptyState } from "../../components/EmptyState";
import EmptyStateTip from "../../components/EmptyState/EmptyStateTip";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import { DashboardHeaderCard } from "../../components/Cards/DashboardHeaderCard";
import {
  PERIOD_OPTIONS,
  SelectorVertical,
  SortableColumn,
  useTableSort,
  useSortedRows,
  SortableTableHead,
} from "./constants";
import { palette } from "../../themes/palette";

interface UserDetailData {
  email: string;
  department: string;
  tools: { tool_name: string; event_count: number; last_used: string }[];
  total_prompts: number;
}

type ViewMode = "users" | "departments";

const BASE_TABS = [
  { label: "Users", value: "users", icon: "Users" as const, tooltip: "Individual user AI tool usage and risk scores" },
  { label: "Departments", value: "departments", icon: "Building2" as const, tooltip: "AI usage aggregated by department" },
];

const DEPT_PER_PAGE = 10;

export default function UserActivityPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const theme = useTheme();
  const [period, setPeriod] = useState("30d");

  const viewMode: ViewMode = location.pathname.includes("/user-activity/departments")
    ? "departments"
    : "users";
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ShadowAiUserActivity[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [departments, setDepartments] = useState<ShadowAiDepartmentActivity[]>([]);
  const [totalDepartments, setTotalDepartments] = useState(0);
  const [deptPage, setDeptPage] = useState(0);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // ─── Sorting ───
  const USERS_COLUMNS: SortableColumn[] = useMemo(() => [
    { id: "user_email", label: "User" },
    { id: "department", label: "Department" },
    { id: "total_prompts", label: "Total prompts" },
    { id: "risk_score", label: "Risk score", tooltip: "Calculated nightly (0–100). Weighted: approval status (40%), compliance (25%), usage volume (15%), department sensitivity (20%)." },
  ], []);
  const DEPT_COLUMNS: SortableColumn[] = useMemo(() => [
    { id: "department", label: "Department" },
    { id: "users", label: "Users" },
    { id: "total_prompts", label: "Total prompts" },
    { id: "top_tool", label: "Top tool" },
    { id: "risk_score", label: "Risk score", tooltip: "Calculated nightly (0–100). Weighted: approval status (40%), compliance (25%), usage volume (15%), department sensitivity (20%)." },
  ], []);
  const DETAIL_TOOLS_COLUMNS: SortableColumn[] = useMemo(() => [
    { id: "tool_name", label: "Tool" },
    { id: "event_count", label: "Events" },
    { id: "last_used", label: "Last used" },
  ], []);

  const { sortConfig: usersSortConfig, handleSort: handleUsersSort } =
    useTableSort("vw_shadow_ai_users_sort");
  const { sortConfig: deptSortConfig, handleSort: handleDeptSort } =
    useTableSort("vw_shadow_ai_depts_sort");
  const { sortConfig: detailToolsSortConfig, handleSort: handleDetailToolsSort } =
    useTableSort("vw_shadow_ai_detail_tools_sort");

  const getUserValue = useCallback(
    (row: ShadowAiUserActivity, key: string): string | number => {
      switch (key) {
        case "user_email": return row.user_email;
        case "department": return row.department || "Unknown";
        case "total_prompts": return row.total_prompts;
        case "risk_score": return row.risk_score ?? 0;
        default: return "";
      }
    }, []
  );
  const getDeptValue = useCallback(
    (row: ShadowAiDepartmentActivity, key: string): string | number => {
      switch (key) {
        case "department": return row.department;
        case "users": return row.users;
        case "total_prompts": return row.total_prompts;
        case "top_tool": return row.top_tool || "";
        case "risk_score": return row.risk_score ?? 0;
        default: return "";
      }
    }, []
  );
  const getDetailToolValue = useCallback(
    (row: { tool_name: string; event_count: number; last_used: string }, key: string): string | number => {
      switch (key) {
        case "tool_name": return row.tool_name;
        case "event_count": return row.event_count;
        case "last_used": return new Date(row.last_used).getTime();
        default: return "";
      }
    }, []
  );

  const sortedUsers = useSortedRows(users, usersSortConfig, getUserValue);
  const sortedDepts = useSortedRows(departments, deptSortConfig, getDeptValue);
  const sortedDetailTools = useSortedRows(
    userDetail?.tools ?? [], detailToolsSortConfig, getDetailToolValue
  );

  const tabs = useMemo(() => BASE_TABS.map((tab) => ({
    ...tab,
    count: tab.value === "users" ? totalUsers : totalDepartments,
  })), [totalUsers, totalDepartments]);

  // Fetch counts for both tabs on mount
  useEffect(() => {
    const controller = new AbortController();
    const fetchCounts = async () => {
      try {
        const [usersData, deptData] = await Promise.all([
          getUsers({ page: 1, limit: 1, period, sort_by: "total_prompts", order: "desc" }),
          getDepartmentActivity(period),
        ]);
        if (controller.signal.aborted) return;
        setTotalUsers(usersData.total);
        setTotalDepartments(deptData.length);
      } catch {
        // counts will update when individual tabs load
      }
    };
    fetchCounts();
    return () => { controller.abort(); };
  }, [period]);

  useEffect(() => {
    const controller = new AbortController();
    const fetchData = async () => {
      setLoading(true);
      try {
        if (viewMode === "users") {
          const params: GetUsersParams = {
            page,
            limit: 20,
            period,
            sort_by: "total_prompts",
            order: "desc",
          };
          const result = await getUsers(params);
          if (controller.signal.aborted) return;
          setUsers(result.users);
          setTotalUsers(result.total);
        } else if (viewMode === "departments") {
          const result = await getDepartmentActivity(period);
          if (controller.signal.aborted) return;
          setDepartments(result);
          setTotalDepartments(result.length);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        console.error("Failed to load data:", error);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    fetchData();
    return () => { controller.abort(); };
  }, [viewMode, page, period]);

  const handleUserClick = async (email: string) => {
    setSelectedEmail(email);
    setDetailLoading(true);
    try {
      const detail = await getUserDetail(email, period);
      setUserDetail(detail);
    } catch (error) {
      console.error("Failed to load user detail:", error);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleBack = () => {
    setSelectedEmail(null);
    setUserDetail(null);
    navigate("/shadow-ai/user-activity/users");
  };

  const handlePeriodChange = (e: SelectChangeEvent<string | number>) => {
    setPeriod(e.target.value as string);
    setPage(1);
  };

  // ─── Detail view ───
  if (selectedEmail) {
    return (
      <PageHeaderExtended
        title="User activity"
        description={selectedEmail}
      >
        <Stack direction="row" alignItems="center" gap="8px">
          <IconButton onClick={handleBack} size="small">
            <ArrowLeft size={16} strokeWidth={1.5} />
          </IconButton>
          <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
            {selectedEmail}
          </Typography>
        </Stack>

        {detailLoading ? (
          <Stack gap="16px">
            <Skeleton height={80} />
            <Skeleton height={200} />
          </Stack>
        ) : userDetail ? (
          <Stack gap="16px">
            <Box
              sx={{
                display: "flex",
                flexWrap: "wrap",
                gap: "16px",
                "& > *": { flex: "1 1 0", minWidth: "150px" },
              }}
            >
              <DashboardHeaderCard
                title="Email"
                count={userDetail.email}
                icon={<Mail size={16} strokeWidth={1.5} />}
                disableNavigation
              />
              <DashboardHeaderCard
                title="Department"
                count={userDetail.department || "Unknown"}
                icon={<Building2 size={16} strokeWidth={1.5} />}
                disableNavigation
              />
              <DashboardHeaderCard
                title="Total prompts"
                count={userDetail.total_prompts}
                disableNavigation
              />
            </Box>

            <Typography sx={{ fontSize: 15, fontWeight: 600 }}>
              Tools used
            </Typography>
            {userDetail.tools?.length > 0 ? (
              <TableContainer sx={singleTheme.tableStyles.primary.frame}>
                <Table>
                  <SortableTableHead
                    columns={DETAIL_TOOLS_COLUMNS}
                    sortConfig={detailToolsSortConfig}
                    onSort={handleDetailToolsSort}
                  />
                  <TableBody>
                    {sortedDetailTools.map(
                      (t) => (
                        <TableRow key={t.tool_name} sx={singleTheme.tableStyles.primary.body.row}>
                          <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{t.tool_name}</TableCell>
                          <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{t.event_count}</TableCell>
                          <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{new Date(t.last_used).toLocaleDateString()}</TableCell>
                        </TableRow>
                      )
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            ) : (
              <Typography sx={{ fontSize: 13, color: palette.text.disabled }}>
                No tool usage recorded
              </Typography>
            )}
          </Stack>
        ) : (
          <Typography sx={{ fontSize: 13, color: palette.text.disabled }}>
            User not found
          </Typography>
        )}
      </PageHeaderExtended>
    );
  }

  // ─── List views ───
  const hasData = viewMode === "users" ? users.length > 0 : departments.length > 0;

  const handleTabChange = (_e: React.SyntheticEvent, newValue: string) => {
    if (newValue === "departments") {
      navigate("/shadow-ai/user-activity/departments");
    } else {
      navigate("/shadow-ai/user-activity/users");
    }
  };

  return (
    <PageHeaderExtended
      title="User activity"
      description="Monitor individual user and department-level AI tool usage across your organization. Track prompts, identify high-risk users, and review activity by department."
      helpArticlePath="shadow-ai/user-activity"
      tipBoxEntity="shadow-ai-user-activity"
    >
    <TabContext value={viewMode}>

      {/* Controls */}
      <Stack sx={{ position: "relative" }}>
        <TabBar
          tabs={tabs}
          activeTab={viewMode}
          onChange={handleTabChange}
        />
        <Box sx={{ position: "absolute", right: 0, top: "50%", transform: "translateY(-50%)" }}>
          <Select
            id="period-select"
            value={period}
            onChange={handlePeriodChange}
            items={PERIOD_OPTIONS}
            sx={{ width: 160 }}
          />
        </Box>
      </Stack>

      {/* Content */}
      {loading ? (
        <Skeleton variant="rectangular" height={300} sx={{ borderRadius: "4px" }} />
      ) : !hasData ? (
        <EmptyState
          icon={Users}
          message="No user activity detected yet. Activity will appear here once monitoring is connected."
          showBorder
        >
          <EmptyStateTip
            icon={Activity}
            title="What gets tracked?"
            description="User sessions, tool access frequency, and department-level usage patterns for AI tools."
          />
          <EmptyStateTip
            icon={Building2}
            title="Department-level insights"
            description="See which departments have the highest AI tool usage. Identify teams that may need governance training or tool approvals."
          />
          <EmptyStateTip
            icon={TrendingUp}
            title="Spot usage trends"
            description="Monitor adoption curves and usage spikes. Correlate activity with policy changes or new tool introductions."
          />
        </EmptyState>
      ) : viewMode === "users" ? (
        <TableContainer sx={singleTheme.tableStyles.primary.frame}>
          <Table>
            <SortableTableHead
              columns={USERS_COLUMNS}
              sortConfig={usersSortConfig}
              onSort={handleUsersSort}
            />
            <TableBody>
              {sortedUsers.map((u) => (
                <TableRow key={u.user_email} sx={{ ...singleTheme.tableStyles.primary.body.row, cursor: "pointer" }} onClick={() => handleUserClick(u.user_email)}>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>
                    <Typography
                      sx={{
                        fontSize: 13,
                        color: palette.brand.primary,
                      }}
                    >
                      {u.user_email}
                    </Typography>
                  </TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{u.department || "Unknown"}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{u.total_prompts}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{u.risk_score ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow
                sx={{
                  "& .MuiTableCell-root.MuiTableCell-footer": {
                    paddingX: theme.spacing(8),
                    paddingY: theme.spacing(4),
                  },
                }}
              >
                <TableCell
                  sx={{
                    paddingX: theme.spacing(2),
                    fontSize: 12,
                    opacity: 0.7,
                  }}
                >
                  Showing {(page - 1) * 20 + 1} -{" "}
                  {Math.min(page * 20, totalUsers)} of {totalUsers} users
                </TableCell>
                <TablePagination
                  count={totalUsers}
                  page={page - 1}
                  onPageChange={(_e, newPage) => setPage(newPage + 1)}
                  rowsPerPage={20}
                  rowsPerPageOptions={[20]}
                  ActionsComponent={(props) => (
                    <TablePaginationActions {...props} />
                  )}
                  labelRowsPerPage=""
                  labelDisplayedRows={({ page: p, count }) =>
                    `Page ${p + 1} of ${Math.max(0, Math.ceil(count / 20))}`
                  }
                  slotProps={{
                    select: {
                      MenuProps: {
                        keepMounted: true,
                        PaperProps: {
                          className: "pagination-dropdown",
                          sx: { mt: 0, mb: theme.spacing(2) },
                        },
                        transformOrigin: { vertical: "bottom", horizontal: "left" },
                        anchorOrigin: { vertical: "top", horizontal: "left" },
                        sx: { mt: theme.spacing(-2) },
                      },
                      inputProps: { id: "pagination-dropdown" },
                      IconComponent: SelectorVertical,
                      sx: {
                        ml: theme.spacing(4),
                        mr: theme.spacing(12),
                        minWidth: theme.spacing(20),
                        textAlign: "left",
                        "&.Mui-focused > div": {
                          backgroundColor: theme.palette.background.main,
                        },
                      },
                    },
                  }}
                  sx={{
                    mt: theme.spacing(6),
                    color: theme.palette.text.secondary,
                    "& .MuiSelect-icon": { width: "24px", height: "fit-content" },
                    "& .MuiSelect-select": {
                      width: theme.spacing(10),
                      borderRadius: theme.shape.borderRadius,
                      border: `1px solid ${theme.palette.border.light}`,
                      padding: theme.spacing(4),
                    },
                  }}
                />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      ) : (
        <TableContainer sx={singleTheme.tableStyles.primary.frame}>
          <Table>
            <SortableTableHead
              columns={DEPT_COLUMNS}
              sortConfig={deptSortConfig}
              onSort={handleDeptSort}
            />
            <TableBody>
              {sortedDepts
                .slice(deptPage * DEPT_PER_PAGE, (deptPage + 1) * DEPT_PER_PAGE)
                .map((d) => (
                <TableRow key={d.department} sx={{ ...singleTheme.tableStyles.primary.body.row, "&:hover": { cursor: "default" } }}>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{d.department}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{d.users}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{d.total_prompts}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{d.top_tool || "—"}</TableCell>
                  <TableCell sx={singleTheme.tableStyles.primary.body.cell}>{d.risk_score ?? 0}</TableCell>
                </TableRow>
              ))}
            </TableBody>
            <TableFooter>
              <TableRow
                sx={{
                  "& .MuiTableCell-root.MuiTableCell-footer": {
                    paddingX: theme.spacing(8),
                    paddingY: theme.spacing(4),
                  },
                }}
              >
                <TableCell
                  sx={{
                    paddingX: theme.spacing(2),
                    fontSize: 12,
                    opacity: 0.7,
                  }}
                >
                  Showing {deptPage * DEPT_PER_PAGE + 1} -{" "}
                  {Math.min((deptPage + 1) * DEPT_PER_PAGE, departments.length)} of{" "}
                  {departments.length} departments
                </TableCell>
                <TablePagination
                  count={departments.length}
                  page={deptPage}
                  onPageChange={(_e, newPage) => setDeptPage(newPage)}
                  rowsPerPage={DEPT_PER_PAGE}
                  rowsPerPageOptions={[DEPT_PER_PAGE]}
                  ActionsComponent={(props) => (
                    <TablePaginationActions {...props} />
                  )}
                  labelRowsPerPage=""
                  labelDisplayedRows={({ page: p, count }) =>
                    `Page ${p + 1} of ${Math.max(0, Math.ceil(count / DEPT_PER_PAGE))}`
                  }
                  slotProps={{
                    select: {
                      MenuProps: {
                        keepMounted: true,
                        PaperProps: {
                          className: "pagination-dropdown",
                          sx: { mt: 0, mb: theme.spacing(2) },
                        },
                        transformOrigin: { vertical: "bottom", horizontal: "left" },
                        anchorOrigin: { vertical: "top", horizontal: "left" },
                        sx: { mt: theme.spacing(-2) },
                      },
                      inputProps: { id: "pagination-dropdown" },
                      IconComponent: SelectorVertical,
                      sx: {
                        ml: theme.spacing(4),
                        mr: theme.spacing(12),
                        minWidth: theme.spacing(20),
                        textAlign: "left",
                        "&.Mui-focused > div": {
                          backgroundColor: theme.palette.background.main,
                        },
                      },
                    },
                  }}
                  sx={{
                    mt: theme.spacing(6),
                    color: theme.palette.text.secondary,
                    "& .MuiSelect-icon": { width: "24px", height: "fit-content" },
                    "& .MuiSelect-select": {
                      width: theme.spacing(10),
                      borderRadius: theme.shape.borderRadius,
                      border: `1px solid ${theme.palette.border.light}`,
                      padding: theme.spacing(4),
                    },
                  }}
                />
              </TableRow>
            </TableFooter>
          </Table>
        </TableContainer>
      )}
    </TabContext>
    </PageHeaderExtended>
  );
}

