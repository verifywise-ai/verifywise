import { useState, useEffect, useCallback, useRef } from "react";
import {
  Box,
  Typography,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  LinearProgress,
} from "@mui/material";
import { Plus, Trash2, Play, Save } from "lucide-react";
import { CustomizableButton } from "../../../components/button/customizable-button";
import Select from "../../../components/Inputs/Select";
import Field from "../../../components/Inputs/Field";
import palette from "../../../themes/palette";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import { resolveMessageVariables, streamPromptTest, StreamPromptTestResult } from "../shared";

interface Message { role: string; content: string }

interface TestCase {
  variables: Record<string, string>;
  expected_output?: string;
}

interface TestDataset {
  id: number;
  name: string;
  test_cases: TestCase[];
}

interface TestDatasetPanelProps {
  promptId: string;
  messages: Message[];
  detectedVars: string[];
  variableValues: Record<string, string>;
  endpoints: Array<{ slug: string; display_name: string }>;
  selectedEndpoint: string;
  config: Record<string, any>;
}

const CELL_SX = { fontSize: 12, py: "8px", borderColor: "border.light" } as const;
const HEAD_SX = { ...CELL_SX, fontWeight: 600, color: "text.secondary", fontSize: 11 } as const;
const MAX_CONCURRENT = 5;

