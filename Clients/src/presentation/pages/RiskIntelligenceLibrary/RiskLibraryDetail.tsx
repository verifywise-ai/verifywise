import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import { X, ExternalLink } from "lucide-react";
import { useState } from "react";
import { RiskLibraryEntryDetail, RiskLibraryMitigation, RiskLibraryIncident } from "../../../domain/types/RiskLibrary";

interface Props {
  detail: RiskLibraryEntryDetail | null;
  open: boolean;
  onClose: () => void;
}

const strategyColors: Record<string, string> = {
  avoid: "#d32f2f",
  transfer: "#1565c0",
  mitigate: "#2e7d32",
  accept: "#f57c00",
};

const MitigationsTab = ({ mitigations }: { mitigations: RiskLibraryMitigation[] }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
    {mitigations.length === 0 ? (
      <Typography variant="body2" color="text.secondary">
        No mitigations available for this risk.
      </Typography>
    ) : (
      mitigations.map((m) => (
        <Box
          key={m.id}
          sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <Chip
              label={m.strategy.toUpperCase()}
              size="small"
              sx={{
                backgroundColor: strategyColors[m.strategy] || "#757575",
                color: "#fff",
                fontWeight: 600,
                fontSize: "0.7rem",
              }}
            />
            <Typography variant="subtitle2" fontWeight={600}>
              {m.title}
            </Typography>
          </Box>
          <Typography variant="body2" sx={{ mb: 1 }}>
            {m.description}
          </Typography>
          {m.implementation_guidance && (
            <Box sx={{ mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                Implementation:
              </Typography>
              <Typography variant="caption" sx={{ ml: 0.5 }}>
                {m.implementation_guidance}
              </Typography>
            </Box>
          )}
          {m.evidence_requirements && (
            <Box sx={{ mb: 0.5 }}>
              <Typography variant="caption" fontWeight={600} color="text.secondary">
                Evidence:
              </Typography>
              <Typography variant="caption" sx={{ ml: 0.5 }}>
                {m.evidence_requirements}
              </Typography>
            </Box>
          )}
          {m.framework_ref && (
            <Chip
              label={m.framework_ref}
              size="small"
              variant="outlined"
              sx={{ mt: 0.5, fontSize: "0.65rem" }}
            />
          )}
        </Box>
      ))
    )}
  </Box>
);

const IncidentsTab = ({ incidents }: { incidents: RiskLibraryIncident[] }) => (
  <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
    {incidents.length === 0 ? (
      <Typography variant="body2" color="text.secondary">
        No linked incidents for this risk.
      </Typography>
    ) : (
      incidents.map((inc) => (
        <Box
          key={inc.id}
          sx={{ p: 2, border: "1px solid", borderColor: "divider", borderRadius: 1 }}
        >
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="subtitle2" fontWeight={600}>
              {inc.incident_title}
            </Typography>
            {inc.source_url && (
              <IconButton
                size="small"
                onClick={() => window.open(inc.source_url!, "_blank")}
              >
                <ExternalLink size={14} />
              </IconButton>
            )}
          </Box>
          {inc.incident_description && (
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {inc.incident_description}
            </Typography>
          )}
          <Box sx={{ display: "flex", gap: 1, mt: 1 }}>
            {inc.harm_type && (
              <Chip label={inc.harm_type} size="small" variant="outlined" />
            )}
            {inc.sector && (
              <Chip label={inc.sector} size="small" variant="outlined" />
            )}
            {inc.incident_date && (
              <Typography variant="caption" color="text.secondary" sx={{ alignSelf: "center" }}>
                {new Date(inc.incident_date).toLocaleDateString()}
              </Typography>
            )}
          </Box>
        </Box>
      ))
    )}
  </Box>
);

const OrgNotesTab = ({
  orgCustomization,
}: {
  orgCustomization: RiskLibraryEntryDetail["orgCustomization"];
}) => (
  <Box sx={{ mt: 1 }}>
    {!orgCustomization ? (
      <Typography variant="body2" color="text.secondary">
        No organization-specific notes for this entry.
      </Typography>
    ) : (
      <>
        {orgCustomization.custom_notes && (
          <Box sx={{ mb: 2 }}>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Notes
            </Typography>
            <Typography variant="body2">{orgCustomization.custom_notes}</Typography>
          </Box>
        )}
        {orgCustomization.custom_mitigations && (
          <Box>
            <Typography variant="subtitle2" fontWeight={600} gutterBottom>
              Custom Mitigations
            </Typography>
            <Typography variant="body2">
              {orgCustomization.custom_mitigations}
            </Typography>
          </Box>
        )}
      </>
    )}
  </Box>
);

const RiskLibraryDetail = ({ detail, open, onClose }: Props) => {
  const [tab, setTab] = useState(0);

  if (!detail) return null;

  const { entry, mitigations, incidents, orgCustomization } = detail;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", md: 520 }, p: 3 } }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 2 }}>
        <Box sx={{ flex: 1, mr: 2 }}>
          <Typography variant="h6" fontWeight={700}>
            {entry.summary}
          </Typography>
          <Box sx={{ display: "flex", gap: 0.5, mt: 1, flexWrap: "wrap" }}>
            {entry.source && <Chip label={entry.source} size="small" />}
            {entry.risk_type && <Chip label={entry.risk_type} size="small" variant="outlined" />}
            {entry.eu_ai_act_tier && (
              <Chip label={`EU AI Act: ${entry.eu_ai_act_tier}`} size="small" variant="outlined" />
            )}
            {entry.severity && <Chip label={entry.severity} size="small" variant="outlined" />}
            {entry.likelihood && <Chip label={entry.likelihood} size="small" variant="outlined" />}
          </Box>
        </Box>
        <IconButton onClick={onClose} size="small">
          <X size={18} />
        </IconButton>
      </Box>

      <Divider />

      <Typography variant="body2" sx={{ mt: 2, mb: 1 }}>
        {entry.description}
      </Typography>

      {entry.marginal_risk_description && (
        <Box sx={{ p: 1.5, backgroundColor: "action.hover", borderRadius: 1, mb: 2 }}>
          <Typography variant="caption" fontWeight={600} color="text.secondary">
            Marginal Risk (AI-specific change):
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {entry.marginal_risk_description}
          </Typography>
        </Box>
      )}

      <Tabs value={tab} onChange={(_e, v) => setTab(v)} sx={{ mb: 1 }}>
        <Tab label={`Mitigations (${mitigations.length})`} />
        <Tab label={`Incidents (${incidents.length})`} />
        <Tab label="Org Notes" />
      </Tabs>

      {tab === 0 && <MitigationsTab mitigations={mitigations} />}
      {tab === 1 && <IncidentsTab incidents={incidents} />}
      {tab === 2 && <OrgNotesTab orgCustomization={orgCustomization} />}
    </Drawer>
  );
};

export default RiskLibraryDetail;
