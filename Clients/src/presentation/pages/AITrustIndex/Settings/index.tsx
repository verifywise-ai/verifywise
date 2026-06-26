/**
 * @fileoverview AI Trust Index — Settings tab.
 *
 * Admin-only configuration of who receives change-notification digests:
 * an organization-user multi-select plus free-text email entry. Changes
 * auto-save (debounced) via the settings mutation.
 *
 * @module pages/AITrustIndex/Settings
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { Box, Stack, Typography, CircularProgress } from "@mui/material";
import ChipInput from "../../../components/Inputs/ChipInput";
import AutoCompleteField from "../../../components/Inputs/Autocomplete";
import { Lock } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { palette } from "../../../themes/palette";
import { useSettings, useUpdateSettings } from "../../../../application/hooks/useAiTrustIndex";
import useUsers from "../../../../application/hooks/useUsers";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useTrustIndexAlert } from "../useTrustIndexAlert";

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
  const { showError, AlertSlot } = useTrustIndexAlert();

  const [recipientUserIds, setRecipientUserIds] = useState<number[]>([]);
  const [recipientEmails, setRecipientEmails] = useState<string[]>([]);
  // Brief "Saved" confirmation so a successful auto-save is distinguishable from
  // nothing happening. Cleared after a couple of seconds.
  const [justSaved, setJustSaved] = useState(false);
  useEffect(() => {
    if (!justSaved) return undefined;
    const t = setTimeout(() => setJustSaved(false), 2000);
    return () => clearTimeout(t);
  }, [justSaved]);
  // Skip the very first auto-save so loading the saved value doesn't trigger a write.
  const hydratedRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate local state from the saved settings once they arrive.
  // Guard each setState behind a value comparison so a post-save refetch of
  // identical settings doesn't produce a fresh array reference that would
  // re-trigger the auto-save effect (which would echo-loop the "Saving…" state).
  useEffect(() => {
    if (settingsData?.data) {
      const nextUserIds = settingsData.data.recipientUserIds ?? [];
      const nextEmails = settingsData.data.recipientEmails ?? [];
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
        { recipientUserIds, recipientEmails },
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
        description="AI Trust Index notification settings."
        breadcrumbItems={[{ label: "Settings" }]}
        helpArticlePath="ai-trust-index/settings"
      >
        <EmptyState
          icon={Lock}
          message="Only administrators can change AI Trust Index notification settings."
          showBorder
        />
      </PageHeaderExtended>
    );
  }

  return (
    <PageHeaderExtended
      title="Settings"
      description="Choose who receives a notification when a tracked app's assessment changes materially. If no recipients are set, no digest is sent."
      breadcrumbItems={[{ label: "Settings" }]}
      helpArticlePath="ai-trust-index/settings"
    >
      {AlertSlot}
      {settingsLoading ? (
        <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
          <CircularProgress size={24} sx={{ color: palette.brand.primary }} />
        </Box>
      ) : (
        <Stack gap="24px" sx={{ maxWidth: 560 }}>
          {/* Cadence note — reassures the admin the index runs automatically and
              shows when it last ran (from the global sync metadata). */}
          <Box
            sx={{
              border: `1px solid ${palette.border.dark}`,
              borderRadius: "4px",
              backgroundColor: palette.background.accent,
              p: "12px 16px",
            }}
          >
            <Typography sx={{ fontSize: "13px", color: palette.text.secondary, lineHeight: 1.6 }}>
              The AI Trust Index is checked automatically every week (Monday). Recipients are
              emailed only when a tracked app&apos;s assessment changes materially — no manual
              checks needed.
              {settingsData?.data?.lastRunWeek && (
                <Box component="span" sx={{ color: palette.text.tertiary }}>
                  {" "}
                  Last checked: {settingsData.data.lastRunWeek}.
                </Box>
              )}
            </Typography>
          </Box>

          <AutoCompleteField
            multiple
            label="Recipients"
            id="ai-trust-index-recipient-users"
            options={userOptions}
            value={selectedUsers}
            loading={usersLoading}
            getOptionLabel={(option) => option.label}
            isOptionEqualToValue={(option, val) => option.id === val.id}
            onChange={(_e, value) => setRecipientUserIds(value.map((v) => v.id))}
            placeholder={usersLoading ? "Loading team members…" : "Select team members"}
          />

          <ChipInput
            id="ai-trust-index-recipient-emails"
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
