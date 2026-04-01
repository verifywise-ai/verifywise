import { Box, Paper, Typography, Stack, Button } from "@mui/material";
import CustomTextField from "../Components/CustomTextField/CustomTextField";
import { CheckCircle as CheckCircleOutlineIcon } from 'lucide-react';
import { downloadResource } from "../../../../application/tools/downloadResource";
import { brand } from "../../../themes/palette";

const Overview = ({
  data,
  loading,
  error,
  onShowAllResources,
  hash
}: {
  data: any;
  loading: boolean;
  error: string | null;
  onShowAllResources: () => void;
  hash: string | null;
}) => {

  const handleDownload = async (id: string) => {
    if (hash) {
      await downloadResource(id, hash);
    }
  };

  if (loading)
    return (
      <Box p={4}>
        <CustomTextField loading label="Loading..." />
      </Box>
    );
  if (error)
    return (
      <Box p={4}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  if (!data) return null;

  return (
    <Stack spacing={6} sx={{ width: "100%", mx: "auto", mb: 8 }}>
      {/* intro */}
      {data?.intro && (
        <Paper
          elevation={0}
          sx={{ background: "none", boxShadow: "none", maxWidth: "100%" }}
        >
          <Stack
            justifyContent="flex-start"
            alignItems="flex-start"
            direction={{ xs: "column", md: "row" }}
            spacing={4}
          >
            {data.intro.purpose && (
              <CustomTextField
                label="Purpose of our trust center"
                value={data.intro.purpose}
              />
            )}
            {data.intro.statement && (
              <CustomTextField
                label="Our statement"
                value={data.intro.statement}
              />
            )}
             {data.intro.mission && (
              <CustomTextField label="Our mission" value={data.intro.mission} />
            )}
          </Stack>
        </Paper>
      )}

      {/* Compliance and Certification Badges */}
      {data?.compliance_badges && (
        <Paper elevation={0} sx={{ background: "none", boxShadow: "none" }}>
          <Typography
            variant="subtitle2"
            color={brand.primary}
            gutterBottom
            sx={{ fontWeight: 600, mb: 2 }}
          >
            Compliance
          </Typography>
          <Stack direction="row" spacing={2}>
            {Object.entries(data.compliance_badges).map(([key, value]) =>
              value ? (
                <Box key={key}>
                  <img
                    src={`/assets/badges/${key}.svg`}
                    alt={key}
                    height={68}
                  />
                </Box>
              ) : null
            )}
          </Stack>
        </Paper>
      )}

      {/* Company Description and Values */}
      {data?.company_description && (
        <Paper elevation={0} sx={{ background: "none", boxShadow: "none" }}>
          <Stack direction={{ xs: "column", md: "row" }} spacing={4}>
            {data.company_description.background && (
              <CustomTextField
                label="Background"
                value={data.company_description.background}
              />
            )}
            {data.company_description.core_benefits && (
              <CustomTextField
                label="Core benefits"
                value={data.company_description.core_benefits}
              />
            )}
            {data.company_description.compliance_doc && (
              <CustomTextField
                label="Compliance documentation"
                value={data.company_description.compliance_doc}
              />
            )}
          </Stack>
        </Paper>
      )}

      {/* Resources */}
      {data?.resources && data.resources.length > 0 && (
        <Box sx={{ width: "100%", maxWidth: 500, mb: 2 }}>
          <Typography
            variant="subtitle2"
            color={brand.primary}
            sx={{ fontWeight: 600, mb: 1 }}
          >
            Resources
          </Typography>
          <Paper
            elevation={0}
            sx={{
              background: "background.main",
              borderRadius: 1,
              border: "1px solid #E0E0E0",
              p: 3,
              width: "100%",
            }}
          >
            <Stack spacing={1}>
              {data.resources.map((resource: any, idx: number) => (
                <Box
                  key={idx}
                  display="flex"
                  alignItems="center"
                  justifyContent="space-between"
                  sx={{ py: 0.5 }}
                >
                  <Box display="flex" alignItems="center" gap={1}>
                    <CheckCircleOutlineIcon
                      size={24}
                      style={{ color: "#10B981" }}
                    />
                    <Typography variant="body2">{resource.name}</Typography>
                  </Box>
                  <Button
                    variant="outlined"
                    size="small"
                    onClick={() => handleDownload(resource.id)}
                    sx={{
                      minWidth: 100,
                      backgroundColor: "background.main",
                      color: "text.secondary",
                      border: "1px solid #d0d5dd",
                      borderRadius: 1,
                    }}
                  >
                    Download
                  </Button>
                </Box>
              ))}
              <Box mt={1}>
                <Button
                  variant="text"
                  color="primary"
                  onClick={onShowAllResources}
                  sx={{
                    textDecoration: "underline",
                    fontSize: 14,
                    minWidth: 0,
                    padding: 0,
                    fontWeight: 400,
                    textTransform: "none",
                    "&:hover": {
                      background: "none",
                      textDecoration: "underline",
                    },
                  }}
                >
                  All resources
                </Button>
              </Box>
            </Stack>
          </Paper>
        </Box>
      )}
    </Stack>
  );
};

export default Overview;
