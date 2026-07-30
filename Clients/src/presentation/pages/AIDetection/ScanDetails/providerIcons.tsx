/**
 * @fileoverview Provider icon mapping for AI/ML libraries, APIs, and frameworks.
 *
 * @module pages/AIDetection/ScanDetails/providerIcons
 */

import { Package } from "lucide-react";
// AI provider icons - lightweight local components (no external dependencies)
import { PROVIDER_ICONS } from "../../../components/ProviderIcons";
// ML framework logos - for providers without lobehub icons
import scikitLearnLogo from "../../../assets/ml-logos/scikit.png";
import numpyLogo from "../../../assets/ml-logos/numpy.svg";
import pandasLogo from "../../../assets/ml-logos/pandas.png";
import matplotlibLogo from "../../../assets/ml-logos/matplotlib.png";
import mxnetLogo from "../../../assets/ml-logos/mxnet.svg";
import scipyLogo from "../../../assets/ml-logos/scipy.svg";
import daskLogo from "../../../assets/ml-logos/dask.svg";
import qdrantLogo from "../../../assets/ml-logos/qdrant.svg";
import chromaLogo from "../../../assets/ml-logos/chroma.png";
import pineconeLogo from "../../../assets/ml-logos/pinecone.png";
import weaviateLogo from "../../../assets/ml-logos/weaviate.png";
import { palette } from "../../../themes/palette";

// ============================================================================
// Provider Icon Mapping
// ============================================================================

// Icon components from local SVG files (SVGR)
const PROVIDER_ICON_COMPONENTS: Record<
  string,
  React.ComponentType<React.SVGProps<SVGSVGElement>>
> = {
  // Cloud AI Providers
  "AI21 Labs": PROVIDER_ICONS.Ai21,
  "Anthropic": PROVIDER_ICONS.Anthropic,
  "Anyscale": PROVIDER_ICONS.Anyscale,
  "AssemblyAI": PROVIDER_ICONS.AssemblyAI,
  "AWS": PROVIDER_ICONS.Aws,
  "Baseten": PROVIDER_ICONS.Baseten,
  "Cerebras": PROVIDER_ICONS.Cerebras,
  "Cohere": PROVIDER_ICONS.Cohere,
  "DeepSeek": PROVIDER_ICONS.DeepSeek,
  "ElevenLabs": PROVIDER_ICONS.ElevenLabs,
  "Fireworks AI": PROVIDER_ICONS.Fireworks,
  "Google": PROVIDER_ICONS.Google,
  "Groq": PROVIDER_ICONS.Groq,
  "HuggingFace": PROVIDER_ICONS.HuggingFace,
  "Jina AI": PROVIDER_ICONS.Jina,
  "LangFuse": PROVIDER_ICONS.Langfuse,
  "LangSmith": PROVIDER_ICONS.LangSmith,
  "Lepton AI": PROVIDER_ICONS.LeptonAI,
  "Meta": PROVIDER_ICONS.Meta,
  "Microsoft": PROVIDER_ICONS.Microsoft,
  "Mistral": PROVIDER_ICONS.Mistral,
  "Nvidia": PROVIDER_ICONS.Nvidia,
  "Ollama": PROVIDER_ICONS.Ollama,
  "OpenAI": PROVIDER_ICONS.OpenAI,
  "OpenRouter": PROVIDER_ICONS.OpenRouter,
  "Perplexity": PROVIDER_ICONS.Perplexity,
  "Replicate": PROVIDER_ICONS.Replicate,
  "SambaNova": PROVIDER_ICONS.SambaNova,
  "Stability AI": PROVIDER_ICONS.Stability,
  "Together AI": PROVIDER_ICONS.Together,
  "Vercel": PROVIDER_ICONS.Vercel,
  "Voyage AI": PROVIDER_ICONS.Voyage,
  // AI/ML Frameworks
  "CrewAI": PROVIDER_ICONS.CrewAI,
  "LangChain": PROVIDER_ICONS.LangChain,
  "LlamaIndex": PROVIDER_ICONS.LlamaIndex,
  "Phidata": PROVIDER_ICONS.Phidata,
  "Pydantic AI": PROVIDER_ICONS.PydanticAI,
  // Local ML
  "vLLM": PROVIDER_ICONS.Vllm,
};

// SVG/PNG logo mappings for providers without lobehub icons
const PROVIDER_SVG_LOGOS: Record<string, string> = {
  // Local ML libraries
  "scikit-learn": scikitLearnLogo,
  "NumPy": numpyLogo,
  "Pandas": pandasLogo,
  "Matplotlib": matplotlibLogo,
  "MXNet": mxnetLogo,
  "SciPy": scipyLogo,
  "Dask": daskLogo,
  // Vector databases
  "Chroma": chromaLogo,
  "Pinecone": pineconeLogo,
  "Qdrant": qdrantLogo,
  "Weaviate": weaviateLogo,
};

export function getProviderIcon(provider?: string, size: number = 16): React.ReactNode {
  if (!provider) return <Package size={size} color={palette.text.tertiary} strokeWidth={1.5} />;

  // Check for SVGR icon component first
  const IconComponent = PROVIDER_ICON_COMPONENTS[provider];
  if (IconComponent) return <IconComponent width={size} height={size} />;

  // Check for SVG/PNG logo
  const svgLogo = PROVIDER_SVG_LOGOS[provider];
  if (svgLogo) {
    return (
      <img
        src={svgLogo}
        alt={provider}
        width={size}
        height={size}
        style={{ objectFit: "contain" }}
      />
    );
  }

  return <Package size={size} color={palette.text.tertiary} strokeWidth={1.5} />;
}
