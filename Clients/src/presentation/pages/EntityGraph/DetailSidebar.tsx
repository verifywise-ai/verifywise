import React from 'react';
import {
  Box,
  Typography,
  IconButton,
  Button,
  Stack,
} from '@mui/material';
import Chip from '../../components/Chip';
import { Chip as MuiChip } from '@mui/material';
import {
  X,
  ExternalLink,
  AlertTriangle,
  User,
  Calendar,
  Link as LinkIcon,
  ChevronRight,
  Shield,
  Target,
  Clock,
  FileText,
  Building2,
  Globe,
  Activity,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Layers,
  Tag,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { EntityType } from './EntityNode';
import { VWLink } from '../../components/Link';
import { text } from "../../themes/palette";

export interface EntityDetails {
  id: string;
  entityType: EntityType;
  label: string;
  sublabel?: string;
  color: string;
  status?: string;
  riskLevel?: string;
  riskSource?: 'model' | 'project' | 'vendor';
  // Extended data from API
  rawData?: Record<string, unknown>;
  connectedEntities?: {
    type: string;
    count: number;
    items: Array<{ id: string; label: string }>;
  }[];
}

interface DetailSidebarProps {
  entity: EntityDetails | null;
  onClose: () => void;
  onNavigateToEntity: (entityType: string, id: string) => void;
}

const entityTypeLabels: Record<EntityType, string> = {
  useCase: 'Use case',
  model: 'Model',
  risk: 'Risk',
  vendor: 'Vendor',
  evidence: 'Evidence',
  framework: 'Framework',
  user: 'User',
};

const entityRoutes: Record<EntityType, string> = {
  useCase: '/project-view',
  model: '/model-inventory',
  risk: '/risk-management',
  vendor: '/vendors',
  evidence: '/file-manager',
  framework: '/framework',
  user: '/settings',
};

// Helper function to format dates
const formatDate = (dateValue: unknown): string => {
  if (!dateValue) return '';
  try {
    const date = new Date(String(dateValue));
    if (isNaN(date.getTime())) return String(dateValue);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return String(dateValue);
  }
};

// Helper component for inline detail rows in table format
const DetailRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  isChip?: boolean;
}> = ({ icon, label, value, isChip }) => (
  <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
    <Box sx={{ display: 'flex', alignItems: 'center', width: '124px', flexShrink: 0, color: `${text.icon}` }}>
      <Box sx={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}>{icon}</Box>
      <Typography sx={{ fontSize: 12, color: `${text.icon}` }}>{label}</Typography>
    </Box>
    <Box sx={{ flex: 1, minWidth: 0 }}>
      {isChip ? (
        <Chip label={value} size="small" uppercase={false} />
      ) : (
        <Typography sx={{ fontSize: 12, color: `${text.secondary}`, wordBreak: 'break-word' }}>
          {value}
        </Typography>
      )}
    </Box>
  </Box>
);

// Helper component for multi-line text details
const DetailText: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <Box sx={{ marginTop: '8px' }}>
    <Typography sx={{ fontSize: 13, fontWeight: 600, color: `${text.secondary}`, marginBottom: '4px' }}>{label}</Typography>
    <Typography sx={{ fontSize: 12, color: `${text.secondary}`, lineHeight: 1.5 }}>
      {value.substring(0, 200)}
      {value.length > 200 ? '...' : ''}
    </Typography>
  </Box>
);

