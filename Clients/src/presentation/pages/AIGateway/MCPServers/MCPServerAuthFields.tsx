import { useState, Dispatch, SetStateAction } from "react";
import { Stack, Typography } from "@mui/material";
import Field from "../../../components/Inputs/Field";
import Select from "../../../components/Inputs/Select";
import { VWLink } from "../../../components/Link/VWLink";
import palette from "../../../themes/palette";
import { useTranslation } from "../../../../application/hooks/useTranslation";
import { fill } from "../../../../i18n/fill";

export interface ServerForm {
  name: string;
  slug: string;
  url: string;
  auth_type: string;
  auth_token: string;
  auth_header_name: string;
  auth_api_key: string;
  oauth_client_id: string;
  oauth_client_secret: string;
  oauth_token_url: string;
  oauth_token_url_source: "manual" | "discovered";
  oauth_scope: string;
  oauth_resource: string;
  // Empty while editing: the API never returns the stored method, so an empty
  // value means "leave it as saved".
  oauth_auth_method: string;
  aws_region: string;
  aws_access_key_id: string;
  aws_secret_access_key: string;
  description: string;
}

export interface AuthEditingServer {
  auth_header?: string;
  auth_secret_hint?: string;
}

interface Props {
  form: ServerForm;
  setForm: Dispatch<SetStateAction<ServerForm>>;
  editingServer?: AuthEditingServer;
  keepsStoredSecret: boolean;
  onFindTokenUrl: () => void;
  findingTokenUrl: boolean;
  tokenUrlNote: string;
}

const hintSx = { fontSize: 11, color: palette.text.tertiary };

const AUTH_METHOD_ITEMS = [
  { _id: "client_secret_basic", name: "Basic (header)" },
  { _id: "client_secret_post", name: "In request body" },
];

export default function MCPServerAuthFields({
  form,
  setForm,
  editingServer,
  keepsStoredSecret,
  onFindTokenUrl,
  findingTokenUrl,
  tokenUrlNote,
}: Props) {
  const { t } = useTranslation();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const hint = keepsStoredSecret ? editingServer?.auth_secret_hint : undefined;
  const keepSecretHint = fill(t("Current secret: {hint}. Leave blank to keep it."), {
    hint: hint ?? "",
  });
  const keepKeyHint = fill(t("Current key: {hint}. Leave blank to keep it."), { hint: hint ?? "" });
  const set = (patch: Partial<ServerForm>) => setForm((p) => ({ ...p, ...patch }));

  if (form.auth_type === "bearer") {
    return (
      <>
        <Field
          label="Bearer token"
          placeholder="Enter the bearer token"
          value={form.auth_token}
          onChange={(e) => set({ auth_token: e.target.value })}
          isRequired={!keepsStoredSecret}
        />
        {hint && (
          <Typography sx={hintSx}>{`Current token: ${hint}. Leave blank to keep it.`}</Typography>
        )}
      </>
    );
  }

  if (form.auth_type === "api_key") {
    return (
      <>
        <Field
          label="Header name"
          placeholder="e.g., X-API-Key (defaults to X-API-Key)"
          value={form.auth_header_name}
          onChange={(e) => set({ auth_header_name: e.target.value })}
        />
        <Field
          label="API key"
          placeholder="Enter the API key value"
          value={form.auth_api_key}
          onChange={(e) => set({ auth_api_key: e.target.value })}
          isRequired={!keepsStoredSecret}
        />
        {hint && (
          <Typography sx={hintSx}>{`Current key: ${hint}. Leave blank to keep it.`}</Typography>
        )}
      </>
    );
  }

  if (form.auth_type === "oauth") {
    return (
      <>
        <Field
          label="Client ID"
          value={form.oauth_client_id}
          onChange={(e) => set({ oauth_client_id: e.target.value })}
          isRequired
        />
        <Field
          label="Client secret"
          type="password"
          value={form.oauth_client_secret}
          onChange={(e) => set({ oauth_client_secret: e.target.value })}
          isRequired={!keepsStoredSecret}
        />
        {hint && <Typography sx={hintSx}>{keepSecretHint}</Typography>}
        <Field
          label="Scope (optional)"
          value={form.oauth_scope}
          onChange={(e) => set({ oauth_scope: e.target.value })}
        />
        <Field
          label="Token URL"
          placeholder="e.g., https://auth.example.com/oauth2/token"
          value={form.oauth_token_url}
          onChange={(e) =>
            set({ oauth_token_url: e.target.value, oauth_token_url_source: "manual" })
          }
          isRequired
        />
        <Stack direction="row" alignItems="center" gap="8px">
          <VWLink
            onClick={(e) => {
              // A link-styled button inside the modal's form would submit it.
              e.preventDefault();
              onFindTokenUrl();
            }}
            showUnderline
          >
            {findingTokenUrl ? t("Finding token URL...") : t("Find token URL")}
          </VWLink>
        </Stack>
        {tokenUrlNote && <Typography sx={hintSx}>{tokenUrlNote}</Typography>}
        <VWLink
          onClick={(e) => {
            e.preventDefault();
            setShowAdvanced((v) => !v);
          }}
          showUnderline={false}
          ariaExpanded={showAdvanced}
        >
          {t("Advanced")}
        </VWLink>
        {showAdvanced && (
          <>
            <Select
              id="oauth_auth_method"
              label="Client authentication"
              placeholder="Keep current setting"
              value={form.oauth_auth_method}
              items={AUTH_METHOD_ITEMS}
              onChange={(e) => set({ oauth_auth_method: e.target.value as string })}
              getOptionValue={(item) => item._id}
            />
            <Field
              label="Resource (optional)"
              value={form.oauth_resource}
              onChange={(e) => set({ oauth_resource: e.target.value })}
            />
          </>
        )}
      </>
    );
  }

  if (form.auth_type === "aws_iam") {
    return (
      <>
        <Field
          label="Region"
          placeholder="e.g., us-east-1"
          value={form.aws_region}
          onChange={(e) => set({ aws_region: e.target.value })}
          isRequired
        />
        <Field
          label="Access key ID"
          value={form.aws_access_key_id}
          onChange={(e) => set({ aws_access_key_id: e.target.value })}
          isRequired
        />
        <Field
          label="Secret access key"
          type="password"
          value={form.aws_secret_access_key}
          onChange={(e) => set({ aws_secret_access_key: e.target.value })}
          isRequired={!keepsStoredSecret}
        />
        {hint && <Typography sx={hintSx}>{keepKeyHint}</Typography>}
        <Typography sx={hintSx}>
          Use the long-term access key of an IAM user with the AWSMCPSignInOAuthAccessPolicy policy.
          Tool calls run with that user's permissions.
        </Typography>
      </>
    );
  }

  return null;
}
