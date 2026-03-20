/**
 * Entity Details Section Component
 *
 * Renders entity-specific details based on the entity type configuration.
 * This component is designed to be extensible for future entity types.
 */

import React from "react";
import { Stack, Typography } from "@mui/material";
import DetailField from "./DetailField";
import {
    getEntityTypeConfig,
    isEntityDeleted,
    EntityTypeConfig,
} from "./entityTypeConfig";
import { background, status } from "../../../themes/palette";

interface EntityDetailsSectionProps {
    details: Record<string, any>;
}

const EntityDetailsSection: React.FC<EntityDetailsSectionProps> = ({ details }) => {
    const entityType = details?.entityType;
    const config: EntityTypeConfig = getEntityTypeConfig(entityType);

    // Container styles
    const containerStyles = {
        backgroundColor: `${background.accent}`,
        border: `1px solid ${status.default.border}`,
        borderRadius: "8px",
        padding: "16px",
    };

    // Deleted entity message styles
    const deletedMessageStyles = {
        backgroundColor: "#FDECEA",
        padding: "12px",
        borderRadius: "6px",
        border: "1px solid #F5C6CB",
    };

    // Check if entity has been deleted
    if (isEntityDeleted(details)) {
        return (
            <Stack spacing={8} sx={containerStyles}>
                <Typography fontWeight={600} fontSize={14} color="#374151" mb={2}>
                    {config.title}
                </Typography>
                <Typography fontSize={13} color="#C62828" fontStyle="italic" sx={deletedMessageStyles}>
                    {config.deletedMessage}
                </Typography>
            </Stack>
        );
    }

    // Render fields that have values
    const fieldsWithValues = config.fields.filter(field => details[field.key]);

    return (
        <Stack spacing={8} sx={containerStyles}>
            <Typography fontWeight={600} fontSize={14} color="#374151" mb={2}>
                {config.title}
            </Typography>
            {fieldsWithValues.length > 0 ? (
                fieldsWithValues.map(field => (
                    <DetailField
                        key={field.key}
                        icon={field.icon}
                        label={field.label}
                        value={field.format ? field.format(details[field.key]) : details[field.key]}
                        withWrap={field.key.toLowerCase().includes('description') || field.key.toLowerCase().includes('goal')}
                    />
                ))
            ) : (
                <Typography fontSize={13} color={status.default.text} fontStyle="italic">
                    {config.noDataMessage}
                </Typography>
            )}
        </Stack>
    );
};

export default EntityDetailsSection;
