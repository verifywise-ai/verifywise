import React, { useState } from "react";
import {
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
} from "@mui/material";
import Banner from "../Banner/index";
import { IDeleteAccountConfirmationProps } from "../../../../domain/interfaces/i.customs";

/**
 * A functional React component that renders a confirmation dialog for deleting an account.
 *
 * The component displays a confirmation dialog when the `open` prop is true, allowing the user
 * to confirm or cancel the deletion of their account. When the delete button is clicked, the dialog closes
 * and a banner shows up at the bottom-right corner of the page for 3 seconds, indicating the account has been removed.
 *
 * @component
 * @example
 * const [isDialogOpen, setDialogOpen] = useState(false);
 * const handleClose = () => setDialogOpen(false);
 * return (
 *   <DeleteAccountConfirmation open={isDialogOpen} onClose={handleClose} />
 * );
 *
 * @param {boolean} open - Boolean to control the visibility of the dialog.
 * @param {function} onClose - Callback function to close the dialog when the user clicks cancel or delete.
 * @returns {JSX.Element} The rendered DeleteAccountConfirmation component.
 */
const DeleteAccountConfirmation: React.FC<IDeleteAccountConfirmationProps> = ({
  open,
  onClose,
}) => {
  const [isBannerOpen, setIsBannerOpen] = useState<boolean>(false);

  /**
   * Handles the account deletion process.
   *
   * This function sets the banner to be visible for 3 seconds and closes the dialog.
   * The banner informs the user that the account has been removed.
   */
  const handleDeleteAccount = () => {
    setIsBannerOpen(true); // Show banner
    onClose(); // Close dialog
    setTimeout(() => setIsBannerOpen(false), 3000); // Auto close banner after 3 seconds
  };

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
        PaperProps={{
          sx: {
            width: "439px", // Custom width
            height: "240px", // Custom height
            maxWidth: "none", // Disable the default maxWidth behavior
            padding: "32px",
            overflowY: "none",
          },
        }}
      >
        <DialogTitle
          id="alert-dialog-title"
          sx={{ fontSize: "16px", padding: 0, paddingBottom: "16px" }}
        >
          {"Are you sure you want to delete this account?"}
        </DialogTitle>
        <DialogContent sx={{ padding: 0, overflowY: "hidden" }}>
          <DialogContentText
            id="alert-dialog-description"
            sx={{ padding: 0, overflowY: "hidden", fontSize: "13px" }}
          >
            When you delete this file, all the links associated with the file will also be removed.
            Note that this is a non-reversible action.
          </DialogContentText>
        </DialogContent>
        <DialogActions sx={{ padding: 0, paddingTop: "32px" }}>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="contained" onClick={handleDeleteAccount} color="error">
            Delete account
          </Button>
        </DialogActions>
      </Dialog>

      {/* Conditionally render banner when isBannerOpen is true */}
      {isBannerOpen && (
        <Banner onClose={onClose} bannerText={"This account is removed."} bannerWidth={"209px"} />
      )}
    </>
  );
};

export default DeleteAccountConfirmation;
