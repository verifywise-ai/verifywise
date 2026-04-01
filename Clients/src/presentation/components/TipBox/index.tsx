import { useState } from "react";
import { Box, keyframes } from "@mui/material";
import { useTipManager } from "../../../application/hooks/useTipManager";
import InfoBox from "../InfoBox";

interface TipBoxProps {
  entityName: string;
}

// Fade-in animation (opacity only to prevent scroll)
const fadeIn = keyframes`
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
`;

// Fade-out animation
const fadeOut = keyframes`
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-8px);
  }
`;

/**
 * TipBox component that displays entity-specific tips to users.
 * Tips are shown one at a time and dismissed permanently when closed.
 * The next tip appears on the user's next visit to the entity page.
 */
const TipBox = ({ entityName }: TipBoxProps) => {
  const { currentTip, dismissTip, currentTipNumber, totalTips } = useTipManager(entityName);
  const [isClosing, setIsClosing] = useState(false);

  if (!currentTip) {
    return null;
  }

  const tipCounter = `Tip ${currentTipNumber} of ${totalTips}`;

  const handleDismiss = () => {
    // Trigger fade-out animation for the entire TipBox (including chip)
    setIsClosing(true);

    // Wait for animation to complete, then call dismissTip
    setTimeout(() => {
      dismissTip();
    }, 300); // Match animation duration
  };

  return (
    <Box
      sx={{
        marginTop: "8px",
        marginBottom: "8px",
        animation: isClosing
          ? `${fadeOut} 0.3s ease-out forwards`
          : `${fadeIn} 0.3s ease-out`,
        position: "relative",
      }}
    >
      {tipCounter && (
        <Box
          sx={{
            position: "absolute",
            top: -8,
            right: 16,
            backgroundColor: "background.surface",
            border: "1px solid #E5E5E5",
            borderRadius: "4px",
            padding: "2px 8px",
            fontSize: 10,
            fontWeight: 500,
            color: "#999",
            zIndex: 1,
          }}
        >
          {tipCounter}
        </Box>
      )}
      <InfoBox
        header={currentTip.header}
        message={currentTip.content}
        storageKey={`tip_${entityName}`}
        variant="info"
        onDismiss={handleDismiss}
        disableInternalStorage={true}
        disableAnimation={true}
        backgroundColor="linear-gradient(135deg, #EFF6FF 0%, #F8FBFF 100%)"
        borderColor="#DBEAFE"
      />
    </Box>
  );
};

export default TipBox;
