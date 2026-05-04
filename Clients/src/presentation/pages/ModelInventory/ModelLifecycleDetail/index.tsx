/**
 * ModelLifecycleDetail - Renders the model lifecycle plugin content
 * Route: /model-inventory/models/:id
 *
 * This component serves as a container for the model-lifecycle plugin.
 * It renders the plugin's UI via PluginSlot.
 */

import { useParams } from "react-router-dom";
import { PluginSlot } from "../../../components/PluginSlot";
import { PLUGIN_SLOTS } from "../../../../domain/constants/pluginSlots";

function ModelLifecycleDetail() {
  const { id } = useParams<{ id: string }>();
  const modelId = id ? parseInt(id) : null;

  if (!modelId) {
    return null;
  }

  return <PluginSlot id={PLUGIN_SLOTS.MODEL_DETAIL_LIFECYCLE} slotProps={{ modelId }} />;
}

export default ModelLifecycleDetail;
