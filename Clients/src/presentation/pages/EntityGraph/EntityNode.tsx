import React, { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Box, Typography } from '@mui/material';
import {
  FolderTree,
  List,
  AlertTriangle,
  Building2,
  FileText,
  BookOpen,
  User,
  type LucideIcon,
} from 'lucide-react';
import VWTooltip from '../../components/VWTooltip';
import { text } from '../../themes/palette';

export type EntityType = 'useCase' | 'model' | 'risk' | 'vendor' | 'evidence' | 'framework' | 'user';

interface EntityNodeData {
  label: string;
  sublabel?: string;
  entityType: EntityType;
  color: string;
  status?: string;
  riskLevel?: string;
  riskSource?: 'model' | 'project' | 'vendor';
  connectionCount?: number;
  isHighlighted?: boolean;
  evidenceCount?: number;
}

const entityIcons: Record<EntityType, LucideIcon> = {
  useCase: FolderTree,
  model: List,
  risk: AlertTriangle,
  vendor: Building2,
  evidence: FileText,
  framework: BookOpen,
  user: User,
};

export const riskLevelColors: Record<string, string> = {
  'Low': '#4caf50',
  'Medium': '#ff9800',
  'High': '#f44336',
  'Critical': '#9c27b0',
  'Very low risk': '#4caf50',
  'Low risk': '#8bc34a',
  'Medium risk': '#ff9800',
  'High risk': '#f44336',
  'Very high risk': '#9c27b0',
};

const EntityNode: React.FC<NodeProps> = ({ data, sourcePosition, targetPosition }) => {
  const nodeData = data as unknown as EntityNodeData;
  const IconComponent = entityIcons[nodeData.entityType] || FolderTree;
  const isRiskNode = nodeData.entityType === 'risk';
  const riskColor = nodeData.riskLevel ? riskLevelColors[nodeData.riskLevel] : undefined;

  // Node size based on connections (subtle scaling)
  const connections = nodeData.connectionCount || 0;
  const sizeScale = connections > 10 ? 1.15 : connections > 5 ? 1.08 : connections > 2 ? 1.0 : 0.95;
  const minWidth = Math.round(120 * sizeScale);
  const maxWidth = Math.round(180 * sizeScale);

  // Build tooltip content
  const tooltipContent = (
    <Box>
      {nodeData.sublabel && <p>{nodeData.sublabel}</p>}
      {nodeData.status && <p>Status: {nodeData.status}</p>}
      {nodeData.riskLevel && <p>Risk level: {nodeData.riskLevel}</p>}
    </Box>
  );

  return (
    <VWTooltip header={nodeData.label} content={tooltipContent} placement="top" maxWidth={400}>
      <Box
        sx={{
          backgroundColor: nodeData.isHighlighted ? '#fffbeb' : 'white',
          border: nodeData.isHighlighted ? '3px solid #f59e0b' : `2px solid ${nodeData.color}`,
          borderRadius: '4px',
          padding: '8px 12px',
          minWidth: minWidth,
          maxWidth: maxWidth,
          boxShadow: nodeData.isHighlighted
            ? '0 0 0 4px rgba(245, 158, 11, 0.3), 0 4px 12px rgba(0,0,0,0.15)'
            : '0 2px 4px rgba(0,0,0,0.1)',
          cursor: 'pointer',
          transition: 'all 0.3s ease-in-out',
          transform: nodeData.isHighlighted ? 'scale(1.05)' : 'scale(1)',
          position: 'relative',
          '&:hover': {
            boxShadow: '0 4px 8px rgba(0,0,0,0.2)',
            transform: 'translateY(-1px)',
          },
        }}
      >
        <Handle
          type="target"
          position={targetPosition || Position.Left}
          style={{
            background: nodeData.color,
            border: 'none',
            width: 8,
            height: 8,
          }}
        />

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box
            sx={{
              backgroundColor: nodeData.color,
              borderRadius: '4px',
              p: 0.5,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconComponent size={14} color="white" />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                fontWeight: 600,
                fontSize: 11,
                color: 'text.secondary',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {nodeData.label}
            </Typography>
            {nodeData.sublabel && (
              <Typography
                variant="caption"
                sx={{
                  fontSize: 9,
                  color: 'text.icon',
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {nodeData.sublabel}
              </Typography>
            )}
          </Box>
        </Box>

        {/* Status/Risk indicator */}
        {(nodeData.status || isRiskNode) && (
          <Box
            sx={{
              mt: 0.5,
              display: 'flex',
              alignItems: 'center',
              gap: 0.5,
            }}
          >
            {nodeData.riskLevel && (
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  backgroundColor: riskColor || nodeData.color,
                }}
              />
            )}
            <Typography
              variant="caption"
              sx={{
                fontSize: 9,
                color: riskColor || text.icon,
                fontWeight: 500,
              }}
            >
              {nodeData.riskLevel || nodeData.status}
            </Typography>
          </Box>
        )}


        <Handle
          type="source"
          position={sourcePosition || Position.Right}
          style={{
            background: nodeData.color,
            border: 'none',
            width: 8,
            height: 8,
          }}
        />
      </Box>
    </VWTooltip>
  );
};

export default memo(EntityNode);
