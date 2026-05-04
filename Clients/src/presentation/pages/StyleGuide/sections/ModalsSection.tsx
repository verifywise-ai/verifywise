import React, { useState } from "react";
import {
  Box,
  Stack,
  Typography,
  useTheme,
  Divider,
  Snackbar,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Drawer,
} from "@mui/material";
import { Copy, X } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import CodeBlock from "../components/CodeBlock";

const modalCodeSnippet = `// Using StandardModal pattern
const { isOpen, openModal, closeModal } = useStandardModal();
const onSubmitRef = useRef<() => void>(() => {});

<StandardModal
  isOpen={isOpen}
  onClose={closeModal}
  title="Modal title"
  onSubmitRef={onSubmitRef}
>
  <ModalContent onSubmit={handleSubmit} />
</StandardModal>`;

const drawerCodeSnippet = `<Drawer
  anchor="right"
  open={isOpen}
  onClose={onClose}
  PaperProps={{
    sx: {
      width: 400,
      backgroundColor: theme.palette.background.modal,
    },
  }}
>
  {/* Drawer content */}
</Drawer>`;

const ModalsSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [demoDrawerOpen, setDemoDrawerOpen] = useState(false);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  return (
    <Box sx={{ p: "32px 40px" }}>
      <Snackbar
        open={!!copiedText}
        autoHideDuration={2000}
        onClose={() => setCopiedText(null)}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />

      {/* Demo Modal */}
      <Dialog
        open={demoModalOpen}
        onClose={() => setDemoModalOpen(false)}
        PaperProps={{
          sx: {
            width: 480,
            maxWidth: "90vw",
            borderRadius: "4px",
            border: `1px solid ${theme.palette.border.light}`,
          },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            p: "16px 20px",
            borderBottom: `1px solid ${theme.palette.border.light}`,
          }}
        >
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.palette.text.primary }}>
            Example modal
          </Typography>
          <Box
            onClick={() => setDemoModalOpen(false)}
            sx={{
              cursor: "pointer",
              color: theme.palette.text.tertiary,
              "&:hover": { color: theme.palette.text.primary },
            }}
          >
            <X size={20} />
          </Box>
        </DialogTitle>
        <DialogContent sx={{ p: "20px" }}>
          <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
            This is the modal content area. Modals use background.modal (#FCFCFD) and include a
            header with title and close button, content area, and action buttons in the footer.
          </Typography>
        </DialogContent>
        <DialogActions
          sx={{
            p: "16px 20px",
            borderTop: `1px solid ${theme.palette.border.light}`,
            gap: "8px",
          }}
        >
          <CustomizableButton
            variant="outlined"
            color="secondary"
            text="Cancel"
            onClick={() => setDemoModalOpen(false)}
          />
          <CustomizableButton
            variant="contained"
            color="primary"
            text="Confirm"
            onClick={() => setDemoModalOpen(false)}
          />
        </DialogActions>
      </Dialog>

      {/* Demo Drawer */}
      <Drawer
        anchor="right"
        open={demoDrawerOpen}
        onClose={() => setDemoDrawerOpen(false)}
        PaperProps={{
          sx: {
            width: 400,
            backgroundColor: theme.palette.background.modal,
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            p: "16px 20px",
            borderBottom: `1px solid ${theme.palette.border.light}`,
          }}
        >
          <Typography sx={{ fontSize: 16, fontWeight: 600, color: theme.palette.text.primary }}>
            Example drawer
          </Typography>
          <Box
            onClick={() => setDemoDrawerOpen(false)}
            sx={{
              cursor: "pointer",
              color: theme.palette.text.tertiary,
              "&:hover": { color: theme.palette.text.primary },
            }}
          >
            <X size={20} />
          </Box>
        </Box>
        <Box sx={{ p: "20px", flex: 1 }}>
          <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
            Drawers slide in from the side and are used for detailed views, forms, or supplementary
            content. Standard width is 400px.
          </Typography>
        </Box>
        <Box
          sx={{
            p: "16px 20px",
            borderTop: `1px solid ${theme.palette.border.light}`,
            display: "flex",
            justifyContent: "flex-end",
            gap: "8px",
          }}
        >
          <CustomizableButton
            variant="outlined"
            color="secondary"
            text="Cancel"
            onClick={() => setDemoDrawerOpen(false)}
          />
          <CustomizableButton
            variant="contained"
            color="primary"
            text="Save"
            onClick={() => setDemoDrawerOpen(false)}
          />
        </Box>
      </Drawer>

      {/* Page Header */}
      <Box sx={{ mb: "32px" }}>
        <Typography
          sx={{
            fontSize: 24,
            fontWeight: 600,
            color: theme.palette.text.primary,
            mb: "8px",
          }}
        >
          Modals & drawers
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Overlay components for focused interactions, forms, and detailed views. Includes dialogs,
          modals, and side drawers.
        </Typography>
      </Box>

      {/* Modal Specifications */}
      <SpecSection title="Modal specifications">
        <SpecGrid>
          <SpecCard
            title="Background"
            value="#FCFCFD"
            note="theme.palette.background.modal"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Border"
            value="1px solid #eaecf0"
            note="theme.palette.border.light"
            onCopy={handleCopy}
          />
          <SpecCard title="Border radius" value="4px" note="Standard radius" onCopy={handleCopy} />
          <SpecCard
            title="Shadow"
            value="0px 4px 24px -4px rgba(16, 24, 40, 0.08)"
            note="theme.boxShadow"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Header padding"
            value="16px 20px"
            note="Title section"
            onCopy={handleCopy}
          />
          <SpecCard title="Content padding" value="20px" note="Body section" onCopy={handleCopy} />
          <SpecCard
            title="Footer padding"
            value="16px 20px"
            note="Actions section"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Title font"
            value="16px / 600"
            note="fontSize / fontWeight"
            onCopy={handleCopy}
          />
          <SpecCard title="Max width" value="600px" note="Standard dialog" onCopy={handleCopy} />
          <SpecCard title="Close icon" value="20px" note="X icon size" onCopy={handleCopy} />
          <SpecCard
            title="Button gap"
            value="8px"
            note="Between action buttons"
            onCopy={handleCopy}
          />
          <SpecCard
            title="Backdrop"
            value="rgba(0,0,0,0.5)"
            note="Overlay opacity"
            onCopy={handleCopy}
          />
        </SpecGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Live Demo */}
      <SpecSection title="Modal example">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standard modal with header, content, and footer sections.
        </Typography>

        <Box
          sx={{
            display: "flex",
            gap: "16px",
            mb: "24px",
          }}
        >
          <CustomizableButton
            variant="contained"
            color="primary"
            text="Open modal"
            onClick={() => setDemoModalOpen(true)}
          />
          <CustomizableButton
            variant="outlined"
            color="primary"
            text="Open drawer"
            onClick={() => setDemoDrawerOpen(true)}
          />
        </Box>

        <Box
          sx={{
            borderRadius: "4px",
            overflow: "hidden",
            border: `1px solid ${theme.palette.border.light}`,
          }}
        >
          <CodeBlock code={modalCodeSnippet} language="tsx" onCopy={handleCopy} />
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Modal Pattern */}
      <SpecSection title="StandardModal pattern">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          VerifyWise uses a StandardModal component with useStandardModal hook for consistent modal
          behavior.
        </Typography>

        <SpecTable
          onCopy={handleCopy}
          specs={[
            { property: "Hook", value: "useStandardModal()" },
            { property: "Returns", value: "{ isOpen, openModal, closeModal }" },
            { property: "Component", value: "<StandardModal />" },
            { property: "Props", value: "isOpen, onClose, title, onSubmitRef" },
            { property: "Submit pattern", value: "useRef<() => void>(() => {})" },
            { property: "Form handling", value: "Pass onSubmit to child, ref to modal" },
          ]}
        />
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Drawer Specifications */}
      <SpecSection title="Drawer specifications">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Side drawers for detailed views, forms, and supplementary content.
        </Typography>

        <SpecGrid columns={3}>
          <SpecCard title="Width" value="400px" note="Default drawer width" onCopy={handleCopy} />
          <SpecCard title="Anchor" value="right" note="Slide direction" onCopy={handleCopy} />
          <SpecCard title="Background" value="#FCFCFD" note="Same as modal" onCopy={handleCopy} />
          <SpecCard title="Header height" value="~52px" note="With padding" onCopy={handleCopy} />
          <SpecCard title="Content padding" value="20px" note="Body area" onCopy={handleCopy} />
          <SpecCard title="Footer height" value="~68px" note="With buttons" onCopy={handleCopy} />
        </SpecGrid>

        <Box
          sx={{
            mt: "24px",
            borderRadius: "4px",
            overflow: "hidden",
            border: `1px solid ${theme.palette.border.light}`,
          }}
        >
          <CodeBlock code={drawerCodeSnippet} language="tsx" onCopy={handleCopy} />
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Modal Sizes */}
      <SpecSection title="Modal sizes">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standard modal widths for different use cases.
        </Typography>

        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "16px",
            "@media (max-width: 900px)": {
              gridTemplateColumns: "repeat(1, 1fr)",
            },
          }}
        >
          <ModalSizeCard
            size="sm"
            width="400px"
            usage="Confirmations, simple forms"
            onCopy={handleCopy}
          />
          <ModalSizeCard
            size="md"
            width="600px"
            usage="Standard forms, details"
            onCopy={handleCopy}
          />
          <ModalSizeCard
            size="lg"
            width="800px"
            usage="Complex forms, tables"
            onCopy={handleCopy}
          />
        </Box>
      </SpecSection>

      {/* Developer Checklist */}
      <Box
        sx={{
          mt: "40px",
          p: "24px",
          backgroundColor: theme.palette.background.accent,
          borderRadius: "4px",
          border: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <Typography
          sx={{
            fontSize: 14,
            fontWeight: 600,
            color: theme.palette.text.primary,
            mb: "16px",
          }}
        >
          Developer checklist
        </Typography>
        <Stack spacing="8px">
          {[
            "Use StandardModal + useStandardModal hook for consistent behavior",
            "Modal pattern: useStandardModal + onSubmitRef for form handling",
            "Background color: theme.palette.background.modal (#FCFCFD)",
            "Include close button (X icon, 20px) in header",
            "Separate header, content, and footer with border-light",
            "Primary action on right, secondary (Cancel) on left",
            "Standard drawer width is 400px, anchor: right",
            "Use CustomizableButton for all modal/drawer actions",
          ].map((item, index) => (
            <Box
              key={index}
              sx={{
                display: "flex",
                alignItems: "flex-start",
                gap: "8px",
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  backgroundColor: theme.palette.primary.main,
                  mt: "6px",
                  flexShrink: 0,
                }}
              />
              <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                {item}
              </Typography>
            </Box>
          ))}
        </Stack>
      </Box>
    </Box>
  );
};

