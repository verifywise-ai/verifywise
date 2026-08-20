import { useParams } from "react-router";
import { useExtensions } from "../../../../application/contexts/Extensions.context";
import ModelLifecycleDetail from "../../Extensions/model-lifecycle/ModelLifecycleDetail";

function ModelLifecycleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const modelId = id ? parseInt(id) : null;
  const { isEnabled } = useExtensions();

  if (!modelId) return null;
  if (!isEnabled("model-lifecycle")) return null;

  return <ModelLifecycleDetail modelId={modelId} />;
}

export default ModelLifecycleDetailPage;
