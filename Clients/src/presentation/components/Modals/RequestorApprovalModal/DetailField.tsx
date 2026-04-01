import React from 'react';
import { Stack, Typography, Box } from "@mui/material";
import {
    stepDetailLabelStyle,
    stepDetailValueStyle,
    stepDetailValueWithWrapStyle
} from './style';
import { status } from "../../../themes/palette";

interface DetailFieldProps {
    label: string;
    value: string | string[];
    withWrap?: boolean;
    icon?: React.ReactNode;
}

const DetailField: React.FC<DetailFieldProps> = ({ label, value, withWrap = false, icon }) => {
    const displayValue = Array.isArray(value) ? value.join(", ") : value;

    return (
        <Stack direction="row" spacing={6} alignItems="flex-start">
            {icon && (
                <Box sx={{
                    color: `${status.default.text}`,
                    mt: "2px",
                    display: "flex",
                    alignItems: "center"
                }}>
                    {icon}
                </Box>
            )}
            <Stack spacing={1} flex={1}>
                <Typography sx={stepDetailLabelStyle}>
                    {label}
                </Typography>
                <Typography sx={withWrap ? stepDetailValueWithWrapStyle : stepDetailValueStyle}>
                    {displayValue}
                </Typography>
            </Stack>
        </Stack>
    );
};

export default DetailField;