// Helper Components

const SpecSection: React.FC<{ title: string; children: React.ReactNode }> = ({
  title,
  children,
}) => {
  const theme = useTheme();
  return (
    <Box sx={{ mb: "16px" }}>
      <Typography
        sx={{
          fontSize: 18,
          fontWeight: 600,
          color: theme.palette.text.primary,
          mb: "16px",
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
};

const SpecGrid: React.FC<{ children: React.ReactNode; columns?: number }> = ({
  children,
  columns = 4,
}) => {
  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: "16px",
        "@media (max-width: 1200px)": {
          gridTemplateColumns: "repeat(3, 1fr)",
        },
        "@media (max-width: 900px)": {
          gridTemplateColumns: "repeat(2, 1fr)",
        },
      }}
    >
      {children}
    </Box>
  );
};

const SpecCard: React.FC<{
  title: string;
  value: string;
  note?: string;
  onCopy: (text: string) => void;
}> = ({ title, value, note, onCopy }) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Box
      onClick={() => onCopy(value)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        p: "16px",
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        cursor: "pointer",
        transition: "border-color 150ms ease",
        position: "relative",
        "&:hover": {
          borderColor: theme.palette.primary.main,
        },
      }}
    >
      {isHovered && (
        <Box
          sx={{
            position: "absolute",
            top: "8px",
            right: "8px",
            color: theme.palette.primary.main,
          }}
        >
          <Copy size={14} />
        </Box>
      )}
      <Typography
        sx={{
          fontSize: 11,
          color: theme.palette.text.tertiary,
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          mb: "4px",
        }}
      >
        {title}
      </Typography>
      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 600,
          color: theme.palette.text.primary,
          fontFamily: "monospace",
          wordBreak: "break-all",
        }}
      >
        {value}
      </Typography>
      {note && (
        <Typography
          sx={{
            fontSize: 11,
            color: theme.palette.text.accent,
            mt: "4px",
          }}
        >
          {note}
        </Typography>
      )}
    </Box>
  );
};

