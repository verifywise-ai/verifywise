import { useState } from "react";
import { Stack, Typography, CircularProgress } from "@mui/material";
import { GitCompareArrows } from "lucide-react";
import FrameworkSelector from "../../components/GovernanceOS/FrameworkSelector";
import MappingCard from "../../components/GovernanceOS/MappingCard";
import { EmptyState } from "../../components/EmptyState";
import { StatusTileCards, StatusTileItem } from "../../components/Cards/StatusTileCards";
import { useMappingsBetween } from "../../../application/hooks/useGovernanceOs";

const FrameworkMapper = () => {
  const [sourceId, setSourceId] = useState(1);
  const [targetId, setTargetId] = useState(2);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  const { data: mappings, isLoading } = useMappingsBetween(sourceId, targetId);

  const filteredMappings = (mappings || []).filter((m) => {
    if (selectedDomain && m.domain_tag !== selectedDomain) return false;
    return true;
  });

  const domains = [...new Set((mappings || []).map((m) => m.domain_tag).filter(Boolean))];

  const domainTileItems: StatusTileItem[] = domains.map((domain) => {
    const count = (mappings || []).filter((m) => m.domain_tag === domain).length;
    return {
      key: domain as string,
      label: (domain as string).replace(/_/g, " "),
      count,
      color: "#13715B",
    };
  });

  return (
    <Stack spacing={3}>
      <Typography variant="body2" sx={{ color: "#475467" }}>
        Explore cross-framework control mappings. Select source and target frameworks to see how
        controls align.
      </Typography>

      <FrameworkSelector
        sourceId={sourceId}
        targetId={targetId}
        onSourceChange={setSourceId}
        onTargetChange={setTargetId}
      />

      {domainTileItems.length > 0 && (
        <StatusTileCards
          items={domainTileItems}
          size="small"
          entityName="mapping"
          selectedKey={selectedDomain}
          onCardClick={(key) => setSelectedDomain(selectedDomain === key ? null : key)}
        />
      )}

      {isLoading ? (
        <Stack alignItems="center" sx={{ py: 6 }}>
          <CircularProgress size={32} />
        </Stack>
      ) : filteredMappings.length === 0 ? (
        <EmptyState
          message="No mappings found for the selected frameworks and filters."
          icon={GitCompareArrows}
          showBorder
        />
      ) : (
        <Stack spacing={2}>
          <Typography variant="caption" sx={{ color: "#8594AC" }}>
            {filteredMappings.length} mapping(s) found
          </Typography>
          {filteredMappings.map((mapping) => (
            <MappingCard key={mapping.id} mapping={mapping} />
          ))}
        </Stack>
      )}
    </Stack>
  );
};

export default FrameworkMapper;
