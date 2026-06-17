import { Box, SelectChangeEvent, Stack, useTheme } from "@mui/material";
import useUserPreferences from "../../../../application/hooks/useUserPreferences";
import React, { useEffect, useState } from "react";
import CustomizableSkeleton from "../../../components/Skeletons";
import Alert from "../../../components/Alert";
import CustomizableToast from "../../../components/Toast";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { SaveIcon } from "lucide-react";
import { UserDateFormat } from "../../../../domain/enums/userDateFormat.enum";
import {
  createNewUserPreferences,
  updateUserPreferencesById,
} from "../../../../application/repository/userPreferences.repository";
import { useAuth } from "../../../../application/hooks/useAuth";
import Select from "../../../components/Inputs/Select";
import { brand } from "../../../themes/palette";
import { setLanguage, getLanguage } from "../../../../i18n/domTranslator";
import type { Lang } from "../../../../i18n/translations";

const LANGUAGE_OPTIONS: { _id: Lang; name: string }[] = [
  { _id: "en", name: "English" },
  { _id: "de", name: "Deutsch" },
  { _id: "fr", name: "Français" },
  { _id: "es", name: "Español" },
];

const Preferences: React.FC = () => {
  const theme = useTheme();
  const { userId } = useAuth();
  const { userPreferences, isDefault, loading, refreshUserPreferences } = useUserPreferences();
  const [isSaveDisabled, setIsSaveDisabled] = useState(true);
  const [dateFormat, setDateFormat] = useState<UserDateFormat>(UserDateFormat.DD_MM_YYYY_DASH);

  const [language, setLang] = useState<Lang>("en");

  useEffect(() => {
    setLang(getLanguage());
  }, []);

  const handleLanguageChange = (event: SelectChangeEvent<string | number>) => {
    const next = event.target.value as Lang;
    setLang(next);
    setIsSaveDisabled(false);
  };

  const [showToast, setShowToast] = useState(false);
  const [alert, setAlert] = useState<{
    variant: "success" | "info" | "warning" | "error";
    title: string;
    body: string;
    isToast: boolean;
    visible: boolean;
  }>({
    variant: "info",
    title: "",
    body: "",
    isToast: true,
    visible: false,
  });

  useEffect(() => {
    if (userPreferences) {
      // Guard against a null/undefined date_format from the server so the
      // Select stays controlled (avoids the controlled->uncontrolled warning).
      setDateFormat(userPreferences.date_format ?? UserDateFormat.DD_MM_YYYY_DASH);
      const serverLang = (userPreferences.language ?? "en") as Lang;
      setLang(serverLang);
      // Server is the source of truth — apply it locally if it differs.
      if (getLanguage() !== serverLang) {
        setLanguage(serverLang);
      }

      setIsSaveDisabled(!isDefault);
    }
  }, [userPreferences, isDefault]);

  const handleOnSelectChange = (event: SelectChangeEvent<string | number>) => {
    setDateFormat(event.target.value as UserDateFormat);
    setIsSaveDisabled(false);
  };

  const handleSaveUserPreferences = async () => {
    setShowToast(true);
    try {
      if (isDefault) {
        const created = await createNewUserPreferences({
          user_id: userId!,
          date_format: dateFormat,
          language,
        });

        if (created) {
          localStorage.setItem("verifywise_preferences", JSON.stringify(created.data));
          setLanguage(language);

          setAlert({
            variant: "success",
            title: "Success",
            body: "User preferences set successfully.",
            isToast: true,
            visible: true,
          });
        }
      } else {
        const updated = await updateUserPreferencesById({
          userId: userId!,
          data: { user_id: userId!, date_format: dateFormat, language },
        });

        if (updated) {
          localStorage.setItem("verifywise_preferences", JSON.stringify(updated.data));
          setLanguage(language);

          setAlert({
            variant: "success",
            title: "Success",
            body: "User preferences updated successfully.",
            isToast: true,
            visible: true,
          });
        }
      }
      refreshUserPreferences();
    } catch (error: any) {
      setAlert({
        variant: "error",
        title: "Error",
        body: error.message || "Failed to update User preferences. Please try again.",
        isToast: true,
        visible: true,
      });
    } finally {
      setShowToast(false); // Hide CustomizableToast after response
      setTimeout(() => {
        setShowToast(false);
      }, 1000);
      setTimeout(() => {
        setAlert((prev) => ({ ...prev, visible: false }));
      }, 3000); // Alert will disappear after 3 seconds
    }
  };

  return (
    <Box sx={{ mt: 3, width: { xs: "90%", md: "70%" }, position: "relative" }}>
      {loading && (
        <CustomizableSkeleton
          variant="rectangular"
          width="100%"
          height="300px"
          minWidth={"100%"}
          minHeight={300}
          sx={{ borderRadius: 2 }}
        />
      )}
      {alert.visible && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={alert.isToast}
          onClick={() => setAlert((prev) => ({ ...prev, visible: false }))}
        />
      )}
      {showToast && <CustomizableToast />} {/* Show CustomizableToast when showToast is true */}
      {!loading && (
        <Box sx={{ width: "100%", maxWidth: 600 }}>
          <Stack sx={{ marginTop: theme.spacing(20) }}>
            <Select
              id="risk-classification-input"
              label="Date format"
              placeholder="Select an option"
              value={dateFormat}
              onChange={handleOnSelectChange}
              items={[
                ...Object.values(UserDateFormat).map((item) => ({
                  _id: item,
                  name: item,
                })),
              ]}
              isRequired
            />
            <Box sx={{ mt: theme.spacing(8) }}>
              <Select
                id="language-input"
                label="Language"
                placeholder="Select a language"
                value={language}
                onChange={handleLanguageChange}
                items={LANGUAGE_OPTIONS}
              />
            </Box>
            <Stack
              sx={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "flex-end",
                alignItems: "center",
                paddingTop: theme.spacing(5),
                marginTop: theme.spacing(10),
              }}
            >
              <CustomizableButton
                variant="contained"
                text="Save"
                sx={{
                  backgroundColor: `${brand.primary}`,
                  border: isSaveDisabled
                    ? "1px solid rgba(0, 0, 0, 0.26)"
                    : `1px solid ${brand.primary}`,
                  gap: 2,
                }}
                icon={<SaveIcon size={16} />}
                onClick={handleSaveUserPreferences}
                isDisabled={isSaveDisabled}
              />
            </Stack>
          </Stack>
        </Box>
      )}
    </Box>
  );
};

export default Preferences;
