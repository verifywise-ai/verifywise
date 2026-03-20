import React, { useState, useEffect } from "react";
import {
  Drawer,
  Stack,
  Typography,
  Divider,
  IconButton,
  useTheme,
} from "@mui/material";
import { X } from "lucide-react";
import SelectComponent from "../../Inputs/Select";
import { CustomizableButton } from "../../button/customizable-button";
import { getAllEntities } from "../../../../application/repository/entity.repository";
import { apiServices } from "../../../../infrastructure/api/networkServices";

interface LinkModelModalProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  agentId: number;
  onSuccess: () => void;
}

const LinkModelModal: React.FC<LinkModelModalProps> = ({
  isOpen,
  setIsOpen,
  agentId,
  onSuccess,
}) => {
  const theme = useTheme();
  const [models, setModels] = useState<{ _id: number | string; name: string }[]>([]);
  const [selectedModelId, setSelectedModelId] = useState<string | number>("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      fetchModels();
    }
  }, [isOpen]);

  const fetchModels = async () => {
    try {
      const response = await getAllEntities({
        routeUrl: "/modelInventory",
      });
      const data = response?.data || [];
      setModels(
        data.map((m: any) => ({
          _id: m.id,
          name: m.model_name || m.name || `Model #${m.id}`,
        }))
      );
    } catch (error) {
      console.error("Failed to fetch models:", error);
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setSelectedModelId("");
  };

  const handleSubmit = async () => {
    if (!selectedModelId) return;

    setIsSubmitting(true);
    try {
      await apiServices.patch(`/agent-primitives/${agentId}/link-model`, {
        model_id: Number(selectedModelId),
      });
      handleClose();
      onSuccess();
    } catch (error) {
      console.error("Failed to link model:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={handleClose}
      PaperProps={{ sx: { width: 400, backgroundColor: theme.palette.background.modal || "#FCFCFD" } }}
    >
      {/* Header */}
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ p: "16px 24px" }}
      >
        <Typography fontSize={16} fontWeight={600}>
          Link to model
        </Typography>
        <IconButton onClick={handleClose} size="small">
          <X size={20} />
        </IconButton>
      </Stack>

      <Divider />

      {/* Content */}
      <Stack sx={{ p: "24px", gap: "20px", flex: 1 }}>
        <Typography fontSize={13} color="text.secondary">
          Select a model from the inventory to link with this agent.
        </Typography>

        <SelectComponent
          id="model-select"
          label="Model"
          placeholder="Select a model"
          value={selectedModelId}
          items={models}
          isRequired
          onChange={(e) => setSelectedModelId(e.target.value)}
        />
      </Stack>

      {/* Footer */}
      <Divider />
      <Stack direction="row" justifyContent="flex-end" gap={1} sx={{ p: "16px 24px" }}>
        <CustomizableButton
          variant="outlined"
          sx={{ border: "1px solid #d0d5dd" }}
          onClick={handleClose}
        >
          Cancel
        </CustomizableButton>
        <CustomizableButton
          variant="contained"
          sx={{ backgroundColor: "brand.primary", border: "1px solid brand.primary" }}
          onClick={handleSubmit}
          isDisabled={isSubmitting || !selectedModelId}
        >
          {isSubmitting ? "Linking..." : "Link model"}
        </CustomizableButton>
      </Stack>
    </Drawer>
  );
};

export default LinkModelModal;
