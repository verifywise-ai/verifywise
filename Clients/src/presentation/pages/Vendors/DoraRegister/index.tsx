import { useMemo, useState } from "react";
import { Box, Stack, Typography } from "@mui/material";
import { Download, ShieldCheck } from "lucide-react";
import { useDoraRegister } from "../../../../application/hooks/useVendors";
import { VendorModel } from "../../../../domain/models/Common/vendor/vendor.model";
import { exportToCSV } from "../../../../application/utils/tableExport";
import SearchBox from "../../../components/Search/SearchBox";
import { CustomizableButton } from "../../../components/button/customizable-button";
import { EmptyState } from "../../../components/EmptyState";
import CustomizableSkeleton from "../../../components/Skeletons";
import MCPTable from "../../AIGateway/MCPTable";
import palette from "../../../themes/palette";

// CSV column order per the DORA register submission shape: provider name,
// LEI, ICT service type, function criticality, substitutability, exit plan,
// country of provision.
const DORA_REGISTER_EXPORT_COLUMNS = [
  { id: "vendor_name", label: "Vendor" },
  { id: "provider_lei", label: "LEI" },
  { id: "ict_service_type", label: "ICT service type" },
  { id: "function_criticality", label: "Function criticality" },
  { id: "substitutability", label: "Substitutability" },
  { id: "has_exit_plan", label: "Exit plan" },
  { id: "country_of_provision", label: "Country of provision" },
];

// On-screen placeholder for missing values. Intentionally NOT used for the
// CSV export: a DORA register-of-information submission must have blank
// cells for missing data, not a literal '—' character.
const NOT_SET = "—";

const formatExitPlan = (hasExitPlan?: boolean): string =>
  hasExitPlan === true ? "Yes" : hasExitPlan === false ? "No" : NOT_SET;

const formatExitPlanForExport = (hasExitPlan?: boolean): string =>
  hasExitPlan === true ? "Yes" : hasExitPlan === false ? "No" : "";

const DoraRegister = () => {
  const { data: doraVendors = [], isLoading } = useDoraRegister();
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredVendors = useMemo(() => {
    if (!searchQuery.trim()) return doraVendors;
    const query = searchQuery.toLowerCase();
    return doraVendors.filter((vendor: VendorModel) =>
      vendor.vendor_name?.toLowerCase().includes(query),
    );
  }, [doraVendors, searchQuery]);

  const exportRows = useMemo(
    () =>
      filteredVendors.map((vendor: VendorModel) => ({
        vendor_name: vendor.vendor_name || "",
        provider_lei: vendor.provider_lei || "",
        ict_service_type: vendor.ict_service_type || "",
        function_criticality: vendor.function_criticality || "",
        substitutability: vendor.substitutability || "",
        has_exit_plan: formatExitPlanForExport(vendor.has_exit_plan),
        country_of_provision: vendor.country_of_provision || "",
      })),
    [filteredVendors],
  );

  const handleExport = () => {
    exportToCSV(exportRows, DORA_REGISTER_EXPORT_COLUMNS, "dora-ict-register");
  };

  if (isLoading) {
    return <CustomizableSkeleton variant="rectangular" width="100%" height={400} />;
  }

  if (doraVendors.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        message="No ICT providers yet. Mark a vendor as an ICT provider to add it to the register."
      />
    );
  }

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <SearchBox
          placeholder="Search ICT providers..."
          value={searchQuery}
          onChange={setSearchQuery}
          fullWidth={false}
        />
        <CustomizableButton
          variant="outlined"
          text="Export register"
          icon={<Download size={16} />}
          onClick={handleExport}
          isDisabled={exportRows.length === 0}
        />
      </Stack>

      {filteredVendors.length === 0 ? (
        <EmptyState message="No ICT providers match your search." />
      ) : (
        <Box>
          <Typography sx={{ fontSize: 12, color: palette.text.tertiary, mb: "12px" }}>
            {filteredVendors.length} ICT provider{filteredVendors.length !== 1 ? "s" : ""}
          </Typography>
          <MCPTable
            id="dora-ict-register-table"
            columns={[
              { label: "Vendor" },
              { label: "ICT service type" },
              { label: "Function criticality" },
              { label: "Substitutability" },
              { label: "Exit plan" },
              { label: "Country" },
              { label: "LEI" },
            ]}
            rows={filteredVendors}
            // vendor.id and vendor.vendor_name are both optional on
            // VendorModel, so either can be undefined; fall back to the
            // row's position in the (already-filtered) array — stable
            // across re-renders and guaranteed unique within it — rather
            // than risk two undefined keys colliding.
            rowKey={(vendor) =>
              vendor.id ?? vendor.vendor_name ?? `row-${filteredVendors.indexOf(vendor)}`
            }
            renderRow={(vendor) => [
              <Typography sx={{ fontSize: 13, fontWeight: 500 }}>{vendor.vendor_name}</Typography>,
              <Typography sx={{ fontSize: 13 }}>{vendor.ict_service_type || NOT_SET}</Typography>,
              <Typography sx={{ fontSize: 13 }}>
                {vendor.function_criticality || NOT_SET}
              </Typography>,
              <Typography sx={{ fontSize: 13 }}>{vendor.substitutability || NOT_SET}</Typography>,
              <Typography sx={{ fontSize: 13 }}>{formatExitPlan(vendor.has_exit_plan)}</Typography>,
              <Typography sx={{ fontSize: 13 }}>
                {vendor.country_of_provision || NOT_SET}
              </Typography>,
              <Typography sx={{ fontSize: 13 }}>{vendor.provider_lei || NOT_SET}</Typography>,
            ]}
          />
        </Box>
      )}
    </Stack>
  );
};

export default DoraRegister;
