import { useEffect, useRef, useState } from "react";
import { useReactFlow, type Node } from "@xyflow/react";
import { useEntityGraphFocus } from "../../../contexts/EntityGraphFocusContext";
import { EntityGraphData } from "../../../../application/repository/entityGraph.repository";
import { getConnectedEntityTypes } from "../utils";
import { TIMING, VIEWPORT } from "../constants";

interface UseFocusEntityOptions {
  entityData: EntityGraphData | null;
  loading: boolean;
  nodes: Node[];
  setVisibleEntities: (entities: string[]) => void;
  setShowProblemsOnly: (show: boolean) => void;
  setSearchQuery: (query: string) => void;
  setNodes: (updater: (nodes: Node[]) => Node[]) => void;
}

/**
 * Hook to handle focusing on a specific entity in the graph.
 * Manages centering, zooming, highlighting, and visibility of connected entity types.
 */
export function useFocusEntity({
  entityData,
  loading,
  nodes,
  setVisibleEntities,
  setShowProblemsOnly,
  setSearchQuery,
  setNodes,
}: UseFocusEntityOptions) {
  const { setCenter } = useReactFlow();
  const { focusEntity } = useEntityGraphFocus();
  const hasFocusedRef = useRef(false);
  const [highlightedNodeId, setHighlightedNodeId] = useState<string | null>(null);

  // When focus entity changes, show connected entity types and reset filters
  useEffect(() => {
    if (!focusEntity || !entityData) return;
    hasFocusedRef.current = false;

    // Get all entity types connected to the focused entity
    const connectedTypes = getConnectedEntityTypes(focusEntity.id, focusEntity.type, entityData);

    // Set visible entities to show all connected types
    setVisibleEntities(connectedTypes);
    setShowProblemsOnly(false);
    setSearchQuery("");
  }, [focusEntity, entityData, setVisibleEntities, setShowProblemsOnly, setSearchQuery]);

  // Center on focused entity after initial render completes
  useEffect(() => {
    if (!focusEntity || loading || nodes.length === 0 || hasFocusedRef.current) return;

    const targetNode = nodes.find((n) => n.id === focusEntity.id);
    if (!targetNode) return;

    // Wait for fitView to complete, then smoothly zoom to focused entity
    const zoomTimer = setTimeout(() => {
      setCenter(
        targetNode.position.x + VIEWPORT.FOCUS_OFFSET_X,
        targetNode.position.y + VIEWPORT.FOCUS_OFFSET_Y,
        { zoom: VIEWPORT.FOCUS_ZOOM, duration: TIMING.ZOOM_DURATION },
      );
      hasFocusedRef.current = true;
      setHighlightedNodeId(targetNode.id);
    }, TIMING.FOCUS_DELAY);

    // Clear highlight after duration
    const highlightTimer = setTimeout(
      () => setHighlightedNodeId(null),
      TIMING.FOCUS_DELAY + TIMING.HIGHLIGHT_DURATION,
    );

    return () => {
      clearTimeout(zoomTimer);
      clearTimeout(highlightTimer);
    };
  }, [focusEntity, loading, nodes, setCenter]);

  // Update nodes with highlight state
  useEffect(() => {
    if (highlightedNodeId === null) return;
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        data: { ...node.data, isHighlighted: node.id === highlightedNodeId },
      })),
    );
  }, [highlightedNodeId, setNodes]);

  return { highlightedNodeId };
}
