import { useState, useEffect, useRef } from "react";
import { Box, Typography, Stack, IconButton, Slider } from "@mui/material";
import { Link } from "react-router-dom";
import { Settings, Router, MessageSquare, Zap, Coins, TriangleAlert, KeyRound } from "lucide-react";
import { AssistantRuntimeProvider } from "@assistant-ui/react";
import { ThreadPrimitive } from "@assistant-ui/react";
import Select from "../../../components/Inputs/Select";
import Field from "../../../components/Inputs/Field";
import StandardModal from "../../../components/Modals/StandardModal";
import { PageHeaderExtended } from "../../../components/Layout/PageHeaderExtended";
import { EmptyState } from "../../../components/EmptyState";
import EmptyStateTip from "../../../components/EmptyState/EmptyStateTip";
import { apiServices } from "../../../../infrastructure/api/networkServices";
import palette from "../../../themes/palette";
import { usePlaygroundRuntime } from "./usePlaygroundRuntime";
import { PlaygroundMessage } from "./PlaygroundMessage";
import { PlaygroundComposer } from "./PlaygroundComposer";

export default function PlaygroundPage() {
  const [endpoints, setEndpoints] = useState<any[]>([]);
  const [selectedEndpoint, setSelectedEndpoint] = useState(() =>
    localStorage.getItem("vw_playground_endpoint") || ""
  );
  const [temperature, setTemperature] = useState(() => {
    const saved = localStorage.getItem("vw_playground_temperature");
    return saved ? Number(saved) : 0.7;
  });
  const [maxTokens, setMaxTokens] = useState(() => {
    const saved = localStorage.getItem("vw_playground_max_tokens");
    return saved ? Number(saved) : 4096;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [tempTemperature, setTempTemperature] = useState(0.7);
  const [tempMaxTokens, setTempMaxTokens] = useState(4096);

  const configRef = useRef({ endpointSlug: "", temperature: 0.7, maxTokens: 4096 });

  // Keep configRef in sync
  configRef.current = {
    endpointSlug: selectedEndpoint,
    temperature,
    maxTokens,
  };

  const runtime = usePlaygroundRuntime(configRef);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiServices.get<Record<string, any>>("/ai-gateway/endpoints");
        const eps = (res?.data?.endpoints || res?.data?.data || []).filter((e: any) => e.is_active);
        setEndpoints(eps);
        if (eps.length > 0) {
          setSelectedEndpoint((prev) => prev || eps[0].slug);
        }
      } catch {
        // Silently handle
      }
    };
    load();
  }, []);

  const endpointItems = endpoints.map((ep) => ({
    _id: ep.slug,
    name: ep.display_name,
  }));

  return (
    <PageHeaderExtended
      title="Playground"
      description="Test your configured endpoints with an interactive chat interface."
      tipBoxEntity="ai-gateway-playground"
      helpArticlePath="ai-gateway/playground"
    >
      <Box sx={{ display: "flex", flexDirection: "column", minHeight: "calc(100vh - 280px)" }}>
        {/* Controls */}
        <Stack direction="row" gap="8px" mb="8px" alignItems="center">
          <Box sx={{ minWidth: 320, maxWidth: 420 }}>
            <Select
              id="endpoint"
              placeholder="Select endpoint"
              value={selectedEndpoint}
              items={endpointItems}
              onChange={(e) => {
                const val = e.target.value as string;
                setSelectedEndpoint(val);
                localStorage.setItem("vw_playground_endpoint", val);
              }}
              getOptionValue={(item) => item._id}
            />
          </Box>
          <Box sx={{ flex: 1 }} />
          <IconButton
            onClick={() => {
              setTempTemperature(temperature);
              setTempMaxTokens(maxTokens);
              setShowSettings(true);
            }}
            sx={{
              p: 1,
              backgroundColor: showSettings ? palette.background.fill : "transparent",
              borderRadius: "4px",
              "&:hover": { backgroundColor: palette.background.fill },
            }}
          >
            <Settings size={16} strokeWidth={1.5} color={showSettings ? palette.brand.primary : palette.text.tertiary} />
          </IconButton>
        </Stack>

        {/* Settings Modal */}
        <StandardModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          title="Playground settings"
          description="Configure parameters for your requests"
          onSubmit={() => {
            setTemperature(tempTemperature);
            setMaxTokens(tempMaxTokens);
            localStorage.setItem("vw_playground_temperature", String(tempTemperature));
            localStorage.setItem("vw_playground_max_tokens", String(tempMaxTokens));
            setShowSettings(false);
          }}
          submitButtonText="Save"
          fitContent
          maxWidth="400px"
        >
          <Stack gap="16px">
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 500, mb: 0.5 }}>
                Temperature: {tempTemperature}
              </Typography>
              <Slider
                value={tempTemperature}
                onChange={(_, v) => setTempTemperature(v as number)}
                min={0}
                max={2}
                step={0.1}
                size="small"
                sx={{ color: palette.brand.primary }}
              />
              <Typography sx={{ fontSize: 11, color: palette.text.tertiary }}>
                Lower values are more focused, higher values are more creative
              </Typography>
            </Box>
            <Field
              label="Max tokens"
              placeholder="4096"
              value={String(tempMaxTokens)}
              onChange={(e) => setTempMaxTokens(Number(e.target.value) || 4096)}
            />
          </Stack>
        </StandardModal>

        {/* Chat Area */}
        <Box
          sx={{
            flex: 1,
            minHeight: 400,
            border: `1.5px solid ${palette.border.light}`,
            borderRadius: "4px",
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            backgroundColor: palette.background.alt,
          }}
        >
          {!selectedEndpoint ? (
            <EmptyState
              icon={endpoints.length === 0 ? Router : MessageSquare}
              message={endpoints.length === 0
                ? "No endpoints available. Configure an endpoint before using the playground."
                : "Select an endpoint to start chatting"}
            >
              {endpoints.length === 0 && (
                <Box sx={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  p: "12px 16px",
                  borderRadius: "4px",
                  border: "1px solid #FEDF89",
                  bgcolor: "#FFFAEB",
                  mb: "8px",
                }}>
                  <TriangleAlert size={16} strokeWidth={1.5} color="#B54708" style={{ flexShrink: 0, marginTop: 1 }} />
                  <Box>
                    <Typography fontSize={13} fontWeight={500} color="#B54708">
                      Setup required
                    </Typography>
                    <Typography fontSize={12} color="#93370D" mt="2px">
                      The playground needs at least one active endpoint.{" "}
                      <Link to="/ai-gateway/settings" style={{ color: "#B54708", fontWeight: 500 }}>Add an API key</Link> in Settings, then{" "}
                      <Link to="/ai-gateway/endpoints" style={{ color: "#B54708", fontWeight: 500 }}>create an endpoint</Link> to get started.
                    </Typography>
                  </Box>
                </Box>
              )}
              <EmptyStateTip
                icon={endpoints.length === 0 ? KeyRound : Zap}
                title={endpoints.length === 0 ? "Step 1: Add an API key" : "Test endpoints before production"}
                description={endpoints.length === 0
                  ? "Go to Settings and add your provider API key (OpenAI, Anthropic, etc.)."
                  : "Send test messages to any configured endpoint and verify model behavior, system prompts, and response quality before routing production traffic."}
              />
              <EmptyStateTip
                icon={endpoints.length === 0 ? Router : Coins}
                title={endpoints.length === 0 ? "Step 2: Create an endpoint" : "Estimate cost per message"}
                description={endpoints.length === 0
                  ? "Go to Endpoints and create one that pairs a model with your API key."
                  : "Every playground message shows its cost and token usage. Multiply by your expected daily volume to forecast monthly spend before going live."}
              />
            </EmptyState>
          ) : (
            <AssistantRuntimeProvider runtime={runtime}>
              <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <ThreadPrimitive.Root
                  style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}
                >
                  <ThreadPrimitive.Viewport
                    style={{
                      flex: 1,
                      overflowY: "auto",
                      padding: "16px",
                    }}
                  >
                    <ThreadPrimitive.Messages
                      components={{ UserMessage: PlaygroundMessage, AssistantMessage: PlaygroundMessage }}
                    />
                  </ThreadPrimitive.Viewport>
                  <PlaygroundComposer disabled={!selectedEndpoint} />
                </ThreadPrimitive.Root>
              </Box>
            </AssistantRuntimeProvider>
          )}
        </Box>
      </Box>
    </PageHeaderExtended>
  );
}
