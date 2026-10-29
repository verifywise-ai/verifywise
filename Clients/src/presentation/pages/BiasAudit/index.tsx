import { useEffect, useMemo, useState } from "react";
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
import { ArrowRight, FolderTree, ListChecks } from "lucide-react";
import { PageHeaderExtended } from "../../components/Layout/PageHeaderExtended";
import Select from "../../components/Inputs/Select";
import { EmptyState } from "../../components/EmptyState";
import { CustomizableButton } from "../../components/button/customizable-button";
import { useProjects } from "../../../application/hooks/useProjects";
import { useAuth } from "../../../application/hooks/useAuth";
import { useBiasAuditSidebarContextSafe } from "../../../application/contexts/BiasAuditSidebar.context";
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
import GenerateCorpus from "./GenerateCorpus";
import RunDetail from "./RunDetail";
import StancePanel from "./StancePanel";
import { RatioTrendSection } from "./RatioTrend";
import PersonLabel from "./PersonLabel";
import OpenVetoList from "./OpenVetoList";
import { questionTitle } from "./intakeLayout";
import { cardSx, cellSx, headSx, helperSx, labelSx } from "./styles";
import { parseSection, sectionPath, type BiasAuditSection } from "./sections";

/**
 * NYC Local Law 144 bias audit module: the profile intake, runs against an
 * uploaded dataset, and the stance documents generated from them. It is a
 * self-administered test, and every page says what it can and cannot stand
 * for. Independent of the Evals dashboard's bias audit, which keeps its own
 * entry. The section comes from the URL; the module sidebar links to it.
 */
