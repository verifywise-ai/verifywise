import { useLocation, useNavigate, useParams } from "react-router";
import { Box, Typography } from "@mui/material";
import { Edit, Hash, Clock } from "lucide-react";
import { useEffect } from "react";
import { CustomizableButton } from "../../components/button/customizable-button";
import { palette, radiusPx } from "../../themes/palette";

interface SubmissionState {
  submissionId: number;
  resubmissionToken?: string;
  formName: string;
  submitterEmail?: string;
}

export function SubmissionSuccess() {
  const location = useLocation();
  const navigate = useNavigate();
  const { publicId, tenantSlug, formSlug } = useParams<{
    publicId?: string;
    tenantSlug?: string;
    formSlug?: string;
  }>();
  const state = location.state as SubmissionState | null;

  const isNewFormat = !!publicId;

  useEffect(() => {
    if (!state) {
      if (isNewFormat) {
        navigate(`/${publicId}/use-case-form-intake`, { replace: true });
      } else if (tenantSlug && formSlug) {
        navigate(`/intake/${tenantSlug}/${formSlug}`, { replace: true });
      }
    }
  }, [state, isNewFormat, publicId, tenantSlug, formSlug, navigate]);

  if (!state) {
    return null;
  }

  const handleEditSubmission = () => {
    if (isNewFormat) {
      navigate(`/${publicId}/use-case-form-intake?token=${state.resubmissionToken}`);
    } else {
      navigate(`/intake/${tenantSlug}/${formSlug}?token=${state.resubmissionToken}`);
    }
  };

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        backgroundColor: palette.background.alt,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        py: 4,
        px: 2,
      }}
    >
      <Box sx={{ width: "100%", maxWidth: 440 }}>
        {/* Ticket top */}
        <Box
          sx={{
            backgroundColor: "background.main",
            borderRadius: "16px 16px 0 0",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            p: 4,
            textAlign: "center",
          }}
        >
          <Typography
            component="h1"
            sx={{ fontSize: "22px", fontWeight: 700, color: palette.text.primary, mb: 1 }}
          >
            Submission received
          </Typography>
          <Typography sx={{ fontSize: "14px", color: palette.text.disabled, mb: 0 }}>
            {state.formName}
          </Typography>
        </Box>

        {/* Tear line with circles */}
        <Box sx={{ position: "relative", height: 24, backgroundColor: "transparent" }}>
          <Box
            sx={{
              position: "absolute",
              left: -12,
              top: "50%",
              transform: "translateY(-50%)",
              width: 24,
              height: 24,
              borderRadius: "50%",
              backgroundColor: palette.background.alt,
            }}
          />
          <Box
            sx={{
              position: "absolute",
              right: -12,
              top: "50%",
              transform: "translateY(-50%)",
              width: 24,
              height: 24,
              borderRadius: "50%",
              backgroundColor: palette.background.alt,
            }}
          />
          <Box
            sx={{
              position: "absolute",
              left: 12,
              right: 12,
              top: "50%",
              borderTop: `2px dashed ${palette.border.light}`,
            }}
          />
        </Box>

        {/* Ticket bottom */}
        <Box
          sx={{
            backgroundColor: "background.main",
            borderRadius: "0 0 16px 16px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            p: 4,
            pt: 2,
          }}
        >
          {/* Details rows */}
          {(() => {
            const rows = [
              {
                label: "Reference",
                value: `${state.submissionId}`,
                icon: <Hash size={13} color={palette.text.disabled} />,
              },
              ...(state.submitterEmail ? [{ label: "Email", value: state.submitterEmail }] : []),
              {
                label: "Status",
                value: "Pending review",
                color: palette.riskMark.medium,
                icon: <Clock size={13} color={palette.riskMark.medium} />,
              },
            ];
            return rows.map((row, i) => (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: "10px",
                  borderBottom:
                    i < rows.length - 1 ? `1px solid ${palette.background.hover}` : "none",
                }}
              >
                <Typography sx={{ fontSize: "13px", color: palette.text.disabled }}>
                  {row.label}
                </Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  {(row as any).icon}
                  <Typography
                    sx={{
                      fontSize: "13px",
                      fontWeight: 600,
                      color: (row as any).color || palette.text.primary,
                      maxWidth: 220,
                      textAlign: "right",
                      wordBreak: "break-all",
                    }}
                  >
                    {row.value}
                  </Typography>
                </Box>
              </Box>
            ));
          })()}

          {state.resubmissionToken && (
            <Box sx={{ mt: 3 }}>
              <CustomizableButton
                variant="contained"
                onClick={handleEditSubmission}
                startIcon={<Edit size={15} />}
                text="Edit and resubmit"
                sx={{
                  "width": "100%",
                  "height": 44,
                  "backgroundColor": "brand.primary",
                  "fontSize": "13px",
                  "fontWeight": 600,
                  "borderRadius": radiusPx.lg,
                  "textTransform": "none",
                  "boxShadow": "none",
                  "&:hover": { backgroundColor: "brand.primaryHover" },
                }}
              />
            </Box>
          )}
        </Box>

        <Typography
          sx={{ textAlign: "center", color: palette.border.dark, fontSize: "12px", mt: 4 }}
        >
          Powered by VerifyWise
        </Typography>
      </Box>
    </Box>
  );
}

export default SubmissionSuccess;
