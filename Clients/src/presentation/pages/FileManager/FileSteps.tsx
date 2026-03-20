import { FileText, Upload } from "lucide-react";
import { IPageTourStep } from "../../types/interfaces/i.tour";
import { background } from "../../themes/palette";

const FileSteps: IPageTourStep[] = [
  {
    target: '[data-joyride-id="upload-file-button"]',
    content: {
      header: "Upload new files",
      body: "Upload policy documents, compliance certificates, assessment reports, and other AI governance documentation to keep everything organized.",
      icon: <Upload size={20} color={background.main} />,
    },
    placement: "bottom-end",
  },
  {
    target: '[data-joyride-id="file-manager-content"]',
    content: {
      header: "Manage your documents",
      body: "All uploaded files are catalogued here. Filter by project, uploader, or date to quickly find what you need.",
      icon: <FileText size={20} color={background.main} />,
    },
    placement: "bottom",
  },
];

export default FileSteps;
