"""
Model Runner for DeepEval Evaluation

Generates responses from language models for evaluation prompts.
"""

import os
import time
from typing import TYPE_CHECKING, Optional, Dict, Any
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch

if TYPE_CHECKING:
    from deepeval_engine.gateway_litellm_client import GatewayCompletion, GatewayProviderError

# Cloud providers run only through the AI Gateway (LiteLLM); there is no direct SDK path
CLOUD_PROVIDERS = ("openai", "anthropic", "google", "xai", "mistral", "openrouter")

GATEWAY_RATE_LIMIT_RETRIES = 3
GATEWAY_MAX_RETRY_DELAY_SECONDS = 60
# Total wait per prompt: generate() is synchronous, so every second here holds the run
GATEWAY_RETRY_BUDGET_SECONDS = 90


def _is_passing_rate_limit(error: "GatewayProviderError") -> bool:
    """A rate limit that lifts within the run; the rule lives in the gateway client."""
    from deepeval_engine.gateway_litellm_client import rate_limit_recovers

    return error.error_type == "RateLimitError" and rate_limit_recovers(error.message)


def _rate_limit_delay(error: "GatewayProviderError", attempt: int) -> float:
    """Exponential backoff, or the provider's hinted wait when longer; never over a minute."""
    from deepeval_engine.gateway_litellm_client import retry_hint_seconds

    backoff = 2 * (2 ** attempt)
    hinted = retry_hint_seconds(error.message) or 0
    return min(max(backoff, hinted), GATEWAY_MAX_RETRY_DELAY_SECONDS)


