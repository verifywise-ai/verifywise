import { useState, useEffect, useCallback, useRef } from "react";
import { Box, Typography } from "@mui/material";
import { RefreshCw } from "lucide-react";
import Field from "../../components/Inputs/Field";
import { getCaptcha } from "../../../application/repository/intakeForm.repository";
import { brand, text, background, status } from "../../themes/palette";

/**
 * Props for MathCaptcha component
 */
interface MathCaptchaProps {
  value: string;
  onChange: (value: string, token: string) => void;
  error?: string;
  refreshTrigger?: number;
}

/**
 * Math CAPTCHA component for spam prevention
 */
export function MathCaptcha({ value, onChange, error, refreshTrigger }: MathCaptchaProps) {
  const [question, setQuestion] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const loadCaptcha = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getCaptcha();
      if (response.data) {
        setQuestion(response.data.question);
        setToken(response.data.token);
        onChangeRef.current("", response.data.token);
      }
    } catch {
      setQuestion("Error loading captcha — click refresh to retry");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  // Auto-refresh when refreshTrigger changes (e.g., after failed submission)
  useEffect(() => {
    if (refreshTrigger && refreshTrigger > 0) {
      loadCaptcha();
    }
  }, [refreshTrigger, loadCaptcha]);

  const handleRefresh = () => {
    loadCaptcha();
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    onChange(e.target.value, token);
  };

  return (
    <Box
      sx={{
        p: 2.5,
        backgroundColor: "#f8fafc",
        borderRadius: "8px",
        border: error ? "1px solid #ef4444" : "1px solid #e2e8f0",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <Typography sx={{ fontWeight: 500, color: "#1f2937", fontSize: "13px" }}>
          Security check
        </Typography>
        <Box
          title="Get new question"
          onClick={isLoading ? undefined : handleRefresh}
          sx={{
            cursor: isLoading ? "default" : "pointer",
            opacity: isLoading ? 0.5 : 1,
            display: "flex",
            alignItems: "center",
            p: "4px",
            borderRadius: "6px",
            color: `${status.default.text}`,
            "&:hover": isLoading ? {} : { color: `${brand.primary}`, backgroundColor: "#f0fdf4" },
          }}
        >
          <RefreshCw size={16} strokeWidth={1.5} />
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
        <Typography
          sx={{
            fontSize: "16px",
            fontWeight: 600,
            color: "#1f2937",
            backgroundColor: `${background.main}`,
            px: 2,
            py: 1,
            borderRadius: "8px",
            border: "1px solid #e2e8f0",
            minWidth: 120,
            textAlign: "center",
          }}
        >
          {isLoading ? "Loading..." : question}
        </Typography>
        <Typography sx={{ fontSize: "16px", color: `${status.default.text}` }}>=</Typography>
        <Field
          id="captcha-answer"
          label=""
          value={value}
          onChange={handleChange}
          placeholder="?"
          type="number"
          disabled={isLoading}
          error={error}
          sx={{
            width: 80,
            "& .MuiOutlinedInput-root": {
              fontSize: "16px",
              fontWeight: 600,
            },
            "& input": { textAlign: "center" },
          }}
        />
      </Box>

      {error && (
        <Typography sx={{ color: "#ef4444", fontSize: "12px", mt: 1 }}>
          {error}
        </Typography>
      )}

      <Typography sx={{ color: `${text.disabled}`, fontSize: "11px", mt: 1.5 }}>
        Please solve this simple math problem to verify you are human
      </Typography>
    </Box>
  );
}

export default MathCaptcha;
