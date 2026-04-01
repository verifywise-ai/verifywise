import React, { useState, useEffect, useRef } from 'react';
import { Button, Stack, Popover, Box, Typography } from '@mui/material';
import { X, Rows3 } from 'lucide-react';
import Select from '../Inputs/Select';
import { ButtonToggle } from '../button-toggle';
import { text, border as borderPalette, status } from "../../themes/palette";

export interface GroupByOption {
  id: string;
  label: string;
}

export interface GroupByProps {
  options: GroupByOption[];
  onGroupChange: (groupBy: string | null, sortOrder: 'asc' | 'desc') => void;
  defaultGroupBy?: string;
  defaultSortOrder?: 'asc' | 'desc';
}

// Badge Component - exported for reuse
export const GroupBadge: React.FC<{ count: number }> = ({ count }) => (
  <Box
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      backgroundColor: '#dcfce7',
      color: '#166534',
      fontSize: '11px',
      fontWeight: 600,
      marginLeft: '6px',
    }}
  >
    {count}
  </Box>
);

// Header Component
const GroupByHeader: React.FC<{
  selectedGroup: string;
  onClear: () => void;
  onClose: () => void;
}> = ({ selectedGroup, onClear, onClose }) => (
  <Stack direction="row" justifyContent="space-between" alignItems="center">
    <Typography sx={{ fontSize: '11px', fontWeight: 600, color: `${status.default.text}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      GROUP BY
    </Typography>
    <Box
      onClick={selectedGroup ? onClear : onClose}
      sx={{
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        '&:hover': { opacity: 0.7 }
      }}
    >
      <X size={16} color={status.default.text} />
    </Box>
  </Stack>
);

// Controls Component
const GroupByControls: React.FC<{
  selectedGroup: string;
  selectItems: Array<{ _id: string; name: string }>;
  sortOrder: 'asc' | 'desc';
  onGroupChange: (event: any) => void;
  onSortChange: (value: string) => void;
}> = ({ selectedGroup, selectItems, sortOrder, onGroupChange, onSortChange }) => (
  <Stack direction="row" spacing={2} alignItems="center">
    <Box sx={{ flex: '0 0 35%' }}>
      <Select
        id="group-by-field"
        value={selectedGroup}
        items={selectItems}
        onChange={onGroupChange}
        sx={{ width: '100%' }}
      />
    </Box>
    <Box sx={{ flex: '0 0 auto', display: 'flex', justifyContent: 'flex-end' }}>
      <Box sx={{ width: '180px' }}>
        <ButtonToggle
          options={[
            { label: 'A → Z', value: 'asc' },
            { label: 'Z → A', value: 'desc' }
          ]}
          value={sortOrder}
          onChange={onSortChange}
          height={34}
        />
      </Box>
    </Box>
  </Stack>
);

// Main GroupBy Component
export const GroupBy: React.FC<GroupByProps> = ({
  options,
  onGroupChange,
  defaultGroupBy,
  defaultSortOrder = 'asc',
}) => {
  const [selectedGroup, setSelectedGroup] = useState<string>(defaultGroupBy || '');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(defaultSortOrder);
  const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);

  const handleClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    setAnchorEl(event.currentTarget);

    // Find the scrollable parent
    let parent = event.currentTarget.parentElement;
    while (parent) {
      const overflow = window.getComputedStyle(parent).overflow;
      if (overflow === 'auto' || overflow === 'scroll' || parent === document.body) {
        scrollParentRef.current = parent;
        break;
      }
      parent = parent.parentElement;
    }
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  // Close popover on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (anchorEl) {
        handleClose();
      }
    };

    if (anchorEl && scrollParentRef.current) {
      scrollParentRef.current.addEventListener('scroll', handleScroll);
      window.addEventListener('scroll', handleScroll, true);
    }

    return () => {
      if (scrollParentRef.current) {
        scrollParentRef.current.removeEventListener('scroll', handleScroll);
      }
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [anchorEl]);

  const handleGroupChange = (event: any) => {
    const value = event.target.value;
    setSelectedGroup(value);
    if (value === '') {
      onGroupChange(null, 'asc');
      setSortOrder('asc');
    } else {
      onGroupChange(value, sortOrder);
    }
  };

  const handleSortChange = (value: string) => {
    const order = value as 'asc' | 'desc';
    setSortOrder(order);
    if (selectedGroup) {
      onGroupChange(selectedGroup, order);
    }
  };

  const handleClear = () => {
    setSelectedGroup('');
    setSortOrder('asc');
    onGroupChange(null, 'asc');
    handleClose();
  };

  const open = Boolean(anchorEl);

  const selectItems = [
    { _id: '', name: 'Select field' },
    ...options.map(option => ({ _id: option.id, name: option.label }))
  ];

  return (
    <>
      <Button
        onClick={handleClick}
        variant="outlined"
        sx={{
          fontSize: '13px',
          fontWeight: 500,
          padding: '6px 12px',
          textTransform: 'none',
          color: '#374151',
          borderColor: `${borderPalette.dark}`,
          height: '34px',
          minWidth: selectedGroup ? '110px' : '80px',
          backgroundColor: open ? '#f0fdf4' : 'transparent',
          '&:hover': {
            borderColor: `${text.muted}`,
            backgroundColor: '#f0fdf4',
          },
        }}
      >
        <Rows3 size={16} color="#10b981" style={{ marginRight: '6px' }} />
        Group
        {selectedGroup && <GroupBadge count={1} />}
      </Button>

      <Popover
        open={open}
        anchorEl={anchorEl}
        onClose={handleClose}
        anchorOrigin={{
          vertical: 'bottom',
          horizontal: 'left',
        }}
        transformOrigin={{
          vertical: 'top',
          horizontal: 'left',
        }}
        slotProps={{
          paper: {
            sx: {
              marginTop: '8px',
              padding: '16px',
              minWidth: '480px',
              boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
              borderRadius: '8px',
            }
          }
        }}
      >
        <Stack spacing={2}>
          <GroupByHeader
            selectedGroup={selectedGroup}
            onClear={handleClear}
            onClose={handleClose}
          />
          <GroupByControls
            selectedGroup={selectedGroup}
            selectItems={selectItems}
            sortOrder={sortOrder}
            onGroupChange={handleGroupChange}
            onSortChange={handleSortChange}
          />
        </Stack>
      </Popover>
    </>
  );
};
