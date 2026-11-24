import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { Box, CircularProgress, Stack, Typography } from "@mui/material";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Alert from "../../../components/Alert";
import StandardModal from "../../../components/Modals/StandardModal";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import Field from "../../../components/Inputs/Field";
import { VWLink } from "../../../components/Link";
import { textStyles } from "../../../themes/typography";
import { palette as vwPalette, radiusPx, text } from "../../../themes/palette";
import { useCanCheck } from "../../../../application/hooks/useCan";
import useTranslation from "../../../../application/hooks/useTranslation";
import {
  useRemoveVendorResearchSearchKey,
  useSaveVendorResearchSearchKey,
  useVendorResearchSearchKey,
} from "../../../../application/hooks/useVendorResearch";
import { readVendorResearchError } from "../../../../application/repository/vendorResearch.repository";
import { SEARCH_KEY_ADD_PARAM } from "../../../../application/constants/llmKeyDeepLink";
import { fill } from "../../../../i18n/fill";

/** Where Brave sells its Search API keys. */
const BRAVE_API_URL = "https://brave.com/search/api/";

/** Why a key was not saved: Brave rejected it, Brave could not be reached, or anything else. */
type SaveFailure = "invalid_key" | "unreachable" | "other";

interface NoticeState {
  variant: "success" | "error";
  body: string;
}

/**
 * The organization's Brave Search API key, on Settings > API keys under the LLM keys. Vendor
 * research searches the news with it whenever the research LLM key has no search of its own (any
 * key but an Anthropic key); without it the news comes from the GDELT Project. Admins only
 * (`llmKeys.admin`, like the LLM keys): everyone else sees nothing, and the server answers them
 * with a 403.
 *
 * The server checks a key with Brave before storing it. A key Brave rejects is never stored; a key
 * Brave could not be reached to check can be saved anyway. Only the last 4 characters come back.
 * `?addSearchKey=1` (the research settings window's link) opens the form once, then leaves the URL.
 */
