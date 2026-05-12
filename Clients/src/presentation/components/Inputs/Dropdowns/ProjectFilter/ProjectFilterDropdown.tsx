import { Select, MenuItem, FormControl, useTheme } from "@mui/material";
import { dropdownStyles, inputStyles } from "./style";
import { ProjectFilterDropdownProps } from "../../../../types/interfaces/i.dropdown";
import { ChevronDown } from "lucide-react";

const GreyDownArrowIcon = () => <ChevronDown size={16} />;

function ProjectFilterDropdown({
  projects,
  selectedProject,
  onChange,
  sx,
}: ProjectFilterDropdownProps) {
  const theme = useTheme();
  return (
    <FormControl disabled={projects.length === 0}>
      <Select
        id="project-filter"
        value={selectedProject || ""}
        onChange={(e) => onChange(e.target.value)}
        displayEmpty
        IconComponent={GreyDownArrowIcon}
        sx={{
          ...inputStyles,
          ...dropdownStyles,
          ...sx,
          "& svg path": {
            fill: theme.palette.other.icon,
          },
        }}
        MenuProps={{
          PaperProps: {
            sx: {
              "borderRadius": theme.shape.borderRadius,
              "boxShadow": theme.boxShadow,
              "mt": 1,
              "& .MuiMenuItem-root": {
                "fontSize": 13,
                "color": theme.palette.text.primary,
                "&:hover": {
                  backgroundColor: theme.palette.background.accent,
                },
                "&.Mui-selected": {
                  "backgroundColor": theme.palette.background.accent,
                  "&:hover": {
                    backgroundColor: theme.palette.background.accent,
                  },
                },
                "& .MuiTouchRipple-root": {
                  display: "none",
                },
              },
            },
          },
        }}
      >
        {projects.length > 0 ? (
          <MenuItem value="all">All</MenuItem>
        ) : (
          <MenuItem value="all">No project available</MenuItem>
        )}
        {projects.map((project) => (
          <MenuItem key={project.id} value={project.id}>
            {project.name}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

export default ProjectFilterDropdown;
