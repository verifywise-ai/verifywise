import {
  Stack,
  useTheme,
  Box,
  CircularProgress,
  Typography,
  IconButton,
  Chip,
  Collapse,
  Select,
  MenuItem,
} from "@mui/material";
import { useState, useCallback, useEffect } from "react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { Plus as PlusIcon, Trash2 as DeleteIcon, Copy as CopyIcon } from "lucide-react";
import Alert from "../../../components/Alert";
import ConfirmationModal from "../../../components/Dialogs/ConfirmationModal";
import Field from "../../../components/Inputs/Field";
import { checkStringValidation } from "../../../../application/validations/stringValidation";
import {
  createApiToken,
  deleteApiToken,
  getApiTokens,
} from "../../../../application/repository/tokens.repository";
import allowedRoles from "../../../../application/constants/permissions";
import { useAuth } from "../../../../application/hooks/useAuth";
import { ApiTokenModel } from "../../../../domain/models/Common/apiToken/apiToken.model";
import LLMKeys from "../LLMKeys";
import { getSelectStyles } from "../../../utils/inputStyles";
import { brand } from "../../../themes/palette";

interface AlertState {
  variant: "success" | "info" | "warning" | "error";
  title?: string;
  body: string;
  isToast?: boolean;
}

const EXPIRY_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 60, label: "60 days" },
  { value: 90, label: "90 days" },
  { value: 180, label: "180 days" },
  { value: 365, label: "1 year" },
];

