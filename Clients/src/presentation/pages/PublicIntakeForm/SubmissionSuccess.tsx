import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Box, Typography } from "@mui/material";
import { Edit, Hash, Clock } from "lucide-react";
import { useEffect } from "react";
import { CustomizableButton } from "../../components/button/customizable-button";

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
      sx={{
        minHeight: "100vh",
        backgroundColor: "#fafafa",
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
          <Typography sx={{ fontSize: "22px", fontWeight: 700, color: "#1e293b", mb: 1 }}>
            Submission received
          </Typography>
          <Typography sx={{ fontSize: "14px", color: "#94a3b8", mb: 0 }}>
            {state.formName}
          </Typography>
        </Box>

        {/* Tear line with circles */}
        <Box sx={{ position: "relative", height: 24, backgroundColor: "transparent" }}>
          <Box sx={{
            position: "absolute", left: -12, top: "50%", transform: "translateY(-50%)",
            width: 24, height: 24, borderRadius: "50%", backgroundColor: "#fafafa",
          }} />
          <Box sx={{
            position: "absolute", right: -12, top: "50%", transform: "translateY(-50%)",
            width: 24, height: 24, borderRadius: "50%", backgroundColor: "#fafafa",
          }} />
          <Box sx={{
            position: "absolute", left: 12, right: 12, top: "50%",
            borderTop: "2px dashed #e2e8f0",
          }} />
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
              { label: "Reference", value: `${state.submissionId}`, icon: <Hash size={13} color="#94a3b8" /> },
              ...(state.submitterEmail ? [{ label: "Email", value: state.submitterEmail }] : []),
              { label: "Status", value: "Pending review", color: "#f59e0b", icon: <Clock size={13} color="#f59e0b" /> },
            ];
            return rows.map((row, i) => (
              <Box
                key={i}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  py: "10px",
                  borderBottom: i < rows.length - 1 ? "1px solid #f1f5f9" : "none",
                }}
              >
                <Typography sx={{ fontSize: "13px", color: "#94a3b8" }}>{row.label}</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: "4px" }}>
                  {(row as any).icon}
                  <Typography sx={{
                    fontSize: "13px", fontWeight: 600,
                    color: (row as any).color || "#1e293b",
                    maxWidth: 220, textAlign: "right", wordBreak: "break-all",
                  }}>
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
                  width: "100%", height: 44, backgroundColor: "brand.primary",
                  fontSize: "13px", fontWeight: 600, borderRadius: "8px", textTransform: "none",
                  boxShadow: "none",
                  "&:hover": { backgroundColor: "brand.primaryHover" },
                }}
              />
            </Box>
          )}
        </Box>

        <Typography sx={{ textAlign: "center", color: "#cbd5e1", fontSize: "12px", mt: 4 }}>
          Powered by VerifyWise
        </Typography>
      </Box>
    </Box>
  );
}

export default SubmissionSuccess;
