/**
 * ImageField component allows users to upload an image by either clicking to select a file
 * or by dragging and dropping the file into the designated area. It displays a preview of the
 * uploaded image if the image is valid and not loading.
 *
 * @component
 * @param {ImageFieldProps} props - The props for the ImageField component.
 * @param {string} props.id - The id for the file input field.
 * @param {string} props.src - The source URL of the image to be displayed.
 * @param {boolean} props.loading - A flag indicating whether the image is currently loading.
 * @param {function} props.onChange - The function to handle the change event when a file is selected.
 *
 * @returns {JSX.Element} The rendered ImageField component.
 */

import "./index.css";
import { useState } from "react";
import { Box, IconButton, Stack, TextField, Typography, useTheme } from "@mui/material";
import { CloudUpload as CloudUploadIcon } from "lucide-react";
import { ImageFieldProps } from "../../../types/widget.types";
import { checkImage, IconButtonStack, TextFieldStyles } from "./constants";

function ImageField({ id, src, loading, onChange }: ImageFieldProps) {
  const theme = useTheme();

  const [isDragging, setIsDragging] = useState(false);
  const handleDragEnter = () => {
    setIsDragging(true);
  };
  const handleDragLeave = () => {
    setIsDragging(false);
  };

  return (
    <>
      {!checkImage(src) || loading ? (
        <>
          <Box
            className="image-field-wrapper"
            mt={theme.spacing(8)}
            sx={{
              position: "relative",
              height: "fit-content",
              border: "dashed",
              borderRadius: theme.shape.borderRadius,
              borderColor: isDragging ? theme.palette.primary.main : theme.palette.border.light,
              borderWidth: "2px",
              transition: "0.2s",
              "&:hover": {
                borderColor: theme.palette.primary.main,
                backgroundColor: "hsl(215, 87%, 51%, 0.05)",
              },
            }}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDrop={handleDragLeave}
          >
            <TextField id={id} type="file" onChange={onChange} sx={TextFieldStyles} />
            <Stack className="custom-file-text" alignItems="center" gap="4px" sx={IconButtonStack}>
              <IconButton
                sx={{
                  pointerEvents: "none",
                  borderRadius: theme.shape.borderRadius,
                  border: `solid 2px ${theme.palette.border.light}`,
                  boxShadow: theme.boxShadow,
                }}
              >
                <CloudUploadIcon size={24} />
              </IconButton>
              <Typography component="h2" color={theme.palette.text.tertiary}>
                <Typography
                  component="span"
                  fontSize="inherit"
                  color={theme.palette.primary.main}
                  fontWeight={500}
                >
                  Click to upload
                </Typography>{" "}
                or drag and drop
              </Typography>
              <Typography color={theme.palette.text.tertiary} sx={{ opacity: 0.6 }}>
                (maximum size: 3MB)
              </Typography>
            </Stack>
          </Box>
          <Typography color={theme.palette.text.tertiary} sx={{ opacity: 0.6 }}>
            Supported formats: JPG, PNG
          </Typography>
        </>
      ) : (
        <Stack direction="row" justifyContent="center">
          <Box
            sx={{
              width: "250px",
              height: "250px",
              borderRadius: "50%",
              overflow: "hidden",
              backgroundImage: `url(${src})`,
              backgroundSize: "cover",
            }}
          ></Box>
        </Stack>
      )}
    </>
  );
}

export default ImageField;
