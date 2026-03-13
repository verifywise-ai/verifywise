import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { ThumbsUp, ThumbsDown, Flag } from "lucide-react";
import { RiskLibraryFeedback } from "../../../domain/types/RiskLibrary";

interface Props {
  entryId: number;
  feedback: RiskLibraryFeedback;
  onSubmit: (params: {
    id: number;
    feedback_type: "upvote" | "downvote" | "flag";
    flag_reason?: string;
  }) => void;
  onRemove: (params: { id: number }) => void;
  isSubmitting?: boolean;
  compact?: boolean;
}

const FeedbackButtons = ({
  entryId,
  feedback,
  onSubmit,
  onRemove,
  isSubmitting = false,
  compact = false,
}: Props) => {
  const [flagDialogOpen, setFlagDialogOpen] = useState(false);
  const [flagReason, setFlagReason] = useState("");

  const handleVote = (type: "upvote" | "downvote") => {
    if (feedback.userVote === type) {
      onRemove({ id: entryId });
    } else {
      onSubmit({ id: entryId, feedback_type: type });
    }
  };

  const handleFlag = () => {
    setFlagDialogOpen(true);
  };

  const handleFlagSubmit = () => {
    onSubmit({
      id: entryId,
      feedback_type: "flag",
      flag_reason: flagReason,
    });
    setFlagDialogOpen(false);
    setFlagReason("");
  };

  const handleFlagClose = () => {
    setFlagDialogOpen(false);
    setFlagReason("");
  };

  if (compact) {
    return (
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
        <Tooltip title={feedback.userVote === "upvote" ? "Remove vote" : "Upvote"}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleVote("upvote");
            }}
            disabled={isSubmitting}
            color={feedback.userVote === "upvote" ? "primary" : "default"}
          >
            <ThumbsUp size={14} />
          </IconButton>
        </Tooltip>
        {feedback.upvotes > 0 && (
          <Typography variant="caption" color="text.secondary">
            {feedback.upvotes}
          </Typography>
        )}
        <Tooltip title={feedback.userVote === "downvote" ? "Remove vote" : "Downvote"}>
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              handleVote("downvote");
            }}
            disabled={isSubmitting}
            color={feedback.userVote === "downvote" ? "error" : "default"}
          >
            <ThumbsDown size={14} />
          </IconButton>
        </Tooltip>
        {feedback.downvotes > 0 && (
          <Typography variant="caption" color="text.secondary">
            {feedback.downvotes}
          </Typography>
        )}
      </Box>
    );
  }

  return (
    <>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <Tooltip title={feedback.userVote === "upvote" ? "Remove vote" : "This risk is relevant"}>
          <IconButton
            size="small"
            onClick={() => handleVote("upvote")}
            disabled={isSubmitting}
            color={feedback.userVote === "upvote" ? "primary" : "default"}
            sx={{
              border: "1px solid",
              borderColor: feedback.userVote === "upvote" ? "primary.main" : "divider",
              borderRadius: 1,
              px: 1.5,
              gap: 0.5,
            }}
          >
            <ThumbsUp size={16} />
            <Typography variant="caption" fontWeight={600}>
              {feedback.upvotes}
            </Typography>
          </IconButton>
        </Tooltip>

        <Tooltip title={feedback.userVote === "downvote" ? "Remove vote" : "Not relevant"}>
          <IconButton
            size="small"
            onClick={() => handleVote("downvote")}
            disabled={isSubmitting}
            color={feedback.userVote === "downvote" ? "error" : "default"}
            sx={{
              border: "1px solid",
              borderColor: feedback.userVote === "downvote" ? "error.main" : "divider",
              borderRadius: 1,
              px: 1.5,
              gap: 0.5,
            }}
          >
            <ThumbsDown size={16} />
            <Typography variant="caption" fontWeight={600}>
              {feedback.downvotes}
            </Typography>
          </IconButton>
        </Tooltip>

        <Tooltip title="Flag this entry">
          <IconButton
            size="small"
            onClick={handleFlag}
            disabled={isSubmitting || feedback.userVote === "flag"}
            color={feedback.userVote === "flag" ? "warning" : "default"}
            sx={{
              border: "1px solid",
              borderColor: feedback.userVote === "flag" ? "warning.main" : "divider",
              borderRadius: 1,
              px: 1.5,
              gap: 0.5,
            }}
          >
            <Flag size={16} />
            {feedback.flags > 0 && (
              <Typography variant="caption" fontWeight={600}>
                {feedback.flags}
              </Typography>
            )}
          </IconButton>
        </Tooltip>
      </Box>

      <Dialog open={flagDialogOpen} onClose={handleFlagClose} maxWidth="sm" fullWidth>
        <DialogTitle>Flag this risk entry</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Please describe why this entry should be reviewed. Common reasons include
            inaccurate information, duplicate entry, or inappropriate content.
          </Typography>
          <TextField
            autoFocus
            fullWidth
            multiline
            rows={3}
            label="Reason"
            value={flagReason}
            onChange={(e) => setFlagReason(e.target.value)}
            placeholder="Describe the issue with this entry..."
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleFlagClose}>Cancel</Button>
          <Button
            onClick={handleFlagSubmit}
            variant="contained"
            color="warning"
            disabled={!flagReason.trim()}
          >
            Submit Flag
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default FeedbackButtons;
