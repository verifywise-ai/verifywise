import React, { useCallback, useEffect, useState } from 'react';
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
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Box, Typography, Stack, ToggleButton, ToggleButtonGroup, LinearProgress } from '@mui/material';
import { AlertTriangle, GitBranch } from 'lucide-react';
import Toggle from '../../components/Inputs/Toggle';
import Alert from '../../components/Alert';
import SearchBox from '../../components/Search/SearchBox';
import { fetchEntityGraphData, EntityGraphData } from '../../../application/repository/entityGraph.repository';
import EntityNode from './EntityNode';
import DetailSidebar, { EntityDetails } from './DetailSidebar';
import {
  entityColors,
  VIEWPORT,
  ENTITY_TYPE_CONFIG,
  DEFAULT_VISIBLE_ENTITIES,
} from './constants';
import type { ExtendedNodeData } from './types';
import { generateNodesAndEdges, getConnectedEntities } from './utils';
import { useDebouncedSearch, useToastNotification, useFocusEntity } from './hooks';
import {
  graphContainerStyle,
  loadingContainerSx,
  loadingTextSx,
  loadingProgressSx,
  loadingPercentSx,
  errorContainerSx,
  emptyStateContainerSx,
  emptyStateTitleSx,
  emptyStateDescriptionSx,
  preparingContainerSx,
  preparingTextSx,
  controlPanelSx,
  problemsToggleRowSx,
  problemsToggleLabelContainerSx,
  problemsToggleLabelSx,
  entityTypesLabelSx,
  toggleButtonGroupSx,
  colorDotSx,
  statsContainerSx,
  statsTextSx,
} from './styles';
import { text, status } from "../../themes/palette";

const nodeTypes = { entity: EntityNode };

