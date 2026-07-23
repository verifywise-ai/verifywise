import React from "react";
import { X } from "lucide-react";
import { Modal, IconButton, Box, Typography } from "@mui/material";
import { typography, spacing } from "./styles/theme";
import { background } from "../../themes/palette";

interface ImageLightboxProps {
  src: string;
  alt: string;
  caption?: string;
  onClose: () => void;
}

const ImageLightbox: React.FC<ImageLightboxProps> = ({ src, alt, caption, onClose }) => {
  return (
    <Modal
      open
      onClose={onClose}
      aria-labelledby="image-lightbox-title"
      aria-describedby={caption ? "image-lightbox-caption" : undefined}
      slotProps={{
        backdrop: {
          className: "confirmation-backdrop",
          sx: {
            backgroundColor: "rgba(0, 0, 0, 0.85)",
          },
        },
      }}
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: spacing.xl,
        zIndex: 2000,
      }}
    >
      <Box
        role="dialog"
        aria-modal="true"
        aria-labelledby="image-lightbox-title"
        sx={{
          maxWidth: "90vw",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          position: "relative",
          outline: "none",
        }}
      >
        <Typography id="image-lightbox-title" sx={{ display: "none" }}>
          {alt}
        </Typography>

        <IconButton
          onClick={onClose}
          aria-label="Close image lightbox"
          sx={{
            "position": "absolute",
            "top": -8,
            "right": -8,
            "width": 40,
            "height": 40,
            "backgroundColor": "rgba(255, 255, 255, 0.1)",
            "color": background.main,
            "&:hover": {
              backgroundColor: "rgba(255, 255, 255, 0.2)",
            },
          }}
        >
          <X size={24} strokeWidth={1.5} />
        </IconButton>

        <Box
          component="img"
          src={src}
          alt={alt}
          sx={{
            maxWidth: "100%",
            maxHeight: caption ? "calc(90vh - 40px)" : "90vh",
            objectFit: "contain",
            borderRadius: "4px",
            boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
            cursor: "default",
          }}
          onClick={(event) => event.stopPropagation()}
        />

        {caption && (
          <Typography
            id="image-lightbox-caption"
            sx={{
              marginTop: spacing.md,
              fontSize: typography.fontSize.sm,
              color: "rgba(255, 255, 255, 0.8)",
              textAlign: "center",
              fontStyle: "italic",
            }}
          >
            {caption}
          </Typography>
        )}
      </Box>
    </Modal>
  );
};

export default ImageLightbox;
