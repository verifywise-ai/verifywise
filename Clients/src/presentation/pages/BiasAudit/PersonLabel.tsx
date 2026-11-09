import { Stack, Typography } from "@mui/material";
import VWAvatar from "../../components/Avatar/VWAvatar";
import useUsers from "../../../application/hooks/useUsers";
import { palette } from "../../themes/palette";

interface PersonLabelProps {
  userId: number | null;
}

/** The person who gave an answer, attested a profile or generated a stance. */
const PersonLabel = ({ userId }: PersonLabelProps) => {
  const { users } = useUsers();
  const user = userId === null ? undefined : users.find((u) => u.id === userId);
  if (!user) {
    return (
      <Typography component="span" sx={{ fontSize: 13, color: palette.text.tertiary }}>
        —
      </Typography>
    );
  }
  return (
    <Stack direction="row" alignItems="center" gap="8px" component="span">
      <VWAvatar
        size="small"
        user={{ firstname: user.name, lastname: user.surname, id: user.id }}
        sx={{ width: 22, height: 22, fontSize: 10 }}
      />
      <Typography component="span" sx={{ fontSize: 13, color: palette.text.secondary }}>
        {`${user.name} ${user.surname}`}
      </Typography>
    </Stack>
  );
};

export default PersonLabel;
