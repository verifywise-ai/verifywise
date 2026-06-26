export interface FileEntityLinkProjection {
  framework_type: string;
  entity_type: string;
  entity_id: number;
  project_id: number | null;
  link_type: string | null;
  group_label: string | null;
  parent_id: number | null;
  sub_id: number | null;
  meta_id: number | null;
  is_evidence: boolean;
  // Only present for evidence_hub/evidence links.
  mapped_model_ids?: number[];
  mapped_training_ids?: number[];
}

export class FileModel {
  id!: string;
  fileName!: string;
  type?: string;
  uploadDate!: Date;
  uploader!: string;
  uploaderName?: string;
  size?: number;
  data?: Blob;
  source?: string;
  projectId?: string;
  projectTitle?: string;
  parentId?: number;
  subId?: number;
  metaId?: number;
  isEvidence?: boolean;
  is_demo?: boolean;
  version?: string;
  reviewStatus?: string;
  fileGroupId?: string;
  tags?: string[];
  entityLinks?: FileEntityLinkProjection[];
  linkGroups?: string[];

  constructor(data: FileModel) {
    this.id = data.id;
    this.fileName = data.fileName;
    this.type = data.type;
    this.uploadDate = data.uploadDate;
    this.uploader = data.uploader;
    this.uploaderName = data.uploaderName;
    this.size = data.size;
    this.data = data.data;
    this.source = data.source;
    this.projectId = data.projectId;
    this.projectTitle = data.projectTitle;
    this.parentId = data.parentId;
    this.subId = data.subId;
    this.metaId = data.metaId;
    this.isEvidence = data.isEvidence;
    this.is_demo = data.is_demo;
    this.version = data.version;
    this.reviewStatus = data.reviewStatus;
    this.fileGroupId = data.fileGroupId;
    this.tags = data.tags;
    this.entityLinks = data.entityLinks;
    this.linkGroups = data.linkGroups;
  }

  static createNewFile(data: Partial<FileModel>): FileModel {
    return new FileModel({
      id: data.id || "",
      fileName: data.fileName || "",
      uploadDate: data.uploadDate || new Date(),
      uploader: data.uploader || "",
      ...data,
    } as FileModel);
  }

  static fromApiData(apiData: any): FileModel {
    return new FileModel({
      id: apiData.id,
      fileName: apiData.fileName,
      type: apiData.type,
      uploadDate:
        typeof apiData.uploadDate === "string" ? new Date(apiData.uploadDate) : apiData.uploadDate,
      uploader: apiData.uploader,
      uploaderName: apiData.uploaderName,
      size: apiData.size,
      data: apiData.data,
      source: apiData.source,
      projectId: apiData.projectId,
      projectTitle: apiData.projectTitle,
      parentId: apiData.parentId,
      subId: apiData.subId,
      metaId: apiData.metaId,
      isEvidence: apiData.isEvidence,
      is_demo: apiData.is_demo,
      version: apiData.version,
      reviewStatus: apiData.reviewStatus,
      fileGroupId: apiData.fileGroupId,
      tags: apiData.tags,
      entityLinks: apiData.entityLinks,
      linkGroups: apiData.linkGroups,
    } as FileModel);
  }

  // Business methods for real-world file/evidence operations
  getFormattedUploadDate(): string {
    return this.uploadDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  }

  getFormattedSize(): string {
    if (!this.size) return "Unknown";

    const units = ["B", "KB", "MB", "GB"];
    let size = this.size;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  getFileExtension(): string {
    const parts = this.fileName.split(".");
    return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
  }

  isImageFile(): boolean {
    const imageExtensions = ["jpg", "jpeg", "png", "gif", "svg", "webp", "bmp"];
    return imageExtensions.includes(this.getFileExtension());
  }

  isDocumentFile(): boolean {
    const docExtensions = ["pdf", "doc", "docx", "txt", "rtf", "odt"];
    return docExtensions.includes(this.getFileExtension());
  }

  isSpreadsheetFile(): boolean {
    const spreadsheetExtensions = ["xls", "xlsx", "csv", "ods"];
    return spreadsheetExtensions.includes(this.getFileExtension());
  }

  isPresentationFile(): boolean {
    const presentationExtensions = ["ppt", "pptx", "odp"];
    return presentationExtensions.includes(this.getFileExtension());
  }

  belongsToProject(projectId: string): boolean {
    return this.projectId === projectId;
  }

  isUploadedBy(userId: string): boolean {
    return this.uploader === userId;
  }

  markAsEvidence(): FileModel {
    return new FileModel({
      ...this,
      isEvidence: true,
    } as FileModel);
  }

  unmarkAsEvidence(): FileModel {
    return new FileModel({
      ...this,
      isEvidence: false,
    } as FileModel);
  }

  assignToProject(projectId: string, projectTitle: string): FileModel {
    return new FileModel({
      ...this,
      projectId,
      projectTitle,
    } as FileModel);
  }

  updateSource(source: string): FileModel {
    return new FileModel({
      ...this,
      source,
    } as FileModel);
  }

  isValidForEvidence(): boolean {
    return !!(this.fileName && this.size && this.uploader && this.uploadDate);
  }

  getFileCategory(): string {
    if (this.isImageFile()) return "Image";
    if (this.isDocumentFile()) return "Document";
    if (this.isSpreadsheetFile()) return "Spreadsheet";
    if (this.isPresentationFile()) return "Presentation";
    return "Other";
  }

  getDaysOld(): number {
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - this.uploadDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }

  isRecentlyUploaded(daysThreshold: number = 7): boolean {
    return this.getDaysOld() <= daysThreshold;
  }
}
