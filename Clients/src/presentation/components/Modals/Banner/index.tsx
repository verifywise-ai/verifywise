import { Box, Paper, Typography } from "@mui/material";
import { X as CloseGreyIcon } from "lucide-react";
import { IBannerProps } from "../../../../domain/interfaces/i.widget";
import { bannerBoxStyle, bannerPaperStyle, bannerTextStyle, closeIconStyle } from "./style";

const index = ({ onClose, bannerText, bannerWidth }: IBannerProps) => {
  return (
    <Box sx={bannerBoxStyle}>
      <Paper
        sx={{
          width: { bannerWidth },
          ...bannerPaperStyle,
        }}
      >
        <Typography sx={bannerTextStyle}>
          {bannerText}
          <CloseGreyIcon size={16} onClick={onClose} style={closeIconStyle} />
        </Typography>
      </Paper>
    </Box>
  );
};

export default index;
