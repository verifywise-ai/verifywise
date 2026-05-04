/**
 * Custom tour step content structure
 * Pure domain type with no framework dependencies
 *
 * Note: Icon type uses 'unknown' to avoid React dependencies.
 * Presentation layer will handle React-specific type casting.
 */
export interface ICustomStepProps {
  header?: string;
  body: string;
  icon?: unknown;
}

/**
 * Core props for custom tour step wrapper component
 * Pure domain type with no framework dependencies
 * Actual implementation props (backProps, primaryProps, etc) come from presentation adapter
 */
export interface ICustomStepWrapperCoreProps {
  content: ICustomStepProps;
}

/**
 * Custom modal props for control pane and other modals
 * Pure domain type with no framework dependencies
 */
export interface ICustomModalProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  title: any;
  content: any;
  subControlTlts: string[];
  onConfirm: () => void;
}

/**
 * Delete account confirmation dialog props
 * Pure domain type with no framework dependencies
 */
export interface IDeleteAccountConfirmationProps {
  open: boolean;
  onClose: () => void;
}
