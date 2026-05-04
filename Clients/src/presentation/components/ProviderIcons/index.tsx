/**
 * AI Provider Icons
 *
 * SVG icons for AI/ML providers used in the AI Detection feature.
 * Icons are imported as React components using SVGR.
 */

// AI Provider SVG icons
import { ReactComponent as Ai21Icon } from "../../assets/icons/ai-providers/ai21.svg";
import { ReactComponent as AnthropicIcon } from "../../assets/icons/ai-providers/anthropic.svg";
import { ReactComponent as AnyscaleIcon } from "../../assets/icons/ai-providers/anyscale.svg";
import { ReactComponent as AssemblyAIIcon } from "../../assets/icons/ai-providers/assemblyai.svg";
import { ReactComponent as AwsIcon } from "../../assets/icons/ai-providers/aws.svg";
import { ReactComponent as BasetenIcon } from "../../assets/icons/ai-providers/baseten.svg";
import { ReactComponent as CerebrasIcon } from "../../assets/icons/ai-providers/cerebras.svg";
import { ReactComponent as CohereIcon } from "../../assets/icons/ai-providers/cohere.svg";
import { ReactComponent as CrewAIIcon } from "../../assets/icons/ai-providers/crewai.svg";
import { ReactComponent as DeepSeekIcon } from "../../assets/icons/ai-providers/deepseek.svg";
import { ReactComponent as ElevenLabsIcon } from "../../assets/icons/ai-providers/elevenlabs.svg";
import { ReactComponent as FireworksIcon } from "../../assets/icons/ai-providers/fireworks.svg";
import { ReactComponent as GoogleIcon } from "../../assets/icons/ai-providers/google.svg";
import { ReactComponent as GroqIcon } from "../../assets/icons/ai-providers/groq.svg";
import { ReactComponent as HuggingFaceIcon } from "../../assets/icons/ai-providers/huggingface.svg";
import { ReactComponent as JinaIcon } from "../../assets/icons/ai-providers/jina.svg";
import { ReactComponent as LangChainIcon } from "../../assets/icons/ai-providers/langchain.svg";
import { ReactComponent as LangfuseIcon } from "../../assets/icons/ai-providers/langfuse.svg";
import { ReactComponent as LangSmithIcon } from "../../assets/icons/ai-providers/langsmith.svg";
import { ReactComponent as LeptonAIIcon } from "../../assets/icons/ai-providers/leptonai.svg";
import { ReactComponent as LlamaIndexIcon } from "../../assets/icons/ai-providers/llamaindex.svg";
import { ReactComponent as MetaIcon } from "../../assets/icons/ai-providers/meta.svg";
import { ReactComponent as MicrosoftIcon } from "../../assets/icons/ai-providers/microsoft.svg";
import { ReactComponent as MistralIcon } from "../../assets/icons/ai-providers/mistral.svg";
import { ReactComponent as NvidiaIcon } from "../../assets/icons/ai-providers/nvidia.svg";
import { ReactComponent as OllamaIcon } from "../../assets/icons/ai-providers/ollama.svg";
import { ReactComponent as OpenAIIcon } from "../../assets/icons/ai-providers/openai.svg";
import { ReactComponent as OpenRouterIcon } from "../../assets/icons/ai-providers/openrouter.svg";
import { ReactComponent as PerplexityIcon } from "../../assets/icons/ai-providers/perplexity.svg";
import { ReactComponent as PhidataIcon } from "../../assets/icons/ai-providers/phidata.svg";
import { ReactComponent as PydanticAIIcon } from "../../assets/icons/ai-providers/pydanticai.svg";
import { ReactComponent as ReplicateIcon } from "../../assets/icons/ai-providers/replicate.svg";
import { ReactComponent as SambaNovaIcon } from "../../assets/icons/ai-providers/sambanova.svg";
import { ReactComponent as StabilityIcon } from "../../assets/icons/ai-providers/stability.svg";
import { ReactComponent as TogetherIcon } from "../../assets/icons/ai-providers/together.svg";
import { ReactComponent as VercelIcon } from "../../assets/icons/ai-providers/vercel.svg";
import { ReactComponent as VllmIcon } from "../../assets/icons/ai-providers/vllm.svg";
import { ReactComponent as VoyageIcon } from "../../assets/icons/ai-providers/voyage.svg";

