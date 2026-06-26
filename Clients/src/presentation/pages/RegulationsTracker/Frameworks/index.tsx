/**
 * @fileoverview Regulations Tracker — International frameworks tab.
 *
 * The cross-border AI governance frameworks (OECD, UNESCO, etc.) mirrored from
 * the public feed. Read-only.
 *
 * @module pages/RegulationsTracker/Frameworks
 */

import { Box, Stack, Typography, CircularProgress } from "@mui/material";
import { AlertTriangle, Landmark } from "lucide-react";
import { EmptyState } from "../../../components/EmptyState";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import Chip from "../../../components/Chip";
import { VWLink } from "../../../components/Link";
import { palette } from "../../../themes/palette";
import { useFrameworks } from "../../../../application/hooks/useRegulationsTracker";

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
  const items: Framework[] = Array.isArray(data?.data?.items) ? data.data.items : [];
  const stale = data?.data?.stale === true;
  const isEmpty = !isLoading && items.length === 0;

  return (
    <PageHeaderExtended
      title="International frameworks"
      description="Cross-border AI governance frameworks and principles that complement national regulations."
      helpArticlePath="regulations-tracker/frameworks"
    >
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
                {f.status && <Chip label={f.status} variant="default" uppercase={false} />}
              </Stack>
              {f.adoptedBy && (
                <Typography sx={{ fontSize: "12px", color: palette.text.tertiary, mt: "4px" }}>
                  Adopted by: {f.adoptedBy}
                </Typography>
              )}
              {f.whyItMatters && (
                <Typography
                  sx={{ fontSize: "13px", color: palette.text.primary, mt: "8px", lineHeight: 1.5 }}
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
                        sx={{ fontSize: "13px", color: palette.text.tertiary, lineHeight: 1.5 }}
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
        </Stack>
      )}
    </PageHeaderExtended>
  );
}
