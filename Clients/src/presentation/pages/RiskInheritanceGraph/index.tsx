/**
 * @fileoverview Risk Inheritance Graph page.
 *
 * Visual explorer for risk_links: nodes are risks, edges are inherits_from and
 * related_to. Positions come from the deterministic layout in ./layout —
 * nothing here force-simulates.
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  BackgroundVariant,
  Panel,
  ReactFlowProvider,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Alert,
  Box,
  Typography,
  Stack,
  CircularProgress,
  useTheme,
} from "@mui/material";
import { Network, AlertTriangle } from "lucide-react";
import { getRiskGraph } from "../../../application/repository/riskLink.repository";
import { APIError } from "../../../application/tools/error";
import type { RiskGraph } from "../../../domain/interfaces/i.riskLink";
import RiskNode from "./RiskNode";
import type { RiskInheritanceNodeData } from "./types";
import DismissalAnalytics from "./DismissalAnalytics";
import { ENTITY_TYPE_COLORS, EDGE_LABELS } from "./types";
import { layoutRiskGraph } from "./layout";
import {
  graphWrapperSx,
  pageContainerSx,
  graphContainerStyle,
  loadingContainerSx,
  loadingTextSx,
  errorContainerSx,
  errorTextSx,
  emptyStateContainerSx,
  emptyStateTitleSx,
  emptyStateDescriptionSx,
  controlPanelSx,
  legendLabelSx,
  legendItemSx,
  legendTextSx,
  statsContainerSx,
  statsTextSx,
} from "./styles";

// Register custom node types
const nodeTypes = { riskNode: RiskNode };

// Legend rows: line swatch + real text (never a background image).
const LEGEND: { label: string; swatch: React.CSSProperties }[] = [
  { label: EDGE_LABELS.inherits, swatch: { borderTop: "2px solid #616161" } },
  {
    label: EDGE_LABELS.suggested,
    swatch: { borderTop: "2px dashed rgba(97, 97, 97, 0.6)" },
  },
  {
    label: EDGE_LABELS.competing,
    swatch: { borderTop: "2px dashed rgba(97, 97, 97, 0.35)" },
  },
  {
    label: EDGE_LABELS.related,
    swatch: { borderTop: "2px dashed rgba(97, 97, 97, 0.8)" },
  },
];

const RiskInheritanceGraphInner: React.FC = () => {
  const theme = useTheme();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [graph, setGraph] = useState<RiskGraph | null>(null);
  const [showTruncated, setShowTruncated] = useState(true);

  useEffect(() => {
    let mounted = true;
    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getRiskGraph();
        if (mounted) setGraph(data);
      } catch (err) {
        if (mounted) {
          setError(err instanceof APIError ? err.message : "Failed to load the risk graph");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    loadData();
    return () => {
      mounted = false;
    };
  }, []);

  const layout = useMemo(() => (graph ? layoutRiskGraph(graph) : null), [graph]);

  // A node is stale when any inherits_from edge pointing at it (as the child)
  // carries Feature 2's flag.
  const staleByNode = useMemo(() => {
    const stale = new Map<string, string>();
    for (const edge of graph?.edges ?? []) {
      if (edge.relationType === "inherits_from" && edge.parentLevelChangedAt) {
        stale.set(edge.sourceKey, edge.parentLevelChangedAt);
      }
    }
    return stale;
  }, [graph]);

  useEffect(() => {
    if (!graph || !layout) return;

    setNodes(
      graph.nodes.map((node) => ({
        id: node.key,
        type: "riskNode",
        position: layout.positions.get(node.key) ?? { x: 0, y: 0 },
        data: {
          name: node.name ?? `Risk ${node.id}`,
          entityType: node.entityType,
          riskLevel: node.riskLevel,
          staleSince: staleByNode.get(node.key) ?? null,
        } as RiskInheritanceNodeData,
      })),
    );

    const stroke = theme.palette.text.secondary;
    setEdges(
      graph.edges.map((edge) => {
        if (edge.relationType === "related_to") {
          return {
            id: String(edge.id),
            source: edge.sourceKey,
            target: edge.targetKey,
            label: EDGE_LABELS.related,
            labelStyle: { fontSize: 9, fill: theme.palette.text.secondary },
            labelBgStyle: { fill: theme.palette.common.white, fillOpacity: 0.9 },
            style: { stroke, strokeWidth: 1, strokeDasharray: "5 5", opacity: 0.8 },
          };
        }
        // The ReactFlow source is the PARENT and the target is the CHILD — the
        // opposite of the DB row, where source_risk_id is the child — so the
        // arrow points down at the child: "this parent covers this child".
        const demoted = layout.demotedEdgeIds.has(edge.id);
        const suggested = edge.status === "suggested";
        return {
          id: String(edge.id),
          source: edge.targetKey,
          target: edge.sourceKey,
          label: demoted
            ? EDGE_LABELS.competing
            : suggested
              ? EDGE_LABELS.suggested
              : EDGE_LABELS.inherits,
          labelStyle: { fontSize: 9, fill: theme.palette.text.secondary },
          labelBgStyle: { fill: theme.palette.common.white, fillOpacity: 0.9 },
          markerEnd: { type: MarkerType.ArrowClosed, color: stroke },
          style: {
            stroke,
            strokeWidth: demoted ? 1 : 2,
            ...(suggested || demoted ? { strokeDasharray: "5 5" } : {}),
            opacity: demoted ? 0.35 : suggested ? 0.6 : 1,
          },
        };
      }),
    );
  }, [graph, layout, staleByNode, setNodes, setEdges, theme]);

  let graphArea: React.ReactNode;
  if (loading) {
    graphArea = (
      <Box sx={loadingContainerSx}>
        <CircularProgress size={32} sx={{ color: theme.palette.primary.main }} />
        <Typography sx={loadingTextSx}>Loading risk inheritance graph...</Typography>
      </Box>
    );
  } else if (error) {
    graphArea = (
      <Box sx={errorContainerSx}>
        <AlertTriangle size={32} color={theme.palette.error.main} />
        <Typography sx={errorTextSx}>{error}</Typography>
      </Box>
    );
  } else if (!graph || graph.nodes.length === 0) {
    graphArea = (
      <Box sx={emptyStateContainerSx}>
        <Network size={48} color={theme.palette.text.disabled} />
        <Typography sx={emptyStateTitleSx}>No risk links yet</Typography>
        <Typography sx={emptyStateDescriptionSx}>
          Run the link scan from a risk&apos;s Linked Risks panel.
        </Typography>
      </Box>
    );
  } else {
    graphArea = (
      <>
      {graph.truncated && showTruncated && (
        <Alert severity="info" onClose={() => setShowTruncated(false)}>
          Showing the first 500 links. Filter by status to narrow the graph.
        </Alert>
      )}
      <Box sx={graphWrapperSx} aria-label="Risk inheritance graph">
        <div style={graphContainerStyle}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            minZoom={0.2}
            maxZoom={2}
            defaultEdgeOptions={{ type: "smoothstep" }}
          >
            <Controls showInteractive={false} />
            <MiniMap
              nodeColor={(n) =>
                ENTITY_TYPE_COLORS[
                  (n.data as RiskInheritanceNodeData)?.entityType ?? "risk"
                ]
              }
              maskColor="rgba(0,0,0,0.1)"
            />
            <Background
              variant={BackgroundVariant.Dots}
              gap={20}
              size={1}
              color={theme.palette.divider}
            />

            <Panel position="top-left">
              <Stack sx={controlPanelSx}>
                <Typography sx={legendLabelSx}>Link types</Typography>
                {LEGEND.map((entry) => (
                  <Box key={entry.label} sx={legendItemSx}>
                    <Box sx={{ width: 28, ...entry.swatch }} aria-hidden="true" />
                    <Typography sx={legendTextSx}>{entry.label}</Typography>
                  </Box>
                ))}
                <Box sx={statsContainerSx}>
                  <Typography sx={statsTextSx}>
                    {nodes.length} risks, {edges.length} links
                  </Typography>
                </Box>
              </Stack>
            </Panel>
          </ReactFlow>
        </div>
      </Box>
      </>
    );
  }

  return (
    <Box sx={pageContainerSx}>
      {graphArea}
      <DismissalAnalytics />
    </Box>
  );
};

const RiskInheritanceGraph: React.FC = () => (
  <ReactFlowProvider>
    <RiskInheritanceGraphInner />
  </ReactFlowProvider>
);

export default RiskInheritanceGraph;
