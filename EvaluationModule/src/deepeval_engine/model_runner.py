"""
Model Runner for DeepEval Evaluation

Generates responses from language models for evaluation prompts.
"""

import os
import time
from typing import Optional, Dict, Any
from transformers import AutoTokenizer, AutoModelForCausalLM
import torch


class ModelRunner:
    """
    Runs inference on language models to generate responses for evaluation.
    
    Supports HuggingFace models, OpenAI API, and Ollama.
    """
    
    def __init__(
        self,
        model_name: str = "TinyLlama/TinyLlama-1.1B-Chat-v1.0",
        provider: str = "huggingface",
        device: Optional[str] = None
    ):
        """
        Initialize model runner.
        
        Args:
            model_name: Name of the model (HuggingFace model ID, OpenAI model name, etc.)
            provider: Provider type ("huggingface", "openai", "ollama")
            device: Device to run on ("cpu", "cuda", "mps"). Auto-detected if None.
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

        from deepeval_engine.gateway_litellm_client import gateway_mode_enabled

        cloud_via_gateway = self.provider in (
            "openai",
            "anthropic",
            "google",
            "xai",
            "mistral",
            "openrouter",
            "huggingface",
        )
        if cloud_via_gateway and gateway_mode_enabled():
            self._gateway_api_key = self._env_api_key_for_provider()
            if not self._gateway_api_key:
                raise ValueError(
                    f"No API key in environment for provider '{self.provider}' (AI Gateway mode)"
                )
            self._gateway_mode = True
            print(f"✓ Model runner via AI Gateway (LiteLLM): {model_name} ({self.provider})")
        elif self.provider == "huggingface":
            self._load_huggingface_model()
        elif self.provider == "openai":
            self._setup_openai()
        elif self.provider == "anthropic":
            self._setup_anthropic()
        elif self.provider == "google":
            self._setup_google()
        elif self.provider == "xai":
            self._setup_xai()
        elif self.provider == "mistral":
            self._setup_mistral()
        elif self.provider == "ollama":
            self._setup_ollama()
        elif self.provider == "openrouter":
            self._setup_openrouter()
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

    def _retry_with_backoff(self, func, max_retries=3, base_delay=2):
        """
        Retry a function with exponential backoff on rate limit errors.

        Args:
            func: Function to execute (should take no arguments, use lambda if needed)
            max_retries: Maximum number of retries (default: 3)
            base_delay: Base delay in seconds for exponential backoff (default: 2)

        Returns:
            Result from the function

        Raises:
            Exception: Re-raises the last exception if all retries fail
        """
        for attempt in range(max_retries + 1):
            try:
                return func()
            except Exception as e:
                error_str = str(e)
                # Check if it's a rate limit error (Status 429 or rate limit message)
                is_rate_limit = "429" in error_str or "rate limit" in error_str.lower()

                if is_rate_limit and attempt < max_retries:
                    # Exponential backoff: 2s, 4s, 8s
                    delay = base_delay * (2 ** attempt)
                    print(f"⏳ Rate limit hit. Retrying in {delay}s... (attempt {attempt + 1}/{max_retries})")
                    time.sleep(delay)
                else:
                    # Not a rate limit error, or we've exhausted retries
                    raise

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
    
    def _setup_openai(self):
        """Setup OpenAI API."""
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("OPENAI_API_KEY environment variable not set")
        
        try:
            import openai
            self.openai_client = openai.OpenAI(api_key=api_key)
            print(f"✓ OpenAI API configured")
        except ImportError:
            raise ImportError("openai package not installed. Install with: pip install openai")
    
    def _setup_anthropic(self):
        """Setup Anthropic API."""
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("ANTHROPIC_API_KEY environment variable not set")
        
        try:
            import anthropic
            self.anthropic_client = anthropic.Anthropic(api_key=api_key)
            print(f"✓ Anthropic API configured")
        except ImportError:
            raise ImportError("anthropic package not installed. Install with: pip install anthropic")
    
    def _setup_google(self):
        """Setup Google API (for Gemini models)."""
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY environment variable not set")
        
        try:
            import google.generativeai as genai
            genai.configure(api_key=api_key)
            self.google_client = genai.GenerativeModel(self.model_name)
            print(f"✓ Google API configured")
        except ImportError:
            raise ImportError("google-generativeai package not installed. Install with: pip install google-generativeai")
    
    def _setup_xai(self):
        """Setup xAI API using official SDK."""
        api_key = os.getenv("XAI_API_KEY")
        if not api_key:
            raise ValueError("XAI_API_KEY environment variable not set")
        
        try:
            from xai_sdk import Client
            self.xai_client = Client(api_key=api_key)
            print(f"✓ xAI API configured")
        except ImportError:
            raise ImportError("xai-sdk package not installed. Install with: pip install xai-sdk")
    
    def _setup_mistral(self):
        """Setup Mistral API using official SDK."""
        api_key = os.getenv("MISTRAL_API_KEY")
        if not api_key:
            raise ValueError("MISTRAL_API_KEY environment variable not set")
        
        try:
            from mistralai import Mistral
            self.mistral_client = Mistral(api_key=api_key)
            print(f"✓ Mistral API configured")
        except ImportError:
            raise ImportError("mistralai package not installed. Install with: pip install mistralai")
    
    def _setup_ollama(self):
        """Setup Ollama."""
        try:
            import ollama
            self.ollama_client = ollama
            print(f"✓ Ollama configured")
        except ImportError:
            raise ImportError("ollama package not installed. Install with: pip install ollama")
    
    def _setup_openrouter(self):
        """Setup OpenRouter API (OpenAI-compatible)."""
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            raise ValueError("OPENROUTER_API_KEY environment variable not set")
        try:
            from openai import OpenAI
            self.openrouter_client = OpenAI(
                api_key=api_key,
                base_url="https://openrouter.ai/api/v1"
            )
            print(f"✓ OpenRouter API configured")
        except ImportError:
            raise ImportError("openai package not installed. Install with: pip install openai")
    
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
        if getattr(self, "_gateway_mode", False):
            return self._generate_gateway(prompt, max_tokens, temperature, top_p)
        if self.provider == "huggingface":
            return self._generate_huggingface(prompt, max_tokens, temperature, top_p)
        elif self.provider == "openai":
            return self._generate_openai(prompt, max_tokens, temperature, top_p)
        elif self.provider == "anthropic":
            return self._generate_anthropic(prompt, max_tokens, temperature, top_p)
        elif self.provider == "google":
            return self._generate_google(prompt, max_tokens, temperature, top_p)
        elif self.provider == "xai":
            return self._generate_xai(prompt, max_tokens, temperature, top_p)
        elif self.provider == "mistral":
            return self._generate_mistral(prompt, max_tokens, temperature, top_p)
        elif self.provider == "ollama":
            return self._generate_ollama(prompt, max_tokens, temperature, top_p)
        elif self.provider == "openrouter":
            return self._generate_openrouter(prompt, max_tokens, temperature, top_p)
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
    
    def _generate_openai(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: Optional[float],
    ) -> str:
        """Generate using OpenAI API with retry logic for rate limits."""
        # Some OpenAI models (e.g., o-series) do not allow temperature and top_p together.
        # Prefer temperature and include top_p only when provided and not an o-series model.
        params: Dict[str, Any] = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        model_lower = (self.model_name or "").lower()
        is_o_series = model_lower.startswith("o")  # covers o1, o3, etc.
        if (top_p is not None) and not is_o_series:
            params["top_p"] = top_p

        def _call_openai():
            response = self.openai_client.chat.completions.create(**params)
            content = response.choices[0].message.content if response.choices else None
            if content is None:
                raise ValueError("OpenAI returned an empty response (None content).")
            return content.strip()

        return self._retry_with_backoff(_call_openai)

    def _generate_gateway(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: Optional[float],
    ) -> str:
        from deepeval_engine.gateway_litellm_client import (
            gateway_chat_completion_sync,
            to_litellm_model,
        )

        litellm_model = to_litellm_model(self.provider, self.model_name)
        messages = [{"role": "user", "content": prompt}]
        key = self._gateway_api_key or ""
        if not key:
            raise RuntimeError("Gateway mode without API key")

        def _call():
            return gateway_chat_completion_sync(
                litellm_model,
                messages,
                key,
                max_tokens=max_tokens,
                temperature=temperature if top_p is None else temperature,
            )

        return self._retry_with_backoff(_call)

    def _generate_anthropic(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: Optional[float],
    ) -> str:
        """Generate using Anthropic API with retry logic for rate limits."""
        # Anthropic does not allow specifying both temperature and top_p simultaneously.
        kwargs: Dict[str, Any] = {
            "model": self.model_name,
            "max_tokens": max_tokens,
            "messages": [{"role": "user", "content": prompt}],
        }
        if top_p is not None:
            # If top_p is provided explicitly, use it and omit temperature
            kwargs["top_p"] = top_p
        else:
            kwargs["temperature"] = temperature

        def _call_anthropic():
            try:
                message = self.anthropic_client.messages.create(**kwargs)
                # Handle various response formats from Anthropic
                if not message.content:
                    return ""
                content_block = message.content[0]
                # Content block might be a TextBlock object or dict
                if hasattr(content_block, 'text'):
                    text = content_block.text
                elif isinstance(content_block, dict):
                    text = content_block.get('text', '')
                else:
                    text = str(content_block)
                return (text or "").strip()
            except Exception as e:
                import traceback
                print(f"Anthropic API error: {e}")
                print(f"Traceback: {traceback.format_exc()}")
                raise

        return self._retry_with_backoff(_call_anthropic)

    def _generate_google(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: Optional[float],
    ) -> str:
        """Generate using Google API (Gemini models) with retry logic for rate limits."""
        generation_config = {
            "max_output_tokens": max_tokens,
            "temperature": temperature,
        }
        if top_p is not None:
            generation_config["top_p"] = top_p

        def _call_google():
            response = self.google_client.generate_content(
                prompt,
                generation_config=generation_config
            )
            return response.text.strip()

        return self._retry_with_backoff(_call_google)

    def _generate_xai(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: Optional[float],
    ) -> str:
        """Generate using xAI official SDK (gRPC-based) with retry logic for rate limits."""
        from xai_sdk.chat import user

        def _call_xai():
            chat = self.xai_client.chat.create(model=self.model_name)
            chat.append(user(prompt))
            response = chat.sample(
                max_tokens=max_tokens,
                temperature=temperature,
            )
            return response.message.content.strip()

        return self._retry_with_backoff(_call_xai)
    
    def _generate_mistral(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: Optional[float],
    ) -> str:
        """Generate using Mistral official SDK with retry logic for rate limits."""
        params: Dict[str, Any] = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if top_p is not None:
            params["top_p"] = top_p

        def _call_mistral():
            chat_response = self.mistral_client.chat.complete(**params)
            content = chat_response.choices[0].message.content

            # Handle case where content is a list (e.g., list of content blocks)
            if isinstance(content, list):
                # Extract text from content blocks if they're dicts with 'text' key
                # Otherwise just join them as strings
                text_parts = []
                for item in content:
                    if isinstance(item, dict) and 'text' in item:
                        text_parts.append(item['text'])
                    else:
                        text_parts.append(str(item))
                content = ''.join(text_parts)

            return content.strip() if content else ""

        return self._retry_with_backoff(_call_mistral)
    
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
        if top_p is not None:
            options["top_p"] = top_p
        response = self.ollama_client.generate(model=self.model_name, prompt=prompt, options=options)
        
        return response['response'].strip()
    
    def _generate_openrouter(
        self,
        prompt: str,
        max_tokens: int,
        temperature: float,
        top_p: Optional[float],
    ) -> str:
        """Generate using OpenRouter (OpenAI-compatible API) with retry logic for rate limits."""
        params: Dict[str, Any] = {
            "model": self.model_name,
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if top_p is not None:
            params["top_p"] = top_p

        def _call_openrouter():
            response = self.openrouter_client.chat.completions.create(**params)
            content = response.choices[0].message.content if response.choices else None
            if content is None:
                raise ValueError("OpenRouter returned an empty response (None content). The model may have refused or timed out.")
            return content.strip()

        return self._retry_with_backoff(_call_openrouter)
    
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

