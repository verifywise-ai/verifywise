import { useState } from "react";
import { Box, Typography, Stack, Paper, Container, useTheme } from "@mui/material";
import {
  Plus,
  Eye,
  Filter,
  Edit3,
  Lock,
  Unlock,
  Save,
  Trash2,
  Download,
  Upload,
} from "lucide-react";
import { CustomizableButton } from "../button/customizable-button";
import VerifyWiseMultiSelect from "../VerifyWiseMultiSelect";
import ViewToggle from "../ViewToggle";

function ButtonShowcase() {
  const theme = useTheme();
  const [multiSelectValues, setMultiSelectValues] = useState<string[]>(["option1", "option3"]);
  const [viewMode, setViewMode] = useState<"card" | "table">("card");

  const multiSelectOptions = [
    { value: "option1", label: "Option 1" },
    { value: "option2", label: "Option 2" },
    { value: "option3", label: "Option 3" },
    { value: "option4", label: "Option 4" },
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Button Component Showcase
      </Typography>
      <Typography variant="body1" color="text.secondary" sx={{ mb: 4 }}>
        Test all button variants and their states for consistency
      </Typography>

      {/* Primary Buttons */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Primary Buttons (Before Standardization)
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <CustomizableButton
            variant="contained"
            color="primary"
            size="medium"
            text="Primary Medium (34px)"
          />
          <CustomizableButton
            variant="contained"
            color="primary"
            size="small"
            text="Primary Small"
          />
          <Box
            sx={{
              minWidth: 140,
              height: 28,
              fontSize: 13,
              backgroundColor: theme.palette.primary.main,
              color: theme.palette.primary.contrastText,
              borderRadius: "4px",
              display: "flex",
              alignItems: "center",
              padding: "6px 12px",
              cursor: "pointer",
              "&:hover": {
                backgroundColor: theme.palette.primary.dark,
              },
            }}
          >
            <Plus size={16} style={{ marginRight: 8 }} />
            Add New (28px)
          </Box>
        </Stack>
      </Paper>

      {/* VerifyWiseMultiSelect */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Multi-Select Components
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <VerifyWiseMultiSelect
            options={multiSelectOptions}
            selectedValues={multiSelectValues}
            onChange={setMultiSelectValues}
            placeholder="Show/hide cards"
            icon={<Eye size={14} />}
            height={28}
          />
          <VerifyWiseMultiSelect
            options={multiSelectOptions}
            selectedValues={[]}
            onChange={() => {}}
            placeholder="Filter options"
            icon={<Filter size={14} />}
            height={32}
          />
        </Stack>
      </Paper>

      {/* Dashboard Action Buttons */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Dashboard Action Buttons (30px)
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Box
            component="button"
            aria-label="Integrations"
            sx={{
              background: "linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%)",
              color: "white",
              fontWeight: 500,
              fontSize: "12px",
              height: "30px",
              minHeight: "30px",
              maxHeight: "30px",
              padding: "0 14px",
              borderRadius: "4px",
              border: "none",
              textTransform: "none",
              boxShadow: "0 2px 4px rgba(139, 92, 246, 0.2)",
              cursor: "pointer",
              "&:hover": {
                background: "linear-gradient(135deg, #7C3AED 0%, #6D28D9 100%)",
                boxShadow: "0 4px 8px rgba(139, 92, 246, 0.3)",
              },
              transition: "all 0.2s ease",
            }}
          >
            Integrations
          </Box>
          <Box
            component="button"
            aria-label="Automations"
            sx={{
              background: "linear-gradient(135deg, #FB923C 0%, #F97316 100%)",
              color: "white",
              fontWeight: 500,
              fontSize: "12px",
              height: "30px",
              minHeight: "30px",
              maxHeight: "30px",
              padding: "0 14px",
              borderRadius: "4px",
              border: "none",
              textTransform: "none",
              boxShadow: "0 2px 4px rgba(251, 146, 60, 0.2)",
              cursor: "pointer",
              "&:hover": {
                background: "linear-gradient(135deg, #F97316 0%, #EA580C 100%)",
                boxShadow: "0 4px 8px rgba(251, 146, 60, 0.3)",
              },
              transition: "all 0.2s ease",
            }}
          >
            Automations
          </Box>
        </Stack>
      </Paper>

      {/* View Toggle */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          View Toggle Component
        </Typography>
        <ViewToggle viewMode={viewMode} onViewChange={setViewMode} />
      </Paper>

      {/* Icon Buttons */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Icon Buttons
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <Box
            component="button"
            aria-label="Lock"
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: `1px solid ${theme.palette.divider}`,
              backgroundColor: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              "&:hover": {
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <Lock size={16} />
          </Box>
          <Box
            component="button"
            aria-label="Unlock"
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: `1px solid ${theme.palette.divider}`,
              backgroundColor: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              "&:hover": {
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <Unlock size={16} />
          </Box>
          <Box
            component="button"
            aria-label="Edit"
            sx={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              border: `1px solid ${theme.palette.divider}`,
              backgroundColor: "transparent",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              "&:hover": {
                backgroundColor: theme.palette.action.hover,
              },
            }}
          >
            <Edit3 size={16} />
          </Box>
        </Stack>
      </Paper>

      {/* Secondary Buttons */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Secondary & Utility Buttons
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <CustomizableButton
            variant="outlined"
            color="primary"
            size="medium"
            text="Outlined Primary"
          />
          <CustomizableButton variant="text" color="primary" size="medium" text="Text Primary" />
          <CustomizableButton
            variant="contained"
            color="secondary"
            size="medium"
            text="Secondary"
          />
        </Stack>
      </Paper>

      {/* Action Buttons */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          Action Buttons (Save, Cancel, Delete, etc.)
        </Typography>
        <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
          <CustomizableButton
            variant="contained"
            color="primary"
            size="medium"
            startIcon={<Save size={16} />}
            text="Save"
          />
          <CustomizableButton
            variant="contained"
            color="error"
            size="medium"
            startIcon={<Trash2 size={16} />}
            text="Delete"
          />
          <CustomizableButton
            variant="outlined"
            color="primary"
            size="medium"
            startIcon={<Download size={16} />}
            text="Download"
          />
          <CustomizableButton
            variant="outlined"
            color="primary"
            size="medium"
            startIcon={<Upload size={16} />}
            text="Upload"
          />
        </Stack>
      </Paper>

      {/* State Comparison */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Typography variant="h6" gutterBottom>
          State Comparison (Hover, Active, Disabled)
        </Typography>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Normal State:
            </Typography>
            <Stack direction="row" spacing={2}>
              <CustomizableButton variant="contained" color="primary" text="Primary" />
              <CustomizableButton variant="outlined" color="primary" text="Outlined" />
              <CustomizableButton variant="text" color="primary" text="Text" />
            </Stack>
          </Box>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Disabled State:
            </Typography>
            <Stack direction="row" spacing={2}>
              <CustomizableButton variant="contained" color="primary" text="Primary" isDisabled />
              <CustomizableButton variant="outlined" color="primary" text="Outlined" isDisabled />
              <CustomizableButton variant="text" color="primary" text="Text" isDisabled />
            </Stack>
          </Box>
        </Stack>
      </Paper>

      {/* Size Comparison */}
      <Paper sx={{ p: 3 }}>
        <Typography variant="h6" gutterBottom>
          Size Comparison (Current Inconsistencies)
        </Typography>
        <Stack spacing={2}>
          <Box>
            <Typography variant="subtitle2" gutterBottom>
              Different Heights (28px, 30px, 32px, 34px):
            </Typography>
            <Stack direction="row" spacing={2} alignItems="center">
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Box
                  sx={{
                    height: 28,
                    width: 100,
                    backgroundColor: "brand.primary",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 1,
                    fontSize: "12px",
                    mb: 1,
                  }}
                >
                  28px
                </Box>
                <Typography variant="caption">Small</Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Box
                  sx={{
                    height: 30,
                    width: 100,
                    backgroundColor: "#8B5CF6",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 1,
                    fontSize: "12px",
                    mb: 1,
                  }}
                >
                  30px
                </Box>
                <Typography variant="caption">Dashboard</Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Box
                  sx={{
                    height: 32,
                    width: 100,
                    backgroundColor: "status.default.text",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 1,
                    fontSize: "12px",
                    mb: 1,
                  }}
                >
                  32px
                </Box>
                <Typography variant="caption">Medium</Typography>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <Box
                  sx={{
                    height: 34,
                    width: 100,
                    backgroundColor: "brand.primary",
                    color: "white",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 1,
                    fontSize: "12px",
                    mb: 1,
                  }}
                >
                  34px
                </Box>
                <Typography variant="caption">Current</Typography>
              </Box>
            </Stack>
          </Box>
        </Stack>
      </Paper>
    </Container>
  );
}

export { ButtonShowcase };
