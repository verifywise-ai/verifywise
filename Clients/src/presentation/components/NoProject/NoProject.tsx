import { NoProjectBox } from "../../pages/Home/styles";
import { EmptyState } from "../EmptyState";
import { FolderOpen } from "lucide-react";

interface NoProjectProps {
  message: string;
}

/**
 * NoProject component displays a message and an image indicating an empty project state.
 *
 * @component
 * @param {NoProjectProps} props - The properties object.
 * @param {string} props.message - The message to display when there are no projects.
 *
 * @returns {JSX.Element} The rendered NoProject component.
 */

const NoProject = ({ message }: NoProjectProps) => {

  return (
    <NoProjectBox>
      <EmptyState icon={FolderOpen} message={message} />
    </NoProjectBox>
  );
};

export default NoProject;
