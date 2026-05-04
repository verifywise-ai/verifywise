import { TrainingStatus } from "../../../enums/status.enum";

/**
 * Props for the NewTraining component
 * onSuccess: Returns Promise<boolean> - true on successful save, false on failure
 *
 * Type usage:
 * - initialData: Optional but complete when present (from API). undefined when creating new.
 * - onSuccess data: Complete DTO after form validation (all required fields validated)
 *
 * ARCHITECTURE: Uses DTO (plain object) not Model (class instance)
 */
export interface NewTrainingProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  onSuccess?: (data: TrainingRegistarDTO) => Promise<boolean>;
  initialData?: TrainingRegistarDTO;
  isEdit?: boolean;
  entityId?: number;
}

/**
 * Form validation errors for training registrar form
 */
export interface NewTrainingFormErrors {
  training_name?: string;
  duration?: string;
  provider?: string;
  department?: string;
  status?: string;
  numberOfPeople?: string;
  description?: string;
}

/**
 * Data Transfer Object (DTO) for training registry
 * Used for API requests/responses and component data transfer
 *
 * ARCHITECTURE: Plain object interface for data transfer between layers
 * - Form submits DTO
 * - API returns DTO
 * - Model class can be instantiated from DTO
 */
export interface TrainingRegistarDTO {
  id?: number;
  training_name: string;
  duration: string;
  provider: string;
  department: string;
  status: TrainingStatus;
  numberOfPeople: number;
  description?: string; // Optional field (not validated by form)
}

/**
 * TrainingRegistarModel - Client-side model for training registry (OOP)
 *
 * ARCHITECTURE DECISION: Uses 'numberOfPeople' to match API contract
 * - API expects: numberOfPeople
 * - Server model property: numberOfPeople
 * - Database column: 'people' (mapped by ORM on server side)
 *
 * This ensures consistency across client-server communication.
 *
 * VALIDATION: All required fields are validated at the form level.
 * Form prevents submission unless all required fields are provided.
 *
 * OOP PATTERN: Accepts DTO in constructor, can contain business logic methods
 */
export class TrainingRegistarModel {
  id?: number;
  training_name: string;
  duration: string;
  provider: string;
  department: string;
  status: TrainingStatus;
  numberOfPeople: number;
  description?: string;

  constructor(data: TrainingRegistarDTO) {
    this.id = data.id;
    this.training_name = data.training_name;
    this.duration = data.duration;
    this.provider = data.provider;
    this.department = data.department;
    this.status = data.status;
    this.numberOfPeople = data.numberOfPeople;
    this.description = data.description ?? "";
  }

  static create(data: TrainingRegistarDTO): TrainingRegistarModel {
    return new TrainingRegistarModel(data);
  }

  // Future: Add business logic methods here
  // Example: isEditable(), validate(), toJSON(), etc.
}
