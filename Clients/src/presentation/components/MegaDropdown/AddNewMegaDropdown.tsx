import React, { useState } from "react";
import { Box, Popover, Typography, Button } from "@mui/material";
import { useNavigate } from "react-router-dom";
import {
  FolderTree,
  Building,
  ListIcon,
  AlertTriangle,
  Shield,
  GraduationCap,
  AlertCircle,
  Plus,
} from "lucide-react";
import { brand, background } from "../../themes/palette";

/**
 * Represents a single item in the mega dropdown menu
 */
interface MegaDropdownItem {
  /** Unique identifier for the menu item */
  id: string;
  /** Display label shown to the user */
  label: string;
  /** Icon component displayed above the label */
  icon: React.ReactNode;
  /** Navigation path where clicking the item will navigate */
  path: string;
  /** Optional state passed to the navigation (e.g., to open a modal) */
  state?: { openCreateModal?: boolean; tab?: string };
}

const items: MegaDropdownItem[] = [
  {
    id: "use-case",
    label: "Use case",
    icon: <FolderTree size={20} strokeWidth={1.5} color="#81C784" />,
    path: "/overview",
    state: { openCreateModal: true },
  },
  {
    id: "vendor",
    label: "Vendor",
    icon: <Building size={20} strokeWidth={1.5} color="#64B5F6" />,
    path: "/vendors",
    state: { openCreateModal: true },
  },
  {
    id: "model",
    label: "Model",
    icon: <ListIcon size={20} strokeWidth={1.5} color="#BA68C8" />,
    path: "/model-inventory",
    state: { openCreateModal: true },
  },
  {
    id: "risk",
    label: "Risk",
    icon: <AlertTriangle size={20} strokeWidth={1.5} color="#FFB74D" />,
    path: "/risk-management",
    state: { openCreateModal: true },
  },
  {
    id: "policy",
    label: "Policy",
    icon: <Shield size={20} strokeWidth={1.5} color="#7986CB" />,
    path: "/policies/new",
  },
  {
    id: "vendor-risk",
    label: "Vendor risk",
    icon: <Building size={20} strokeWidth={1.5} color="#E57373" />,
    path: "/vendors/risks",
    state: { openCreateModal: true },
  },
  {
    id: "model-risk",
    label: "Model risk",
    icon: <AlertTriangle size={20} strokeWidth={1.5} color="#F06292" />,
    path: "/model-inventory/model-risks",
    state: { openCreateModal: true },
  },
  {
    id: "training",
    label: "Training",
    icon: <GraduationCap size={20} strokeWidth={1.5} color="#4DD0E1" />,
    path: "/training",
    state: { openCreateModal: true },
  },
  {
    id: "ai-incident",
    label: "Incident",
    icon: <AlertCircle size={20} strokeWidth={1.5} color="#FF8A65" />,
    path: "/ai-incident-managements",
    state: { openCreateModal: true },
  },
];

/**
 * Props for the AddNewMegaDropdown component
 */
interface AddNewMegaDropdownProps {
  /** Custom label for the dropdown button (defaults to "Add new") */
  buttonLabel?: string;
}

const AddNewMegaDropdown: React.FC<AddNewMegaDropdownProps> = ({
  buttonLabel = "Add new",
}) => {
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
    setHoveredItem(null);
  };

  const handleItemClick = (item: MegaDropdownItem) => {
    if (item.state) {
      navigate(item.path, { state: item.state });
    } else {
      navigate(item.path);
    }
    handleClose();
  };

  const open = Boolean(anchorEl);
  const id = open ? "add-new-mega-dropdown" : undefined;

  return (
    <>
      <Button
        variant="contained"
        size="small"
        startIcon={<Plus size={14} />}
        onClick={handleClick}
        sx={{
          background: `${brand.primary}`,
          color: "white",
          fontWeight: 500,
          fontSize: "13px",
          height: "34px",
          minHeight: "34px",
          padding: "0 12px",
          borderRadius: "4px",
          textTransform: "none",
          boxShadow: "none",
          "&:hover": {
            background: "#0f5f4c",
            boxShadow: "none",
          },
          transition: "background 0.2s ease",
        }}
      >
        {buttonLabel}
      </Button>

      <Popover
        id={id}
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        sx={{
          mt: 1,
          "& .MuiPopover-paper": {
            borderRadius: "12px",
            boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
            overflow: "hidden",
            backgroundColor: `${background.main}`,
          },
        }}
      >
        <Box
          role="menu"
          aria-label="Add new item menu"
          sx={{
            p: 1.5,
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 1,
          }}
        >
          {items.map((item) => (
            <Box
              key={item.id}
              role="menuitem"
              tabIndex={0}
              aria-label={`Create new ${item.label}`}
              onClick={() => handleItemClick(item)}
              onMouseEnter={() => setHoveredItem(item.id)}
              onMouseLeave={() => setHoveredItem(null)}
              onKeyDown={(e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleItemClick(item);
                }
              }}
              sx={{
                borderRadius: "8px",
                padding: "12px 8px",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                backgroundColor: hoveredItem === item.id ? "background.surface" : "transparent",
                border: hoveredItem === item.id ? "1px solid #e0e0e0" : "1px solid transparent",
                transition: "all 0.15s ease",
                minWidth: "90px",
                position: "relative",
                "&:active": {
                  transform: "scale(0.97)",
                },
              }}
            >
              {/* Icon container with rounded background */}
              <Box
                sx={{
                  width: 40,
                  height: 40,
                  borderRadius: "10px",
                  backgroundColor: "background.main",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.15s ease",
                }}
              >
                {item.icon}
              </Box>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 400,
                  fontSize: "12px",
                  color: "#1a1a1a",
                  textAlign: "center",
                  lineHeight: 1.2,
                }}
              >
                {item.label}
              </Typography>
            </Box>
          ))}
        </Box>
      </Popover>
    </>
  );
};

export default AddNewMegaDropdown;
