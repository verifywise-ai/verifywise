import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FileIcon, getFileIconSrc } from "../index";

// Mock all SVG imports as simple strings
vi.mock("../../../assets/icons/file-types/pdf.svg", () => ({
  default: "pdf-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/doc.svg", () => ({
  default: "doc-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/docx.svg", () => ({
  default: "docx-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/xls.svg", () => ({
  default: "xls-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/xlsx.svg", () => ({
  default: "xlsx-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/ppt.svg", () => ({
  default: "ppt-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/pptx.svg", () => ({
  default: "pptx-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/txt.svg", () => ({
  default: "txt-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/csv.svg", () => ({
  default: "csv-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/zip.svg", () => ({
  default: "zip-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/rar.svg", () => ({
  default: "rar-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/jpg.svg", () => ({
  default: "jpg-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/jpeg.svg", () => ({
  default: "jpeg-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/png.svg", () => ({
  default: "png-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/gif.svg", () => ({
  default: "gif-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/json.svg", () => ({
  default: "json-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/xml.svg", () => ({
  default: "xml-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/md.svg", () => ({
  default: "md-icon.svg",
}));
vi.mock("../../../assets/icons/file-types/default.svg", () => ({
  default: "default-icon.svg",
}));

describe("FileIcon", () => {
  it("renders an img element with the correct alt text for a pdf file", () => {
    renderWithProviders(<FileIcon fileName="report.pdf" />);
    const img = screen.getByAltText("pdf icon");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "pdf-icon.svg");
  });

  it("renders an img element with the correct alt text for a doc file", () => {
    renderWithProviders(<FileIcon fileName="document.doc" />);
    const img = screen.getByAltText("doc icon");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "doc-icon.svg");
  });

  it("renders default icon for unknown file extensions", () => {
    renderWithProviders(<FileIcon fileName="readme.xyz" />);
    const img = screen.getByAltText("xyz icon");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "default-icon.svg");
  });

  it("renders default icon when fileName has no extension", () => {
    renderWithProviders(<FileIcon fileName="Makefile" />);
    const img = screen.getByAltText("file icon");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "default-icon.svg");
  });

  it("applies custom size", () => {
    renderWithProviders(<FileIcon fileName="image.png" size={48} />);
    const img = screen.getByAltText("png icon");
    expect(img).toBeInTheDocument();
  });

  describe("getFileIconSrc", () => {
    it("returns correct icon src for known extensions", () => {
      expect(getFileIconSrc("file.pdf")).toBe("pdf-icon.svg");
      expect(getFileIconSrc("file.csv")).toBe("csv-icon.svg");
      expect(getFileIconSrc("file.json")).toBe("json-icon.svg");
    });

    it("returns default icon for unknown extensions", () => {
      expect(getFileIconSrc("file.unknown")).toBe("default-icon.svg");
    });

    it("handles empty filename", () => {
      expect(getFileIconSrc("")).toBe("default-icon.svg");
    });
  });
});
