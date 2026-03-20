import React, { useState } from "react";
import {
  Box,
  Stack,
  Typography,
  useTheme,
  Divider,
  Snackbar,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from "@mui/material";
import { Copy } from "lucide-react";
import CodeBlock from "../components/CodeBlock";
import { text, background } from "../../../themes/palette";

// Sample table data
const sampleData = {
  columns: ["Name", "Email", "Role", "Status"],
  rows: [
    { name: "John Doe", email: "john@example.com", role: "Admin", status: "Active" },
    { name: "Jane Smith", email: "jane@example.com", role: "Editor", status: "Active" },
    { name: "Bob Wilson", email: "bob@example.com", role: "Viewer", status: "Inactive" },
  ],
};

const tableCodeSnippet = `<TableContainer>
  <Table sx={singleTheme.tableStyles.primary.frame}>
    <TableHead
      sx={{
        backgroundColor:
          singleTheme.tableStyles.primary.header.backgroundColors,
      }}
    >
      <TableRow sx={singleTheme.tableStyles.primary.header.row}>
        {columns.map((col) => (
          <TableCell
            key={col.id}
            style={singleTheme.tableStyles.primary.header.cell}
          >
            {col.name}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
    <TableBody>
      {rows.map((row) => (
        <TableRow
          key={row.id}
          sx={singleTheme.tableStyles.primary.body.row}
        >
          <TableCell>{row.name}</TableCell>
          {/* ... more cells */}
        </TableRow>
      ))}
    </TableBody>
  </Table>
</TableContainer>`;

const TablesSection: React.FC = () => {
  const theme = useTheme();
  const [copiedText, setCopiedText] = useState<string | null>(null);

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
          Tables
        </Typography>
        <Typography
          sx={{
            fontSize: 14,
            color: theme.palette.text.tertiary,
            maxWidth: 600,
          }}
        >
          Data tables for displaying lists, grids, and tabular data. All tables use consistent
          styling from singleTheme.tableStyles.
        </Typography>
      </Box>

      {/* Shared Specifications */}
      <SpecSection title="Table specifications">
        <SpecGrid>
          <SpecCard title="Border" value="1px solid #d0d5dd" note="Frame border" onCopy={handleCopy} />
          <SpecCard title="Border radius" value="4px" note="Container corners" onCopy={handleCopy} />
          <SpecCard title="Cell padding" value="12px 10px" note="Header and body cells" onCopy={handleCopy} />
          <SpecCard title="Min column width" value="120px" note="Prevents column collapse" onCopy={handleCopy} />
          <SpecCard title="Row height" value="~44px" note="With padding" onCopy={handleCopy} />
          <SpecCard title="Header font" value="13px" note="fontSizes.medium" onCopy={handleCopy} />
          <SpecCard title="Header weight" value="400" note="Regular weight" onCopy={handleCopy} />
          <SpecCard title="Header text" value="uppercase" note="Text transform" onCopy={handleCopy} />
          <SpecCard title="Header color" value={text.tertiary} note="text.tertiary" onCopy={handleCopy} />
          <SpecCard title="Header bg" value="linear-gradient(180deg, background.accent 0%, background.hover 100%)" note="Gradient background" onCopy={handleCopy} />
          <SpecCard title="Body bg" value={background.main} note="White background" onCopy={handleCopy} />
          <SpecCard title="Row hover bg" value="#fafafa" note="Hover state" onCopy={handleCopy} />
        </SpecGrid>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Live Example */}
      <SpecSection title="Table example">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Standard data table with header and body rows. Uses MUI Table components with custom styling.
        </Typography>

        <Box
          sx={{
            border: `1px solid ${theme.palette.border.light}`,
            borderRadius: "4px",
            overflow: "hidden",
            mb: "24px",
          }}
        >
          {/* Header */}
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
            <Typography
              sx={{
                fontSize: 12,
                fontWeight: 500,
                color: theme.palette.text.secondary,
              }}
            >
              Primary table
            </Typography>
          </Box>

          {/* Live Example */}
          <Box sx={{ p: "16px", backgroundColor: theme.palette.background.main }}>
            <TableContainer>
              <Table
                sx={{
                  border: "1px solid #d0d5dd",
                  borderRadius: "4px",
                  "& td, & th": {
                    border: 0,
                  },
                }}
              >
                <TableHead
                  sx={{
                    background: `linear-gradient(180deg, ${background.accent} 0%, ${background.hover} 100%)`,
                  }}
                >
                  <TableRow
                    sx={{
                      textTransform: "uppercase",
                      borderBottom: "1px solid #d0d5dd",
                    }}
                  >
                    {sampleData.columns.map((col) => (
                      <TableCell
                        key={col}
                        sx={{
                          color: "text.tertiary",
                          fontSize: "13px",
                          fontWeight: 400,
                          padding: "12px 10px",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {col}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sampleData.rows.map((row, index) => (
                    <TableRow
                      key={index}
                      sx={{
                        textTransform: "capitalize",
                        borderBottom: "1px solid #d0d5dd",
                        backgroundColor: "white",
                        transition: "background-color 0.3s ease-in-out",
                        "&:hover td": {
                          backgroundColor: "#fafafa",
                        },
                        "&:hover": {
                          cursor: "pointer",
                        },
                        "&:last-child": {
                          borderBottom: "none",
                        },
                      }}
                    >
                      <TableCell sx={{ fontSize: "13px", padding: "12px 10px" }}>
                        {row.name}
                      </TableCell>
                      <TableCell sx={{ fontSize: "13px", padding: "12px 10px" }}>
                        {row.email}
                      </TableCell>
                      <TableCell sx={{ fontSize: "13px", padding: "12px 10px" }}>
                        {row.role}
                      </TableCell>
                      <TableCell sx={{ fontSize: "13px", padding: "12px 10px" }}>
                        <Box
                          component="span"
                          sx={{
                            px: "8px",
                            py: "2px",
                            borderRadius: "4px",
                            fontSize: "12px",
                            fontWeight: 500,
                            backgroundColor: row.status === "Active" ? "#ecfdf3" : "background.accent",
                            color: row.status === "Active" ? "#079455" : "#838c99",
                          }}
                        >
                          {row.status}
                        </Box>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>

          {/* Code */}
          <Box sx={{ borderTop: `1px solid ${theme.palette.border.light}` }}>
            <CodeBlock code={tableCodeSnippet} language="tsx" onCopy={handleCopy} />
          </Box>
        </Box>
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Header Styles */}
      <SpecSection title="Header cell styles">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Table header styling from singleTheme.tableStyles.primary.header
        </Typography>

        <SpecTable
          onCopy={handleCopy}
          specs={[
            { property: "backgroundColor", value: "linear-gradient(180deg, background.accent 0%, background.hover 100%)" },
            { property: "color", value: "text.tertiary" },
            { property: "fontSize", value: "13px" },
            { property: "fontWeight", value: "400" },
            { property: "padding", value: "12px 10px" },
            { property: "textTransform", value: "uppercase" },
            { property: "whiteSpace", value: "nowrap" },
            { property: "borderBottom", value: "1px solid #d0d5dd" },
            { property: "minWidth", value: "120px" },
          ]}
        />
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Body Styles */}
      <SpecSection title="Body row styles">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Table body row styling from singleTheme.tableStyles.primary.body
        </Typography>

        <SpecTable
          onCopy={handleCopy}
          specs={[
            { property: "backgroundColor", value: "background.main" },
            { property: "fontSize", value: "13px" },
            { property: "padding", value: "12px 10px" },
            { property: "textTransform", value: "capitalize" },
            { property: "borderBottom", value: "1px solid #d0d5dd" },
            { property: "transition", value: "background-color 0.3s ease-in-out" },
            { property: "hover:backgroundColor", value: "#fafafa" },
            { property: "hover:cursor", value: "pointer" },
          ]}
        />
      </SpecSection>

      <Divider sx={{ my: "32px" }} />

      {/* Pagination */}
      <SpecSection title="Pagination">
        <Typography sx={{ fontSize: 13, color: theme.palette.text.tertiary, mb: "24px" }}>
          Table pagination styling. Uses MUI TablePagination with custom styling.
        </Typography>

        <SpecGrid columns={3}>
          <SpecCard title="Label font" value="12px" note="'Showing X - Y of Z'" onCopy={handleCopy} />
          <SpecCard title="Label opacity" value="0.7" note="Muted appearance" onCopy={handleCopy} />
          <SpecCard title="Rows per page" value="[5, 10, 15, 25]" note="Options array" onCopy={handleCopy} />
          <SpecCard title="Default rows" value="10" note="Initial page size" onCopy={handleCopy} />
          <SpecCard title="Storage key" value="localStorage" note="Persisted preference" onCopy={handleCopy} />
          <SpecCard title="Button radius" value="4px" note="Page buttons" onCopy={handleCopy} />
        </SpecGrid>
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
            "Import table styles from singleTheme.tableStyles.primary",
            "Use TableContainer, Table, TableHead, TableBody, TableRow, TableCell from MUI",
            "Apply frame styles: singleTheme.tableStyles.primary.frame",
            "Header styles: singleTheme.tableStyles.primary.header.row and .cell",
            "Body styles: singleTheme.tableStyles.primary.body.row and .cell",
            "Always use uppercase text transform for headers",
            "Include hover state for clickable rows",
            "Use TablePagination for paginated tables",
            "Persist rows per page preference in localStorage",
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
            {hoveredIndex === index && (
              <Copy size={12} color={theme.palette.primary.main} />
            )}
          </Box>
        </Box>
      ))}
    </Box>
  );
};

export default TablesSection;
