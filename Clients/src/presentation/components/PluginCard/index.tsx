import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  useTheme,
  Chip,
  CircularProgress,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import {
  ChevronRight as ChevronRightIcon,
  CheckCircle as CheckIcon,
  AlertCircle as ErrorIcon,
  XCircle as DisconnectIcon,
  MoreVertical as MoreVerticalIcon,
  Settings as SettingsIcon,
  Trash2 as TrashIcon,
  Building2 as OrgIcon,
  FolderKanban as ProjectIcon,
} from 'lucide-react';
import { cardStyles } from '../../themes/components';
import { background } from '../../themes/palette';
import { Plugin, PluginInstallationStatus } from '../../../domain/types/plugins';
import ConfirmationModal from '../../components/Dialogs/ConfirmationModal';

interface PluginCardProps {
  plugin: Plugin;
  onUninstall?: (installationId: number, pluginKey: string) => Promise<void>;
  onManage?: (plugin: Plugin) => void;
  loading?: boolean;
}

const PluginCard: React.FC<PluginCardProps> = ({
  plugin,
  onUninstall,
  onManage,
  loading = false,
}) => {
  const theme = useTheme();
  const [isHovered, setIsHovered] = useState(false);
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const menuOpen = Boolean(anchorEl);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    event.stopPropagation();
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = (event?: React.MouseEvent) => {
    if (event) event.stopPropagation();
    setAnchorEl(null);
  };

  const handleManageClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    handleMenuClose();
    if (onManage) onManage(plugin);
  };

  const handleUninstallClick = (event: React.MouseEvent) => {
    event.stopPropagation();
    handleMenuClose();
    setIsDeleteModalOpen(true);
  };

  const handleConfirmUninstall = async () => {
    if (!plugin.installationId || !onUninstall) return;

    try {
      await onUninstall(plugin.installationId, plugin.key);
      setIsDeleteModalOpen(false);
    } catch (error) {
      console.error(`Failed to uninstall ${plugin.displayName}:`, error);
      setIsDeleteModalOpen(false);
    }
  };

  const getStatusColor = (status?: PluginInstallationStatus) => {
    if (!status) return 'default';

    switch (status) {
      case PluginInstallationStatus.INSTALLED:
        return 'success';
      case PluginInstallationStatus.INSTALLING:
        return 'warning';
      case PluginInstallationStatus.FAILED:
        return 'error';
      default:
        return 'default';
    }
  };

  const getStatusIcon = (status?: PluginInstallationStatus) => {
    if (!status) return <DisconnectIcon size={16} />;

    switch (status) {
      case PluginInstallationStatus.INSTALLED:
        return <CheckIcon size={16} />;
      case PluginInstallationStatus.FAILED:
        return <ErrorIcon size={16} />;
      default:
        return <DisconnectIcon size={16} />;
    }
  };

  const getActionText = () => {
    if (plugin.installationStatus === PluginInstallationStatus.INSTALLING) {
      return 'Installing...';
    }
    // Always show "View Details" for consistency
    return 'View Details';
  };

  const handleActionClick = async (event: React.MouseEvent) => {
    event.stopPropagation();

    if (loading) return;

    // Always navigate to plugin management page
    // Installation will happen from there via explicit button
    if (onManage) {
      onManage(plugin);
    }
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        ...(cardStyles.base(theme) as any),
        margin: 0,
        background: `linear-gradient(135deg, ${background.main} 0%, ${background.gradientStop} 100%)`,
        '&:hover': {
          background: `linear-gradient(135deg, ${background.accent} 0%, #f1f5f9 100%)`,
          borderColor: '#D1D5DB',
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
        },
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleActionClick}
    >
      <CardContent
        sx={{
          p: 2,
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          position: 'relative',
          backgroundColor: 'transparent',
          '&:last-child': {
            paddingBottom: 2,
          },
        }}
      >
        {/* Header Section */}
        <Box sx={{ p: 2, m: 3, backgroundColor: 'transparent' }}>
          {/* Plugin Icon */}
          {plugin.iconUrl && (
            <Box
              component="img"
              src={plugin.iconUrl}
              alt={`${plugin.displayName} logo`}
              sx={{
                width: 48,
                height: 48,
                mb: 3,
                objectFit: 'contain',
              }}
            />
          )}

          {/* Plugin Name and Status */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
            <Typography
              variant="h6"
              sx={(theme) => ({
                fontWeight: 600,
                color: theme.palette.text.primary,
                fontSize: '15px',
              })}
            >
              {plugin.displayName}
            </Typography>
            {plugin.installationStatus && (
              <Box sx={{ ml: 2 }}>
                <Chip
                  size="small"
                  label={plugin.installationStatus}
                  color={getStatusColor(plugin.installationStatus)}
                  icon={getStatusIcon(plugin.installationStatus)}
                  sx={{
                    fontSize: '11px',
                    height: 22,
                    borderRadius: '4px',
                    backgroundColor:
                      getStatusColor(plugin.installationStatus) === 'success'
                        ? 'rgba(34, 197, 94, 0.1)'
                        : getStatusColor(plugin.installationStatus) === 'error'
                        ? 'rgba(239, 68, 68, 0.1)'
                        : getStatusColor(plugin.installationStatus) === 'warning'
                        ? 'rgba(245, 158, 11, 0.1)'
                        : 'rgba(107, 114, 128, 0.1)',
                    color:
                      getStatusColor(plugin.installationStatus) === 'success'
                        ? '#16a34a'
                        : getStatusColor(plugin.installationStatus) === 'error'
                        ? '#dc2626'
                        : getStatusColor(plugin.installationStatus) === 'warning'
                        ? '#d97706'
                        : 'status.default.text',
                    border: `1px solid ${
                      getStatusColor(plugin.installationStatus) === 'success'
                        ? 'rgba(34, 197, 94, 0.2)'
                        : getStatusColor(plugin.installationStatus) === 'error'
                        ? 'rgba(239, 68, 68, 0.2)'
                        : getStatusColor(plugin.installationStatus) === 'warning'
                        ? 'rgba(245, 158, 11, 0.2)'
                        : 'rgba(107, 114, 128, 0.2)'
                    }`,
                    fontWeight: 500,
                  }}
                />
              </Box>
            )}
          </Box>
        </Box>

        {/* Content Section */}
        <Box sx={{ backgroundColor: 'transparent', mx: 3, mb: 4, px: 2, flexGrow: 1 }}>
          {/* Plugin Description */}
          <Typography
            variant="body2"
            sx={(theme) => ({
              color: theme.palette.text.secondary,
              fontSize: '13px',
              mb: "8px",
            })}
          >
            {plugin.description}
          </Typography>

          {/* Framework Type Badge */}
          {plugin.frameworkType && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: "8px", mb: "8px" }}>
              <Chip
                size="small"
                icon={
                  plugin.frameworkType === 'organizational' ? (
                    <OrgIcon size={11} />
                  ) : (
                    <ProjectIcon size={11} />
                  )
                }
                label={plugin.frameworkType === 'organizational' ? 'Organizational' : 'Project'}
                variant="outlined"
                sx={{
                  fontSize: '10px',
                  height: 20,
                  borderRadius: '10px',
                  backgroundColor: 'transparent',
                  color:
                    plugin.frameworkType === 'organizational'
                      ? 'brand.primary'
                      : '#6366f1',
                  borderColor:
                    plugin.frameworkType === 'organizational'
                      ? 'brand.primary'
                      : '#6366f1',
                  fontWeight: 500,
                  '& .MuiChip-icon': {
                    color: 'inherit',
                    marginLeft: '4px',
                    marginRight: '-2px',
                  },
                }}
              />
            </Box>
          )}

          {/* Plugin Features */}
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: "8px" }}>
            {(plugin.features || []).slice(0, 2).map((feature, index) => (
              <Chip
                key={index}
                size="small"
                label={feature.name}
                variant="outlined"
                sx={{ fontSize: '10px', height: 20 }}
              />
            ))}
          </Box>
        </Box>

        {/* Action Button */}
        <Box
          sx={{
            position: 'absolute',
            top: 20,
            right: 20,
            display: 'flex',
            alignItems: 'center',
            color: theme.palette.primary.main,
            transition: 'all 0.3s ease',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? (
            <CircularProgress size={20} />
          ) : plugin.installationStatus === PluginInstallationStatus.INSTALLED ? (
            <>
              <IconButton
                size="small"
                onClick={handleMenuOpen}
                sx={{
                  color: 'brand.primary',
                  opacity: isHovered ? 1 : 0.7,
                  transition: 'opacity 0.3s ease',
                  '&:hover': {
                    backgroundColor: 'rgba(19, 113, 91, 0.1)',
                  },
                }}
              >
                <MoreVerticalIcon size={20} />
              </IconButton>
              <Menu
                anchorEl={anchorEl}
                open={menuOpen}
                onClose={() => handleMenuClose()}
                onClick={(e) => e.stopPropagation()}
                PaperProps={{
                  sx: {
                    mt: 1,
                    minWidth: 160,
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                    borderRadius: '8px',
                    border: '1px solid #d0d5dd',
                  },
                }}
              >
                {plugin.requiresConfiguration !== false && (
                  <MenuItem onClick={handleManageClick}>
                    <ListItemIcon>
                      <SettingsIcon size={16} />
                    </ListItemIcon>
                    <ListItemText primaryTypographyProps={{ fontSize: '13px' }}>
                      Manage
                    </ListItemText>
                  </MenuItem>
                )}
                <MenuItem onClick={handleUninstallClick}>
                  <ListItemIcon>
                    <TrashIcon size={16} color="#dc2626" />
                  </ListItemIcon>
                  <ListItemText
                    primaryTypographyProps={{ fontSize: '13px', color: '#dc2626' }}
                  >
                    Uninstall
                  </ListItemText>
                </MenuItem>
              </Menu>
            </>
          ) : (
            <>
              <Typography
                variant="body2"
                sx={{
                  fontWeight: 500,
                  fontSize: '13px',
                  opacity: isHovered ? 1 : 0,
                  transform: isHovered ? 'translateX(0)' : 'translateX(10px)',
                  transition: 'all 0.3s ease',
                  whiteSpace: 'nowrap',
                  mr: isHovered ? 1 : 0,
                }}
              >
                {getActionText()}
              </Typography>
              <ChevronRightIcon
                size={20}
                style={{
                  transform: isHovered ? 'translateX(0)' : 'translateX(0)',
                  transition: 'all 0.3s ease',
                }}
              />
            </>
          )}
        </Box>
      </CardContent>

      {/* Uninstall Confirmation Modal */}
      {isDeleteModalOpen && (
        <ConfirmationModal
          title="Confirm uninstall"
          body={
            <Typography fontSize={13}>
              Are you sure you want to uninstall {plugin.displayName}? This action cannot be undone.
            </Typography>
          }
          cancelText="Cancel"
          proceedText="Uninstall"
          onCancel={() => setIsDeleteModalOpen(false)}
          onProceed={handleConfirmUninstall}
          proceedButtonColor="error"
          proceedButtonVariant="contained"
        />
      )}
    </Card>
  );
};

export default PluginCard;