// Export individual icons
export const Ai21 = Ai21Icon;
export const Anthropic = AnthropicIcon;
export const Anyscale = AnyscaleIcon;
export const AssemblyAI = AssemblyAIIcon;
export const Aws = AwsIcon;
export const Baseten = BasetenIcon;
export const Cerebras = CerebrasIcon;
export const Cohere = CohereIcon;
export const CrewAI = CrewAIIcon;
export const DeepSeek = DeepSeekIcon;
export const ElevenLabs = ElevenLabsIcon;
export const Fireworks = FireworksIcon;
export const Google = GoogleIcon;
export const Groq = GroqIcon;
export const HuggingFace = HuggingFaceIcon;
export const Jina = JinaIcon;
export const LangChain = LangChainIcon;
export const Langfuse = LangfuseIcon;
export const LangSmith = LangSmithIcon;
export const LeptonAI = LeptonAIIcon;
export const LlamaIndex = LlamaIndexIcon;
export const Meta = MetaIcon;
export const Microsoft = MicrosoftIcon;
export const Mistral = MistralIcon;
export const Nvidia = NvidiaIcon;
export const Ollama = OllamaIcon;
export const OpenAI = OpenAIIcon;
export const OpenRouter = OpenRouterIcon;
export const Perplexity = PerplexityIcon;
export const Phidata = PhidataIcon;
export const PydanticAI = PydanticAIIcon;
export const Replicate = ReplicateIcon;
export const SambaNova = SambaNovaIcon;
export const Stability = StabilityIcon;
export const Together = TogetherIcon;
export const Vercel = VercelIcon;
export const Vllm = VllmIcon;
export const Voyage = VoyageIcon;

// Provider icon mapping for easy lookup
export const PROVIDER_ICONS: Record<string, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  Ai21: Ai21Icon,
  Anthropic: AnthropicIcon,
  Anyscale: AnyscaleIcon,
  AssemblyAI: AssemblyAIIcon,
  Aws: AwsIcon,
  Baseten: BasetenIcon,
  Cerebras: CerebrasIcon,
  Cohere: CohereIcon,
  CrewAI: CrewAIIcon,
  DeepSeek: DeepSeekIcon,
  ElevenLabs: ElevenLabsIcon,
  Fireworks: FireworksIcon,
  Google: GoogleIcon,
  Groq: GroqIcon,
  HuggingFace: HuggingFaceIcon,
  Jina: JinaIcon,
  LangChain: LangChainIcon,
  Langfuse: LangfuseIcon,
  LangSmith: LangSmithIcon,
  LeptonAI: LeptonAIIcon,
  LlamaIndex: LlamaIndexIcon,
  Meta: MetaIcon,
  Microsoft: MicrosoftIcon,
  Mistral: MistralIcon,
  Nvidia: NvidiaIcon,
  Ollama: OllamaIcon,
  OpenAI: OpenAIIcon,
  OpenRouter: OpenRouterIcon,
  Perplexity: PerplexityIcon,
  Phidata: PhidataIcon,
  PydanticAI: PydanticAIIcon,
  Replicate: ReplicateIcon,
  SambaNova: SambaNovaIcon,
  Stability: StabilityIcon,
  Together: TogetherIcon,
  Vercel: VercelIcon,
  Vllm: VllmIcon,
  Voyage: VoyageIcon,
};

/**
 * Maps vendor names (as used in the tool registry / Shadow AI) to PROVIDER_ICONS keys.
 * Use this mapping anywhere you need to resolve a vendor string to an icon component.
 */
export const VENDOR_ICON_MAP: Record<string, string> = {
  // Direct matches (vendor name === icon key)
  OpenAI: "OpenAI",
  Anthropic: "Anthropic",
  Google: "Google",
  Microsoft: "Microsoft",
  DeepSeek: "DeepSeek",
  Cohere: "Cohere",
  Groq: "Groq",
  OpenRouter: "OpenRouter",
  Replicate: "Replicate",
  ElevenLabs: "ElevenLabs",
  Vercel: "Vercel",
  Meta: "Meta",
  Nvidia: "Nvidia",
  Ollama: "Ollama",
  Anyscale: "Anyscale",
  Baseten: "Baseten",
  Cerebras: "Cerebras",
  SambaNova: "SambaNova",
  // Vendor name differs from icon key
  "Mistral AI": "Mistral",
  "Perplexity AI": "Perplexity",
  "Together AI": "Together",
  "Fireworks AI": "Fireworks",
  "Hugging Face": "HuggingFace",
  "Stability AI": "Stability",
  "AI21 Labs": "Ai21",
  Amazon: "Aws",
  "GitHub/Microsoft": "Microsoft",
  xAI: "Groq",
  LeptonAI: "LeptonAI",
  Jina: "Jina",
  AssemblyAI: "AssemblyAI",
};
