import React, { useState } from "react";
import { Box, Typography, Stack, SelectChangeEvent } from "@mui/material";
import { OnboardingStepProps } from "../../../types/interfaces/i.onboarding";
import { UserPlus } from "lucide-react";
import { CustomizableButton } from "../../button/customizable-button";
import Select from "../../Inputs/Select";
import Field from "../../Inputs/Field";
import { sendInviteEmail } from "../../../../application/repository/mail.repository";
import { useAuth } from "../../../../application/hooks/useAuth";
import { useRoles } from "../../../../application/hooks/useRoles";
import onboardingBanner from "../../../assets/onboarding-banner.svg";

interface TeamMemberInvite {
  email: string;
  role: "admin" | "reviewer" | "editor";
}

const InviteTeamStep: React.FC<OnboardingStepProps> = () => {
  const { organizationId } = useAuth();
  const { roles } = useRoles();
  const [invites, setInvites] = useState<TeamMemberInvite[]>([
    { email: "", role: "editor" },
  ]);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleEmailChange = (index: number, value: string) => {
    const newInvites = [...invites];
    newInvites[index].email = value;

    // Auto-add new row when email is filled
    const isLastRow = index === invites.length - 1;
    if (isLastRow && value.trim() !== "" && invites.length < 5) {
      newInvites.push({ email: "", role: "editor" });
    }

    // Auto-remove empty rows but keep at least 1 empty row
    const filledInvites = newInvites.filter((inv) => inv.email.trim() !== "");
    const emptyInvites = newInvites.filter((inv) => inv.email.trim() === "");

    if (filledInvites.length > 0 && emptyInvites.length > 1) {
      // Keep filled invites and only one empty row
      const finalInvites: TeamMemberInvite[] = [...filledInvites, { email: "", role: "editor" as const }];
      setInvites(finalInvites);
    } else {
      setInvites(newInvites);
    }
  };

  const handleRoleChange = (index: number, event: SelectChangeEvent<string | number>) => {
    const newInvites = [...invites];
    newInvites[index].role = event.target.value as "admin" | "reviewer" | "editor";
    setInvites(newInvites);
  };

  const getRoleId = (roleName: string): string => {
    const role = roles.find((r) => r.name.toLowerCase() === roleName.toLowerCase());
    return role ? role.id.toString() : "1"; // Default to first role if not found
  };

  const handleInvite = async () => {
    const validInvites = invites.filter((invite) => invite.email.trim() !== "");
    if (validInvites.length > 0) {
      setIsSending(true);
      setErrorMessage(null);
      setSuccessMessage(null);

      try {
        // Send all invites in parallel
        const invitePromises = validInvites.map((invite) =>
          sendInviteEmail({
            to: invite.email,
            email: invite.email,
            name: "",
            surname: "",
            roleId: getRoleId(invite.role),
            organizationId: String(organizationId || ""),
          })
        );

        await Promise.all(invitePromises);
        setSuccessMessage(`Successfully sent ${validInvites.length} invitation${validInvites.length > 1 ? 's' : ''}!`);

        // Clear invites after successful send
        setInvites([{ email: "", role: "editor" }]);

        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(null), 3000);
      } catch (error: any) {
        // Check if it's an email service configuration error (expected in local dev)
        const isEmailConfigError = error?.message?.includes("email") || error?.message?.includes("mail");

        if (isEmailConfigError) {
          // Use console.warn for expected local development scenario
          console.warn("Email service not available (expected in local development):", error?.message);
          setErrorMessage("Email service not configured. Invitations cannot be sent in local development.");
        } else {
          // Use console.error for unexpected errors
          console.error("Unexpected error sending invitations:", error);
          setErrorMessage("An error occurred while sending invitations. Please try again.");
        }
      } finally {
        setIsSending(false);
      }
    }
  };

  const roleOptions = [
    { _id: "editor", name: "Editor" },
    { _id: "reviewer", name: "Reviewer" },
    { _id: "admin", name: "Admin" },
  ];

  return (
    <Stack spacing={4}>
      <Box
        sx={{
          position: "relative",
          width: "100%",
        }}
      >
        <Box
          component="img"
          src={onboardingBanner}
          alt="Onboarding"
          sx={{
            width: "100%",
            height: "auto",
            maxHeight: "140px",
            borderRadius: "4px",
            objectFit: "cover",
            display: "block",
          }}
        />
        <Typography
          variant="h5"
          sx={{
            position: "absolute",
            top: "40px",
            left: "50px",
            fontWeight: 600,
            fontSize: "24px",
            color: "background.main",
          }}
        >
          Invite team members
        </Typography>
      </Box>

      <Box>
        <Typography
          sx={{
            fontSize: "14px",
            color: "text.icon",
            marginBottom: 3,
            lineHeight: 1.6,
          }}
        >
          Invite up to 5 people to your organization to collaborate on AI governance and compliance.
        </Typography>
      </Box>

      <Stack sx={{ gap: "8px" }}>
        {invites.map((invite, index) => (
          <Box key={index} sx={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
            <Field
              id={`email-${index}`}
              type="text"
              placeholder="Email address"
              value={invite.email}
              onChange={(e) => handleEmailChange(index, e.target.value)}
              sx={{
                flex: 1,
              }}
            />

            <Box sx={{ minWidth: "150px", flexShrink: 0, pointerEvents: "auto", position: "relative", zIndex: 1 }}>
              <Select
                id={`role-${index}`}
                value={invite.role}
                onChange={(e) => handleRoleChange(index, e)}
                items={roleOptions}
                sx={{
                  width: "100%",
                  pointerEvents: "auto",
                  cursor: "pointer",
                }}
              />
            </Box>
          </Box>
        ))}

        <CustomizableButton
          variant="contained"
          text={isSending ? "Sending..." : "Invite teammates"}
          onClick={handleInvite}
          startIcon={<UserPlus size={16} />}
          isDisabled={isSending}
          sx={{
            backgroundColor: "brand.primary",
            fontSize: "14px",
            padding: "10px 20px",
            alignSelf: "flex-start",
            "&:hover": {
              backgroundColor: "brand.primaryHover",
            },
            "&:disabled": {
              backgroundColor: "text.disabled",
              color: "background.main",
            },
          }}
        />

        {successMessage && (
          <Box
            sx={{
              backgroundColor: "#F0FDF4",
              border: "1px solid #D1FAE5",
              borderRadius: "4px",
              padding: 2.5,
            }}
          >
            <Typography sx={{ fontSize: "13px", color: "brand.primary", lineHeight: 1.6 }}>
              {successMessage}
            </Typography>
          </Box>
        )}

        {errorMessage && (
          <Box
            sx={{
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              borderRadius: "4px",
              padding: 2.5,
            }}
          >
            <Typography sx={{ fontSize: "13px", color: "#DC2626", lineHeight: 1.6 }}>
              {errorMessage}
            </Typography>
          </Box>
        )}

        <Box
          sx={{
            backgroundColor: "#F0FDF4",
            border: "1px solid #D1FAE5",
            borderRadius: "4px",
            padding: 2.5,
          }}
        >
          <Typography sx={{ fontSize: "13px", color: "brand.primary", lineHeight: 1.6 }}>
            You can skip this step and invite team members later from the organization settings.
          </Typography>
        </Box>
      </Stack>
    </Stack>
  );
};

export default InviteTeamStep;
