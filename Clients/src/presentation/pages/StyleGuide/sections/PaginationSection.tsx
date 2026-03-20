import React, { useState } from "react";
import { Box, Stack, Typography, useTheme, Divider, Snackbar, Button } from "@mui/material";
import { Copy, ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight } from "lucide-react";
import CodeBlock from "../components/CodeBlock";

const paginationSnippets = {
  basic: `import TablePaginationActions from "../TablePagination";

<TablePaginationActions
  count={100}
  page={currentPage}
  rowsPerPage={10}
  onPageChange={(event, newPage) => setCurrentPage(newPage)}
/>`,
  withTable: `import { TablePagination } from "@mui/material";
import TablePaginationActions from "../TablePagination";

<TablePagination
  component="div"
  count={totalRows}
  page={page}
  onPageChange={handlePageChange}
  rowsPerPage={rowsPerPage}
  onRowsPerPageChange={handleRowsPerPageChange}
  ActionsComponent={TablePaginationActions}
  rowsPerPageOptions={[5, 10, 25, 50]}
/>`,
};

const PaginationSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [demoPage, setDemoPage] = useState(0);

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedText(text);
    setTimeout(() => setCopiedText(null), 2000);
  };

  const totalPages = 10;

  return (
    <Box sx={{ p: "32px 40px" }}>
      <Snackbar
        open={!!copiedText}
        autoHideDuration={2000}
        onClose={() => setCopiedText(null)}
        message="Copied to clipboard"
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      />

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
          Pagination
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Table pagination controls for navigating through data sets.
          Uses lucide-react icons for navigation buttons.
        </Typography>
      </Box>

      {/* Pagination Actions */}
      <SpecSection title="TablePaginationActions">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Custom pagination actions component with first, previous, next, and last page buttons.
        </Typography>

        <Box sx={{ display: "flex", gap: "40px", flexWrap: "wrap" }}>
          <Box sx={{ flex: "1 1 500px", minWidth: 320 }}>
            <Stack spacing="24px">
              <ExampleWithCode
                label="Interactive demo"
                code={paginationSnippets.basic}
                onCopy={handleCopy}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                    Page {demoPage + 1} of {totalPages}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    <Button
                      variant="text"
                      onClick={() => setDemoPage(0)}
                      disabled={demoPage === 0}
                      sx={{ minWidth: 36, p: "6px" }}
                    >
                      <ChevronsLeft size={16} />
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => setDemoPage(demoPage - 1)}
                      disabled={demoPage === 0}
                      sx={{ minWidth: 36, p: "6px" }}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => setDemoPage(demoPage + 1)}
                      disabled={demoPage >= totalPages - 1}
                      sx={{ minWidth: 36, p: "6px" }}
                    >
                      <ChevronRight size={16} />
                    </Button>
                    <Button
                      variant="text"
                      onClick={() => setDemoPage(totalPages - 1)}
                      disabled={demoPage >= totalPages - 1}
                      sx={{ minWidth: 36, p: "6px" }}
                    >
                      <ChevronsRight size={16} />
                    </Button>
                  </Box>
                </Box>
              </ExampleWithCode>

              <ExampleWithCode
                label="With MUI TablePagination"
                code={paginationSnippets.withTable}
                onCopy={handleCopy}
              >
                <Box
                  sx={{
                    p: "12px",
                    backgroundColor: theme.palette.background.fill,
                    borderRadius: "4px",
                  }}
                >
                  <Typography sx={{ fontSize: 12, color: theme.palette.text.accent, mb: "8px" }}>
                    TablePaginationActions is used as ActionsComponent in MUI TablePagination
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: "24px",
                    }}
                  >
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      Rows per page: 10
                    </Typography>
                    <Typography sx={{ fontSize: 13, color: theme.palette.text.secondary }}>
                      1-10 of 100
                    </Typography>
                    <Box sx={{ display: "flex" }}>
                      <Button variant="text" disabled sx={{ minWidth: 36, p: "6px" }}>
                        <ChevronsLeft size={16} />
                      </Button>
                      <Button variant="text" disabled sx={{ minWidth: 36, p: "6px" }}>
                        <ChevronLeft size={16} />
                      </Button>
                      <Button variant="text" sx={{ minWidth: 36, p: "6px" }}>
                        <ChevronRight size={16} />
                      </Button>
                      <Button variant="text" sx={{ minWidth: 36, p: "6px" }}>
                        <ChevronsRight size={16} />
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </ExampleWithCode>
            </Stack>
          </Box>

          <Box sx={{ flex: "1 1 300px", minWidth: 280 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Component specifications
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "Icon size", value: "16px" },
                { property: "Button variant", value: "text" },
                { property: "Button min-width", value: "36px" },
                { property: "Button padding", value: "6px" },
                { property: "Container margin-left", value: "6px (theme.spacing(3))" },
                { property: "Disabled opacity", value: "0.38" },
              ]}
            />

            <Typography sx={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.secondary, mb: "16px", mt: "24px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Icons used
            </Typography>
            <SpecTable
              onCopy={handleCopy}
              specs={[
                { property: "First page", value: "ChevronsLeft" },
                { property: "Previous page", value: "ChevronLeft" },
                { property: "Next page", value: "ChevronRight" },
                { property: "Last page", value: "ChevronsRight" },
              ]}
            />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* MUI Pagination Styling */}
      <SpecSection title="MUI Pagination styling">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Theme overrides for MUI Pagination component (defined in light.ts).
        </Typography>

        <Box sx={{ display: "flex", gap: "16px", flexWrap: "wrap", mb: "24px" }}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              gap: "4px",
              p: "8px 12px",
              border: `1px solid ${theme.palette.border.light}`,
              borderRadius: "4px",
              backgroundColor: theme.palette.background.main,
            }}
          >
            {[1, 2, 3, "...", 8, 9, 10].map((item, index) => (
              <Box
                key={index}
                sx={{
                  width: 32,
                  height: 32,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "4px",
                  fontSize: 13,
                  color: item === 1 ? theme.palette.text.primary : theme.palette.text.tertiary,
                  backgroundColor: item === 1 ? theme.palette.background.fill : "transparent",
                  cursor: typeof item === "number" ? "pointer" : "default",
                  "&:hover": typeof item === "number" ? {
                    backgroundColor: theme.palette.background.fill,
                  } : {},
                }}
              >
                {item}
              </Box>
            ))}
          </Box>
        </Box>

        <SpecTable
          onCopy={handleCopy}
          specs={[
            { property: "Background", value: "background.main (background.main)" },
            { property: "Border", value: "1px solid #eaecf0" },
            { property: "Button color", value: "text.tertiary (text.tertiary)" },
            { property: "Button border radius", value: "4px" },
            { property: "First/last button border", value: "1px solid #eaecf0" },
            { property: "Selected background", value: "background.fill (#F4F4F4)" },
            { property: "Hover background", value: "background.fill (#F4F4F4)" },
          ]}
        />
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
            "Use TablePaginationActions as ActionsComponent in MUI TablePagination",
            "Icons are from lucide-react (ChevronsLeft, ChevronLeft, ChevronRight, ChevronsRight)",
            "Buttons are automatically disabled at first/last page",
            "Page is 0-indexed internally but displayed as 1-indexed to users",
            "Common rowsPerPage options: [5, 10, 25, 50]",
            "Theme styling for MuiPagination is defined in light.ts",
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
              index < specs.length - 1
                ? `1px solid ${theme.palette.border.light}`
                : "none",
            cursor: "pointer",
            transition: "background-color 150ms ease",
            "&:hover": {
              backgroundColor: theme.palette.background.fill,
            },
          }}
        >
          <Typography sx={{ fontSize: 12, color: theme.palette.text.secondary }}>
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
            {hoveredIndex === index && (
              <Copy size={12} color={theme.palette.primary.main} />
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

const ExampleWithCode: React.FC<{
  label: string;
  code: string;
  onCopy: (text: string) => void;
  children: React.ReactNode;
}> = ({ label, code, onCopy, children }) => {
  const theme = useTheme();
  const [showCode, setShowCode] = useState(true);

  return (
    <Box
      sx={{
        border: `1px solid ${theme.palette.border.light}`,
        borderRadius: "4px",
        overflow: "hidden",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          p: "8px 12px",
          backgroundColor: theme.palette.background.alt,
          borderBottom: `1px solid ${theme.palette.border.light}`,
        }}
      >
        <Typography sx={{ fontSize: 12, fontWeight: 500, color: theme.palette.text.secondary }}>
          {label}
        </Typography>
        <Box
          onClick={() => setShowCode(!showCode)}
          sx={{
            fontSize: 11,
            color: showCode ? theme.palette.primary.main : theme.palette.text.tertiary,
            cursor: "pointer",
            "&:hover": { color: theme.palette.primary.main },
          }}
        >
          {showCode ? "Hide code" : "Show code"}
        </Box>
      </Box>

      <Box sx={{ p: "16px", backgroundColor: theme.palette.background.main }}>
        {children}
      </Box>

      {showCode && (
        <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
          <CodeBlock code={code} language="tsx" onCopy={onCopy} />
        </Box>
      )}
    </Box>
  );
};

export default PaginationSection;