const SearchKey = () => {
  const { t } = useTranslation();
  const can = useCanCheck();
  const isAdmin = can("llmKeys.admin");
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = useVendorResearchSearchKey(isAdmin);
  const save = useSaveVendorResearchSearchKey();
  const remove = useRemoveVendorResearchSearchKey();

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isRemoveOpen, setIsRemoveOpen] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [failure, setFailure] = useState<SaveFailure | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);

  useEffect(() => {
    if (searchParams.get(SEARCH_KEY_ADD_PARAM) !== "1") return;
    if (isAdmin) setIsFormOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete(SEARCH_KEY_ADD_PARAM);
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, isAdmin]);

  useEffect(() => {
    if (!notice) return undefined;
    const timeoutId = setTimeout(() => setNotice(null), 3000);
    return () => clearTimeout(timeoutId);
  }, [notice]);

  const closeForm = useCallback(() => {
    setIsFormOpen(false);
    setKeyValue("");
    setFailure(null);
  }, []);

  const submit = useCallback(
    async (skipCheck: boolean) => {
      const key = keyValue.trim();
      if (!key || save.isPending) return;
      setFailure(null);
      try {
        await save.mutateAsync(skipCheck ? { key, skipCheck: true } : { key });
      } catch (error) {
        const code = readVendorResearchError(error).code;
        setFailure(code === "invalid_key" || code === "unreachable" ? code : "other");
        return;
      }
      closeForm();
      setNotice({ variant: "success", body: t("Brave search key saved.") });
    },
    [keyValue, save, closeForm, t],
  );

  const handleRemove = useCallback(async () => {
    try {
      await remove.mutateAsync();
    } catch {
      // The global error toast says what went wrong.
      setIsRemoveOpen(false);
      return;
    }
    setIsRemoveOpen(false);
    setNotice({ variant: "success", body: t("Brave search key removed.") });
  }, [remove, t]);

  if (!isAdmin) return null;

  const configured = searchKey.data?.configured === true;
  const last4 = searchKey.data?.last4 ?? null;

  const renderStatus = () => {
    if (searchKey.isPending) {
      return <CircularProgress size={16} aria-label={t("Loading the search key")} />;
    }
    if (searchKey.isError) {
      return (
        <Typography sx={{ ...textStyles.body, color: "status.error.text" }}>
          {t("Could not load the search key.")}
        </Typography>
      );
    }
    return (
      <Typography
        data-testid="search-key-status"
        sx={{ ...textStyles.body, color: configured ? "text.primary" : "text.tertiary" }}
      >
        {configured
          ? last4
            ? fill(t("Brave Search · ending in {last4}"), { last4 })
            : t("Brave Search")
          : t("Not set")}
      </Typography>
    );
  };

  const failureText: Record<SaveFailure, string> = {
    invalid_key: t("Brave rejected this key. Check that you copied all of it."),
    unreachable: t("Could not reach Brave to check this key."),
    other: t("Could not save the key. Try again."),
  };

  return (
    <Stack sx={{ mt: "24px", width: "100%" }}>
      {notice && (
        <Alert
          variant={notice.variant}
          body={notice.body}
          isToast={false}
          onClick={() => setNotice(null)}
        />
      )}

      <Stack sx={{ pt: "40px", gap: "12px" }}>
        <Box>
          <Typography sx={{ fontSize: 15, fontWeight: 600, color: `${text.black}` }}>
            {t("Search API key")}
          </Typography>
          <Typography sx={{ fontSize: 13, color: vwPalette.text.tertiary, mt: "4px" }}>
            {t(
              "Vendor research searches the news with Brave when the research key is not an Anthropic key. Without a Brave key, news comes from the GDELT Project, which sometimes refuses requests.",
            )}
          </Typography>
        </Box>
        <Stack
          direction="row"
          sx={{
            alignItems: "center",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
            border: `1px solid ${vwPalette.border.light}`,
            borderRadius: radiusPx.sm,
            p: "16px",
            backgroundColor: "background.main",
          }}
        >
          {renderStatus()}
          {searchKey.isSuccess && (
            <Stack direction="row" sx={{ gap: "8px" }}>
              {configured ? (
                <>
                  <CustomizableButton
                    variant="outlined"
                    text={t("Replace key")}
                    onClick={() => setIsFormOpen(true)}
                    testId="search-key-replace"
                  />
                  <CustomizableButton
                    variant="outlined"
                    color="error"
                    text={t("Remove")}
                    onClick={() => setIsRemoveOpen(true)}
                    testId="search-key-remove"
                  />
                </>
              ) : (
                <CustomizableButton
                  variant="contained"
                  text={t("Add key")}
                  onClick={() => setIsFormOpen(true)}
                  testId="search-key-add"
                />
              )}
            </Stack>
          )}
        </Stack>
      </Stack>

      <StandardModal
        isOpen={isFormOpen}
        onClose={closeForm}
        title={t("Brave search key")}
        description={t("Vendor research searches the news with this key.")}
        onSubmit={() => void submit(false)}
        submitButtonText={t("Save")}
        isSubmitting={save.isPending}
        isSubmitDisabled={keyValue.trim() === ""}
        maxWidth="560px"
      >
        <Stack sx={{ gap: "8px" }}>
          <Field
            id="search-key-value"
            label={t("API key")}
            type="password"
            autoComplete="off"
            value={keyValue}
            onChange={(event) => {
              setKeyValue(event.target.value);
              setFailure(null);
            }}
            error={failure !== null ? failureText[failure] : undefined}
            dataTestId="search-key-field"
            isRequired
          />
          {failure === "unreachable" && (
            <Box>
              <CustomizableButton
                variant="outlined"
                text={t("Save anyway")}
                onClick={() => void submit(true)}
                isDisabled={save.isPending}
                testId="search-key-save-anyway"
              />
            </Box>
          )}
          <Typography sx={{ ...textStyles.bodySmall, color: "text.tertiary" }}>
            <VWLink
              url={BRAVE_API_URL}
              openInNewTab
              sx={{ fontSize: "inherit", verticalAlign: "baseline" }}
            >
              {t("Get a key at brave.com/search/api")}
            </VWLink>
          </Typography>
          <Typography sx={{ ...textStyles.bodySmall, color: "text.tertiary" }}>
            {t(
              "Brave charges about $5 per 1,000 searches after $5 of free credit a month. A research run makes about 8.",
            )}
          </Typography>
        </Stack>
      </StandardModal>

      {isRemoveOpen && (
        <ConfirmationModal
          title={t("Remove the Brave search key?")}
          body={
            <Typography fontSize={13}>
              {t("Vendor research will search the news with the GDELT Project instead.")}
            </Typography>
          }
          cancelText={t("Cancel")}
          proceedText={t("Remove")}
          onCancel={() => setIsRemoveOpen(false)}
          onProceed={() => void handleRemove()}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          isLoading={remove.isPending}
          TitleFontSize={0}
        />
      )}
    </Stack>
  );
};

export default SearchKey;
