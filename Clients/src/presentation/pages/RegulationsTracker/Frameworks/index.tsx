/**
 * @fileoverview Regulations Tracker — International frameworks tab.
 *
 * The cross-border AI governance frameworks (OECD, UNESCO, etc.) mirrored from
 * the public feed. Read-only.
 *
 * @module pages/RegulationsTracker/Frameworks
 */

import { Box, Stack, Typography, CircularProgress } from "@mui/material";
import { AlertTriangle, Info, Landmark } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import Chip from "../../../components/Chip";
import { VWLink } from "../../../components/Link";
import { palette } from "../../../themes/palette";
import { useFrameworks } from "../../../../application/hooks/useRegulationsTracker";
import { regulationStatusVariant } from "../statusVariant";

interface Framework {
  name: string;
  status?: string;
  adoptedBy?: string;
  whyItMatters?: string;
  keyPrinciples?: string[];
  namedDocuments?: string[];
  sourceUrl?: string;
}

export default function Frameworks() {
  const { data, isLoading, isError } = useFrameworks();
  const navigate = useNavigate();
  const items: Framework[] = Array.isArray(data?.data?.items) ? data.data.items : [];
  const stale = data?.data?.stale === true;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <PageHeaderExtended
      title="International frameworks"
      description="Cross-border AI governance frameworks and principles that complement national regulations."
      helpArticlePath="regulations-tracker/frameworks"
    >
      {/* EU AI Act discoverability callout */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
          border: `1px solid ${palette.border.dark}`,
          borderRadius: "4px",
          backgroundColor: palette.background.accent,
          p: "10px 14px",
          mb: "16px",
        }}
      >
        <Info
          size={14}
          strokeWidth={1.5}
          style={{ color: palette.text.secondary, marginTop: "2px", flexShrink: 0 }}
        />
        <Typography sx={{ fontSize: "13px", color: palette.text.secondary }}>
          Looking for the EU AI Act, or another country&apos;s law? Those live under each country.{" "}
          <VWLink onClick={() => navigate("/regulations-tracker/browse")}>
            Find them in Browse.
          </VWLink>
        </Typography>
      </Box>

      {isLoading && (
        <Box sx={{ display: "flex", justifyContent: "center", py: "48px" }}>
          <CircularProgress size={24} sx={{ color: palette.brand.primary }} />
        </Box>
      )}

      {isError && (
        <EmptyState
          icon={AlertTriangle}
          message="We couldn't load international frameworks right now. Please try again later."
          showBorder
        />
      )}

      {isEmpty && !isError && (
        <EmptyState
          icon={Landmark}
          message="No international frameworks are recorded yet."
          showBorder
        />
      )}

      {!isLoading && !isError && items.length > 0 && (
        <Stack gap="8px">
          {stale && (
            <Typography sx={{ fontSize: "12px", color: palette.text.tertiary, mb: "4px" }}>
              Showing the last known frameworks; live data is temporarily unavailable.
            </Typography>
          )}
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
              gap: "16px",
            }}
          >
            {items.map((f, i) => (
              <Box
                key={`${f.name}-${i}`}
                sx={{
                  border: `1px solid ${palette.border.dark}`,
                  borderRadius: "4px",
                  p: "12px",
                  backgroundColor: palette.background.main,
                }}
              >
                <Stack direction="row" alignItems="flex-start" gap="8px" flexWrap="wrap">
                  <Typography sx={{ fontSize: "14px", fontWeight: 600, flex: 1, minWidth: 0 }}>
                    {f.name}
                  </Typography>
                  {f.status && (
                    <Chip
                      label={f.status}
                      variant={regulationStatusVariant(f.status)}
                      uppercase={false}
                    />
                  )}
                </Stack>
                {f.adoptedBy && (
                  <Typography sx={{ fontSize: "12px", color: palette.text.tertiary, mt: "4px" }}>
                    Adopted by: {f.adoptedBy}
                  </Typography>
                )}
                {f.whyItMatters && (
                  <Typography
                    sx={{
                      fontSize: "13px",
                      color: palette.text.primary,
                      mt: "8px",
                      lineHeight: 1.5,
                    }}
                  >
                    {f.whyItMatters}
                  </Typography>
                )}
                {f.keyPrinciples && f.keyPrinciples.length > 0 && (
                  <Box sx={{ mt: "8px" }}>
                    <Typography
                      sx={{ fontSize: "12px", fontWeight: 600, color: palette.text.secondary }}
                    >
                      Key principles
                    </Typography>
                    <Box component="ul" sx={{ m: "4px 0 0", pl: "18px" }}>
                      {f.keyPrinciples.map((p, j) => (
                        <Typography
                          key={j}
                          component="li"
                          sx={{ fontSize: "12px", color: palette.text.tertiary, lineHeight: 1.4 }}
                        >
                          {p}
                        </Typography>
                      ))}
                    </Box>
                  </Box>
                )}
                {f.namedDocuments && f.namedDocuments.length > 0 && (
                  <Stack direction="row" gap="6px" flexWrap="wrap" sx={{ mt: "8px" }}>
                    {f.namedDocuments.map((doc, j) => (
                      <Chip key={j} label={doc} variant="default" uppercase={false} />
                    ))}
                  </Stack>
                )}
                {f.sourceUrl && (
                  <Box sx={{ mt: "8px" }}>
                    <VWLink url={f.sourceUrl} openInNewTab alwaysShowIcon>
                      View source
                    </VWLink>
                  </Box>
                )}
              </Box>
            ))}
          </Box>
        </Stack>
      )}
    </PageHeaderExtended>
  );
}