export default function TestDatasetPanel({
  promptId,
  messages,
  detectedVars,
  variableValues,
  endpoints: _endpoints,
  selectedEndpoint,
  config,
}: TestDatasetPanelProps) {
  const [datasets, setDatasets] = useState<TestDataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<number | "new">("new");
  const [datasetName, setDatasetName] = useState("New dataset");
  const [testCases, setTestCases] = useState<TestCase[]>([{ variables: {}, expected_output: "" }]);
  const [results, setResults] = useState<(StreamPromptTestResult | null)[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => { abortRef.current?.abort(); };
  }, []);

  const loadDatasets = useCallback(async () => {
    try {
      const res = await apiServices.get<Record<string, any>>(`/ai-gateway/prompts/${promptId}/test-datasets`);
      setDatasets(res?.data?.test_datasets || res?.data?.data || []);
    } catch { /* silently handle */ }
  }, [promptId]);

  useEffect(() => { loadDatasets(); }, [loadDatasets]);

  const selectDataset = (id: string) => {
    if (id === "new") {
      setSelectedDatasetId("new");
      setDatasetName("New dataset");
      setTestCases([{ variables: {}, expected_output: "" }]);
      setResults([]);
      return;
    }
    const ds = datasets.find((d) => d.id === Number(id));
    if (ds) {
      setSelectedDatasetId(ds.id);
      setDatasetName(ds.name);
      setTestCases(ds.test_cases.length > 0 ? ds.test_cases : [{ variables: {}, expected_output: "" }]);
      setResults([]);
    }
  };

  const addRow = () => {
    setTestCases((prev) => [...prev, { variables: {}, expected_output: "" }]);
    setResults((prev) => [...prev, null]);
  };

  const removeRow = (idx: number) => {
    setTestCases((prev) => prev.filter((_, i) => i !== idx));
    setResults((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateVar = (rowIdx: number, varName: string, value: string) => {
    setTestCases((prev) =>
      prev.map((tc, i) =>
        i === rowIdx ? { ...tc, variables: { ...tc.variables, [varName]: value } } : tc
      )
    );
  };

  const updateExpected = (rowIdx: number, value: string) => {
    setTestCases((prev) =>
      prev.map((tc, i) => (i === rowIdx ? { ...tc, expected_output: value } : tc))
    );
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (selectedDatasetId === "new") {
        const res = await apiServices.post<Record<string, any>>(`/ai-gateway/prompts/${promptId}/test-datasets`, {
          name: datasetName,
          test_cases: testCases,
        });
        const created = res?.data?.test_dataset || res?.data?.data;
        if (created) {
          setSelectedDatasetId(created.id);
          setDatasets((prev) => [created, ...prev]);
        }
      } else {
        await apiServices.patch(`/ai-gateway/prompts/${promptId}/test-datasets/${selectedDatasetId}`, {
          name: datasetName,
          test_cases: testCases,
        });
        setDatasets((prev) => prev.map((d) => (d.id === selectedDatasetId ? { ...d, name: datasetName, test_cases: testCases } : d)));
      }
    } catch { /* silently handle */ }
    finally { setIsSaving(false); }
  };

  const runSingle = async (tc: TestCase, idx: number, signal: AbortSignal): Promise<void> => {
    const merged = { ...variableValues, ...tc.variables };
    const resolved = resolveMessageVariables(messages, merged);

    try {
      const result = await streamPromptTest({
        endpointSlug: selectedEndpoint,
        messages: resolved,
        variables: merged,
        config,
        onDelta: () => {}, // no per-chunk UI update needed for table rows
        signal,
      });

      setResults((prev) => {
        const next = [...prev];
        next[idx] = result;
        return next;
      });
    } catch (err: any) {
      if (err?.name === "AbortError") return;
      setResults((prev) => {
        const next = [...prev];
        next[idx] = { content: `Error: ${err.message}`, latency: 0, tokens: 0, cost: 0 };
        return next;
      });
    }
  };

  const handleRunAll = async () => {
    if (!selectedEndpoint) return;

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    const { signal } = abortRef.current;

    setIsRunning(true);
    setProgress(0);
    setResults(new Array(testCases.length).fill(null));

    let completed = 0;
    for (let i = 0; i < testCases.length; i += MAX_CONCURRENT) {
      const batch = testCases.slice(i, i + MAX_CONCURRENT);
      const promises = batch.map((tc, batchIdx) => {
        const globalIdx = i + batchIdx;
        return runSingle(tc, globalIdx, signal).then(() => {
          completed++;
          setProgress(Math.round((completed / testCases.length) * 100));
        });
      });
      await Promise.all(promises);
    }

    setIsRunning(false);
  };

  const deleteDataset = async () => {
    if (selectedDatasetId === "new") return;
    try {
      await apiServices.delete(`/ai-gateway/prompts/${promptId}/test-datasets/${selectedDatasetId}`);
      setDatasets((prev) => prev.filter((d) => d.id !== selectedDatasetId));
      setSelectedDatasetId("new");
      setDatasetName("New dataset");
      setTestCases([{ variables: {}, expected_output: "" }]);
      setResults([]);
    } catch { /* silently handle */ }
  };

  const datasetItems = [
    { _id: "new", name: "+ New dataset" },
    ...datasets.map((d) => ({ _id: String(d.id), name: d.name })),
  ];

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <Box sx={{ p: "16px", borderBottom: `1px solid ${palette.border.light}`, flexShrink: 0 }}>
        <Box sx={{ display: "flex", gap: "16px", mb: "8px", alignItems: "flex-end" }}>
          <Select
            id="dataset-select"
            label="Dataset"
            value={String(selectedDatasetId)}
            onChange={(e) => selectDataset(e.target.value as string)}
            items={datasetItems}
            sx={{ flex: 1 }}
          />
          <Field
            label="Name"
            value={datasetName}
            onChange={(e) => setDatasetName(e.target.value)}
            sx={{ flex: 1 }}
          />
        </Box>
        <Box sx={{ display: "flex", gap: "8px", mt: "8px", justifyContent: "flex-end" }}>
          <CustomizableButton
            text="Save dataset"
            icon={<Save size={13} strokeWidth={1.5} />}
            onClick={handleSave}
            isDisabled={isSaving}
            variant="outlined"
            sx={{ height: 30, fontSize: 12 }}
          />
          <CustomizableButton
            text="Run all"
            icon={<Play size={13} strokeWidth={1.5} />}
            onClick={handleRunAll}
            isDisabled={isRunning || !selectedEndpoint || testCases.length === 0}
            sx={{ height: 30, fontSize: 12 }}
          />
          {selectedDatasetId !== "new" && (
            <CustomizableButton
              text="Delete"
              icon={<Trash2 size={13} strokeWidth={1.5} />}
              onClick={deleteDataset}
              variant="text"
              sx={{ height: 30, fontSize: 12, color: "#B42318" }}
            />
          )}
        </Box>
        {isRunning && (
          <Box sx={{ mt: "8px" }}>
            <LinearProgress variant="determinate" value={progress} sx={{ height: 4, borderRadius: 2, bgcolor: "#E4E7EC", "& .MuiLinearProgress-bar": { bgcolor: "#13715B" } }} />
            <Typography fontSize={11} color="text.secondary" mt={0.5}>{progress}% complete</Typography>
          </Box>
        )}
      </Box>

      {/* Table */}
      <Box sx={{ flex: 1, overflow: "auto" }}>
        <TableContainer>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...HEAD_SX, width: 32 }}>#</TableCell>
                {detectedVars.map((v) => (
                  <TableCell key={v} sx={HEAD_SX}>{`{{${v}}}`}</TableCell>
                ))}
                <TableCell sx={HEAD_SX}>Expected</TableCell>
                <TableCell sx={HEAD_SX}>Output</TableCell>
                <TableCell sx={{ ...HEAD_SX, width: 70 }}>Latency</TableCell>
                <TableCell sx={{ ...HEAD_SX, width: 60 }}>Tokens</TableCell>
                <TableCell sx={{ ...HEAD_SX, width: 60 }}>Cost</TableCell>
                <TableCell sx={{ ...HEAD_SX, width: 32 }} />
              </TableRow>
            </TableHead>
            <TableBody>
              {testCases.map((tc, idx) => {
                const result = results[idx] || null;
                return (
                  <TableRow key={idx}>
                    <TableCell sx={CELL_SX}>{idx + 1}</TableCell>
                    {detectedVars.map((v) => (
                      <TableCell key={v} sx={CELL_SX}>
                        <Field
                          value={tc.variables[v] || ""}
                          onChange={(e) => updateVar(idx, v, e.target.value)}
                          placeholder={v}
                          sx={{ "& input": { py: "4px", px: "8px", fontSize: 12 } }}
                        />
                      </TableCell>
                    ))}
                    <TableCell sx={CELL_SX}>
                      <Field
                        value={tc.expected_output || ""}
                        onChange={(e) => updateExpected(idx, e.target.value)}
                        placeholder="Optional"
                        sx={{ "& input": { py: "4px", px: "8px", fontSize: 12 } }}
                      />
                    </TableCell>
                    <TableCell sx={{ ...CELL_SX, maxWidth: 200 }}>
                      <Typography fontSize={11} noWrap title={result?.content}>
                        {result?.content || (isRunning && !result ? "..." : "-")}
                      </Typography>
                    </TableCell>
                    <TableCell sx={CELL_SX}>
                      <Typography fontSize={11}>{result?.latency ? `${result.latency}ms` : "-"}</Typography>
                    </TableCell>
                    <TableCell sx={CELL_SX}>
                      <Typography fontSize={11}>{result?.tokens ? result.tokens : "-"}</Typography>
                    </TableCell>
                    <TableCell sx={CELL_SX}>
                      <Typography fontSize={11}>{result?.cost ? `$${result.cost.toFixed(4)}` : "-"}</Typography>
                    </TableCell>
                    <TableCell sx={CELL_SX}>
                      {testCases.length > 1 && (
                        <IconButton size="small" onClick={() => removeRow(idx)}>
                          <Trash2 size={12} strokeWidth={1.5} />
                        </IconButton>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>

        <Box
          onClick={addRow}
          sx={{ px: "16px", py: "8px", display: "flex", alignItems: "center", gap: "4px", cursor: "pointer", color: "primary.main", "&:hover": { textDecoration: "underline" } }}
        >
          <Plus size={13} strokeWidth={1.5} />
          <Typography fontSize={12} fontWeight={500}>Add test case</Typography>
        </Box>
      </Box>
    </Box>
  );
}
