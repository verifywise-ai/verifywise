export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
};

export const checkImage = (url: string) => {
  const image = new Image();
  image.src = url;
  return image.naturalWidth !== 0;
};

export const uploadFile = (
  file: File,
  allowedFileTypes: string[],
  maxFileSize: number,
): { error?: string; file?: File } => {
  try {
    if (!allowedFileTypes.includes(file.type)) {
      return { error: "Invalid file type. Please upload a supported file format." };
    }

    if (file.size > maxFileSize) {
      return {
        error: `File is too large. Maximum size allowed is ${maxFileSize / (1024 * 1024)}MB.`,
      };
    }

    return { file };
  } catch (error) {
    console.error("Error uploading file:", error);
    return { error: "An error occurred while uploading the file. Please try again." };
  }
};
