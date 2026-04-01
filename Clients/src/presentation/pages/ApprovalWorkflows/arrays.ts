import type { StandardColumn } from "../../../domain/types/standardTable";

export const entities = [
    { _id: 1, name: "Use case" },
    { _id: 2, name: "File / Evidence" },
];

export const TABLE_COLUMNS: StandardColumn[] = [
    { id: "workflow_title", label: "TITLE", sortable: true },
    { id: "entity_name", label: "ENTITY", sortable: true },
    { id: "steps", label: "STEPS COUNT", sortable: true },
    { id: "date_updated", label: "DATE UPDATED", sortable: true },
    { id: "actions", label: "ACTIONS", sortable: false },
];