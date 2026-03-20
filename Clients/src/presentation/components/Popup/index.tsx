import { Button, Typography, useTheme, Stack, Modal } from "@mui/material";
import { X as ClearIcon } from "lucide-react";
import { FC } from "react";
import { useModalKeyHandling } from "../../../application/hooks/useModalKeyHandling";
import { IPopupProps } from "../../types/widget.types";
import { text } from "../../themes/palette";

const Popup: FC<IPopupProps> = ({
  popupId,
  popupContent,
  openPopupButtonName,
  popupTitle,
  popupSubtitle,
  handleOpenOrClose,
  anchor,
}) => {
  const theme = useTheme();
  const open = Boolean(anchor);
  const id = open ? popupId : undefined;

  useModalKeyHandling({
    isOpen: open,
    onClose: () => handleOpenOrClose?.(null as any),
  });

  const styles = {
    openPopupButton: {
      width: 120,
      height: 34,
      fontSize: 13,
      textTransform: "inherit",
      backgroundColor: "#4C7DE7",
      boxShadow: "none",
      borderRadius: 2,
      border: "1px solid #175CD3",
      "&:hover": { boxShadow: "none", backgroundColor: "#175CD3 " },
      display: "none",
    },
    closePopupButton: {
      position: "absolute",
      right: 28,
      top: 21,
      minWidth: 36,
      height: 36,
      p: 0,
      color: `${text.muted}`,
      "&:hover": { background: "none" },
    },
    popupContent: {
      position: "relative",
      backgroundColor: theme.palette.background.alt,
      borderRadius: 2,
      pt: 15,
      pb: 15,
      pl: 15,
      pr: 15,
      maxHeight: "90vh",
      width: "fit-content",
      overflow: "auto",
    },
    actionButton: {
      borderRadius: 2,
      maxHeight: 34,
      textTransform: "inherit",
      backgroundColor: "#4C7DE7",
      boxShadow: "none",
      border: "1px solid #175CD3",
      ml: "auto",
      mr: 0,
      mt: "30px",
      "&:hover": { boxShadow: "none" },
    },
  };

  return (
    <>
      <Button
        aria-describedby={id}
        type="button"
        variant="contained"
        onClick={handleOpenOrClose}
        sx={styles.openPopupButton}
        disableRipple={theme.components?.MuiButton?.defaultProps?.disableRipple}
      >
        {openPopupButtonName}
      </Button>
      <Modal
        className="Popup"
        open={open}
        onClose={() => handleOpenOrClose?.(null as any)}
        aria-labelledby={id}
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Stack sx={styles.popupContent} className="PopupContent">
          <Typography
            variant="h1"
            component="div"
            sx={{ color: `${text.secondary}`, fontSize: 16, fontWeight: 600, mb: 3.5 }}
          >
            {popupTitle}
          </Typography>
          {popupSubtitle && (
            <Typography
              variant="subtitle1"
              component="div"
              sx={{ color: `${text.secondary}`, fontSize: 13 }}
            >
              {popupSubtitle}
            </Typography>
          )}
          <Button onClick={handleOpenOrClose} sx={styles.closePopupButton}>
            <ClearIcon size={20} />
          </Button>
          {popupContent}
        </Stack>
      </Modal>
    </>
  );
};

export default Popup;