const DetailSidebar: React.FC<DetailSidebarProps> = ({
  entity,
  onClose,
  onNavigateToEntity,
}) => {
  const navigate = useNavigate();

  if (!entity) return null;

  const handleGoToEntity = () => {
    const route = entityRoutes[entity.entityType];
    if (route) {
      // Extract numeric ID from entity id (e.g., "project-1" -> "1")
      const numericId = entity.id.split('-').slice(1).join('-');
      navigate(`${route}?id=${numericId}`);
    }
  };

  const rawData = entity.rawData || {};

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 410,
        height: '100%',
        backgroundColor: 'white',
        borderLeft: '1px solid #d0d5dd',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-4px 0 12px rgba(0,0,0,0.08)',
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          borderBottom: '1px solid #d0d5dd',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1.5,
        }}
      >
        <Box
          sx={{
            width: 40,
            height: 40,
            borderRadius: '4px',
            backgroundColor: entity.color,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Typography sx={{ color: 'white', fontWeight: 600, fontSize: 14 }}>
            {entity.label.charAt(0).toUpperCase()}
          </Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 11,
              color: 'text.icon',
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              mb: 0.25,
            }}
          >
            {entityTypeLabels[entity.entityType]}
          </Typography>
          <Typography
            sx={{
              fontSize: 16,
              fontWeight: 600,
              color: '#101828',
              wordBreak: 'break-word',
              whiteSpace: 'normal',
              overflow: 'visible',
              textOverflow: 'clip',
            }}
          >
            {entity.label}
          </Typography>
          {entity.sublabel && (
            <Typography sx={{ fontSize: 12, color: 'text.icon' }}>
              {entity.sublabel}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onClose} sx={{ mt: -0.5, mr: -0.5 }}>
          <X size={18} />
        </IconButton>
      </Box>

      {/* Content */}
      <Box sx={{ flex: 1, overflow: 'auto', padding: '8px' }}>
        {/* Status/Risk Level - only show for non-risk entities */}
        {entity.entityType !== 'risk' && (entity.status || entity.riskLevel) && (
          <Box sx={{ marginBottom: '8px' }}>
            <Typography sx={{ fontSize: 12, color: 'text.icon', mb: 0.5 }}>
              {entity.riskLevel ? 'Risk level' : 'Status'}
            </Typography>
            <Chip
              label={entity.riskLevel || entity.status || ''}
              size="small"
              uppercase={false}
            />
          </Box>
        )}

        {/* Entity-Specific Details */}
        <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', marginBottom: '8px', marginTop: '8px' }}>
          Details
        </Typography>

        <Stack sx={{ gap: '8px' }}>
          {/* USE CASE Details */}
          {entity.entityType === 'useCase' && (
            <>
              {Boolean(rawData.uc_id) && (
                <DetailRow icon={<Tag size={14} />} label="UC ID" value={String(rawData.uc_id)} />
              )}
              {Boolean(rawData.owner_name || rawData.owner) && (
                <DetailRow icon={<User size={14} />} label="Owner" value={String(rawData.owner_name || rawData.owner)} />
              )}
              {Boolean(rawData.ai_risk_classification) && (
                <DetailRow icon={<Shield size={14} />} label="AI risk" value={String(rawData.ai_risk_classification)} isChip />
              )}
              {Boolean(rawData.type_of_high_risk_role) && (
                <DetailRow icon={<User size={14} />} label="Role" value={String(rawData.type_of_high_risk_role).replace(/_/g, ' ')} />
              )}
              {Boolean(rawData.start_date) && (
                <DetailRow icon={<Calendar size={14} />} label="Start date" value={formatDate(rawData.start_date)} />
              )}
              {Boolean(rawData.last_updated) && (
                <DetailRow icon={<Clock size={14} />} label="Last updated" value={formatDate(rawData.last_updated)} />
              )}
              {Boolean(rawData.target_industry) && (
                <DetailRow icon={<Building2 size={14} />} label="Industry" value={String(rawData.target_industry)} />
              )}
              {Boolean(rawData.goal) && (
                <DetailText label="Goal" value={String(rawData.goal)} />
              )}
              {(rawData.doneSubcontrols !== undefined && rawData.totalSubcontrols !== undefined) && (
                <DetailRow icon={<CheckCircle2 size={14} />} label="Subcontrols" value={`${rawData.doneSubcontrols}/${rawData.totalSubcontrols}`} />
              )}
              {(rawData.answeredAssessments !== undefined && rawData.totalAssessments !== undefined) && (
                <DetailRow icon={<FileText size={14} />} label="Assessments" value={`${rawData.answeredAssessments}/${rawData.totalAssessments}`} />
              )}
            </>
          )}

          {/* MODEL Details */}
          {entity.entityType === 'model' && (
            <>
              {Boolean(rawData.provider) && (
                <DetailRow icon={<Building2 size={14} />} label="Provider" value={String(rawData.provider)} />
              )}
              {Boolean(rawData.version) && (
                <DetailRow icon={<Tag size={14} />} label="Version" value={String(rawData.version)} />
              )}
              {Boolean(rawData.owner_name || rawData.owner) && (
                <DetailRow icon={<User size={14} />} label="Owner" value={String(rawData.owner_name || rawData.owner)} />
              )}
              {Boolean(rawData.approver_name || rawData.approver) && (
                <DetailRow icon={<User size={14} />} label="Approver" value={String(rawData.approver_name || rawData.approver)} />
              )}
              {Boolean(rawData.capabilities) && (
                <DetailText label="Capabilities" value={String(rawData.capabilities)} />
              )}
              {rawData.security_assessment !== undefined && (
                <DetailRow icon={<Shield size={14} />} label="Security assessed" value={rawData.security_assessment ? 'Yes' : 'No'} />
              )}
              {Boolean(rawData.status_date) && (
                <DetailRow icon={<Calendar size={14} />} label="Status date" value={formatDate(rawData.status_date)} />
              )}
              {Boolean(rawData.created_at) && (
                <DetailRow icon={<Clock size={14} />} label="Created" value={formatDate(rawData.created_at)} />
              )}
            </>
          )}

          {/* VENDOR Details */}
          {entity.entityType === 'vendor' && (
            <>
              {Boolean(rawData.vendor_provides) && (
                <DetailText label="Provides" value={String(rawData.vendor_provides)} />
              )}
              {Boolean(rawData.website) && (
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                  <Box sx={{ display: 'flex', alignItems: 'center', width: '124px', flexShrink: 0, color: 'text.icon' }}>
                    <Box sx={{ marginRight: '4px', display: 'flex', alignItems: 'center' }}><Globe size={14} /></Box>
                    <Typography sx={{ fontSize: 12, color: 'text.icon' }}>Website</Typography>
                  </Box>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <VWLink
                      url={String(rawData.website).startsWith('http') ? String(rawData.website) : `https://${rawData.website}`}
                      openInNewTab
                    >
                      {String(rawData.website).replace(/^https?:\/\//, '').substring(0, 30)}
                    </VWLink>
                  </Box>
                </Box>
              )}
              {Boolean(rawData.vendor_contact_person) && (
                <DetailRow icon={<User size={14} />} label="Contact" value={String(rawData.vendor_contact_person)} />
              )}
              {Boolean(rawData.review_date) && (
                <DetailRow icon={<Calendar size={14} />} label="Review date" value={formatDate(rawData.review_date)} />
              )}
              {Boolean(rawData.review_result) && (
                <DetailText label="Review result" value={String(rawData.review_result)} />
              )}
              {Boolean(rawData.data_sensitivity) && (
                <DetailRow icon={<Shield size={14} />} label="Data sensitivity" value={String(rawData.data_sensitivity)} isChip />
              )}
              {Boolean(rawData.business_criticality) && (
                <DetailRow icon={<Activity size={14} />} label="Business criticality" value={String(rawData.business_criticality)} isChip />
              )}
              {Boolean(rawData.regulatory_exposure) && (
                <DetailRow icon={<AlertCircle size={14} />} label="Regulatory exposure" value={String(rawData.regulatory_exposure)} isChip />
              )}
              {rawData.risk_score !== undefined && rawData.risk_score !== null && (
                <DetailRow icon={<BarChart3 size={14} />} label="Risk score" value={String(rawData.risk_score)} />
              )}
            </>
          )}

          {/* RISK Details */}
          {entity.entityType === 'risk' && (
            <>
              {Boolean(entity.riskLevel) && (
                <DetailRow icon={<AlertTriangle size={14} />} label="Risk level" value={String(entity.riskLevel)} isChip />
              )}
              {Boolean(rawData.likelihood) && (
                <DetailRow icon={<Target size={14} />} label="Likelihood" value={String(rawData.likelihood)} isChip />
              )}
              {Boolean(rawData.risk_owner) && (
                <DetailRow icon={<User size={14} />} label="Owner" value={String(rawData.risk_owner)} />
              )}
              {Boolean(rawData.ai_lifecycle_phase) && (
                <DetailRow icon={<Layers size={14} />} label="Lifecycle phase" value={String(rawData.ai_lifecycle_phase)} />
              )}
              {Boolean(rawData.severity) && (
                <DetailRow icon={<AlertTriangle size={14} />} label="Severity" value={String(rawData.severity)} isChip />
              )}
              {Boolean(rawData.impact) && (
                <DetailRow icon={<Activity size={14} />} label="Impact" value={String(rawData.impact)} />
              )}
              {Boolean(rawData.mitigation_status) && (
                <DetailRow icon={<CheckCircle2 size={14} />} label="Mitigation" value={String(rawData.mitigation_status)} isChip />
              )}
              {Boolean(rawData.deadline) && (
                <DetailRow icon={<Calendar size={14} />} label="Deadline" value={formatDate(rawData.deadline)} />
              )}
              {Boolean(rawData.approval_status) && (
                <DetailRow icon={<Shield size={14} />} label="Approval" value={String(rawData.approval_status)} />
              )}
              {Boolean(rawData.risk_description) && (
                <DetailText label="Description" value={String(rawData.risk_description)} />
              )}
              {/* Vendor risk specific */}
              {Boolean(rawData.impact_description) && (
                <DetailText label="Impact description" value={String(rawData.impact_description)} />
              )}
              {Boolean(rawData.action_plan) && (
                <DetailText label="Action plan" value={String(rawData.action_plan)} />
              )}
            </>
          )}

          {/* EVIDENCE Details */}
          {entity.entityType === 'evidence' && (
            <>
              {Boolean(rawData.evidence_type) && (
                <DetailRow icon={<Tag size={14} />} label="Type" value={String(rawData.evidence_type)} />
              )}
              {Boolean(rawData.description) && (
                <DetailText label="Description" value={String(rawData.description)} />
              )}
              {rawData.file_count !== undefined && (
                <DetailRow icon={<FileText size={14} />} label="Files" value={String(rawData.file_count)} />
              )}
              {Boolean(rawData.expiry_date) && (
                <DetailRow icon={<Calendar size={14} />} label="Expiry date" value={formatDate(rawData.expiry_date)} />
              )}
              {Array.isArray(rawData.mapped_model_ids) && rawData.mapped_model_ids.length > 0 && (
                <DetailRow icon={<LinkIcon size={14} />} label="Linked models" value={String(rawData.mapped_model_ids.length)} />
              )}
              {Boolean(rawData.created_at) && (
                <DetailRow icon={<Clock size={14} />} label="Created" value={formatDate(rawData.created_at)} />
              )}
            </>
          )}

          {/* FRAMEWORK Details */}
          {entity.entityType === 'framework' && (
            <>
              {Boolean(rawData.description) && (
                <DetailText label="Description" value={String(rawData.description)} />
              )}
              {rawData.is_organizational !== undefined && (
                <DetailRow icon={<Building2 size={14} />} label="Organizational" value={rawData.is_organizational ? 'Yes' : 'No'} />
              )}
              {Boolean(rawData.created_at) && (
                <DetailRow icon={<Clock size={14} />} label="Created" value={formatDate(rawData.created_at)} />
              )}
            </>
          )}
        </Stack>

        {/* Connected Entities */}
        {entity.connectedEntities && entity.connectedEntities.length > 0 && (
          <>
            <Typography sx={{ fontSize: 13, fontWeight: 600, color: 'text.secondary', marginBottom: '8px', marginTop: '8px' }}>
              Connected entities
            </Typography>
            <Stack sx={{ gap: '8px' }}>
              {entity.connectedEntities.map((connection) => (
                <Box
                  key={connection.type}
                  sx={{
                    p: 1.5,
                    backgroundColor: 'background.accent',
                    borderRadius: '4px',
                    border: '1px solid status.default.border',
                  }}
                >
                  <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}>
                    <Typography sx={{ fontSize: 12, color: 'text.icon', textTransform: 'capitalize' }}>
                      {connection.type.replace(/([A-Z])/g, ' $1').trim()}s
                    </Typography>
                    <MuiChip
                      size="small"
                      label={String(connection.count)}
                      sx={{ height: 20, fontSize: 11, backgroundColor: 'status.default.border' }}
                    />
                  </Box>
                  {connection.items.slice(0, 3).map((item) => (
                    <Box
                      key={item.id}
                      onClick={() => onNavigateToEntity(connection.type, item.id)}
                      sx={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        py: 0.5,
                        cursor: 'pointer',
                        '&:hover': { color: 'brand.primary' },
                      }}
                    >
                      <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>
                        {item.label}
                      </Typography>
                      <ChevronRight size={12} color={text.icon} />
                    </Box>
                  ))}
                  {connection.items.length > 3 && (
                    <Typography sx={{ fontSize: 11, color: 'text.icon', mt: 0.5 }}>
                      +{connection.items.length - 3} more
                    </Typography>
                  )}
                </Box>
              ))}
            </Stack>
          </>
        )}

      </Box>

      {/* Footer */}
      <Box
        sx={{
          p: 2,
          borderTop: '1px solid #d0d5dd',
          display: 'flex',
          gap: 1,
        }}
      >
        <Button
          variant="outlined"
          size="small"
          fullWidth
          onClick={onClose}
          sx={{
            borderColor: 'border.dark',
            color: 'text.secondary',
            textTransform: 'none',
            height: 34,
            '&:hover': { borderColor: 'text.disabled', backgroundColor: 'background.accent' },
          }}
        >
          Close
        </Button>
        <Button
          variant="contained"
          size="small"
          fullWidth
          onClick={handleGoToEntity}
          endIcon={<ExternalLink size={14} />}
          sx={{
            backgroundColor: 'brand.primary',
            textTransform: 'none',
            height: 34,
            '&:hover': { backgroundColor: '#0f5a48' },
          }}
        >
          Go to {entityTypeLabels[entity.entityType].toLowerCase()}
        </Button>
      </Box>
    </Box>
  );
};

export default DetailSidebar;
