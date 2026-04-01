/**
 * ViewRelationshipsButton - Opens Entity Graph modal focused on a specific entity
 *
 * Usage:
 * <ViewRelationshipsButton
 *   entityId={model.id}
 *   entityType="model"
 *   entityLabel={model.name}
 * />
 */

import React, { useState } from 'react';
import { IconButton } from '@mui/material';
import { GitBranch } from 'lucide-react';
import VWTooltip from '../VWTooltip';
import { EntityGraphModal, FocusEntityType } from "../EntityGraphModal";
import { brand, text } from "../../themes/palette";

interface ViewRelationshipsButtonProps {
  entityId: string | number;
  entityType: FocusEntityType;
  entityLabel?: string;
  size?: 'small' | 'medium';
  tooltipText?: string;
}

const ViewRelationshipsButton: React.FC<ViewRelationshipsButtonProps> = ({
  entityId,
  entityType,
  entityLabel,
  size = 'small',
  tooltipText = 'View relationships',
}) => {
  const [modalOpen, setModalOpen] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setModalOpen(true);
  };

  const handleClose = () => {
    setModalOpen(false);
  };

  const iconSize = size === 'small' ? 16 : 20;

  return (
    <>
      <VWTooltip content={tooltipText} maxWidth={200}>
        <IconButton
          size={size}
          onClick={handleClick}
          sx={{
            color: `${text.icon}`,
            '&:hover': {
              color: `${brand.primary}`,
              backgroundColor: 'rgba(19, 113, 91, 0.08)',
            },
          }}
        >
          <GitBranch size={iconSize} />
        </IconButton>
      </VWTooltip>

      <EntityGraphModal
        open={modalOpen}
        onClose={handleClose}
        focusEntityId={entityId}
        focusEntityType={entityType}
        focusEntityLabel={entityLabel}
      />
    </>
  );
};

export default ViewRelationshipsButton;
