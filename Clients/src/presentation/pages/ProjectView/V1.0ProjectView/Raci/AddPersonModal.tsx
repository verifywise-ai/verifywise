import { useMemo, useState, type FC } from "react";
import { Stack, Typography } from "@mui/material";
import Alert from "../../../../components/Alert";
import StandardModal from "../../../../components/Modals/StandardModal";
import AutoCompleteField from "../../../../components/Inputs/Autocomplete";
import Checkbox from "../../../../components/Inputs/Checkbox";
import useUsers from "../../../../../application/hooks/useUsers";
import type { User } from "../../../../../domain/types/User";
import type { RaciRole } from "../../../../../domain/enums/raci.enum";
import { RACI_LEGEND, RACI_ROLES, RACI_SAVE_ERROR_MESSAGE } from "./raci.constants";

interface AddPersonModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  /** The last save failed; the modal stays open so the person can retry. */
  hasSaveError: boolean;
  /** People already in the matrix, who cannot be picked again. */
  existingUserIds: number[];
  onClose: () => void;
  /** Call `onAdded` once saved, so the modal closes and resets. */
  onSubmit: (userId: number, roles: RaciRole[], onAdded: () => void) => void;
}

const AddPersonModal: FC<AddPersonModalProps> = ({
  isOpen,
  isSubmitting,
  hasSaveError,
  existingUserIds,
  onClose,
  onSubmit,
}) => {
  const { users, loading, error } = useUsers();
  const [person, setPerson] = useState<User | null>(null);
  const [roles, setRoles] = useState<RaciRole[]>([]);

  const options = useMemo(
    () => users.filter((user) => !existingUserIds.includes(Number(user.id))),
    [users, existingUserIds],
  );

  let noOptionsText = "Everyone is already in this matrix";
  if (loading) noOptionsText = "Loading people...";
  else if (error) noOptionsText = "People could not be loaded.";
  else if (users.length === 0) noOptionsText = "No people found.";

  const toggleRole = (role: RaciRole) => {
    setRoles((current) =>
      current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
    );
  };

  const handleClose = () => {
    setPerson(null);
    setRoles([]);
    onClose();
  };

  const handleSubmit = () => {
    if (person) onSubmit(Number(person.id), roles, handleClose);
  };

  return (
    <StandardModal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add person"
      description="Give someone in your organization a role on this use case."
      onSubmit={handleSubmit}
      submitButtonText="Add person"
      isSubmitting={isSubmitting}
      isSubmitDisabled={!person || roles.length === 0}
      fitContent
    >
      <Stack sx={{ gap: "16px" }}>
        {hasSaveError && <Alert variant="error" body={RACI_SAVE_ERROR_MESSAGE} inline />}
        <AutoCompleteField<User>
          id="raci-person"
          label="Person"
          placeholder="Select a person"
          options={options}
          value={person}
          onChange={(_event, value) => setPerson(value)}
          getOptionLabel={(user) => `${user.name} ${user.surname}`}
          isOptionEqualToValue={(option, value) => option.id === value.id}
          noOptionsText={noOptionsText}
        />
        <Stack sx={{ gap: "8px" }}>
          <Typography sx={{ fontSize: "13px", fontWeight: 500 }}>Roles</Typography>
          {RACI_ROLES.map((role) => (
            <Checkbox
              key={role}
              id={`raci-add-role-${role}`}
              label={RACI_LEGEND[role]}
              isChecked={roles.includes(role)}
              value={role}
              onChange={() => toggleRole(role)}
              size="small"
            />
          ))}
        </Stack>
      </Stack>
    </StandardModal>
  );
};

export default AddPersonModal;
