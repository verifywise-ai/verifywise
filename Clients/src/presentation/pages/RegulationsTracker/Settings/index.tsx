/**
 * @fileoverview Regulations Tracker — Settings tab.
 *
 * Admin-only configuration of who receives regulation-change notifications:
 * an organization-user multi-select plus free-text email entry. Changes
 * auto-save (debounced) via the settings mutation.
 *
 * @module pages/RegulationsTracker/Settings
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Box, Stack, Typography, CircularProgress } from "@mui/material";
import ChipInput from "../../../components/Inputs/ChipInput";
import AutoCompleteField from "../../../components/Inputs/Autocomplete";
import { Lock } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { palette } from "../../../themes/palette";
import {
  useSettings,
  useUpdateSettings,
} from "../../../../application/hooks/useRegulationsTracker";
import useUsers from "../../../../application/hooks/useUsers";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useTrackerAlert } from "../useTrackerAlert";

interface UserOption {
  id: number;
  label: string;
}

export default function Settings() {
  const { userRoleName, isSuperAdmin } = useAuth();
  const isAdmin = isSuperAdmin || userRoleName === "Admin" || userRoleName === "SuperAdmin";

  const { data: settingsData, isLoading: settingsLoading } = useSettings();
  const { users, loading: usersLoading } = useUsers();
  const updateSettings = useUpdateSettings();
  const { showError, AlertSlot } = useTrackerAlert();

  const [recipientUserIds, setRecipientUserIds] = useState<number[]>([]);
  const [recipientEmails, setRecipientEmails] = useState<string[]>([]);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => {
    if (!justSaved) return undefined;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);

  const hydratedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate local state from saved settings once they arrive.
  // Guard setState behind value comparison to avoid echo-loop with auto-save.
  useEffect(() => {
    if (settingsData?.data) {
      const nextUserIds: number[] = settingsData.data.recipient_user_ids ?? [];
      const nextEmails: string[] = settingsData.data.recipient_emails ?? [];
      setRecipientUserIds((prev) =>
        prev.length === nextUserIds.length && prev.every((v, i) => v === nextUserIds[i])
          ? prev
          : nextUserIds,
      );
      setRecipientEmails((prev) =>
        prev.length === nextEmails.length && prev.every((v, i) => v === nextEmails[i])
          ? prev
          : nextEmails,
      );
    }
  }, [settingsData]);

  // Debounced auto-save on any change (after initial hydration).
  useEffect(() => {
    if (!isAdmin) return;
    if (!hydratedRef.current) {
      hydratedRef.current = true;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      updateSettings.mutate(
        { recipient_user_ids: recipientUserIds, recipient_emails: recipientEmails },
        {
          onSuccess: () => setJustSaved(true),
          onError: () => showError("We couldn't save your recipient changes. Please try again."),
        },
      );
    }, 600);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // updateSettings is stable from React Query; intentionally excluded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipientUserIds, recipientEmails, isAdmin]);

  const userOptions: UserOption[] = useMemo(
    () =>
      (users ?? []).map((u) => ({
        id: u.id,
        label: [u.name, u.surname].filter(Boolean).join(" ") || u.email || `User ${u.id}`,
      })),
    [users],
  );

  const selectedUsers = useMemo(
    () => userOptions.filter((o) => recipientUserIds.includes(o.id)),
    [userOptions, recipientUserIds],
  );

  if (!isAdmin) {
    return (
      <PageHeaderExtended
        title="Settings"
        description="Regulations Tracker notification settings."
        breadcrumbItems={[{ label: "Settings" }]}
        helpArticlePath="regulations-tracker/settings"
      >
        <EmptyState
          icon={Lock}
          message="Only administrators can change Regulations Tracker notification settings."
          showBorder
        />
      </PageHeaderExtended>
    );
  }

  return (
    <PageHeaderExtended
      title="Settings"
      description="Choose who receives a notification when a tracked country's regulations change. If no recipients are set, no digest is sent."
      breadcrumbItems={[{ label: "Settings" }]}
      helpArticlePath="regulations-tracker/settings"
    >
      {AlertSlot}
      {settingsLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={24} sx={{ color: palette.brand.primary }} />
        </Box>
      ) : (
        <Stack gap="24px" sx={{ maxWidth: 560 }}>
          {/* Cadence note */}
          <Box
            sx={{
              border: `1px solid ${palette.border.dark}`,
              borderRadius: "4px",
              backgroundColor: palette.background.accent,
              p: "12px 16px",
            }}
          >
            <Typography sx={{ fontSize: "13px", color: palette.text.secondary, lineHeight: 1.6 }}>
              The regulations feed is checked automatically. Recipients are notified only when a
              tracked country&apos;s regulations change materially — no manual checks needed.
              {settingsData?.data?.last_run_at && (
                <Box component="span" sx={{ color: palette.text.tertiary }}>
                  {" "}
                  Last checked: {settingsData.data.last_run_at}.
                </Box>
              )}
            </Typography>
          </Box>

          <AutoCompleteField
            multiple
            label="Recipients"
            id="regulations-tracker-recipient-users"
            options={userOptions}
            value={selectedUsers}
            loading={usersLoading}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, val) => option.id === val.id}
            onChange={(_e, value) => setRecipientUserIds(value.map((v) => v.id))}
            placeholder={usersLoading ? "Loading team members…" : "Select team members"}
          />

          <ChipInput
            id="regulations-tracker-recipient-emails"
            label="Additional emails"
            value={recipientEmails}
            onChange={setRecipientEmails}
            placeholder="Type an email and press Enter"
          />

          <Stack direction="row" alignItems="center" gap="8px" sx={{ minHeight: 16 }}>
            <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
              Changes are saved automatically.
            </Typography>
            {updateSettings.isPending && (
              <Stack direction="row" alignItems="center" gap="4px">
                <CircularProgress size={10} sx={{ color: palette.text.tertiary }} />
                <Typography sx={{ fontSize: "12px", color: palette.text.tertiary }}>
                  Saving…
                </Typography>
              </Stack>
            )}
            {!updateSettings.isPending && justSaved && (
              <Typography sx={{ fontSize: "12px", color: palette.brand.primary }}>Saved</Typography>
            )}
          </Stack>
        </Stack>
      )}
    </PageHeaderExtended>
  );
}
