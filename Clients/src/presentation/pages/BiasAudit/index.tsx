import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  Alert,
  Box,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import TabContext from "@mui/lab/TabContext";
import { FolderTree, ListChecks } from "lucide-react";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import TabBar from "../../components/TabBar";
import type { TabItem } from "../../components/TabBar";
import Select from "../../components/Inputs/Select";
import { EmptyState } from "../../components/EmptyState";
import { CustomizableButton } from "../../components/button/customizable-button";
import { useProjects } from "../../../application/hooks/useProjects";
import { useAuth } from "../../../application/hooks/useAuth";
import useFormattedDate from "../../../application/hooks/useFormattedDate";
import { useQueryClient } from "@tanstack/react-query";
import {
  aedtQueryKeys,
  useAedtProfile,
  useAedtQuestions,
  useAedtRuns,
  useAttestAedtProfile,
  useGenerateAedtScopeDetermination,
  useSaveAedtAnswers,
} from "../../../application/hooks/useAedtBiasAudit";
import {
  describeAedtError,
  LL144_FRAMEWORK_ID,
  type AedtAnswerInput,
  type AedtProfileView,
  type AedtReadiness,
  type AedtRunSummary,
} from "../../../application/repository/aedtBiasAudit.repository";
import { palette } from "../../themes/palette";
import ProfileWizard from "./ProfileWizard";
import RunUpload from "./RunUpload";
import RunDetail from "./RunDetail";
import StancePanel from "./StancePanel";
import PersonLabel from "./PersonLabel";
import OpenVetoList from "./OpenVetoList";
import { questionTitle } from "./intakeLayout";
import { cardSx, cellSx, headSx } from "./styles";

/**
 * NYC Local Law 144 bias audit module: the profile intake, runs against an
 * uploaded dataset, and the stance documents generated from them. It is a
 * self-administered test, and every page says what it can and cannot stand
 * for. Independent of the Evals dashboard's bias audit, which keeps its own
 * entry.
 */
const BiasAuditPage = () => {
  const { projectId: projectParam } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { userRoleName } = useAuth();
  const { approvedProjects, isLoading: projectsLoading } = useProjects();
  const [activeTab, setActiveTab] = useState("profile");

  const projects = useMemo(
    () =>
      approvedProjects.filter((p) =>
        (p.framework ?? []).some((f) => f.framework_id === LL144_FRAMEWORK_ID),
      ),
    [approvedProjects],
  );

  const parsed = projectParam && /^\d+$/.test(projectParam) ? Number(projectParam) : null;
  const projectId = parsed ?? (projects.length > 0 ? projects[0].id : null);

  // The server is the authority on both; these only explain a disabled button.
  const canEdit = userRoleName === "Admin" || userRoleName === "Editor";
  const canAttest = userRoleName === "Admin";

  return (
    <PageHeaderExtended
      title="LL 144 bias audit"
      description="Test your hiring tool against the calculations NYC Local Law 144 requires, record your position, and generate a stance document. A self-administered test is not a bias audit under the law, which requires an independent auditor."
    >
      {projectsLoading ? (
        <Stack alignItems="center" sx={{ py: "32px" }}>
          <CircularProgress size={24} />
        </Stack>
      ) : projects.length === 0 && parsed === null ? (
        <EmptyState
          icon={FolderTree}
          message="No use case has the NYC Local Law 144 framework. Add the framework to a use case to start."
          showBorder
        />
      ) : (
        <Stack gap="16px">
          {projects.length > 0 && (
            <Select
              id="aedt-project"
              label="Use case"
              value={projectId ?? ""}
              items={projects.map((p) => ({ _id: p.id, name: p.project_title }))}
              onChange={(e) => {
                setActiveTab("profile");
                navigate(`/bias-audit/${e.target.value}`);
              }}
              sx={{ width: "100%", maxWidth: "420px" }}
            />
          )}
          {projectId !== null && (
            <ProjectWorkspace
              key={projectId}
              projectId={projectId}
              canEdit={canEdit}
              canAttest={canAttest}
              activeTab={activeTab}
              onTabChange={setActiveTab}
            />
          )}
        </Stack>
      )}
    </PageHeaderExtended>
  );
};

