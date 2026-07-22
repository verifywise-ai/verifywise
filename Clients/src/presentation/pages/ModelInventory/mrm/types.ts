/** Minimal user shape the MRM sub-tabs need for owner/validator display + selects. */
export interface MrmUser {
  id: number | string;
  name?: string;
  surname?: string;
  email?: string;
}
