import {
  Button,
  Modal,
  Stack,
  Typography,
  useTheme,
  Divider,
  Box,
  Tabs,
  Tab,
} from "@mui/material";
import { X as CloseIcon } from "lucide-react";

import React, { useState } from "react";
import DropDowns from "../../Inputs/Dropdowns";
import AuditorFeedback from "../ComplianceFeedback/ComplianceFeedback";
import { ICustomModalProps } from "../../../../domain/interfaces/i.customs";
import { border as borderPalette } from "../../../themes/palette";

const CustomModal: React.FC<ICustomModalProps> = ({
  isOpen,
  setIsOpen,
  title,
  content,
  subControlTlts,
}) => {
  const theme = useTheme();
  const [selectedTab, setSelectedTab] = useState<number>(0); // State to track active tab

  const [activeSection, setActiveSection] = useState<string>("Overview");
  const [responseMessage, _] = useState<string | null>(null);

  const handleClose = () => setIsOpen(false);

  const handleSelectedTab = (_: React.SyntheticEvent, newValue: number) => {
    setSelectedTab(newValue);
  };

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
  };

  // const handleSave = async () => {
  //   try {
  //     const { status, data } = await onConfirm();
  //     const response = (STATUS_CODE as any)[status](data);
  //     setResponseMessage(response.message);
  //   } catch (error) {
  //     setResponseMessage("An unexpected error occurred. Please try again.");
  //   }
  // };

  const buttonTabStyles = {
    backgroundColor: `${borderPalette.light}`,
    color: "Black",
    borderColor: `${borderPalette.light}`,
    borderTop: 0,
    borderBottom: 0,
    borderRadius: 0,
    fontWeight: 500,
    boxShadow: "none",
    textTransform: "none",
    "&:hover": {
      boxShadow: "none",
    },
  };

  const buttonStyle = {
    fontSize: 13,
    textTransform: "capitalize",
    backgroundColor: "#4C7DE7",
    boxShadow: "none",
    borderRadius: "4px",
    border: "1px solid #175CD3",
    "&:hover": {
      boxShadow: "none",
      backgroundColor: "#175CD3 ",
    },
  };

  const getVariant = (activeSection: string, section: string) => {
    return activeSection === section ? "contained" : "outlined";
  };

  return (
    <Modal
      open={isOpen}
      onClose={(_event, reason) => {
        if (reason !== "backdropClick") {
          handleClose();
        }
      }}
    >
      <Stack
        gap={theme.spacing(4)}
        sx={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          width: 800,
          bgcolor: theme.palette.background.alt,
          borderRadius: theme.shape.borderRadius,
          boxShadow: 24,
          paddingY: theme.spacing(15),
          paddingX: theme.spacing(20),
          "&:focus": {
            outline: "none",
          },
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <Stack
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Typography fontSize={16} fontWeight={600} sx={{ textAlign: "left" }}>
            {title}
          </Typography>

          <CloseIcon
            size={20}
            onClick={handleClose}
            style={{ cursor: "pointer" }}
          />
        </Stack>
        <Typography fontSize={13}>{content}</Typography>
        <DropDowns />

        {responseMessage && (
          <Typography
            fontSize={13}
            color="error"
            sx={{ mb: 2, fontWeight: 500 }}
          >
            {responseMessage}
          </Typography>
        )}
        <Divider sx={{ borderColor: "#C2C2C2", mt: theme.spacing(3) }} />

        <Box sx={{ width: "100%", bgcolor: "#FCFCFD" }}>
          <Tabs
            value={selectedTab}
            onChange={handleSelectedTab}
            indicatorColor="primary"
            sx={{
              justifyContent: "flex-start",
              '& .MuiTab-root': {
                color: 'primary.main',
              },
              '& .Mui-selected': {
                color: 'primary.main',
              }
            }}
          >
            {subControlTlts.map((_, index) => (
              <Tab
                key={index}
                label={`Subcontrol ${index + 1}`}
                sx={{ textTransform: "none" }}
              />
            ))}
          </Tabs>
        </Box>

        <Stack
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "flex-start",
            borderRadius: "4px",
            border: "1px solid #eaecf0",
            width: "fit-content",
          }}
        >
          {["Overview", "Evidence", "Auditor Feedback"].map(
            (section, index) => (
              <Button
                key={index}
                variant={getVariant(activeSection, section)}
                onClick={() => handleSectionChange(section)}
                disableRipple
                sx={{
                  ...buttonTabStyles,
                  backgroundColor:
                    activeSection === section ? "border.light" : "transparent",
                  fontWeight: activeSection === section ? "500" : 300,
                }}
              >
                {section}
              </Button>
            )
          )}
        </Stack>

        {/* Dynamic Content Based on Active Section */}
        <Box>
          <Typography
            fontSize={16}
            fontWeight={600}
            sx={{ textAlign: "left", mb: 3 }}
          >
            {subControlTlts[selectedTab]}
          </Typography>
          <Typography variant="body1" sx={{ mb: 5 }}>
            {"hiiiiiiiiiiiiiiiiii =D"}
            Lorem ipsum dolor sit amet consectetur adipisicing elit. Similique
            atque natus accusantium molestiae illum labore a ut dolorem
            doloribus maiores rerum quibusdam, sapiente amet itaque ad culpa
            quidem nostrum quo mollitia nihil reiciendis autem perspiciatis
            minus nobis. Ab delectus consequatur harum minima similique
            possimus? Nostrum at porro vel nisi assumenda facere voluptatem
            nobis fuga repudiandae in minus temporibus voluptatibus sint
            accusamus quia laboriosam laudantium, eum optio facilis, aliquam
            quasi quae a consequuntur. Sed quibusdam beatae perferendis dolorum
            nihil harum sunt unde vel pariatur quasi id placeat nulla accusamus
            delectus deleniti soluta illum dolorem, reprehenderit explicabo quo
            ex? Quod, non illum.
          </Typography>
          {activeSection === "Overview" && (
            <Typography variant="body1">
              <DropDowns />
            </Typography>
          )}
          {["Evidence", "Auditor Feedback"].includes(activeSection) && (
            <AuditorFeedback
              activeSection={activeSection}
              feedback=""
              onChange={(e) => console.log(e.target.value)}
              files={[]}
              deletedFilesIds={[]}
              onDeletedFilesChange={(ids) => console.log("Deleted Files:", ids)} // Add a handler
              uploadFiles={[]}
              onUploadFilesChange={(files) =>
                console.log("Uploaded Files:", files)
              } // Add a handler
            />
          )}
        </Box>
        <Stack
          sx={{
            display: "flex",
            flexDirection: "row",
            justifyContent: "space-between",
            mt: 2,
          }}
        >
          <Stack
            gap={theme.spacing(4)}
            sx={{ display: "flex", flexDirection: "row" }}
          >
            <Button
              variant="contained"
              onClick={() => console.log("Previous Subcontrol clicked")}
              sx={buttonStyle}
              disableRipple
            >
              &lt;- Previous Subcontrol
            </Button>
            <Button
              variant="contained"
              onClick={() => console.log("Next Subcontrol clicked")}
              sx={buttonStyle}
              disableRipple
            >
              Next Subcontrol -&gt;
            </Button>
          </Stack>
          <Button
            variant="contained"
            // onClick={handleSave}
            sx={{
              ...buttonStyle,
              width: 68,
              "&:hover": {
                backgroundColor: "#175CD3 ",
              },
            }}
            disableRipple
          >
            Save
          </Button>
        </Stack>
      </Stack>
    </Modal>
  );
};

export default CustomModal;
