import React, { Suspense, useState, ReactNode } from "react";
import { CircularProgress } from "@mui/material";
import { usePluginRegistry } from "../../../application/contexts/PluginRegistry.context";
import { PluginSlotId, PluginRenderType } from "../../../domain/constants/pluginSlots";
import { apiServices } from "../../../infrastructure/api/networkServices";

interface PluginSlotProps {
  id: PluginSlotId;
  // Props passed to all plugin components in this slot
  slotProps?: Record<string, any>;
  // Wrapper component for each plugin component
  wrapper?: React.ComponentType<{ children: ReactNode }>;
  // Custom fallback while loading
  fallback?: ReactNode;
  // Filter by render type (optional)
  renderType?: PluginRenderType;
  // For tab slots: the currently active tab value
  activeTab?: string;
  // For plugin key filter (e.g., only show components for a specific plugin)
  pluginKey?: string;
}

export function PluginSlot({
  id,
  slotProps = {},
  wrapper: Wrapper,
  fallback = <CircularProgress size={16} />,
  renderType,
  activeTab,
  pluginKey: filterPluginKey,
}: PluginSlotProps) {
  const { getComponentsForSlot } = usePluginRegistry();
  const [openModals, setOpenModals] = useState<Set<string>>(new Set());

  const components = getComponentsForSlot(id);

  // Apply filters
  let filtered = components;
  if (renderType) {
    filtered = filtered.filter((c) => c.renderType === renderType);
  }
  if (filterPluginKey) {
    filtered = filtered.filter((c) => c.pluginKey === filterPluginKey);
  }

  if (filtered.length === 0) {
    return null;
  }

  const handleTriggerModal = (componentName: string) => {
    setOpenModals((prev) => new Set([...prev, componentName]));
  };

  const handleCloseModal = (componentName: string) => {
    setOpenModals((prev) => {
      const next = new Set(prev);
      next.delete(componentName);
      return next;
    });
  };

  // Track rendered values to prevent duplicate rendering
  const renderedTabValues = new Set<string>();
  const renderedRawComponents = new Set<string>();

  return (
    <>
      {filtered.map((loaded, index) => {
        // Skip modals in main render - they render separately below
        if (loaded.renderType === "modal") {
          return null;
        }

        // For tab render type, only render if this is the active tab
        // Use props.value if available (for shared tabs across plugins), otherwise fall back to pluginKey
        const tabValue = loaded.props?.value || loaded.pluginKey;
        if (loaded.renderType === "tab") {
          if (activeTab !== tabValue) {
            return null;
          }
          // De-duplicate: only render one component per unique tab value
          if (renderedTabValues.has(tabValue)) {
            return null;
          }
          renderedTabValues.add(tabValue);
        }

        // For raw render type, de-duplicate by component name
        // This prevents multiple plugins from rendering the same shared component multiple times
        if (loaded.renderType === "raw") {
          if (renderedRawComponents.has(loaded.componentName)) {
            return null;
          }
          renderedRawComponents.add(loaded.componentName);
        }

        const element = (
          <Suspense
            key={`${loaded.pluginKey}-${loaded.componentName}-${index}`}
            fallback={fallback}
          >
            <loaded.Component
              {...loaded.props}
              {...slotProps}
              apiServices={apiServices}
              onTriggerModal={slotProps.onTriggerModal || handleTriggerModal}
            />
          </Suspense>
        );

        return Wrapper ? (
          <Wrapper key={`${loaded.pluginKey}-${index}`}>{element}</Wrapper>
        ) : (
          element
        );
      })}

      {/* Render modals */}
      {components
        .filter((c) => c.renderType === "modal")
        .filter((c) => !filterPluginKey || c.pluginKey === filterPluginKey)
        .map((loaded, index) => {
          // Use external open/onClose from slotProps if provided, otherwise use internal state
          const isOpenFromSlotProps = slotProps.open !== undefined;
          const isOpen = isOpenFromSlotProps
            ? slotProps.open
            : openModals.has(loaded.componentName) ||
              (loaded.trigger && openModals.has(loaded.trigger));
          const handleClose = isOpenFromSlotProps
            ? slotProps.onClose
            : () => handleCloseModal(loaded.trigger || loaded.componentName);

          return (
            <Suspense
              key={`modal-${loaded.pluginKey}-${loaded.componentName}-${index}`}
              fallback={null}
            >
              <loaded.Component
                {...loaded.props}
                {...slotProps}
                apiServices={apiServices}
                open={isOpen}
                onClose={handleClose}
              />
            </Suspense>
          );
        })}
    </>
  );
}

export default PluginSlot;
