// src/presentation/components/CustomTextField.tsx
import React from "react";
import { Box, Typography, Skeleton, TextField } from "@mui/material";
import { brand, background } from "../../../../themes/palette";

interface CustomTextFieldProps {
  label: string;
  value?: string;
  loading?: boolean;
}

const CustomTextField: React.FC<CustomTextFieldProps> = ({ label, value, loading }) => (
  <Box sx={{ width: "33%", mb: 2 }}>
    <Typography variant="subtitle2" color={brand.primary} sx={{ mb: 1, fontWeight: 600 }}>
      {label}
    </Typography>
    <Box
      sx={{
        border: "1px solid #EEEEEE",
        borderRadius: 1,
        p: 2,
        minHeight: 140,
        background: `${background.main}`,
        width: "100%",
      }}
    >
      {loading ? (
        <Skeleton variant="rectangular" width="100%" height={40} />
      ) : (
        <TextField
          value={value || ''}
          InputProps={{ readOnly: true, disableUnderline: true }}
          variant="standard"
          multiline
          minRows={3}
          maxRows={8}
          fullWidth
          sx={{
            background: `${background.main}`,
            border: "none",
            p: 0,
            '& .MuiInputBase-input': {
              fontSize: 13,
              lineHeight: 1.5,
            },
          }}
        />
      )}
    </Box>
  </Box>
);

export default CustomTextField;