const ApiKeys = () => {
  const { userRoleName } = useAuth();
  const theme = useTheme();
  const isDisabled = !allowedRoles.apiKeys?.manage?.includes(userRoleName);

  const [tokens, setTokens] = useState<ApiTokenModel[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [tokenToDelete, setTokenToDelete] = useState<ApiTokenModel | null>(null);
  const [newTokenName, setNewTokenName] = useState("");
  const [newTokenNameError, setNewTokenNameError] = useState<string | null>(null);
  const [selectedExpiry, setSelectedExpiry] = useState<number>(30);
  const [newlyCreatedToken, setNewlyCreatedToken] = useState<string | null>(null);
  const [alert, setAlert] = useState<AlertState | null>(null);
  const [copiedTokenId, setCopiedTokenId] = useState<number | null>(null);
  const [hoveredTokenId, setHoveredTokenId] = useState<number | null>(null);
  const [deletingTokenId, setDeletingTokenId] = useState<number | null>(null);

  const showAlert = useCallback((variant: AlertState["variant"], title: string, body: string) => {
    setAlert({ variant, title, body, isToast: false });
  }, []);

  const fetchTokens = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getApiTokens({ routeUrl: "/tokens" });
      if (response && response.data && response.data.data) {
        const tokenModels = response.data.data.map((tokenData: any) =>
          ApiTokenModel.createNewApiToken(tokenData),
        );
        setTokens(tokenModels);
      }
    } catch (_error) {
      showAlert("error", "Error", "Failed to fetch API tokens");
    } finally {
      setIsLoading(false);
    }
  }, [showAlert]);

  useEffect(() => {
    fetchTokens();
  }, [fetchTokens]);

  useEffect(() => {
    if (alert) {
      const timer = setTimeout(() => setAlert(null), 3000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [alert]);

  const handleTokenNameChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewTokenName(value);

    const validation = checkStringValidation("Token name", value, 3, 50, false, false);
    setNewTokenNameError(validation.accepted ? null : validation.message);
  }, []);

  const handleCreateToken = useCallback(async () => {
    if (!newTokenName.trim() || newTokenNameError || isLoading) {
      return;
    }

    setIsLoading(true);
    try {
      const tokenCreationData = ApiTokenModel.createApiTokenForCreation(newTokenName);

      const response = await createApiToken({
        routeUrl: "/tokens",
        body: { name: tokenCreationData.name, expires_in_days: selectedExpiry },
      });

      if (response && response.data && response.data.data) {
        const createdToken = response.data.data;
        setNewlyCreatedToken(createdToken.token || null);
        await fetchTokens();
        setNewTokenName("");
        setNewTokenNameError(null);
      }
    } catch (error) {
      // Extract more specific error message from response
      let errorMessage = "Failed to create API token";

      // Handle CustomException objects (thrown by networkServices.ts)
      if (error && typeof error === "object" && "message" in error) {
        const message = (error as any).message;
        if (typeof message === "string") {
          errorMessage = message;
        }
      }
      // Handle HTTP response errors
      else if (error && typeof error === "object" && "response" in error) {
        const response = (error as any).response;

        // Check multiple possible locations for the error message
        if (response?.data?.data && typeof response.data.data === "string") {
          // Validation errors from STATUS_CODE[400] put the message in data.data
          errorMessage = response.data.data;
        } else if (response?.data?.message) {
          errorMessage = response.data.message;
        } else if (response?.data?.error) {
          errorMessage = response.data.error;
        } else if (typeof response?.data === "string") {
          // Sometimes the data field itself is a string
          errorMessage = response.data;
        } else if (response?.status === 409) {
          errorMessage = "A token with this name already exists. Please use a different name.";
        } else if (response?.status === 400) {
          errorMessage = "Invalid token name. Please check your input and try again.";
        } else if (response?.status === 429) {
          errorMessage = "You have reached the maximum number of API tokens allowed.";
        } else if (response?.status >= 500) {
          errorMessage = "Server error occurred while creating API token. Please try again later.";
        }
      }

      showAlert("error", "Error", errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [newTokenName, newTokenNameError, isLoading, fetchTokens, showAlert]);

  const isCreateButtonDisabled = !newTokenName.trim() || !!newTokenNameError || isLoading;

  const handleDeleteToken = useCallback(async () => {
    if (!tokenToDelete) return;

    // Start animation
    setDeletingTokenId(tokenToDelete.id);
    setIsDeleteModalOpen(false);

    setIsLoading(true);
    try {
      await deleteApiToken({
        routeUrl: `/tokens/${tokenToDelete.id}`,
      });

      // Wait for animation to complete before removing from list
      setTimeout(async () => {
        showAlert("success", "Token Deleted", "API token deleted successfully");
        await fetchTokens();
        setDeletingTokenId(null);
        setTokenToDelete(null);
      }, 300);
    } catch (_error) {
      setDeletingTokenId(null);
      showAlert("error", "Error", "Failed to delete API token");
    } finally {
      setIsLoading(false);
    }
  }, [tokenToDelete, fetchTokens, showAlert]);

  const handleCopyToken = useCallback((token: string, tokenId: number) => {
    navigator.clipboard.writeText(token);
    setCopiedTokenId(tokenId);
    setTimeout(() => setCopiedTokenId(null), 2000);
  }, []);

  const handleCloseCreateModal = useCallback(() => {
    setIsCreateModalOpen(false);
    setNewTokenName("");
    setNewTokenNameError(null);
    setNewlyCreatedToken(null);
    setSelectedExpiry(30);
  }, []);

  return (
    <Stack sx={{ mt: 3, width: "100%" }}>
      {alert && (
        <Alert
          variant={alert.variant}
          title={alert.title}
          body={alert.body}
          isToast={false}
          onClick={() => setAlert(null)}
        />
      )}

      <Stack sx={{ pt: theme.spacing(20) }}>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            mb: 3,
          }}
        >
          <Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: "text.black" }}>
              API Keys
            </Typography>
            <Typography sx={{ fontSize: 13, color: "#666666", mt: 0.5, mb: 3 }}>
              Manage your API keys for programmatic access to VerifyWise features
            </Typography>
          </Box>
          {tokens.length > 0 && (
            <CustomizableButton
              variant="contained"
              text="Create new key"
              icon={<PlusIcon size={16} />}
              onClick={() => setIsCreateModalOpen(true)}
              isDisabled={isDisabled}
              sx={{
                "backgroundColor": "brand.primary",
                "color": "background.main",
                "&:hover": { backgroundColor: "#0e5c47" },
              }}
            />
          )}
        </Box>

        {isLoading && tokens.length === 0 ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress />
          </Box>
        ) : tokens.length === 0 ? (
          <Box
            sx={{
              border: "2px dashed status.default.border",
              borderRadius: "12px",
              p: 6,
              textAlign: "center",
              backgroundColor: "#fafbfc",
            }}
          >
            <Box
              sx={{
                width: 56,
                height: 56,
                borderRadius: "50%",
                backgroundColor: "#f0fdf4",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto",
                mb: 2,
              }}
            >
              <PlusIcon size={24} color={brand.primary} />
            </Box>
            <Typography sx={{ fontSize: 15, fontWeight: 600, color: "text.black", mb: 1 }}>
              No API keys yet
            </Typography>
            <Typography sx={{ fontSize: 13, color: "#666666", mb: 3 }}>
              Create your first API key to enable programmatic access to your account
            </Typography>
            <CustomizableButton
              variant="contained"
              text="Create API key"
              icon={<PlusIcon size={16} />}
              onClick={() => setIsCreateModalOpen(true)}
              isDisabled={isDisabled}
              sx={{
                "backgroundColor": "brand.primary",
                "color": "background.main",
                "&:hover": { backgroundColor: "#0e5c47" },
              }}
            />
          </Box>
        ) : (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {tokens.map((token) => (
              <Collapse key={token.id} in={deletingTokenId !== token.id} timeout={300}>
                <Box
                  onMouseEnter={() => setHoveredTokenId(token.id)}
                  onMouseLeave={() => setHoveredTokenId(null)}
                  sx={{
                    border: "1.5px solid #eaecf0",
                    borderRadius: "4px",
                    p: 4,
                    backgroundColor: hoveredTokenId === token.id ? "#f8fffe" : "background.main",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    transition: "all 0.3s ease-in-out",
                    cursor: "default",
                    boxShadow:
                      hoveredTokenId === token.id ? "0 2px 8px rgba(19, 113, 91, 0.08)" : "none",
                    opacity: deletingTokenId === token.id ? 0 : 1,
                    transform: deletingTokenId === token.id ? "translateY(-20px)" : "translateY(0)",
                  }}
                >
                  <Box sx={{ flex: 1 }}>
                    <Typography
                      sx={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: "text.black",
                        mb: 2,
                        letterSpacing: "0.01em",
                      }}
                    >
                      {token.name}
                    </Typography>
                    <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                      <Chip
                        label={token.getStatus()}
                        sx={{
                          "backgroundColor": token.getStatusColor(),
                          "color": token.getStatusTextColor(),
                          "fontWeight": 500,
                          "fontSize": "11px",
                          "height": "20px",
                          "borderRadius": "4px",
                          "& .MuiChip-label": {
                            padding: "0 8px",
                            textTransform: "uppercase",
                            letterSpacing: "0.5px",
                          },
                        }}
                      />
                      <Typography sx={{ fontSize: 12, color: "#999999" }}>•</Typography>
                      <Typography sx={{ fontSize: 12, color: "#999999" }}>
                        Created{" "}
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "text.black",
                          }}
                        >
                          {token.getFormattedCreatedDate()}
                        </Typography>
                      </Typography>
                      <Typography sx={{ fontSize: 12, color: "#999999" }}>•</Typography>
                      <Typography sx={{ fontSize: 12, color: "#999999" }}>
                        {token.isExpired() ? "Expired" : "Expires"}{" "}
                        <Typography
                          component="span"
                          sx={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: "text.black",
                          }}
                        >
                          {token.getFormattedExpiryDate()}
                        </Typography>
                      </Typography>
                    </Box>
                  </Box>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <IconButton
                      onClick={() => {
                        setTokenToDelete(token);
                        setIsDeleteModalOpen(true);
                      }}
                      disableRipple
                      disabled={isDisabled}
                      sx={{
                        "color": "#DC2626",
                        "opacity": hoveredTokenId === token.id ? 1 : 0.6,
                        "transition": "opacity 0.2s ease-in-out",
                        "&:hover": {
                          backgroundColor: "#FEF2F2",
                        },
                        "&:disabled": {
                          opacity: 0.3,
                        },
                      }}
                    >
                      <DeleteIcon size={18} />
                    </IconButton>
                  </Box>
                </Box>
              </Collapse>
            ))}
          </Box>
        )}
      </Stack>

      {/* Create Token Modal */}
      {isCreateModalOpen && !newlyCreatedToken && (
        <ConfirmationModal
          title="Create New API Key"
          body={
            <Stack spacing={3}>
              <Typography sx={{ fontSize: 13, color: "text.black", mb: 1 }}>
                Create a new API key for programmatic access to your account.
              </Typography>
              <Field
                id="token-name"
                label="Key name"
                value={newTokenName}
                onChange={handleTokenNameChange}
                error={newTokenNameError || undefined}
                placeholder="e.g. Production API Key"
                sx={{ backgroundColor: "background.main" }}
                isRequired
              />
              <Stack gap={theme.spacing(2)}>
                <Typography
                  component="p"
                  variant="body1"
                  color={theme.palette.text.secondary}
                  fontWeight={500}
                  fontSize="13px"
                  sx={{ margin: 0, height: "22px" }}
                >
                  Expiration
                </Typography>
                <Select
                  id="expiry-select"
                  value={selectedExpiry}
                  onChange={(e) => setSelectedExpiry(e.target.value as number)}
                  size="small"
                  sx={{
                    backgroundColor: "background.main",
                    ...getSelectStyles(theme),
                  }}
                >
                  {EXPIRY_OPTIONS.map((option) => (
                    <MenuItem key={option.value} value={option.value}>
                      {option.label}
                    </MenuItem>
                  ))}
                </Select>
              </Stack>
            </Stack>
          }
          cancelText="Cancel"
          proceedText={isLoading ? "Creating..." : "Create"}
          onCancel={handleCloseCreateModal}
          onProceed={handleCreateToken}
          proceedButtonColor="primary"
          proceedButtonVariant="contained"
          TitleFontSize={0}
          confirmBtnSx={{
            "backgroundColor": isCreateButtonDisabled ? "#ccc" : "brand.primary",
            "color": isCreateButtonDisabled ? "#666" : "background.main",
            "cursor": isCreateButtonDisabled ? "not-allowed" : "pointer",
            "opacity": isCreateButtonDisabled ? 0.6 : 1,
            "&:hover": {
              backgroundColor: isCreateButtonDisabled ? "#ccc" : "#0e5c47",
            },
          }}
        />
      )}

      {/* Token Created Modal */}
      {isCreateModalOpen && newlyCreatedToken && (
        <>
          <Box
            onClick={handleCloseCreateModal}
            sx={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(0, 0, 0, 0.5)",
              zIndex: 1299,
            }}
          />
          <Stack
            sx={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 1300,
              backgroundColor: "white",
              padding: "16px",
              borderRadius: "8px",
              boxShadow: "0 4px 8px rgba(0, 0, 0, 0.1)",
              maxWidth: "440px",
              width: "100%",
            }}
          >
            <Stack sx={{ mb: 3 }}>
              <Typography sx={{ fontSize: 16, fontWeight: 600, mb: 2 }}>API key created</Typography>
              <Typography sx={{ fontSize: 13, color: "text.black", mb: 3 }}>
                Your API key has been created successfully. Make sure to copy it now as it won't be
                shown again.
              </Typography>
              <Box>
                <Box
                  sx={{
                    backgroundColor: "#ecfdf3",
                    border: "1.5px solid brand.primary",
                    borderRadius: "4px",
                    p: 2.5,
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 2,
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 13,
                      fontFamily: "monospace",
                      color: "text.black",
                      wordBreak: "break-all",
                      flex: 1,
                      fontWeight: 500,
                    }}
                  >
                    {newlyCreatedToken}
                  </Typography>
                  <IconButton
                    onClick={() => handleCopyToken(newlyCreatedToken, -1)}
                    disableRipple
                    sx={{
                      "color": copiedTokenId === -1 ? "brand.primary" : "#666666",
                      "backgroundColor": copiedTokenId === -1 ? "#f0fdf4" : "transparent",
                      "transition": "all 0.2s ease-in-out",
                      "&:hover": {
                        backgroundColor: "#f0fdf4",
                        color: "brand.primary",
                      },
                    }}
                  >
                    <CopyIcon size={18} />
                  </IconButton>
                </Box>
                <Box
                  sx={{
                    height: 28,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Typography
                    sx={{
                      fontSize: 12,
                      color: "brand.primary",
                      fontWeight: 500,
                      opacity: copiedTokenId === -1 ? 1 : 0,
                      transition: "opacity 0.2s ease-in-out",
                    }}
                  >
                    ✓ Copied to clipboard!
                  </Typography>
                </Box>
              </Box>
            </Stack>
            <Stack
              sx={{
                display: "flex",
                flexDirection: "row",
                justifyContent: "flex-end",
                alignItems: "center",
              }}
            >
              <CustomizableButton
                text="I copied the key"
                variant="contained"
                sx={{
                  "backgroundColor": "brand.primary",
                  "color": "background.main",
                  "px": "32px",
                  "&:hover": { backgroundColor: "#0e5c47" },
                }}
                onClick={handleCloseCreateModal}
              />
            </Stack>
          </Stack>
        </>
      )}

      {/* Delete Token Modal */}
      {isDeleteModalOpen && tokenToDelete && (
        <ConfirmationModal
          title="Delete API Key"
          body={
            <Typography fontSize={13}>
              Are you sure you want to delete the API key "{tokenToDelete.name}
              "? This action cannot be undone and any applications using this key will lose access.
            </Typography>
          }
          cancelText="Cancel"
          proceedText={isLoading ? "Deleting..." : "Delete"}
          onCancel={() => {
            setIsDeleteModalOpen(false);
            setTokenToDelete(null);
          }}
          onProceed={handleDeleteToken}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
          TitleFontSize={0}
        />
      )}

      <LLMKeys />
    </Stack>
  );
};

export default ApiKeys;