class ModelRunner:
    """
    Runs inference on language models to generate responses for evaluation.
    
    Cloud providers run through the AI Gateway; HuggingFace, Ollama and custom
    OpenAI-compatible endpoints run directly.
    """
    
    def __init__(
        self,
        model_name: str = "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
        provider: str = "huggingface",
        device: Optional[str] = None,
        endpoint_url: Optional[str] = None,
        api_key: Optional[str] = None,
    ):
        """
        Initialize model runner.
        
        Args:
            model_name: Name of the model (HuggingFace model ID, OpenAI model name, etc.)
            provider: Provider type ("huggingface", "openai", "ollama")
            device: Device to run on ("cpu", "cuda", "mps"). Auto-detected if None.
            endpoint_url: Base URL of a custom_api (OpenAI-compatible) or Ollama endpoint
            api_key: Key for a custom_api endpoint, if it needs one
        """
        self.model_name = model_name
        self.provider = provider.lower()
        
        if device is None:
            if torch.cuda.is_available():
                self.device = "cuda"
            elif torch.backends.mps.is_available():
                self.device = "mps"
            else:
                self.device = "cpu"
        else:
            self.device = device
        
        self.model = None
        self.tokenizer = None
        self._gateway_mode = False
        self._gateway_api_key: Optional[str] = None
        # Usage and cost of the last generate() call, when the gateway reported them
        self.last_completion: Optional["GatewayCompletion"] = None
        # Sampling settings LiteLLM left out on any call (the run records them)
        self.dropped_params: set = set()

        from deepeval_engine.gateway_litellm_client import gateway_mode_enabled

        if self.provider in CLOUD_PROVIDERS or (self.provider == "huggingface" and gateway_mode_enabled()):
            # Cloud models only run through the AI Gateway's LiteLLM
            if not gateway_mode_enabled():
                raise RuntimeError(
                    f"Provider '{self.provider}' runs through the AI Gateway; set AI_GATEWAY_INTERNAL_KEY"
                )
            self._gateway_api_key = self._env_api_key_for_provider()
            if not self._gateway_api_key:
                raise ValueError(
                    f"No API key in environment for provider '{self.provider}' (AI Gateway mode)"
                )
            self._gateway_mode = True
            print(f"✓ Model runner via AI Gateway (LiteLLM): {model_name} ({self.provider})")
        elif self.provider == "local":
            # Loading a user-named model in the shared server process would download any
            # repo and unpickle its weights; local models run behind their own endpoint
            raise ValueError(
                "Local model files are not run inside EvalServer. Serve the model with "
                "Ollama, vLLM or another OpenAI-compatible server and add it as a custom API model."
            )
        elif self.provider == "huggingface":
            self._load_huggingface_model()
        elif self.provider == "custom_api":
            self._setup_custom_api(endpoint_url, api_key)
        elif self.provider == "ollama":
            self._setup_ollama(endpoint_url)
        else:
            raise ValueError(f"Unsupported provider: {provider}")

        print(f"✓ Model runner initialized: {model_name} on {self.device}")

    @staticmethod
    def _env_api_key_for_provider_static(provider: str) -> Optional[str]:
        env_map = {
            "openai": "OPENAI_API_KEY",
            "anthropic": "ANTHROPIC_API_KEY",
            "google": "GOOGLE_API_KEY",
            "gemini": "GOOGLE_API_KEY",
            "xai": "XAI_API_KEY",
            "mistral": "MISTRAL_API_KEY",
            "openrouter": "OPENROUTER_API_KEY",
            "huggingface": "HF_API_KEY",
        }
        var = env_map.get(provider.lower())
        return os.getenv(var, "") if var else None

    def _env_api_key_for_provider(self) -> Optional[str]:
        v = self._env_api_key_for_provider_static(self.provider)
        return v if v else None

    def _load_huggingface_model(self):
        """Load HuggingFace model."""
        print(f"Loading HuggingFace model: {self.model_name}...")
        
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        self.model = AutoModelForCausalLM.from_pretrained(
            self.model_name,
            torch_dtype=torch.float16 if self.device in ["cuda", "mps"] else torch.float32,
            device_map="auto" if self.device == "cuda" else None,
        )
        
        if self.device != "cuda":
            self.model = self.model.to(self.device)
        
        self.model.eval()
    
    def _setup_custom_api(self, endpoint_url: Optional[str], api_key: Optional[str]):
        """An OpenAI-compatible server the user runs or names (vLLM, LM Studio, a proxy)."""
        if not endpoint_url:
            raise ValueError("A custom API model needs an endpoint URL")
        from deepeval_engine.endpoint_client import openai_base_url, openai_compatible_client

        # User-entered: the outbound policy (private hosts allowed for on-prem; metadata,
        # wildcard and non-http refused), then the /v1 path self-hosted judges use too
        base_url = openai_base_url(endpoint_url, keep_entered_path=True)
        self.custom_client = openai_compatible_client(base_url, api_key)
        print(f"✓ Custom API configured: {endpoint_url}")

    def _setup_ollama(self, endpoint_url: Optional[str] = None):
        """Setup Ollama."""
        try:
            from deepeval_engine.endpoint_client import ollama_client

            self.ollama_client = ollama_client(endpoint_url)
            print(f"✓ Ollama configured")
        except ImportError:
            raise ImportError("ollama package not installed. Install with: pip install ollama")
    
    def generate(
        self,
        prompt: str,
        max_tokens: int = 500,
        temperature: float = 0.7,
        top_p: Optional[float] = None,
    ) -> str:
        """
        Generate a response to the given prompt.
        
        Args:
            prompt: Input prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            top_p: Nucleus sampling parameter
            
        Returns:
            Generated response text
        """
        self.last_completion = None
        if getattr(self, "_gateway_mode", False):
            return self._generate_gateway(prompt, max_tokens, temperature, top_p)
        if self.provider == "huggingface":
            return self._generate_huggingface(prompt, max_tokens, temperature, top_p)
        elif self.provider == "custom_api":
            return self._generate_custom_api(prompt, max_tokens, temperature, top_p)
        elif self.provider == "ollama":
            return self._generate_ollama(prompt, max_tokens, temperature, top_p)
        else:
            raise ValueError(f"Unsupported provider: {self.provider}")
    
    def _generate_huggingface(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: float,
    ) -> str:
        """Generate using HuggingFace model."""
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=max_tokens,
                temperature=temperature,
                top_p=top_p,
                do_sample=True,
                pad_token_id=self.tokenizer.eos_token_id,
            )
        
        # Decode only the generated tokens (skip the input)
        generated_tokens = outputs[0][inputs['input_ids'].shape[1]:]
        response = self.tokenizer.decode(generated_tokens, skip_special_tokens=True)
        
        return response.strip()
    
    def _generate_custom_api(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: Optional[float],
    ) -> str:
        """Generate with the run's own OpenAI-compatible endpoint (never the gateway)."""
        params: Dict[str, Any] = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        from deepeval_engine.gateway_litellm_client import top_p_to_send

        sent_top_p = top_p_to_send(top_p)
        if sent_top_p is not None:
            params["top_p"] = sent_top_p
        response = self.custom_client.chat.completions.create(**params)
        content = response.choices[0].message.content if response.choices else None
        if content is None:
            raise ValueError("The endpoint returned an empty response (None content).")
        return content.strip()

    def _generate_gateway(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: Optional[float],
    ) -> str:
        from deepeval_engine.gateway_litellm_client import (
            GatewayProviderError,
            gateway_completion_sync,
            to_litellm_model,
        )

        litellm_model = to_litellm_model(self.provider, self.model_name)
        messages = [{"role": "user", "content": prompt}]
        key = self._gateway_api_key or ""
        if not key:
            raise RuntimeError("Gateway mode without API key")

        # Only a passing rate limit is retried: quota and billing errors never recover.
        # The wait blocks like the call itself does: generate() is synchronous.
        waited = 0.0
        for attempt in range(GATEWAY_RATE_LIMIT_RETRIES + 1):
            try:
                completion = gateway_completion_sync(
                    litellm_model,
                    messages,
                    key,
                    max_tokens=max_tokens,
                    temperature=temperature,
                    top_p=top_p,
                )
                break
            except GatewayProviderError as e:
                if not _is_passing_rate_limit(e) or attempt == GATEWAY_RATE_LIMIT_RETRIES:
                    raise
                delay = _rate_limit_delay(e, attempt)
                if waited + delay > GATEWAY_RETRY_BUDGET_SECONDS:
                    raise
                waited += delay
                print(f"⏳ Rate limit hit. Retrying in {delay}s... (attempt {attempt + 1}/{GATEWAY_RATE_LIMIT_RETRIES})")
                time.sleep(delay)
        self.last_completion = completion
        new_drops = set(completion.dropped_params) - self.dropped_params
        if new_drops:
            # Once per runner (one run), not per prompt
            print(f"⚠️ {self.model_name} does not take {', '.join(sorted(new_drops))}; the provider default was used")
            self.dropped_params.update(new_drops)
        return completion.text

    def _generate_ollama(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: Optional[float],
    ) -> str:
        """Generate using Ollama."""
        options = {
            "num_predict": max_tokens,
            "temperature": temperature,
        }
        from deepeval_engine.gateway_litellm_client import top_p_to_send

        sent_top_p = top_p_to_send(top_p)
        if sent_top_p is not None:
            options["top_p"] = sent_top_p
        response = self.ollama_client.generate(model=self.model_name, prompt=prompt, options=options)
        
        return response['response'].strip()
    
    def generate_batch(
        self,
        prompts: list[str],
        max_tokens: int = 500,
        temperature: float = 0.7,
        top_p: Optional[float] = None,
    ) -> list[str]:
        """
        Generate responses for multiple prompts.
        
        Args:
            prompts: List of input prompts
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            top_p: Nucleus sampling parameter
            
        Returns:
            List of generated responses
        """
        responses = []
        for prompt in prompts:
            response = self.generate(prompt, max_tokens, temperature, top_p)
            responses.append(response)
        return responses


if __name__ == "__main__":
    # Test the model runner
    runner = ModelRunner()
    
    test_prompts = [
        "What is the capital of France?",
        "Explain what is recursion in programming.",
        "Write a haiku about technology.",
    ]
    
    print("\n=== Testing Model Runner ===\n")
    for i, prompt in enumerate(test_prompts, 1):
        print(f"{i}. Prompt: {prompt}")
        response = runner.generate(prompt, max_tokens=100)
        print(f"   Response: {response}\n")