interface WorkspaceProps {
  projectId: number;
  canEdit: boolean;
  canAttest: boolean;
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const ProjectWorkspace = ({
  projectId,
  canEdit,
  canAttest,
  activeTab,
  onTabChange,
}: WorkspaceProps) => {
  const profileQuery = useAedtProfile(projectId);
  const questionsQuery = useAedtQuestions(projectId);
  const runsQuery = useAedtRuns(projectId);
  const save = useSaveAedtAnswers(projectId);
  const attest = useAttestAedtProfile(projectId);
  const scope = useGenerateAedtScopeDetermination(projectId);
  // Set when a save or attest succeeded but the profile could not be
  // reloaded after it: the page no longer knows what is saved, so editing
  // stops until a reload.
  const [reloadRequired, setReloadRequired] = useState<"saved" | "attested" | null>(null);
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<number | null>(null);

  const profile = profileQuery.data;
  const runs = runsQuery.data ?? [];

  const tabs: TabItem[] = [
    { label: "Profile", value: "profile", icon: "ClipboardList" },
    { label: "Runs", value: "runs", icon: "Play", count: runs.length },
    {
      label: "Scope determination",
      value: "scope",
      icon: "FileText",
      count: profile?.scopeDeterminations.length ?? 0,
    },
  ];

  if (profileQuery.isLoading || questionsQuery.isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: "32px" }}>
        <CircularProgress size={24} />
      </Stack>
    );
  }

  // A failed background refetch keeps the data it had. Only an explicit
  // refusal (401, 403, or 404: deleted or no longer a member) or a query with
  // no data replaces the page; anything else (network, 408, 429, 5xx) keeps
  // the wizard and an unsaved draft, with a small notice.
  const blocks = (error: unknown, hasData: boolean) => {
    if (!error) return false;
    const { status } = describeAedtError(error);
    return !hasData || status === 401 || status === 403 || status === 404;
  };
  const loadError = blocks(profileQuery.error, Boolean(profile))
    ? profileQuery.error
    : blocks(questionsQuery.error, Boolean(questionsQuery.data))
      ? questionsQuery.error
      : null;
  const refetchFailed = !loadError && Boolean(profileQuery.error ?? questionsQuery.error);
  if (loadError || !profile) {
    const { status, message } = describeAedtError(loadError);
    return (
      <Alert severity="error" sx={{ borderRadius: "4px" }} data-testid="aedt-load-error">
        <Typography sx={{ fontSize: 13 }}>{message}</Typography>
        {status === 404 && (
          <Typography sx={{ fontSize: 13, mt: "4px" }}>
            A use case you are not a member of is reported as not found. Ask its owner or an Admin
            to add you.
          </Typography>
        )}
      </Alert>
    );
  }

  // The hooks refetch the profile on settle, and React Query runs that (and
  // awaits it) before a per-call onSuccess, so the profile query's state
  // here says whether the reload after the write worked.
  const reloadFailed = () =>
    queryClient.getQueryState(aedtQueryKeys.profile(projectId))?.status === "error";

  const handleSave = (answers: AedtAnswerInput[]) => {
    attest.reset();
    save.mutate(answers, {
      onSuccess: () => {
        if (reloadFailed()) setReloadRequired("saved");
      },
    });
  };

  const handleAttest = () => {
    save.reset();
    attest.mutate(undefined, {
      onSuccess: () => {
        if (reloadFailed()) setReloadRequired("attested");
      },
    });
  };

  const actionError = save.error ?? attest.error;
  // Runs and scope determinations act on the attested profile, never on a
  // draft ahead of it, so both are gated on what the attested answers decide.
  const decision = profile.attestedDecision;
  const outOfScope = decision?.readiness.scope === "out_of_scope";

  const runBlockedReason = !profile.attested
    ? "Attest the profile before recording a run. A run records the attested answers it was measured against."
    : outOfScope
      ? "The attested profile places the tool out of scope, so the module does not run its measures. Generate a scope determination instead."
      : null;

  const scopeBlockedReason = !canEdit
    ? "Only an Admin or Editor can generate a scope determination."
    : !profile.attested
      ? "Attest the profile first. A scope determination cites the attested answers."
      : !outOfScope
        ? "A scope determination is available only when the attested answers place the tool out of scope. Otherwise the stance comes from a run."
        : null;

  return (
    <Stack gap="16px">
      {refetchFailed && (
        <Alert severity="warning" sx={{ borderRadius: "4px" }} data-testid="aedt-refetch-error">
          <Typography sx={{ fontSize: 13 }}>
            The latest data could not be refreshed. The page shows what was loaded before.
          </Typography>
        </Alert>
      )}
      <ProfileSummary profile={profile} />

      {/* TabList needs a TabContext ancestor — see style guide § Tabs. */}
      <TabContext value={activeTab}>
        <TabBar
          tabs={tabs}
          activeTab={activeTab}
          onChange={(_, value) => {
            setSelectedRun(null);
            onTabChange(value);
          }}
        />
      </TabContext>

      {activeTab === "profile" && reloadRequired && (
        <Alert
          severity="info"
          sx={{ borderRadius: "4px" }}
          data-testid="aedt-reload-required"
          action={
            <CustomizableButton
              variant="outlined"
              size="small"
              text="Reload the page"
              testId="aedt-reload-page"
              onClick={() => window.location.reload()}
            />
          }
        >
          <Typography sx={{ fontSize: 13 }}>
            {reloadRequired === "saved"
              ? "Your answers were saved. Reload the page to continue."
              : "The profile was attested. Reload the page to continue."}
          </Typography>
        </Alert>
      )}

      {activeTab === "profile" && !reloadRequired && (
        <ProfileWizard
          // Remounts only when the loaded profile's version changes (a save
          // after an attestation files a new version). Inputs are locked
          // while a write is pending and unsaveable edits block Save, so
          // nothing unsaved is on screen when that happens.
          key={`${projectId}:${LL144_FRAMEWORK_ID}:${profile.profile?.version ?? 0}`}
          questions={questionsQuery.data ?? []}
          answers={profile.answers}
          profileStatus={profile.profile?.status ?? null}
          canEdit={canEdit}
          canAttest={canAttest}
          onSave={handleSave}
          onAttest={handleAttest}
          isSaving={save.isPending}
          isAttesting={attest.isPending}
          errorMessage={actionError ? describeAedtError(actionError).message : null}
        />
      )}

      {activeTab === "runs" &&
        (selectedRun !== null ? (
          <RunDetail
            runId={selectedRun}
            canEdit={canEdit}
            canAttest={canAttest}
            onBack={() => setSelectedRun(null)}
          />
        ) : (
          <Stack gap="16px">
            <RunUpload
              projectId={projectId}
              metric={decision?.metric ?? null}
              canEdit={canEdit}
              blockedReason={runBlockedReason}
              onCreated={setSelectedRun}
            />
            <RunsTable
              runs={runs}
              isLoading={runsQuery.isLoading}
              error={runsQuery.error ? describeAedtError(runsQuery.error).message : null}
              onOpen={setSelectedRun}
            />
          </Stack>
        ))}

      {activeTab === "scope" && (
        <StancePanel
          kind="scope"
          stances={profile.scopeDeterminations}
          generateBlockedReason={scopeBlockedReason}
          onGenerate={() => scope.mutate()}
          isGenerating={scope.isPending}
          generateError={scope.error ? describeAedtError(scope.error).message : null}
        />
      )}
    </Stack>
  );
};

