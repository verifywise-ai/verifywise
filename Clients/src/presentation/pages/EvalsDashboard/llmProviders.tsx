/**
 * LLM providers an organization can save an API key for in LLM Evals (dashboard key
 * dialog and organization settings).
 */

import { ReactComponent as OpenAILogo } from "../../assets/icons/openai_logo.svg";
import { ReactComponent as AnthropicLogo } from "../../assets/icons/anthropic_logo.svg";
import { ReactComponent as GeminiLogo } from "../../assets/icons/gemini_logo.svg";
import { ReactComponent as MistralLogo } from "../../assets/icons/mistral_logo.svg";
import { ReactComponent as XAILogo } from "../../assets/icons/xai_logo.svg";
import { ReactComponent as OpenRouterLogo } from "../../assets/icons/openrouter_logo.svg";

// Large SVGs loaded from public/ to avoid bundling
const HuggingFaceLogo = (props: React.SVGProps<SVGSVGElement>) => (
  <img
    src="/assets/icons/huggingface_logo.svg"
    alt="Hugging Face"
    width={props.width || 24}
    height={props.height || 24}
    style={{ display: "inline-block" }}
  />
);
const BuildIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <img
    src="/assets/icons/build.svg"
    alt="Build"
    width={props.width || 24}
    height={props.height || 24}
    style={{ display: "inline-block" }}
  />
);

export interface LlmProviderOption {
  _id: string;
  name: string;
  Logo: React.FC<React.SVGProps<SVGSVGElement>>;
}

export const LLM_PROVIDERS: LlmProviderOption[] = [
  { _id: "openrouter", name: "OpenRouter", Logo: OpenRouterLogo },
  { _id: "openai", name: "OpenAI", Logo: OpenAILogo },
  { _id: "anthropic", name: "Anthropic", Logo: AnthropicLogo },
  { _id: "google", name: "Gemini", Logo: GeminiLogo },
  { _id: "xai", name: "xAI", Logo: XAILogo },
  { _id: "mistral", name: "Mistral", Logo: MistralLogo },
  { _id: "huggingface", name: "Hugging Face", Logo: HuggingFaceLogo },
  { _id: "custom", name: "Custom", Logo: BuildIcon },
];