const SpecTable: React.FC<{
  specs: { property: string; value: string }[];
  onCopy: (text: string) => void;
}> = ({ specs, onCopy }) => {
  const theme = useTheme();
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <Box
      sx={{
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        overflow: "hidden",
      }}
    >
      {specs.map((spec, index) => (
        <Box
          key={index}
          onClick={() => onCopy(spec.value)}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            p: "10px 14px",
            borderBottom:
              index < specs.length - 1 ? `1px solid ${theme.palette.border.light}` : "none",
            cursor: "pointer",
            transition: "background-color 150ms ease",
            "&:hover": {
              backgroundColor: theme.palette.background.fill,
            },
          }}
        >
          <Typography
            sx={{
              fontSize: 12,
              color: theme.palette.text.secondary,
            }}
          >
            {spec.property}
          </Typography>
          <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 500,
                color: theme.palette.text.primary,
                fontFamily: "monospace",
              }}
            >
              {spec.value}
            </Typography>
            {hoveredIndex === index && <Copy size={12} color={theme.palette.primary.main} />}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

const ModalSizeCard: React.FC<{
  size: string;
  width: string;
  usage: string;
  onCopy: (text: string) => void;
}> = ({ size, width, usage, onCopy }) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);

  // Calculate visual width as percentage (400px = 50%, 600px = 75%, 800px = 100%)
  const visualWidth = size === "sm" ? "50%" : size === "md" ? "75%" : "100%";

  return (
    <Box
      onClick={() => onCopy(width)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      sx={{
        p: "16px",
        backgroundColor: theme.palette.background.alt,
        borderRadius: "4px",
        border: `1px solid ${theme.palette.border.light}`,
        cursor: "pointer",
        transition: "border-color 150ms ease",
        position: "relative",
        "&:hover": {
          borderColor: theme.palette.primary.main,
        },
      }}
    >
      {isHovered && (
        <Box
          sx={{
            position: "absolute",
            top: "8px",
            right: "8px",
            color: theme.palette.primary.main,
          }}
        >
          <Copy size={14} />
        </Box>
      )}

      {/* Visual representation */}
      <Box
        sx={{
          height: 40,
          width: visualWidth,
          backgroundColor: theme.palette.background.main,
          border: `1px solid ${theme.palette.border.dark}`,
          borderRadius: "2px",
          mb: "12px",
        }}
      />

      <Typography
        sx={{
          fontSize: 14,
          fontWeight: 600,
          color: theme.palette.text.primary,
          mb: "2px",
          textTransform: "uppercase",
        }}
      >
        {size}
      </Typography>
      <Typography
        sx={{
          fontSize: 14,
          fontFamily: "monospace",
          color: theme.palette.text.accent,
          mb: "8px",
        }}
      >
        {width}
      </Typography>
      <Typography
        sx={{
          fontSize: 11,
          color: theme.palette.text.tertiary,
        }}
      >
        {usage}
      </Typography>
    </Box>
  );
};

export default ModalsSection;