/** What a draft's scope is, when it differs from the attested version's. */
const DRAFT_SCOPE_NOTE: Record<AedtReadiness["scope"], string> = {
  out_of_scope: "Your draft answers place the tool out of scope.",
  in_scope: "Your draft answers place the tool in scope.",
  undetermined: "Your draft answers leave scope undetermined.",
};

const ProfileSummary = ({ profile }: { profile: AedtProfileView }) => {
  const formatDate = useFormattedDate();
  const { attested, attestedDecision } = profile;
  const current = profile.profile;
  const draftAhead =
    current && attested && current.status === "draft" && current.id !== attested.id;
  // The attested readiness is what runs and scope determinations act on; the
  // saved answers' readiness stands in only while nothing is attested.
  const readiness = attestedDecision?.readiness ?? profile.readiness;
  const draft = profile.readiness;
  const draftScopeDiffers = draftAhead && attestedDecision && draft.scope !== readiness.scope;
  const draftScoreDiffers =
    draftAhead && !draftScopeDiffers && draft.score !== null && draft.score !== readiness.score;
  const draftDiffers = draftScopeDiffers || draftScoreDiffers;
  const draftAnswers = new Map(profile.answers.map((a) => [a.questionKey, a]));

  return (
    <Box
      sx={{
        ...cardSx,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "1fr 2fr" },
        gap: "16px",
      }}
      data-testid="aedt-profile-summary"
    >
      <Stack gap="8px">
        <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>Profile</Typography>
        {current ? (
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
            <span>Version</span> <span>{current.version}</span>
            <span>{" · "}</span>
            <span>{current.status === "attested" ? "Attested" : "Draft"}</span>
          </Typography>
        ) : (
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
            No answers saved yet
          </Typography>
        )}
        {attested && (
          <Stack direction="row" alignItems="center" gap="8px" flexWrap="wrap">
            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>Attested by</Typography>
            <PersonLabel userId={attested.attestedByUserId} />
            <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
              {formatDate(attested.attestedAt)}
            </Typography>
          </Stack>
        )}
        {draftAhead && !draftDiffers && (
          <Typography sx={{ fontSize: 12, color: palette.status.warning.text }}>
            Runs use the attested version until you attest this draft.
          </Typography>
        )}
      </Stack>

      <Stack gap="8px">
        <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>Readiness</Typography>
        {!attestedDecision && current && (
          <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
            From your saved answers. Nothing is attested yet, so no run or scope determination can
            be recorded.
          </Typography>
        )}
        {readiness.scope === "out_of_scope" ? (
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
            {attestedDecision
              ? "On the attested answers, the tool's output is one input among several with no extra weight. No score is shown; you can generate a scope determination instead of a run."
              : "On your saved answers, the tool's output is one input among several with no extra weight. No score is shown. Attest the profile to generate a scope determination."}
          </Typography>
        ) : readiness.missingVetoes.length > 0 ? (
          // The server's blockedReason quotes raw question keys; name them by title.
          <Box sx={{ color: palette.text.secondary }}>
            <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
              Scope is not established. Answer these deciding questions before a score can be shown:
            </Typography>
            <OpenVetoList
              vetoes={readiness.missingVetoes.map((key) => ({
                key,
                dontKnow: draftAnswers.get(key)?.dontKnow ?? false,
              }))}
            />
          </Box>
        ) : readiness.score === null ? (
          // Not expected (the server scores whenever scope is in), but never
          // render "null%".
          <Typography sx={{ fontSize: 13, color: palette.text.secondary }}>
            No score yet.
          </Typography>
        ) : (
          <Typography sx={{ fontSize: 20, fontWeight: 600, color: palette.text.primary }}>
            {`${readiness.score}%`}
          </Typography>
        )}
        {draftDiffers && (
          <Typography
            component="div"
            sx={{ fontSize: 12, color: palette.status.warning.text }}
            data-testid="aedt-draft-differs"
          >
            {draftScopeDiffers ? (
              <span>{DRAFT_SCOPE_NOTE[draft.scope]}</span>
            ) : (
              <>
                <span>Draft readiness</span> <span>{`${draft.score}%.`}</span>
              </>
            )}{" "}
            <span>
              Runs and scope determinations follow the attested version until you attest the draft.
            </span>
            {/* An undetermined draft names the deciding questions that leave it open, by title. */}
            {draftScopeDiffers && draft.scope === "undetermined" && (
              <>
                {draft.missingVetoes.length > 0 && (
                  <>
                    <Box component="p" sx={{ m: 0, mt: "4px" }}>
                      Deciding questions still open in the draft:
                    </Box>
                    <OpenVetoList
                      vetoes={draft.missingVetoes.map((key) => ({
                        key,
                        dontKnow: draftAnswers.get(key)?.dontKnow ?? false,
                      }))}
                    />
                  </>
                )}
              </>
            )}
          </Typography>
        )}
        <Typography sx={{ fontSize: 12, color: palette.text.tertiary }}>
          The readiness score is VerifyWise&apos;s own measure of how close you are to commissioning
          an independent audit. No regulator recognises it.
        </Typography>
        {/* Open items are work for the wizard, so they follow the answers being edited. */}
        {draft.openItems.length > 0 && (
          <Box>
            <Stack direction="row" alignItems="center" gap="6px">
              <ListChecks size={14} strokeWidth={1.5} color={palette.text.tertiary} />
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: palette.text.tertiary }}>
                {draftAhead ? "Open items in your draft" : "Open items"}
              </Typography>
            </Stack>
            <Box component="ul" sx={{ m: 0, pl: "18px" }}>
              {draft.openItems.map((item) => (
                <Typography
                  component="li"
                  key={item.key}
                  sx={{ fontSize: 12, color: palette.text.tertiary }}
                >
                  {questionTitle(item.key)}
                </Typography>
              ))}
            </Box>
          </Box>
        )}
      </Stack>
    </Box>
  );
};

