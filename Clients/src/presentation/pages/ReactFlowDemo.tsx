import React, { useCallback } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type OnConnect,
  BackgroundVariant,
} from '@xyflow/react';
import { brand, background, border as borderPalette } from "../themes/palette";
import '@xyflow/react/dist/style.css';

const initialNodes: Node[] = [
  {
    id: '1',
    type: 'input',
    data: { label: 'AI Model' },
    position: { x: 250, y: 0 },
    style: { background: `${brand.primary}`, color: 'white', border: 'none' },
  },
  {
    id: '2',
    data: { label: 'Risk Assessment' },
    position: { x: 100, y: 100 },
    style: { background: `${background.main}`, border: `1px solid ${borderPalette.dark}` },
  },
  {
    id: '3',
    data: { label: 'Compliance Check' },
    position: { x: 400, y: 100 },
    style: { background: `${background.main}`, border: `1px solid ${borderPalette.dark}` },
  },
  {
    id: '4',
    data: { label: 'Evidence Collection' },
    position: { x: 100, y: 200 },
    style: { background: `${background.main}`, border: `1px solid ${borderPalette.dark}` },
  },
  {
    id: '5',
    data: { label: 'Policy Validation' },
    position: { x: 400, y: 200 },
    style: { background: `${background.main}`, border: `1px solid ${borderPalette.dark}` },
  },
  {
    id: '6',
    type: 'output',
    data: { label: 'Governance Report' },
    position: { x: 250, y: 300 },
    style: { background: '#4CAF93', color: 'white', border: 'none' },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e1-3', source: '1', target: '3', animated: true },
  { id: 'e2-4', source: '2', target: '4' },
  { id: 'e3-5', source: '3', target: '5' },
  { id: 'e4-6', source: '4', target: '6' },
  { id: 'e5-6', source: '5', target: '6' },
];

const ReactFlowDemo: React.FC = () => {
  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
      </ReactFlow>
    </div>
  );
};

export default ReactFlowDemo;
