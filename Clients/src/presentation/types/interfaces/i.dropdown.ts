export interface ProjectFilterDropdownProps {
  projects: { id: string; name: string }[];
  selectedProject: string | number | null;
  onChange: (projectId: string | number | null) => void;
  sx?: any;
}
