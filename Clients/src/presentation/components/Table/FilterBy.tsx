import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button, Stack, Popover, Box, Typography } from '@mui/material';
import { X, Filter, Plus } from 'lucide-react';
import Select from '../Inputs/Select';
import Field from '../Inputs/Field';
import { VWLink } from '../Link/VWLink';
import { brand, status } from "../../themes/palette";

// Column type determines available operators and value input type
export type FilterColumnType = 'select' | 'text' | 'date';

export interface FilterColumnOption {
  value: string;
  label: string;
}

export interface FilterColumn {
  id: string;
  label: string;
  type: FilterColumnType;
  options?: FilterColumnOption[]; // Required for 'select' type
}

export type FilterOperator =
  | 'is'
  | 'is_not'
  | 'is_empty'
  | 'is_not_empty'
  | 'contains'
  | 'does_not_contain'
  // Date operators
  | 'in_1_day'
  | 'in_7_days'
  | 'in_2_weeks'
  | 'in_30_days'
  | 'is_past'
  | 'is_today';

export interface FilterCondition {
  id: string; // Unique identifier for this filter row
  columnId: string;
  operator: FilterOperator;
  value: string;
}

export interface FilterByProps {
  columns: FilterColumn[];
  onFilterChange: (conditions: FilterCondition[], logic: 'and' | 'or') => void;
  defaultConditions?: FilterCondition[];
  defaultLogic?: 'and' | 'or';
}

// Operators for select columns
const SELECT_OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

// Operators for text columns
const TEXT_OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'is', label: 'is' },
  { value: 'is_not', label: 'is not' },
  { value: 'contains', label: 'contains' },
  { value: 'does_not_contain', label: 'does not contain' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

// Operators for date columns
const DATE_OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: 'in_1_day', label: 'in 1 day' },
  { value: 'in_7_days', label: 'in 7 days' },
  { value: 'in_2_weeks', label: 'in 2 weeks' },
  { value: 'in_30_days', label: 'in 30 days' },
  { value: 'is_today', label: 'is today' },
  { value: 'is_past', label: 'is past' },
  { value: 'is_empty', label: 'is empty' },
  { value: 'is_not_empty', label: 'is not empty' },
];

// All operators that don't require a value input
const NO_VALUE_OPERATORS: FilterOperator[] = [
  'is_empty',
  'is_not_empty',
  'in_1_day',
  'in_7_days',
  'in_2_weeks',
  'in_30_days',
  'is_past',
  'is_today',
];

// Check if operator requires a value
const operatorRequiresValue = (operator: FilterOperator): boolean => {
  return !NO_VALUE_OPERATORS.includes(operator);
};

// Get operators based on column type
const getOperatorsForColumnType = (type: FilterColumnType): Array<{ value: FilterOperator; label: string }> => {
  switch (type) {
    case 'select':
      return SELECT_OPERATORS;
    case 'date':
      return DATE_OPERATORS;
    case 'text':
    default:
      return TEXT_OPERATORS;
  }
};