interface RunsTableProps {
  runs: AedtRunSummary[];
  isLoading: boolean;
  error: string | null;
  onOpen: (runId: number) => void;
}

const RunsTable = ({ runs, isLoading, error, onOpen }: RunsTableProps) => {
  const formatDate = useFormattedDate();
  if (isLoading) {
    return (
      <Stack alignItems="center" sx={{ py: "16px" }}>
        <CircularProgress size={20} />
      </Stack>
    );
  }
  if (error) {
    return (
      <Alert severity="error" sx={{ borderRadius: "4px" }}>
        {error}
      </Alert>
    );
  }
  if (runs.length === 0) {
    return (
      <EmptyState icon={ListChecks} message="No runs recorded for this use case yet." showBorder />
    );
  }
  return (
    <Box sx={{ ...cardSx, p: 0, overflowX: "auto" }}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell sx={headSx}>Recorded</TableCell>
            <TableCell sx={headSx}>Rate computed</TableCell>
            <TableCell sx={headSx} align="right">
              Rows
            </TableCell>
            <TableCell sx={headSx}>Profile version</TableCell>
            <TableCell sx={headSx}>Figures</TableCell>
            <TableCell sx={headSx}>Expires</TableCell>
            <TableCell sx={headSx} />
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.map((r) => (
            <TableRow key={r.id} data-testid={`run-row-${r.id}`}>
              <TableCell sx={cellSx}>{formatDate(r.created_at, { includeTime: true })}</TableCell>
              <TableCell sx={cellSx}>
                {r.metric === "scoring_rate" ? "Scoring rate" : "Selection rate"}
              </TableCell>
              <TableCell sx={cellSx} align="right">
                {r.row_count ?? "—"}
              </TableCell>
              <TableCell sx={cellSx}>{r.profile_version}</TableCell>
              <TableCell sx={cellSx}>{r.has_result ? "Computed" : "Withheld"}</TableCell>
              <TableCell sx={cellSx}>{formatDate(r.expiry_date)}</TableCell>
              <TableCell sx={cellSx} align="right">
                <CustomizableButton
                  variant="outlined"
                  size="small"
                  text="Open"
                  testId={`aedt-open-run-${r.id}`}
                  onClick={() => onOpen(r.id)}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
};

export default BiasAuditPage;