const EntityGraphInner: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [loading, setLoading] = useState(true);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [entityData, setEntityData] = useState<EntityGraphData | null>(null);
  const [visibleEntities, setVisibleEntities] = useState<string[]>(DEFAULT_VISIBLE_ENTITIES);
  const [showProblemsOnly, setShowProblemsOnly] = useState(false);
  const [selectedEntity, setSelectedEntity] = useState<EntityDetails | null>(null);
  const [entityLookup, setEntityLookup] = useState<Map<string, Record<string, unknown>>>(new Map());

  // Custom hooks
  const { searchQuery, setSearchQuery, debouncedSearchQuery } = useDebouncedSearch();
  const { showToast, toastMessage, showToastWithMessage, hideToast } = useToastNotification();

  // Focus entity hook
  useFocusEntity({
    entityData,
    loading,
    nodes,
    setVisibleEntities,
    setShowProblemsOnly,
    setSearchQuery,
    setNodes,
  });

  // Fetch data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        setLoadingProgress(0);
        const data = await fetchEntityGraphData((loaded, total) => setLoadingProgress(Math.round((loaded / total) * 100)));
        setEntityData(data);
        setError(null);
      } catch (err) {
        setError('Failed to load entity data');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  // Update nodes and edges when data or filters change
  useEffect(() => {
    if (!entityData) return;
    const { nodes: newNodes, edges: newEdges, entityLookup: newLookup } = generateNodesAndEdges(entityData, {
      visibleEntities, showProblemsOnly, searchQuery: debouncedSearchQuery, visibleRelationships: [],
    });
    setNodes(newNodes);
    setEdges(newEdges);
    setEntityLookup(newLookup);
  }, [entityData, visibleEntities, showProblemsOnly, debouncedSearchQuery, setNodes, setEdges]);

  const handleVisibilityChange = useCallback((_: React.MouseEvent<HTMLElement>, v: string[]) => {
    if (v.length > 0) setVisibleEntities(v);
  }, []);

  const handleProblemsToggle = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked;
    setShowProblemsOnly(checked);
    showToastWithMessage({
      title: checked ? 'Problems filter enabled' : 'Problems filter disabled',
      body: checked
        ? 'Showing only entities with issues: high-risk items, incomplete data, or compliance gaps.'
        : 'Showing all entities regardless of their status.',
    });
  }, [showToastWithMessage]);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const data = node.data as ExtendedNodeData;
    setSelectedEntity({
      id: node.id,
      entityType: data.entityType as EntityDetails['entityType'],
      label: data.label, sublabel: data.sublabel, color: data.color,
      status: data.status, riskLevel: data.riskLevel, rawData: data.rawData,
      connectedEntities: getConnectedEntities(node.id, edges, entityLookup),
    });
  }, [edges, entityLookup]);

  const handleNavigateToEntity = useCallback((_: string, id: string) => {
    const node = nodes.find(n => n.id === id);
    if (node) handleNodeClick({} as React.MouseEvent, node);
  }, [nodes, handleNodeClick]);

  if (loading) {
    return (
      <Box sx={loadingContainerSx}>
        <Typography sx={loadingTextSx}>Loading entity graph...</Typography>
        <LinearProgress variant="determinate" value={loadingProgress} sx={loadingProgressSx} />
        <Typography sx={loadingPercentSx}>{loadingProgress}% complete</Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box sx={errorContainerSx}>
        <Typography color="error">{error}</Typography>
      </Box>
    );
  }

  const hasNoData = entityData && !entityData.useCases?.length && !entityData.models?.length && !entityData.vendors?.length && !entityData.risks?.length;
  if (hasNoData) {
    return (
      <Box sx={emptyStateContainerSx}>
        <GitBranch size={48} color={text.disabled} />
        <Typography sx={emptyStateTitleSx}>No entities to display</Typography>
        <Typography sx={emptyStateDescriptionSx}>Add use cases, models, or vendors to visualize compliance relationships.</Typography>
      </Box>
    );
  }

  // Wait for nodes to be generated before rendering ReactFlow
  if (nodes.length === 0) {
    return (
      <Box sx={preparingContainerSx}>
        <Typography sx={preparingTextSx}>Preparing graph...</Typography>
      </Box>
    );
  }

  return (
    <div style={graphContainerStyle}>
      {showToast && (
        <Alert
          variant="info"
          title={toastMessage.title}
          body={toastMessage.body}
          isToast
          onClick={hideToast}
        />
      )}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: VIEWPORT.FIT_VIEW_PADDING }}
        minZoom={VIEWPORT.MIN_ZOOM}
        maxZoom={VIEWPORT.MAX_ZOOM}
        defaultEdgeOptions={{ type: 'smoothstep', animated: false }}
      >
        <Controls showInteractive={false} />
        <MiniMap
          nodeColor={(n) => (n.data as ExtendedNodeData)?.color || `${text.icon}`}
          maskColor="rgba(0,0,0,0.1)"
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color={status.default.border} />

        <Panel position="top-left">
          <Stack sx={controlPanelSx}>
            <SearchBox value={searchQuery} onChange={setSearchQuery} placeholder="Search entities..." />
            <Box sx={problemsToggleRowSx}>
              <Box sx={problemsToggleLabelContainerSx}>
                <AlertTriangle size={14} color="#f59e0b" />
                <Typography sx={problemsToggleLabelSx}>Show problems only</Typography>
              </Box>
              <Toggle size="small" checked={showProblemsOnly} onChange={handleProblemsToggle} />
            </Box>
            <Box>
              <Typography sx={entityTypesLabelSx}>Entity types</Typography>
              <ToggleButtonGroup
                value={visibleEntities}
                onChange={handleVisibilityChange}
                size="small"
                sx={toggleButtonGroupSx}
              >
                {ENTITY_TYPE_CONFIG.map(({ value, colorKey, label }) => (
                  <ToggleButton key={value} value={value}>
                    <Box sx={colorDotSx(entityColors[colorKey as keyof typeof entityColors])} />
                    {label}
                  </ToggleButton>
                ))}
              </ToggleButtonGroup>
            </Box>
            <Box sx={statsContainerSx}>
              <Typography sx={statsTextSx}>Showing {nodes.length} entities, {edges.length} relationships</Typography>
            </Box>
          </Stack>
        </Panel>
      </ReactFlow>
      <DetailSidebar entity={selectedEntity} onClose={() => setSelectedEntity(null)} onNavigateToEntity={handleNavigateToEntity} />
    </div>
  );
};

const EntityGraph: React.FC = () => (
  <ReactFlowProvider>
    <EntityGraphInner />
  </ReactFlowProvider>
);

export default EntityGraph;