// Generate unique ID for filter rows
const generateFilterId = (): string => {
  return `filter-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Shared width for WHERE badge and AND/OR toggle (68px + 30% = ~88px)
const LOGIC_CONTROL_WIDTH = '88px';

// Narrow AND/OR Toggle Component for filter rows
const LogicToggle: React.FC<{
  value: 'and' | 'or';
  onChange: (value: 'and' | 'or') => void;
}> = ({ value, onChange }) => {
  return (
    <Box
      sx={{
        display: 'flex',
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: '4px',
        overflow: 'hidden',
        height: '30px',
        bgcolor: 'action.hover',
        padding: '2px',
        gap: '2px',
        width: LOGIC_CONTROL_WIDTH,
      }}
    >
      <Box
        onClick={() => onChange('and')}
        sx={{
          cursor: 'pointer',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontSize: '11px',
          fontWeight: 600,
          userSelect: 'none',
          borderRadius: '2px',
          bgcolor: value === 'and' ? 'background.paper' : 'transparent',
          border: value === 'and' ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid transparent',
          color: 'text.primary',
          transition: 'all 0.2s ease',
        }}
      >
        AND
      </Box>
      <Box
        onClick={() => onChange('or')}
        sx={{
          cursor: 'pointer',
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          fontSize: '11px',
          fontWeight: 600,
          userSelect: 'none',
          borderRadius: '2px',
          bgcolor: value === 'or' ? 'background.paper' : 'transparent',
          border: value === 'or' ? '1px solid rgba(0, 0, 0, 0.08)' : '1px solid transparent',
          color: 'text.primary',
          transition: 'all 0.2s ease',
        }}
      >
        OR
      </Box>
    </Box>
  );
};

// Badge Component - shows count of active filters
const FilterBadge: React.FC<{ count: number }> = ({ count }) => (
  <Box
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '18px',
      height: '18px',
      borderRadius: '50%',
      backgroundColor: '#dbeafe',
      color: '#1e40af',
      fontSize: '11px',
      fontWeight: 600,
      marginLeft: '6px',
    }}
  >
    {count}
  </Box>
);

// WHERE Badge Component
const WhereBadge: React.FC = () => (
  <Box
    sx={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      height: '34px',
      width: LOGIC_CONTROL_WIDTH,
      borderRadius: '4px',
      backgroundColor: '#f1f5f9',
      color: '#475569',
      fontSize: '11px',
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.5px',
    }}
  >
    WHERE
  </Box>
);

// Header Component
const FilterByHeader: React.FC<{
  onClose: () => void;
}> = ({ onClose }) => (
  <Stack direction="row" justifyContent="space-between" alignItems="center">
    <Typography sx={{ fontSize: '11px', fontWeight: 600, color: 'status.default.text', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
      FILTER BY
    </Typography>
    <Box
      onClick={onClose}
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

// Single Filter Row Component
const FilterRow: React.FC<{
  condition: FilterCondition;
  columns: FilterColumn[];
  isFirst: boolean;
  logic: 'and' | 'or';
  onLogicChange: (logic: 'and' | 'or') => void;
  onChange: (condition: FilterCondition) => void;
  onRemove: () => void;
  showRemove: boolean;
}> = ({ condition, columns, isFirst, logic, onLogicChange, onChange, onRemove, showRemove }) => {
  const currentColumn = columns.find(col => col.id === condition.columnId);
  const columnType = currentColumn?.type || 'text';
  const operators = getOperatorsForColumnType(columnType);
  const showValueField = operatorRequiresValue(condition.operator);

  // Column dropdown items
  const columnItems = columns.map(col => ({ _id: col.id, name: col.label }));

  // Operator dropdown items
  const operatorItems = operators.map(op => ({ _id: op.value, name: op.label }));

  // Value dropdown items (for select type columns)
  const valueItems = currentColumn?.options
    ? [
        { _id: '', name: 'Select value' },
        ...currentColumn.options.map(opt => ({ _id: opt.value, name: opt.label }))
      ]
    : [];

  const handleColumnChange = (e: any) => {
    const newColumnId = e.target.value;
    const newColumn = columns.find(col => col.id === newColumnId);
    const newType = newColumn?.type || 'text';
    const newOperators = getOperatorsForColumnType(newType);

    // Reset operator to first available for new column type
    onChange({
      ...condition,
      columnId: newColumnId,
      operator: newOperators[0].value,
      value: '',
    });
  };

  const handleOperatorChange = (e: any) => {
    const newOperator = e.target.value as FilterOperator;
    onChange({
      ...condition,
      operator: newOperator,
      // Clear value if operator doesn't require it
      value: operatorRequiresValue(newOperator) ? condition.value : '',
    });
  };

  const handleValueChange = (e: any) => {
    onChange({
      ...condition,
      value: e.target.value,
    });
  };

  return (
    <Stack direction="row" gap="12px" alignItems="center">
      {/* Left side: WHERE badge or AND/OR toggle */}
      <Box sx={{ flexShrink: 0 }}>
        {isFirst ? (
          <WhereBadge />
        ) : (
          <LogicToggle
            value={logic}
            onChange={onLogicChange}
          />
        )}
      </Box>

      {/* Column dropdown */}
      <Box sx={{ flex: '0 0 180px' }}>
        <Select
          id={`filter-column-${condition.id}`}
          value={condition.columnId}
          items={columnItems}
          onChange={handleColumnChange}
          sx={{ width: '100%' }}
        />
      </Box>

      {/* Operator dropdown */}
      <Box sx={{ flex: '0 0 140px' }}>
        <Select
          id={`filter-operator-${condition.id}`}
          value={condition.operator}
          items={operatorItems}
          onChange={handleOperatorChange}
          sx={{ width: '100%' }}
        />
      </Box>

      {/* Value field (hidden for is_empty/is_not_empty) */}
      <Box sx={{ flex: 1, visibility: showValueField ? 'visible' : 'hidden' }}>
        {columnType === 'select' && currentColumn?.options ? (
          <Select
            id={`filter-value-${condition.id}`}
            value={condition.value}
            items={valueItems}
            onChange={handleValueChange}
            sx={{ width: '100%' }}
          />
        ) : (
          <Field
            id={`filter-value-${condition.id}`}
            placeholder="Enter text here..."
            value={condition.value}
            onChange={handleValueChange}
            sx={{ width: '100%' }}
          />
        )}
      </Box>

      {/* Remove button */}
      <Box
        onClick={showRemove ? onRemove : undefined}
        sx={{
          cursor: showRemove ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'center',
          opacity: showRemove ? 1 : 0.3,
          '&:hover': showRemove ? { opacity: 0.7 } : {},
        }}
      >
        <X size={16} color={status.default.text} />
      </Box>
    </Stack>
  );
};

// Main FilterBy Component
export const FilterBy: React.FC<FilterByProps> = ({
  columns,
  onFilterChange,
  defaultConditions,
  defaultLogic = 'and',
}) => {
  // Create initial condition
  const createInitialCondition = useCallback((): FilterCondition => {
    const firstColumn = columns[0];
    const operators = getOperatorsForColumnType(firstColumn?.type || 'text');
    return {
      id: generateFilterId(),
      columnId: firstColumn?.id || '',
      operator: operators[0]?.value || 'is',
      value: '',
    };
  }, [columns]);

  const [conditions, setConditions] = useState<FilterCondition[]>(
    defaultConditions?.length ? defaultConditions : [createInitialCondition()]
  );
  const [logic, setLogic] = useState<'and' | 'or'>(defaultLogic);
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

  const handleConditionChange = (index: number, newCondition: FilterCondition) => {
    const newConditions = [...conditions];
    newConditions[index] = newCondition;
    setConditions(newConditions);
    onFilterChange(newConditions, logic);
  };

  const handleLogicChange = (newLogic: 'and' | 'or') => {
    setLogic(newLogic);
    onFilterChange(conditions, newLogic);
  };

  const handleAddFilter = () => {
    if (conditions.length < 4) {
      const newConditions = [...conditions, createInitialCondition()];
      setConditions(newConditions);
      onFilterChange(newConditions, logic);
    }
  };

  const handleRemoveFilter = (index: number) => {
    if (conditions.length > 1) {
      const newConditions = conditions.filter((_, i) => i !== index);
      setConditions(newConditions);
      onFilterChange(newConditions, logic);
    }
  };

  const handleClearAll = () => {
    const initialCondition = createInitialCondition();
    setConditions([initialCondition]);
    setLogic('and');
    onFilterChange([initialCondition], 'and');
  };

  // Count active filters (conditions with a value or operators that don't need a value)
  const activeFilterCount = conditions.filter(
    (c) => c.value || NO_VALUE_OPERATORS.includes(c.operator)
  ).length;

  const open = Boolean(anchorEl);
  const canAddMore = conditions.length < 4;

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
          borderColor: 'border.dark',
          height: '34px',
          minWidth: activeFilterCount > 0 ? '100px' : '80px',
          backgroundColor: open ? '#eff6ff' : 'transparent',
          '&:hover': {
            borderColor: 'text.muted',
            backgroundColor: '#eff6ff',
          },
        }}
      >
        <Filter size={16} color="#3b82f6" style={{ marginRight: '6px' }} />
        Filter
        {activeFilterCount > 0 && <FilterBadge count={activeFilterCount} />}
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
              minWidth: '700px',
              boxShadow: '0px 4px 12px rgba(0, 0, 0, 0.1)',
              borderRadius: '4px',
            }
          }
        }}
      >
        <Stack gap="12px">
          <FilterByHeader
            onClose={handleClose}
          />

          {/* Filter rows */}
          {conditions.map((condition, index) => (
            <FilterRow
              key={condition.id}
              condition={condition}
              columns={columns}
              isFirst={index === 0}
              logic={logic}
              onLogicChange={handleLogicChange}
              onChange={(newCondition) => handleConditionChange(index, newCondition)}
              onRemove={() => handleRemoveFilter(index)}
              showRemove={conditions.length > 1}
            />
          ))}

          {/* Add filter link - aligned with the first dropdown (after WHERE/AND/OR) */}
          {canAddMore && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mt: '4px', ml: `calc(${LOGIC_CONTROL_WIDTH} + 12px)` }}>
              <Plus size={14} color={brand.primary} />
              <VWLink onClick={handleAddFilter} showUnderline={false}>
                Add filter
              </VWLink>
            </Box>
          )}

          {/* Clear all footer */}
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'flex-end',
              py: '8px',
              px: '12px',
              mt: '12px',
              mx: '-16px',
              mb: '-16px',
              backgroundColor: 'background.accent',
              borderTop: '1px solid status.default.border',
              borderRadius: '0 0 4px 4px',
            }}
          >
            <Typography
              onClick={handleClearAll}
              sx={{
                fontSize: '9px',
                fontWeight: 600,
                color: 'status.default.text',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
                cursor: 'pointer',
                '&:hover': {
                  color: '#374151',
                },
              }}
            >
              Clear all
            </Typography>
          </Box>
        </Stack>
      </Popover>
    </>
  );
};