const BiasAuditPage = () => {
  const { projectId: projectParam, section: sectionParam } = useParams<{
    projectId?: string;
    section?: string;
  }>();
  const navigate = useNavigate();
  const { userRoleName } = useAuth();
  const { approvedProjects, isLoading: projectsLoading } = useProjects();
  const sidebar = useBiasAuditSidebarContextSafe();
  const activeSection = parseSection(sectionParam);

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

  // With a use case, ProjectWorkspace publishes it with its counts.
  const setSidebarSummary = sidebar?.setSummary;
  useEffect(() => {
    if (projectId === null) setSidebarSummary?.({ projectId: null, runsCount: 0, scopeCount: 0 });
  }, [projectId, setSidebarSummary]);

  return (
    <PageHeaderExtended
      title="LL 144 bias audit"
      description="Check your hiring tool against NYC Local Law 144 before the independent audit. Results are for your internal use. A self-run test is not a bias audit under the law."
    >
      {projectsLoading ? (
        <Stack alignItems="center" sx={{ py: "32px" }}>
          <CircularProgress size={24} />
        </Stack>
      ) : projects.length === 0 && parsed === null ? (
        <EmptyState
          icon={FolderTree}
          message="To start, open a use case, go to its settings and add the NYC Local Law 144 framework."
          showBorder
        >
          <CustomizableButton
            variant="contained"
            text="Go to use cases"
            testId="aedt-go-to-use-cases"
            onClick={() => navigate("/overview")}
          />
        </EmptyState>
      ) : (
        <Stack gap="16px">
          {projects.length > 0 && (
            <Select
              id="aedt-project"
              label="Use case"
              value={projectId ?? ""}
              items={projects.map((p) => ({ _id: p.id, name: p.project_title }))}
              onChange={(e) => navigate(sectionPath(Number(e.target.value), "profile"))}
              sx={{ width: "100%", maxWidth: "420px" }}
            />
          )}
          {projectId !== null && (
            <ProjectWorkspace
              key={projectId}
              projectId={projectId}
              canEdit={canEdit}
              canAttest={canAttest}
              activeSection={activeSection}
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
  activeSection: BiasAuditSection;
}

const ProjectWorkspace = ({ projectId, canEdit, canAttest, activeSection }: WorkspaceProps) => {
  const navigate = useNavigate();
  const profileQuery = useAedtProfile(projectId);
  const questionsQuery = useAedtQuestions(projectId);
  const runsQuery = useAedtRuns(projectId);
  const save = useSaveAedtAnswers(projectId);
  const attest = useAttestAedtProfile(projectId);
  const scope = useGenerateAedtScopeDetermination(projectId);
  // Set when a save or attest succeeded but the profile could not be
  // reloaded after it: the page does not know what is saved, so the wizard
  // is hidden until the profile loads again, which clears it.
  const [reloadRequired, setReloadRequired] = useState<"saved" | "attested" | null>(null);
  if (reloadRequired && profileQuery.status === "success") setReloadRequired(null);
  const queryClient = useQueryClient();
  const [selectedRun, setSelectedRun] = useState<number | null>(null);
  // Opening a section from the sidebar starts it at its list, as the tabs did.
  const [shownSection, setShownSection] = useState(activeSection);
  if (shownSection !== activeSection) {
    setShownSection(activeSection);
    setSelectedRun(null);
  }

  const profile = profileQuery.data;
  const runs = runsQuery.data ?? [];
  const runsCount = runs.length;
  const scopeCount = profile?.scopeDeterminations.length ?? 0;

  const setSidebarSummary = useBiasAuditSidebarContextSafe()?.setSummary;
  useEffect(() => {
    setSidebarSummary?.({ projectId, runsCount, scopeCount });
  }, [projectId, runsCount, scopeCount, setSidebarSummary]);

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

  const handleSave = (answers: AedtAnswerInput[], onSaved: () => void) => {
    attest.reset();
    save.mutate(answers, {
      onSuccess: () => {
        onSaved();
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
    ? "Attest the profile before recording a run."
    : outOfScope
      ? "On the attested answers the tool is out of scope, so there is nothing to measure. Record a scope determination instead."
      : null;

  // A corpus becomes a run, and an out-of-scope profile records no runs, so
  // generation is closed with them.
  const generateBlockedReason = !decision
    ? "Attest the profile first."
    : outOfScope
      ? "On the attested answers the tool is out of scope, so there is nothing to test."
      : decision.mayGenerate
        ? null
        : decision.generationBlocked.join("; ");

  const scopeBlockedReason = !canEdit
    ? "Only an Admin or Editor can generate a scope determination."
    : !profile.attested
      ? "Attest the profile first. A scope determination cites the attested answers."
      : !outOfScope
        ? "A scope determination is available only when the attested answers place the tool out of scope. Otherwise the stance comes from a run."
        : null;

  const nextStep = nextStepFor(profile, runsCount);

  return (
    <Stack gap="16px">
      {reloadRequired && (
        <Alert
          severity="warning"
          sx={{ borderRadius: "4px" }}
          data-testid="aedt-reload-required"
          action={
            <CustomizableButton
              variant="outlined"
              size="small"
              text="Try again"
              testId="aedt-reload-profile"
              onClick={() => void profileQuery.refetch()}
            />
          }
        >
          <Typography sx={{ fontSize: 13 }}>
            {reloadRequired === "saved"
              ? "Your answers were saved, but the profile could not be reloaded."
              : "The profile was attested, but it could not be reloaded."}
          </Typography>
        </Alert>
      )}
      {refetchFailed && !reloadRequired && (
        <Alert severity="warning" sx={{ borderRadius: "4px" }} data-testid="aedt-refetch-error">
          <Typography sx={{ fontSize: 13 }}>
            The latest data could not be refreshed. The page shows what was loaded before.
          </Typography>
        </Alert>
      )}
      <ProfileSummary
        profile={profile}
        nextStep={nextStep}
        onGo={
          nextStep.section === activeSection
            ? null
            : () => navigate(sectionPath(projectId, nextStep.section))
        }
      />

      {activeSection === "profile" && !reloadRequired && (
        // No key: the wizard overlays its edits on whatever answers the
        // profile query holds, so a new version or a refetch updates them in
        // place and never drops an unsaved edit.
        <ProfileWizard
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

      {activeSection === "generate" && (
        <GenerateCorpus
          projectId={projectId}
          canEdit={canEdit}
          mayGenerate={generateBlockedReason === null}
          blockedReason={generateBlockedReason}
        />
      )}

      {activeSection === "runs" &&
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
            {runsCount > 1 && <RatioTrendSection projectId={projectId} />}
          </Stack>
        ))}

      {activeSection === "scope" && (
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

interface NextStep {
  section: BiasAuditSection;
  text: string;
  action: string;
}

/** The one thing to do next, from the profile and the runs recorded so far. */
function nextStepFor(profile: AedtProfileView, runsCount: number): NextStep {
  const current = profile.profile;
  const decision = profile.attestedDecision;
  if (!current) {
    return { section: "profile", text: "Answer the profile questions.", action: "Open profile" };
  }
  if (!decision) {
    return profile.readiness.missingVetoes.length > 0
      ? {
          section: "profile",
          text: "Answer the required questions, then attest the profile.",
          action: "Open profile",
        }
      : {
          section: "profile",
          text: "Attest the profile. An Admin confirms the answers as your position.",
          action: "Open profile",
        };
  }
  if (decision.readiness.scope === "out_of_scope") {
    return {
      section: "scope",
      text: "The tool is out of scope on your answers. Record a scope determination.",
      action: "Open scope determination",
    };
  }
  if (runsCount === 0) {
    return {
      section: "generate",
      text: "Generate test candidates, score them in your platform, then upload the scores as a run.",
      action: "Generate test candidates",
    };
  }
  return {
    section: "runs",
    text: "Record a run for this month to keep your results current.",
    action: "Open runs",
  };
}

interface ProfileSummaryProps {
  profile: AedtProfileView;
  nextStep: NextStep;
  /** Opens the next step's section; null when the page already shows it. */
  onGo: (() => void) | null;
}

const ProfileSummary = ({ profile, nextStep, onGo }: ProfileSummaryProps) => {
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
        gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1.4fr" },
        gap: "24px",
      }}
      data-testid="aedt-profile-summary"
    >
      <Stack gap="4px">
        <Typography sx={labelSx}>Profile</Typography>
        {current ? (
          <Typography sx={valueSx}>
            <span>Version</span> <span>{current.version}</span>
            <span>{" · "}</span>
            <span>{current.status === "attested" ? "Attested" : "Draft"}</span>
          </Typography>
        ) : (
          <Typography sx={valueSx}>No answers saved yet</Typography>
        )}
        {attested && (
          <Stack direction="row" alignItems="center" gap="6px" flexWrap="wrap">
            <Typography sx={helperSx}>Attested by</Typography>
            <PersonLabel userId={attested.attestedByUserId} />
            <Typography sx={helperSx}>{formatDate(attested.attestedAt)}</Typography>
          </Stack>
        )}
        {draftAhead && !draftDiffers && (
          <Typography sx={{ ...helperSx, color: palette.status.warning.text }}>
            Runs use the attested version until you attest this draft.
          </Typography>
        )}
      </Stack>

      <Stack gap="4px">
        <Typography sx={labelSx}>Readiness</Typography>
        {readiness.scope === "out_of_scope" ? (
          <>
            <Typography sx={valueSx}>Out of scope</Typography>
            <Typography sx={helperSx}>
              The output is one input among several with no extra weight.
            </Typography>
          </>
        ) : readiness.missingVetoes.length > 0 ? (
          // The server's blockedReason quotes raw question keys; name them by title.
          <Box sx={{ color: palette.text.tertiary }}>
            <Typography sx={valueSx}>Not established yet</Typography>
            <Typography sx={helperSx}>Required questions still open:</Typography>
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
          <Typography sx={valueSx}>No score yet</Typography>
        ) : (
          <>
            <Typography sx={{ fontSize: 22, fontWeight: 600, color: palette.text.primary }}>
              {`${readiness.score}%`}
            </Typography>
            <Typography sx={helperSx}>
              VerifyWise&apos;s own measure of audit readiness, not a legal test.
            </Typography>
          </>
        )}
        {!attestedDecision && current && (
          <Typography sx={helperSx}>From your saved answers. Nothing is attested yet.</Typography>
        )}
        {draftDiffers && (
          <Typography
            component="div"
            sx={{ ...helperSx, color: palette.status.warning.text }}
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
            {/* An undetermined draft names the required questions that leave it open, by title. */}
            {draftScopeDiffers &&
              draft.scope === "undetermined" &&
              draft.missingVetoes.length > 0 && (
                <>
                  <Box component="p" sx={{ m: 0, mt: "4px" }}>
                    Required questions still open in the draft:
                  </Box>
                  <OpenVetoList
                    vetoes={draft.missingVetoes.map((key) => ({
                      key,
                      dontKnow: draftAnswers.get(key)?.dontKnow ?? false,
                    }))}
                  />
                </>
              )}
          </Typography>
        )}
        {/* Open items are work for the wizard, so they follow the answers being edited. */}
        {draft.openItems.length > 0 && (
          <Typography sx={helperSx} data-testid="aedt-open-items">
            <span>{draftAhead ? "Open items in your draft:" : "Open items:"}</span>{" "}
            <span>{draft.openItems.map((item) => questionTitle(item.key)).join(", ")}</span>
          </Typography>
        )}
      </Stack>

      <Stack
        gap="8px"
        alignItems="flex-start"
        sx={{
          borderLeft: { md: `1px solid ${palette.border.light}` },
          pl: { md: "24px" },
        }}
        data-testid="aedt-next-step"
      >
        <Typography sx={labelSx}>Next step</Typography>
        <Typography sx={{ fontSize: 13, color: palette.text.primary }}>{nextStep.text}</Typography>
        {onGo && (
          <CustomizableButton
            variant="contained"
            size="small"
            text={nextStep.action}
            testId="aedt-next-step-go"
            endIcon={<ArrowRight size={14} strokeWidth={1.5} />}
            onClick={onGo}
          />
        )}
      </Stack>
    </Box>
  );
};

const valueSx = { fontSize: 15, fontWeight: 600, color: palette.text.primary } as const;

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
            <TableCell sx={headSx}>Rate</TableCell>
            <TableCell sx={headSx} align="right">
              Rows
            </TableCell>
            <TableCell sx={headSx}>Profile version</TableCell>
            <TableCell sx={headSx}>Results</TableCell>
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
              <TableCell sx={cellSx}>{r.has_result ? "Calculated" : "Withheld"}</TableCell>
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
