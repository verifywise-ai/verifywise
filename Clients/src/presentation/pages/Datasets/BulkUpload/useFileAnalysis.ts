import { useState, useCallback } from "react";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { detectPiiInHeaders, PiiDetectionResult } from "./piiDetection";

export interface FileAnalysis {
  file: File;
  fileName: string;
  fileSize: number;
  format: string;
  headers: string[];
  rowCount: number;
  previewRows: Record<string, unknown>[];
  pii: PiiDetectionResult;
  skipped: boolean;
  metadata: DatasetMetadata;
}

export interface DatasetMetadata {
  name: string;
  description: string;
  version: string;
  format: string;
  type: string;
  classification: string;
  contains_pii: boolean;
  pii_types: string;
  owner: string;
  source: string;
  status: string;
}

function getFileExtension(filename: string): string {
  return filename.substring(filename.lastIndexOf(".") + 1).toUpperCase();
}

function stripExtension(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function analyzeCsv(file: File): Promise<Omit<FileAnalysis, "skipped" | "metadata">> {
  return new Promise((resolve, reject) => {
    // Read full file to count rows, but only keep preview
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const headers = results.meta.fields || [];
        const pii = detectPiiInHeaders(headers);
        resolve({
          file,
          fileName: file.name,
          fileSize: file.size,
          format: "CSV",
          headers,
          rowCount: results.data.length,
          previewRows: (results.data as Record<string, unknown>[]).slice(0, 10),
          pii,
        });
      },
      error: (error) => {
        reject(new Error(`Failed to parse CSV: ${error.message}`));
      },
    });
  });
}

function analyzeXlsx(file: File): Promise<Omit<FileAnalysis, "skipped" | "metadata">> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: "array" });
        const firstSheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[firstSheetName];

        // Get headers from first row
        const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
        const headers = jsonData.length > 0 ? Object.keys(jsonData[0]) : [];
        const pii = detectPiiInHeaders(headers);

        resolve({
          file,
          fileName: file.name,
          fileSize: file.size,
          format: getFileExtension(file.name),
          headers,
          rowCount: jsonData.length,
          previewRows: jsonData.slice(0, 10),
          pii,
        });
      } catch (err) {
        reject(new Error(`Failed to parse XLSX: ${(err as Error).message}`));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

function buildDefaultMetadata(
  analysis: Omit<FileAnalysis, "skipped" | "metadata">,
  ownerName: string,
): DatasetMetadata {
  return {
    name: stripExtension(analysis.fileName),
    description: `Dataset from ${analysis.fileName}, ${analysis.rowCount} rows, ${analysis.headers.length} columns`,
    version: "1.0",
    format: analysis.format,
    type: "Training",
    classification: "Internal",
    contains_pii: analysis.pii.containsPii,
    pii_types: analysis.pii.piiColumns.join(", "),
    owner: ownerName,
    source: "Bulk Upload",
    status: "Draft",
  };
}

export function useFileAnalysis() {
  const [analyses, setAnalyses] = useState<FileAnalysis[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeFiles = useCallback(async (files: File[], ownerName: string) => {
    setAnalyzing(true);
    setError(null);

    try {
      const results: FileAnalysis[] = [];

      for (const file of files) {
        const ext = getFileExtension(file.name);
        let analysis: Omit<FileAnalysis, "skipped" | "metadata">;

        if (ext === "CSV") {
          analysis = await analyzeCsv(file);
        } else if (ext === "XLSX" || ext === "XLS") {
          analysis = await analyzeXlsx(file);
        } else {
          continue; // skip unsupported
        }

        const metadata = buildDefaultMetadata(analysis, ownerName);
        results.push({ ...analysis, skipped: false, metadata });
      }

      setAnalyses(results);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const updateMetadata = useCallback((index: number, updates: Partial<DatasetMetadata>) => {
    setAnalyses((prev) =>
      prev.map((a, i) => (i === index ? { ...a, metadata: { ...a.metadata, ...updates } } : a)),
    );
  }, []);

  const toggleSkip = useCallback((index: number) => {
    setAnalyses((prev) => prev.map((a, i) => (i === index ? { ...a, skipped: !a.skipped } : a)));
  }, []);

  const applyBatchDefaults = useCallback((defaults: Partial<DatasetMetadata>) => {
    setAnalyses((prev) =>
      prev.map((a) => ({
        ...a,
        metadata: { ...a.metadata, ...defaults },
      })),
    );
  }, []);

  const reset = useCallback(() => {
    setAnalyses([]);
    setError(null);
  }, []);

  return {
    analyses,
    analyzing,
    error,
    analyzeFiles,
    updateMetadata,
    toggleSkip,
    applyBatchDefaults,
    reset,
  };
}
