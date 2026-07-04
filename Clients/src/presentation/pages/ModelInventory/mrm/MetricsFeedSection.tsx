import { useState } from "react";
import {
  Box,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import { Copy } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Chip from "../../../components/Chip";
import Field from "../../../components/Inputs/Field";
import StandardModal from "../../../components/Modals/StandardModal";
import { EmptyState } from "../../../components/EmptyState";
import { displayFormattedDate } from "../../../tools/isoDateToString";
import {
  useCreateIngestionToken,
  useIngestionTokens,
  useRevokeIngestionToken,
  useRotateIngestionToken,
} from "../../../../application/hooks/useMrm";
import { mrmErrorMessage } from "./constants";
import { relativeTime } from "./dateUtils";
import {
  mrmCaptionStyle,
  mrmCodeBlockStyle,
  mrmSectionIntroStyle,
  mrmSubHeadingStyle,
  mrmTableCellStyle,
  mrmTableContainerStyle,
  mrmTableHeadCellStyle,
} from "./mrmStyles";

interface MetricsFeedSectionProps {
  onError: (message: string) => void;
  onSuccess: (message: string) => void;
}

const ENDPOINT_URL = "POST https://your-server/api/mrm/models/{externalModelKey}/metrics";

const EXAMPLE_REQUEST = `# push one metric reading for a model (key in the path)
curl -X POST https://your-server/api/mrm/models/retail-pd-scorecard/metrics \\
  -H "Authorization: Bearer vw_mrm_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "metric": "psi",
    "value": 0.24,
    "at": "2026-07-02T14:00:00Z",
    "window": "daily",
    "segment": "subprime"
  }'`;

const PAYLOAD_FIELDS: { field: string; type: string; required: string; notes: string }[] = [
  {
    field: "metric",
    type: "string",
    required: "Yes",
    notes:
      "A metric key your org has registered. Unknown keys are stored and flagged “no threshold defined”.",
  },
  {
    field: "value",
    type: "number",
    required: "Yes",
    notes: "The raw computed value — stored verbatim, evaluated server-side.",
  },
  {
    field: "at",
    type: "ISO 8601",
    required: "Yes",
    notes: "When the metric pertains to (not send time). Future timestamps are rejected.",
  },
  {
    field: "window",
    type: "string",
    required: "No",
    notes: "e.g. daily / weekly / rolling-30d — avoids comparing incomparable windows.",
  },
  {
    field: "segment",
    type: "string",
    required: "No",
    notes: "Sub-population (e.g. subprime); default “overall”. Thresholds can be segment-specific.",
  },
  {
    field: "context",
    type: "object",
    required: "No",
    notes: "Arbitrary metadata (sample size, source job) — stored for audit, never evaluated.",
  },
];

const MetricsFeedSection = ({ onError, onSuccess }: MetricsFeedSectionProps) => {
  const { data: tokens = [] } = useIngestionTokens();
  const createToken = useCreateIngestionToken();
  const rotateToken = useRotateIngestionToken();
  const revokeToken = useRevokeIngestionToken();

  const [isCreateOpen, setCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState("");
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [busyTokenId, setBusyTokenId] = useState<number | null>(null);

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      onSuccess("Copied to clipboard");
    } catch {
      onError("Could not copy to clipboard");
    }
  };

  const handleCreate = async () => {
    if (!tokenName.trim()) {
      onError("Give the token a name so you can recognise it later.");
      return;
    }
    try {
      const created = await createToken.mutateAsync({ name: tokenName.trim() });
      setCreateOpen(false);
      setTokenName("");
      setPlaintext(created.token);
      onSuccess("Ingestion token created");
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to create ingestion token"));
    }
  };

  const handleRotate = async (id: number) => {
    setBusyTokenId(id);
    try {
      const rotated = await rotateToken.mutateAsync(id);
      setPlaintext(rotated.token);
      onSuccess("Token rotated");
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to rotate token"));
    } finally {
      setBusyTokenId(null);
    }
  };

  const handleRevoke = async (id: number) => {
    setBusyTokenId(id);
    try {
      await revokeToken.mutateAsync(id);
      onSuccess("Token revoked");
    } catch (error) {
      onError(mrmErrorMessage(error, "Failed to revoke token"));
    } finally {
      setBusyTokenId(null);
    }
  };

  return (
    <Box>
      <Typography sx={mrmSectionIntroStyle}>
        One open endpoint. Your monitoring pipeline (Airflow, dbt, cron, notebook &mdash; anything
        that can POST) sends model-performance metrics here. VerifyWise evaluates them against
        thresholds and raises alerts. We never reach into your stack.
      </Typography>

      <Typography sx={mrmSubHeadingStyle}>Endpoint</Typography>
      <Box sx={mrmCodeBlockStyle}>{ENDPOINT_URL}</Box>
      <Typography sx={mrmCaptionStyle}>
        The model key is in the path, not the body &mdash; so one fleet pipeline can push for many
        models by varying the URL. The external model key is a stable key you set once on the model
        inventory record (e.g. retail-pd-scorecard).
      </Typography>

      <Typography sx={mrmSubHeadingStyle}>How to send metrics</Typography>
      <Box
        component="ol"
        sx={{ ...mrmSectionIntroStyle, paddingLeft: "20px", marginBottom: "16px" }}
      >
        <li>Create an ingestion token below (per-org, machine-to-machine, revocable).</li>
        <li>POST a metric event to the model&apos;s URL, per metric, on your own cadence.</li>
        <li>
          VerifyWise evaluates each value against the model&apos;s thresholds and updates the
          Monitoring tab; a breach can flag the model for revalidation.
        </li>
      </Box>

      <Typography sx={mrmSubHeadingStyle}>Example request</Typography>
      <Box sx={{ position: "relative" }}>
        <Box sx={{ position: "absolute", top: "8px", right: "8px", zIndex: 1 }}>
          <CustomizableButton
            variant="outlined"
            size="small"
            text="Copy"
            icon={<Copy size={14} strokeWidth={1.5} />}
            onClick={() => copy(EXAMPLE_REQUEST)}
            testId="mrm-copy-curl-btn"
          />
        </Box>
        <Box sx={mrmCodeBlockStyle}>{EXAMPLE_REQUEST}</Box>
      </Box>
      <Typography sx={mrmCaptionStyle}>
        Re-POSTing the same (metric, at, segment, window) is idempotent (deduped), so retry-safe
        crons are trivial. VerifyWise always re-evaluates thresholds server-side &mdash; a
        client-supplied breach verdict is never accepted.
      </Typography>

      <Typography sx={mrmSubHeadingStyle}>Payload schema</Typography>
      <TableContainer sx={{ ...mrmTableContainerStyle, marginBottom: "24px" }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={mrmTableHeadCellStyle}>Field</TableCell>
              <TableCell sx={mrmTableHeadCellStyle}>Type</TableCell>
              <TableCell sx={mrmTableHeadCellStyle}>Required</TableCell>
              <TableCell sx={mrmTableHeadCellStyle}>Notes</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {PAYLOAD_FIELDS.map((f) => (
              <TableRow key={f.field}>
                <TableCell sx={{ ...mrmTableCellStyle, fontFamily: "monospace" }}>
                  {f.field}
                </TableCell>
                <TableCell sx={mrmTableCellStyle}>{f.type}</TableCell>
                <TableCell sx={mrmTableCellStyle}>{f.required}</TableCell>
                <TableCell sx={mrmTableCellStyle}>{f.notes}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "8px",
        }}
      >
        <Typography sx={{ ...mrmSubHeadingStyle, marginBottom: 0 }}>Ingestion tokens</Typography>
        <CustomizableButton
          variant="contained"
          text="Create ingestion token"
          onClick={() => setCreateOpen(true)}
          testId="mrm-create-token-btn"
        />
      </Box>
      <Typography sx={mrmCaptionStyle}>
        Each token is shown once on creation (only its hash is stored), like an API key. Every
        ingested point records which token wrote it, for the audit trail.
      </Typography>

      {tokens.length === 0 ? (
        <EmptyState message="No ingestion tokens yet. Create one to start pushing metrics." />
      ) : (
        <TableContainer sx={mrmTableContainerStyle}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={mrmTableHeadCellStyle}>Name</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Created</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Last used</TableCell>
                <TableCell sx={mrmTableHeadCellStyle}>Status</TableCell>
                <TableCell sx={mrmTableHeadCellStyle} align="right">
                  Actions
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {tokens.map((token) => {
                const revoked = token.revoked_at != null;
                return (
                  <TableRow key={token.id} hover>
                    <TableCell sx={mrmTableCellStyle}>{token.name}</TableCell>
                    <TableCell sx={mrmTableCellStyle}>
                      {token.created_at ? displayFormattedDate(token.created_at) : "—"}
                    </TableCell>
                    <TableCell sx={mrmTableCellStyle}>
                      {token.last_used_at ? relativeTime(token.last_used_at) : "Never used"}
                    </TableCell>
                    <TableCell sx={mrmTableCellStyle}>
                      <Chip
                        label={revoked ? "Revoked" : "Active"}
                        variant={revoked ? "default" : "success"}
                        uppercase={false}
                      />
                    </TableCell>
                    <TableCell sx={mrmTableCellStyle} align="right">
                      {!revoked && (
                        <Stack direction="row" sx={{ gap: "8px", justifyContent: "flex-end" }}>
                          <CustomizableButton
                            variant="outlined"
                            size="small"
                            text="Rotate"
                            onClick={() => handleRotate(token.id)}
                            isDisabled={
                              busyTokenId === token.id ||
                              rotateToken.isPending ||
                              revokeToken.isPending
                            }
                            testId="mrm-rotate-token-btn"
                          />
                          <CustomizableButton
                            variant="outlined"
                            size="small"
                            text="Revoke"
                            onClick={() => handleRevoke(token.id)}
                            isDisabled={
                              busyTokenId === token.id ||
                              rotateToken.isPending ||
                              revokeToken.isPending
                            }
                            testId="mrm-revoke-token-btn"
                          />
                        </Stack>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <StandardModal
        isOpen={isCreateOpen}
        onClose={() => {
          setCreateOpen(false);
          setTokenName("");
        }}
        title="Create ingestion token"
        description="Name a machine-to-machine token your pipeline will use to push metrics."
        onSubmit={handleCreate}
        submitButtonText="Create"
        isSubmitting={createToken.isPending}
        fitContent
      >
        <Stack sx={{ gap: "48px" }}>
          <Field
            id="mrm-token-name"
            label="Token name"
            placeholder="e.g. Airflow (prod)"
            isRequired
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
          />
        </Stack>
      </StandardModal>

      <StandardModal
        isOpen={plaintext != null}
        onClose={() => setPlaintext(null)}
        title="Copy your token now"
        description="This is the only time the token is shown. Store it securely — it cannot be retrieved again."
        submitButtonText="Done"
        onSubmit={() => setPlaintext(null)}
        fitContent
      >
        <Stack sx={{ gap: "16px" }}>
          <Box sx={mrmCodeBlockStyle}>{plaintext ?? ""}</Box>
          <Box>
            <CustomizableButton
              variant="outlined"
              text="Copy token"
              icon={<Copy size={14} strokeWidth={1.5} />}
              onClick={() => plaintext && copy(plaintext)}
              testId="mrm-copy-token-btn"
            />
          </Box>
        </Stack>
      </StandardModal>
    </Box>
  );
};

export default MetricsFeedSection;
