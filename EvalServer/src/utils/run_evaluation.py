"""
Evaluation Runner - Executes DeepEval evaluations and stores results
"""

import os
import sys
import re
import asyncio
import json
import traceback
import subprocess
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession

# Regex pattern for valid model names (alphanumeric, dash, underscore, colon, slash, dot)
# Examples: llama3.2, mistral:7b, microsoft/phi-2, gpt-4o-mini
SAFE_MODEL_NAME_PATTERN = re.compile(r'^[a-zA-Z0-9][a-zA-Z0-9._:/-]*$')

# Add EvaluationModule to path (use absolute path)
evaluation_module_path = Path(__file__).parent.parent.parent.parent / "EvaluationModule"
sys.path.insert(0, str((evaluation_module_path / "src").resolve()))

from crud import evaluation_logs as crud
from crud.deepeval_scorers import list_scorers
from deepeval_engine.gatekeeper import evaluate_gate
from utils.run_custom_scorer import run_custom_scorer, ScorerResult
from utils.error_detection import FatalErrorTracker, detect_fatal_error


async def run_evaluation(
    db: AsyncSession,
    experiment_id: str,
    config: Dict[str, Any],
    organization_id: int,
) -> Dict[str, Any]:
    """
    Run a DeepEval evaluation based on experiment configuration.
    
    Args:
        db: Database session
        experiment_id: Experiment ID
        config: Experiment configuration with model, dataset, judge LLM, metrics
        organization_id: Organization ID for tenant isolation
        
    Returns:
        Evaluation results
    """
    print(f"\n{'='*70}")
    print(f"Starting Evaluation: {experiment_id}")
    print(f"{'='*70}\n")
    
    # Debug: Print Python info
    print(f"🐍 Python version: {sys.version}")
    print(f"🐍 Python executable: {sys.executable}")
    print(f"📦 sys.path[0]: {sys.path[0]}")
    print(f"📦 EvaluationModule path added: {str((evaluation_module_path / 'src').resolve())}")
    print()
    
    try:
        # Helper: ensure Ollama model is locally available
        def ensure_ollama_model(model_name: str) -> None:
            # Security: Validate model name to prevent command injection
            if not model_name or not SAFE_MODEL_NAME_PATTERN.match(model_name):
                print(f"⚠️  Invalid model name format: '{model_name}'. Skipping Ollama check.")
                return
            if len(model_name) > 128:
                print(f"⚠️  Model name too long: '{model_name[:50]}...'. Skipping Ollama check.")
                return

            try:
                # Check if model exists locally
                list_proc = subprocess.run(["ollama", "list"], capture_output=True, text=True, timeout=30)
                if list_proc.returncode == 0 and model_name in list_proc.stdout:
                    print(f"✓ Ollama model '{model_name}' is available locally")
                    return
                print(f"• Ollama model '{model_name}' not found locally; pulling...")
                pull_proc = subprocess.run(["ollama", "pull", model_name], text=True, timeout=600)
                if pull_proc.returncode == 0:
                    print(f"✓ Pulled Ollama model '{model_name}' successfully")
                else:
                    print(f"⚠️  Unable to pull Ollama model '{model_name}'. You may need to run 'ollama pull {model_name}' manually.")
            except Exception as _e:
                print(f"⚠️  Could not verify/pull Ollama model '{model_name}': {_e}")

        # Import DeepEval modules
        print("Importing deepeval_engine...")
        from deepeval_engine import ModelRunner, DeepEvalEvaluator
        print("✅ deepeval_engine imported")
        
        print("Importing deepeval.test_case...")
        from deepeval.test_case import LLMTestCase, ConversationalTestCase
        print("✅ deepeval imported")
        
        # Import Turn class for multi-turn conversations (required)
        from deepeval.test_case import Turn
        print("✅ Turn class imported for multi-turn evaluation")
        
        # Extract configuration
        model_config = config.get("model", {})
        judge_config = config.get("judgeLlm", {})
        dataset_config = config.get("dataset", {})
        metrics_config = config.get("metrics", {})
        thresholds_config = config.get("thresholds", {})
        
        # Evaluation mode: "scorer" = custom only, "standard" = judge only, "both" = run both
        evaluation_mode = config.get("evaluationMode", "standard")
        print(f"📋 Evaluation mode: {evaluation_mode}")
        
        # Set up API keys from config (if provided)
        # Check for multi-provider API keys map (new format from backend)
        # These keys are used by CUSTOM SCORERS - each scorer uses its own configured provider
        # G_EVAL_PROVIDER is set later based on the Judge LLM config (user's explicit selection)
        scorer_api_keys = config.get("scorerApiKeys")
        if scorer_api_keys and isinstance(scorer_api_keys, dict):
            # Map provider names to environment variable names
            provider_env_map = {
                "openai": "OPENAI_API_KEY",
                "anthropic": "ANTHROPIC_API_KEY",
                "google": "GOOGLE_API_KEY",
                "xai": "XAI_API_KEY",
                "mistral": "MISTRAL_API_KEY",
                "huggingface": "HF_API_KEY",
                "openrouter": "OPENROUTER_API_KEY",
            }
            
            configured_count = 0
            for provider in list(scorer_api_keys.keys()):
                env_var = provider_env_map.get(provider.lower())
                key_value = scorer_api_keys.get(provider)
                if env_var and key_value:
                    os.environ[env_var] = key_value
                    configured_count += 1
        
        # Legacy: single scorer API key (backward compatibility)
        legacy_key = config.get("scorerApiKey")
        if legacy_key and not scorer_api_keys:
            os.environ["OPENAI_API_KEY"] = legacy_key
            os.environ["ANTHROPIC_API_KEY"] = legacy_key
            os.environ["GOOGLE_API_KEY"] = legacy_key
            os.environ["XAI_API_KEY"] = legacy_key
            os.environ["MISTRAL_API_KEY"] = legacy_key
        
        # Judge LLM API keys (for DeepEval metrics - Standard Judge mode)
        print(f"📝 Judge LLM config: provider={judge_config.get('provider')}, has_apiKey={bool(judge_config.get('apiKey'))}")
        has_judge_key = judge_config.get("apiKey") and judge_config["apiKey"] not in ["***", "", None]
        is_self_hosted_judge = judge_config.get("provider", "").lower() in ("self-hosted", "ollama")

        if has_judge_key or is_self_hosted_judge:
            provider = judge_config.get("provider", "").lower()
            print(f"🔑 Setting API key for judge provider: {provider}")
            if provider == "openai":
                os.environ["OPENAI_API_KEY"] = judge_config["apiKey"]
                print(f"✅ OPENAI_API_KEY set")
            elif provider == "anthropic":
                os.environ["ANTHROPIC_API_KEY"] = judge_config["apiKey"]
            elif provider in ("google", "gemini"):
                os.environ["GOOGLE_API_KEY"] = judge_config["apiKey"]
            elif provider == "xai":
                os.environ["XAI_API_KEY"] = judge_config["apiKey"]
            elif provider == "mistral":
                os.environ["MISTRAL_API_KEY"] = judge_config["apiKey"]
            elif provider == "openrouter":
                os.environ["OPENROUTER_API_KEY"] = judge_config["apiKey"]
            elif provider in ("self-hosted", "ollama"):
                # Self-hosted / Ollama judge uses OpenAI-compatible API
                endpoint_url = judge_config.get("endpointUrl", "")
                if endpoint_url:
                    base_url = endpoint_url.rstrip("/")
                    if not base_url.endswith("/v1"):
                        base_url = base_url + "/v1"
                    os.environ["OPENAI_API_BASE"] = base_url
                    print(f"✅ OPENAI_API_BASE set to {base_url}")
                elif provider == "ollama":
                    # Default Ollama endpoint
                    os.environ["OPENAI_API_BASE"] = "http://localhost:11434/v1"
                    print(f"✅ OPENAI_API_BASE set to http://localhost:11434/v1 (default Ollama)")
                # Set API key or dummy for self-hosted endpoints that don't require auth
                if judge_config.get("apiKey") and judge_config["apiKey"] not in ["***", "", None]:
                    os.environ["OPENAI_API_KEY"] = judge_config["apiKey"]
                else:
                    os.environ["OPENAI_API_KEY"] = "not-needed"
                    print(f"✅ OPENAI_API_KEY set to dummy (self-hosted endpoint)")
                # DeepEval's G-Eval uses the OpenAI client, so set provider to openai
                provider = "openai"

            # Expose judge provider/model for evaluator (provider-agnostic G‑Eval)
            if provider:
                os.environ["G_EVAL_PROVIDER"] = provider
            if judge_config.get("model"):
                os.environ["G_EVAL_MODEL"] = str(judge_config["model"])
            # Set max tokens for judge (default 512, but user can set higher)
            max_tokens = judge_config.get("maxTokens", 512)
            os.environ["G_EVAL_MAX_TOKENS"] = str(max_tokens)
            print(f"✅ G_EVAL_MAX_TOKENS set to {max_tokens}")
        
        # Model API keys (for the model being tested)
        if model_config.get("apiKey") and model_config["apiKey"] != "***":
            provider = (model_config.get("provider") or model_config.get("accessMethod") or "").lower()
            if provider == "openai":
                os.environ["OPENAI_API_KEY"] = model_config["apiKey"]
            elif provider == "anthropic":
                os.environ["ANTHROPIC_API_KEY"] = model_config["apiKey"]
            elif provider in ("google"):
                os.environ["GOOGLE_API_KEY"] = model_config["apiKey"]
            elif provider == "xai":
                os.environ["XAI_API_KEY"] = model_config["apiKey"]
            elif provider == "mistral":
                os.environ["MISTRAL_API_KEY"] = model_config["apiKey"]
            elif provider == "openrouter":
                os.environ["OPENROUTER_API_KEY"] = model_config["apiKey"]
            elif provider == "custom_api":
                # For custom API, we'll set as OPENAI_API_KEY since we use OpenAI client
                os.environ["OPENAI_API_KEY"] = model_config["apiKey"]
                if model_config.get("endpointUrl"):
                    os.environ["OPENAI_API_BASE"] = model_config["endpointUrl"]
        
        # 1. Initialize Model Runner
        print(f"📦 Initializing model: {model_config.get('name', 'unknown')}")
        
        # Check both 'provider' and 'accessMethod' fields (frontend may send either)
        model_provider = (model_config.get("provider") or model_config.get("accessMethod") or "ollama").lower()
        model_name = model_config.get("name")
        print(f"📦 Model provider: {model_provider}")
        
        # Map frontend provider names to ModelRunner names
        provider_mapping = {
            "local": "huggingface",    # Local files treated as HuggingFace models
            "custom_api": "openai",    # Custom API uses OpenAI client with custom base_url
            "openai": "openai",        # OpenAI API
            "anthropic": "anthropic",  # Anthropic API
            "google": "google",        # Google API (for Gemini models)
            "xai": "xai",              # xAI API
            "mistral": "mistral",      # Mistral API
            "huggingface": "huggingface",  # HuggingFace models
            "ollama": "ollama",        # Ollama local server
            "openrouter": "openrouter",  # OpenRouter (multi-provider gateway)
        }
        
        runner_provider = provider_mapping.get(model_provider, "ollama")
        
        # Set custom endpoint if provided
        if model_config.get("endpointUrl"):
            if runner_provider == "ollama":
                os.environ["OLLAMA_HOST"] = model_config["endpointUrl"]
            elif runner_provider == "openai":
                os.environ["OPENAI_API_BASE"] = model_config["endpointUrl"]
        
        try:
            model_runner = ModelRunner(
                model_name=model_name,
                provider=runner_provider,
            )
        except Exception as e:
            error_msg = f"Failed to initialize model: {str(e)}"
            print(f"❌ {error_msg}")
            await crud.update_experiment_status(
                db=db,
                experiment_id=experiment_id,
                organization_id=organization_id,
                status="failed",
                error_message=error_msg
            )
            return {"error": error_msg}
        
        # If using Ollama, proactively ensure the model exists locally before generation
        if runner_provider == "ollama" and isinstance(model_name, str):
            ensure_ollama_model(model_name)
        
        # 2. Load Dataset (builtin by name, custom path, prompts, conversations, or benchmarks)
        print(f"\n📊 Loading dataset...")

        prompts = dataset_config.get("prompts", [])
        conversations = []  # list[dict]: { scenario?: str, turns: [{role, content}] }
        
        # Check if prompts from frontend are actually multi-turn (have 'turns' key instead of 'prompt')
        if prompts and isinstance(prompts, list) and len(prompts) > 0:
            first_item = prompts[0]
            if isinstance(first_item, dict) and "turns" in first_item:
                # This is multi-turn data, move to conversations
                print(f"📝 Detected multi-turn dataset with {len(prompts)} conversations")
                conversations = prompts
                prompts = []
        
        # Built-in preset by name (chatbot | rag | agent | safety)
        builtin_value = dataset_config.get("useBuiltin")
        if not prompts and isinstance(builtin_value, str):
            name = builtin_value.strip().lower()
            datasets_dir = evaluation_module_path / "data" / "datasets"
            preset_map = {
                "chatbot": datasets_dir / "chatbot" / "chatbot_basic.json",
                "rag": datasets_dir / "rag" / "rag_product_docs.json",
                "agent": datasets_dir / "agent" / "agent_task_execution_multiturn.json",
            }
            preset_path = preset_map.get(name)
            if preset_path and preset_path.is_file():
                print(f"📦 Using built-in dataset: {name} -> {preset_path}")
                with open(preset_path, "r", encoding="utf-8") as f:
                    loaded = json.load(f)
                    # Accept either prompts (single-turn) or conversational scenarios
                    if isinstance(loaded, list) and loaded and isinstance(loaded[0], dict) and "turns" in loaded[0]:
                        conversations = loaded
                    else:
                        prompts = loaded
            elif name in preset_map:
                error_msg = f"Built-in dataset file not found: {preset_map.get(name)}"
                print(f"❌ {error_msg}")
                await crud.update_experiment_status(
                    db=db,
                    experiment_id=experiment_id,
                    organization_id=organization_id,
                    status="failed",
                    error_message=error_msg
                )
                return {"error": error_msg}
        # Custom dataset path if provided (only load if we don't have data yet)
        if not prompts and not conversations and dataset_config.get("path"):
            custom_path = Path(dataset_config["path"])
            if not custom_path.is_absolute():
                custom_path = (evaluation_module_path / custom_path).resolve()
            print(f"📄 Loading custom dataset from: {custom_path}")
            if not custom_path.exists():
                error_msg = f"Dataset file not found: {custom_path}"
                print(f"❌ {error_msg}")
                await crud.update_experiment_status(
                    db=db,
                    experiment_id=experiment_id,
                    organization_id=organization_id,
                    status="failed",
                    error_message=error_msg
                )
                return {"error": error_msg}
            with open(custom_path, "r", encoding="utf-8") as f:
                loaded = json.load(f)
                if isinstance(loaded, list) and loaded and isinstance(loaded[0], dict) and "turns" in loaded[0]:
                    conversations = loaded
                else:
                    prompts = loaded
            print(f"✓ Loaded dataset from {custom_path}")
        if not prompts and not conversations:
            error_msg = "No prompts or conversations in dataset"
            print(f"❌ {error_msg}")
            await crud.update_experiment_status(
                db=db,
                experiment_id=experiment_id,
                organization_id=organization_id,
                status="failed",
                error_message=error_msg
            )
            return {"error": error_msg}
        
        test_cases_data = []

        # Check if this is a simulated conversation mode
        simulated_mode = dataset_config.get("simulatedMode", False)
        simulated_scenarios = dataset_config.get("scenarios", [])
        
        if simulated_mode and simulated_scenarios:
            # Import ConversationSimulator (required for simulated mode)
            try:
                from deepeval.conversation_simulator import ConversationSimulator
                from deepeval.dataset import ConversationalGolden
            except ImportError:
                error_msg = "ConversationSimulator is not available. Please upgrade DeepEval to use simulated mode."
                print(f"❌ {error_msg}")
                await crud.update_experiment_status(
                    db=db,
                    experiment_id=experiment_id,
                    organization_id=organization_id,
                    status="failed",
                    error_message=error_msg
                )
                return {"error": error_msg}
            # 3A-SIM. Simulated conversation mode: use ConversationSimulator
            print(f"\n🎭 SIMULATED MODE: Generating conversations for {len(simulated_scenarios)} scenarios...")
            
            # Create model callback for the simulator
            async def model_callback(input_text: str, turns_history: list, thread_id: str = "") -> Turn:
                """Generate next assistant response given conversation history."""
                # Build context from history
                context_parts = []
                for t in turns_history[-6:]:  # Keep last 6 turns for context
                    context_parts.append(f"{t.role.capitalize()}: {t.content}")
                context = "\n".join(context_parts)
                
                prompt = f"{context}\n\nUser: {input_text}\n\nAssistant:" if context else f"User: {input_text}\n\nAssistant:"
                
                response = model_runner.generate(
                    prompt=prompt,
                    max_tokens=1024,
                    temperature=0.7,
                )
                return Turn(role="assistant", content=response or "")
            
            # Create ConversationalGoldens from scenarios
            goldens = []
            for scenario_data in simulated_scenarios:
                golden = ConversationalGolden(
                    scenario=scenario_data.get("scenario", "General conversation"),
                    expected_outcome=scenario_data.get("expected_outcome", "Helpful response"),
                    user_description=scenario_data.get("user_description", "A typical user"),
                )
                goldens.append(golden)
            
            # Run simulation
            max_turns = dataset_config.get("maxTurns", 6)
            simulator = ConversationSimulator(model_callback=model_callback)
            
            print(f"🔄 Simulating conversations with max {max_turns} turns each...")
            simulated_test_cases = simulator.simulate(goldens=goldens, max_turns=max_turns)
            
            # Convert simulated test cases to our format
            for idx, conv_tc in enumerate(simulated_test_cases, 1):
                test_cases_data.append({
                    "test_case": conv_tc,
                    "is_conversational": True,
                    "metadata": {
                        "sample_id": f"simulated_scenario_{idx}",
                        "protected_attributes": {"category": conv_tc.scenario or f"scenario_{idx}", "difficulty": "simulated"},
                    }
                })
            
            print(f"✓ Generated {len(test_cases_data)} simulated conversations")
            
        elif conversations:
            # 3A. Conversational (multi-turn) evaluation using DeepEval's ConversationalTestCase
            # IMPORTANT: We run the MODEL to generate assistant responses, not use pre-written ones!
            print(f"\n🗣️ Detected conversational dataset with {len(conversations)} scenarios.")
            print(f"   🔄 MODEL WILL GENERATE RESPONSES for each conversation turn...\n")

            # Initialize fatal error tracker for early termination
            fatal_error_tracker = FatalErrorTracker(threshold=2)

            for s_idx, convo in enumerate(conversations, 1):
                scenario = convo.get("scenario") or f"scenario_{s_idx}"
                expected_outcome = convo.get("expected_outcome", "")
                raw_turns = convo.get("turns") or []
                
                print(f"  [{s_idx}/{len(conversations)}] Scenario: {scenario[:50]}...")
                
                # Extract user turns from the dataset
                user_turns_content = []
                expected_assistant_turns = []  # Keep expected responses for reference
                for t in raw_turns:
                    role = (t.get("role") or "").lower()
                    content = t.get("content") or ""
                    if role == "user":
                        user_turns_content.append(content)
                    elif role == "assistant":
                        expected_assistant_turns.append(content)
                
                if not user_turns_content:
                    print(f"    ⚠️ No user turns found, skipping...")
                    continue
                
                # Build Turn objects by GENERATING assistant responses
                turn_objects = []
                generated_assistant_turns = []
                conversation_history = []  # Track conversation for context
                
                start_time = datetime.now()
                total_tokens = 0
                
                for turn_idx, user_msg in enumerate(user_turns_content):
                    # Add user turn
                    turn_objects.append(Turn(role="user", content=user_msg))
                    conversation_history.append({"role": "user", "content": user_msg})
                    
                    # Build prompt with conversation context
                    if len(conversation_history) == 1:
                        # First turn - just the user message
                        prompt = f"You are a helpful assistant. Respond to the user.\n\nUser: {user_msg}\n\nAssistant:"
                    else:
                        # Build multi-turn prompt with history
                        history_str = ""
                        for h in conversation_history[:-1]:  # Exclude current turn
                            role_label = "User" if h["role"] == "user" else "Assistant"
                            history_str += f"{role_label}: {h['content']}\n"
                        prompt = f"You are a helpful assistant. Continue this conversation.\n\n{history_str}User: {user_msg}\n\nAssistant:"
                    
                    # GENERATE assistant response using the model
                    try:
                        assistant_response = model_runner.generate(
                            prompt=prompt,
                            max_tokens=1024,
                            temperature=0.7,
                        )
                        
                        # Clean up response if needed
                        if assistant_response:
                            assistant_response = assistant_response.strip()
                            # Remove common prefixes if model echoes them
                            if assistant_response.lower().startswith("assistant:"):
                                assistant_response = assistant_response[10:].strip()
                        
                        if not assistant_response:
                            assistant_response = "[Model returned empty response]"

                        # Track success to reset fatal error counter
                        fatal_error_tracker.track_success()

                    except Exception as gen_err:
                        print(f"    ⚠️ Generation error on turn {turn_idx + 1}: {gen_err}")
                        assistant_response = f"[Generation error: {str(gen_err)[:100]}]"

                        # Check if this is a fatal error that should stop the experiment
                        should_stop = fatal_error_tracker.track_error(str(gen_err))
                        if should_stop:
                            termination_reason = fatal_error_tracker.get_termination_reason()
                            print(f"\n🛑 FATAL ERROR DETECTED: {termination_reason}")
                            print(f"   Stopping experiment early to avoid wasting time on unrecoverable errors.\n")

                            # Update experiment status to failed
                            await crud.update_experiment_status(
                                db=db,
                                experiment_id=experiment_id,
                                organization_id=organization_id,
                                status="failed",
                                error_message=termination_reason,
                            )
                            return {"error": termination_reason, "early_termination": True}

                    # Add generated assistant turn
                    turn_objects.append(Turn(role="assistant", content=assistant_response))
                    conversation_history.append({"role": "assistant", "content": assistant_response})
                    generated_assistant_turns.append(assistant_response)
                    
                    # Estimate tokens for this turn
                    total_tokens += len(user_msg.split()) + len(assistant_response.split())
                
                latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                
                print(f"    ✓ Generated {len(generated_assistant_turns)} responses ({latency_ms}ms)")
                
                if not turn_objects:
                    continue
                
                # Create ConversationalTestCase with MODEL-GENERATED responses
                conv_test_case = ConversationalTestCase(
                    turns=turn_objects,
                )
                
                # Build raw_turns for storage (with generated responses)
                generated_raw_turns = []
                for i, user_msg in enumerate(user_turns_content):
                    generated_raw_turns.append({"role": "user", "content": user_msg})
                    if i < len(generated_assistant_turns):
                        generated_raw_turns.append({"role": "assistant", "content": generated_assistant_turns[i]})
                
                # Store as conversational test case
                test_cases_data.append({
                    "test_case": conv_test_case,
                    "is_conversational": True,
                    "scenario": scenario,
                    "expected_outcome": expected_outcome,
                    "metadata": {
                        "sample_id": f"{scenario}",
                        "protected_attributes": {"category": scenario, "difficulty": "conversation"},
                        "turn_count": len(turn_objects),
                    }
                })
                
                # Create a log entry for this conversation
                combined_input = "\n".join([f"User: {msg}" for msg in user_turns_content])
                combined_output = "\n".join([f"Assistant: {msg}" for msg in generated_assistant_turns])
                
                created_log = await crud.create_log(
                    db=db,
                    project_id=config.get("project_id"),
                    organization_id=organization_id,
                    experiment_id=experiment_id,
                    input_text=combined_input or scenario,
                    output_text=combined_output,
                    model_name=model_name,
                    latency_ms=latency_ms,
                    token_count=total_tokens,
                    metadata={
                        "is_conversational": True,
                        "scenario": scenario,
                        "expected_outcome": expected_outcome,
                        "turn_count": len(turn_objects),
                        "turns": generated_raw_turns,  # Store conversation with GENERATED responses
                        "expected_assistant_turns": expected_assistant_turns,  # Keep expected for reference
                    },
                )
                
                # Store log_id in test case metadata for later metric_scores update
                if created_log:
                    test_cases_data[-1]["metadata"]["log_id"] = created_log.get("id")
            
            print(f"\n✓ Built {len(test_cases_data)} ConversationalTestCases with MODEL-GENERATED responses.")
        else:
            # 3B. Single-turn path (existing)
            print(f"\n🤖 Generating {len(prompts)} responses...\n")

            # Initialize fatal error tracker for early termination
            fatal_error_tracker = FatalErrorTracker(threshold=2)

            for idx, prompt_data in enumerate(prompts, 1):
                start_time = datetime.now()  # Set before try block so it's always defined
                try:
                    print(f"  [{idx}/{len(prompts)}] Processing: {prompt_data['prompt'][:50]}...")
                    
                    # Generate response (first attempt)
                    response = model_runner.generate(
                        prompt=prompt_data["prompt"],
                        max_tokens=2048,
                        temperature=0.7,
                    )
                    
                    # If response is empty/whitespace, retry once with safer params
                    if not response or not str(response).strip():
                        print("     • Empty response, retrying with higher max_tokens/lower temperature...")
                        try:
                            response = model_runner.generate(
                                prompt=prompt_data["prompt"],
                                max_tokens=2048,
                                temperature=0.2,
                            )
                        except Exception as retry_err:
                            print(f"     • Retry failed: {retry_err}")
                    
                    # If still empty, mark as error and continue
                    if not response or not str(response).strip():
                        await crud.create_log(
                            db=db,
                            project_id=config.get("project_id"),
                            organization_id=organization_id,
                            experiment_id=experiment_id,
                            input_text=prompt_data["prompt"],
                            output_text="",
                            model_name=model_name,
                            latency_ms=int((datetime.now() - start_time).total_seconds() * 1000),
                            token_count=0,
                            status="error",
                            error_message="empty_output",
                        )
                        print("     ✗ Empty output after retry - logged as error")
                        continue
                    
                    latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
                    
                    # Create test case
                    test_case = LLMTestCase(
                        input=prompt_data["prompt"],
                        actual_output=response,
                        expected_output=prompt_data.get("expected_output", ""),
                    )
                    
                    # Log the interaction
                    created_log = await crud.create_log(
                        db=db,
                        project_id=config.get("project_id"),
                        organization_id=organization_id,
                        experiment_id=experiment_id,
                        input_text=prompt_data["prompt"],
                        output_text=response,
                        model_name=model_name,
                        latency_ms=latency_ms,
                        token_count=len(response.split()) if isinstance(response, str) else 0,  # Rough estimate
                        status="success",
                    )
                    
                    # Record latency metric
                    await crud.create_metric(
                        db=db,
                        project_id=config.get("project_id"),
                        metric_name="latency",
                        metric_type="performance",
                        value=float(latency_ms),
                        organization_id=organization_id,
                        experiment_id=experiment_id,
                    )
                    
                    test_cases_data.append({
                        "test_case": test_case,
                        "metadata": {
                            "sample_id": prompt_data.get("id"),
                            "category": prompt_data.get("category"),
                            "difficulty": prompt_data.get("difficulty"),
                            "log_id": created_log.get("id") if created_log else None,
                        }
                    })

                    print(f"     ✓ Generated ({latency_ms}ms)")

                    # Track success to reset fatal error counter
                    fatal_error_tracker.track_success()

                except Exception as e:
                    print(f"     ❌ Error: {e}")

                    # Calculate latency even for errors (time spent before error)
                    error_latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)

                    # Log the error with latency
                    await crud.create_log(
                        db=db,
                        project_id=config.get("project_id"),
                        organization_id=organization_id,
                        experiment_id=experiment_id,
                        input_text=prompt_data.get("prompt", str(prompt_data)[:200]),
                        model_name=model_name,
                        latency_ms=error_latency_ms,
                        token_count=0,
                        status="error",
                        error_message=str(e),
                    )

                    # Check if this is a fatal error that should stop the experiment
                    should_stop = fatal_error_tracker.track_error(str(e))
                    if should_stop:
                        termination_reason = fatal_error_tracker.get_termination_reason()
                        print(f"\n🛑 FATAL ERROR DETECTED: {termination_reason}")
                        print(f"   Stopping experiment early to avoid wasting time on unrecoverable errors.\n")

                        # Update experiment status to failed
                        await crud.update_experiment_status(
                            db=db,
                            experiment_id=experiment_id,
                            organization_id=organization_id,
                            status="failed",
                            error_message=termination_reason,
                        )
                        return {"error": termination_reason, "early_termination": True}

                    continue
        
        if not test_cases_data:
            error_msg = "No responses generated"
            await crud.update_experiment_status(
                db=db,
                experiment_id=experiment_id,
                organization_id=organization_id,
                status="failed",
                error_message=error_msg
            )
            return {"error": error_msg}
        
        # 4. Run DeepEval Metrics (if keys available)
        print(f"\n🔍 Running evaluation metrics...\n")
        
        # Create minimal config for evaluator
        class SimpleConfig:
            def __init__(self):
                self.model = type('obj', (object,), {'model_id': model_name})()
                self.dataset = type('obj', (object,), {'name': 'experiment_dataset'})()
        
        simple_config = SimpleConfig()
        config_manager = type('obj', (object,), {'config': simple_config})()
        
        output_dir = evaluation_module_path / "artifacts" / "deepeval_results"
        evaluator = DeepEvalEvaluator(
            config_manager=config_manager,
            output_dir=str(output_dir),
            metric_thresholds=thresholds_config,
        )
        
        # Read UI-selected metrics from config
        ui_metrics = config.get("metrics") or {}
        task_type = (config.get("taskType") or config.get("task_type") or "").strip().lower()
        bundles = config.get("bundles") or {}
        
        # Map frontend metric names (camelCase) to backend metric names (snake_case)
        # New metric structure:
        # - Universal Core (all use cases): relevance, correctness, completeness, hallucination, instruction_following, toxicity, bias
        # - RAG: context_relevancy, context_precision, context_recall, faithfulness
        # - Agent: tool_selection, tool_correctness, action_relevance, planning_quality
        metric_name_map = {
            # Universal Core
            "answerRelevancy": "answer_relevancy",
            "correctness": "correctness",
            "completeness": "completeness",
            "hallucination": "hallucination",
            "instructionFollowing": "instruction_following",
            "toxicity": "toxicity",
            "bias": "bias",
            # RAG-specific
            "contextRelevancy": "context_relevancy",
            "contextPrecision": "context_precision",
            "contextRecall": "context_recall",
            "faithfulness": "faithfulness",
            # Agent-specific
            "toolSelection": "tool_selection",
            "toolCorrectness": "tool_correctness",
            "actionRelevance": "action_relevance",
            "planningQuality": "planning_quality",
        }

        # Start with all metrics disabled
        deepeval_metrics_config = {
            # Universal Core (run for every use case)
            "answer_relevancy": False,
            "correctness": False,
            "completeness": False,
            "hallucination": False,
            "instruction_following": False,
            "toxicity": False,
            "bias": False,
            # RAG-specific (require retrieval_context)
            "context_relevancy": False,
            "context_precision": False,
            "context_recall": False,
            "faithfulness": False,
            # Agent-specific (tools, multi-step)
            "tool_selection": False,
            "tool_correctness": False,
            "action_relevance": False,
            "planning_quality": False,
        }
        
        # Enable metrics based on UI selection
        for ui_key, backend_key in metric_name_map.items():
            if ui_metrics.get(ui_key, False):
                deepeval_metrics_config[backend_key] = True
        
        # If no UI metrics provided (legacy/rerun), use defaults based on task type
        if not ui_metrics:
            # Default: enable Universal Core for all
            deepeval_metrics_config["answer_relevancy"] = True
            deepeval_metrics_config["correctness"] = True
            deepeval_metrics_config["completeness"] = True
            deepeval_metrics_config["hallucination"] = True
            deepeval_metrics_config["instruction_following"] = True
            deepeval_metrics_config["toxicity"] = True
            deepeval_metrics_config["bias"] = True
            
            if task_type == "rag":
                # RAG: Universal Core + RAG-specific metrics
                deepeval_metrics_config.update({
                    "context_relevancy": True,
                    "context_precision": True,
                    "context_recall": True,
                    "faithfulness": True,
                })
            elif task_type in ("agent", "agents"):
                # Agent: Universal Core + Agent-specific metrics
                deepeval_metrics_config.update({
                    "tool_selection": True,
                    "tool_correctness": True,
                    "action_relevance": True,
                    "planning_quality": True,
                })
            # Chatbot: Universal Core only (no extra metrics)
        
        # Log which metrics are enabled
        enabled_metrics = [k for k, v in deepeval_metrics_config.items() if v]
        print(f"📊 Enabled metrics: {enabled_metrics}")
        
        # 4. Run DeepEval metrics (only if mode is "standard" or "both")
        results = []
        if evaluation_mode in ("standard", "both"):
            print(f"\n🧪 Running DeepEval built-in metrics (mode: {evaluation_mode})")
            results = evaluator.run_evaluation(
                test_cases_data=test_cases_data,
                metrics_config=deepeval_metrics_config,
                use_case=task_type or "chatbot",
            )
        else:
            print(f"\n⏭️ Skipping DeepEval metrics (mode: {evaluation_mode})")
            # Still need to create empty results structure for consistency
            # test_cases_data is a list of {"test_case": LLMTestCase, "metadata": {...}}
            results = []
            for tc_data in test_cases_data:
                test_case = tc_data.get("test_case")
                if test_case:
                    results.append({
                        "input": getattr(test_case, "input", ""),
                        "output": getattr(test_case, "actual_output", ""),
                        "expected": getattr(test_case, "expected_output", None),
                        "context": getattr(test_case, "retrieval_context", None),
                        "metric_scores": {},
                    })

        # 4.1 Run Custom LLM Judge Scorers (if mode is "scorer" or "both")
        print(f"\n{'='*50}")
        print(f"🔍 CUSTOM SCORER EXECUTION")
        print(f"{'='*50}")
        
        project_id = config.get("project_id")
        custom_scorer_results: Dict[str, list] = {}  # scorer_id -> list of results per test case
        enabled_scorers: list = []  # Track for later use in storing results
        
        # Only run custom scorers if mode is "scorer" or "both"
        if evaluation_mode not in ("scorer", "both"):
            print(f"⏭️ Skipping custom scorers (mode: {evaluation_mode})")
        else:
            print(f"🎯 Running custom scorers (mode: {evaluation_mode})")
        
        # Note: Scorer API key is now set at the start of evaluation (see above)
        # This ensures DeepEval metrics also use the key
        
        if evaluation_mode in ("scorer", "both"):
            try:
                # Load enabled custom scorers for this organization
                # Note: Scorers are org-scoped, organization_id isolation is sufficient here
                all_scorers = await list_scorers(organization_id=organization_id, db=db)
                enabled_scorers = [s for s in all_scorers if s.get("enabled") and s.get("type") == "llm"]

                # Filter by selected scorers if specified in experiment config
                selected_scorer_ids = config.get("selectedScorers")
                if selected_scorer_ids and isinstance(selected_scorer_ids, list):
                    # Store original count before filtering
                    original_enabled_count = len(enabled_scorers)
                    # Only run scorers that are both enabled AND selected
                    enabled_scorers = [s for s in enabled_scorers if s.get("id") in selected_scorer_ids]
                    filtered_count = original_enabled_count - len(enabled_scorers)

                    print(f"📋 Found {len(all_scorers)} total scorers")
                    print(f"   Selected scorers: {len(enabled_scorers)} (from {len(selected_scorer_ids)} requested)")
                    print(f"   Selected scorer IDs: {selected_scorer_ids}")
                    if filtered_count > 0:
                        print(f"   ⚠️  {filtered_count} enabled scorer(s) not in selection - will be skipped")

                    # Warn if selected scorer IDs don't exist or are disabled
                    selected_set = set(selected_scorer_ids)
                    found_set = set(s.get("id") for s in enabled_scorers)
                    missing = selected_set - found_set
                    if missing:
                        print(f"   ⚠️  Warning: {len(missing)} requested scorer(s) not found or disabled: {list(missing)}")
                else:
                    # No selection specified, run all enabled scorers (backward compatibility)
                    print(f"📋 Found {len(all_scorers)} total scorers, {len(enabled_scorers)} enabled LLM scorers")
                    print(f"   No scorer selection specified - running all enabled scorers")
                
                if enabled_scorers:
                    for scorer in enabled_scorers:
                        scorer_id = scorer.get("id", "unknown")
                        scorer_name = scorer.get("name", "Unknown Scorer")
                        metric_key = scorer.get("metricKey", scorer_id)
                        scorer_config = scorer.get("config", {})
                        
                        print(f"\n🎯 Running Scorer: {scorer_name}")
                        print(f"   ID: {scorer_id}")
                        print(f"   Metric Key: {metric_key}")
                        print(f"   Judge Model: {scorer_config.get('judgeModel', 'NOT CONFIGURED')}")
                        print(f"   Messages: {len(scorer_config.get('messages', []))} template(s)")
                        print(f"   Choice Scores: {scorer_config.get('choiceScores', [])}")
                        print(f"   Threshold: {scorer.get('defaultThreshold', 0.5)}")
                        
                        scorer_scores = []
                        
                        for idx, tc_data in enumerate(test_cases_data):
                            test_case = tc_data.get("test_case")
                            if not test_case:
                                continue
                            
                            input_text = getattr(test_case, "input", "") or ""
                            output_text = getattr(test_case, "actual_output", "") or ""
                            expected_text = getattr(test_case, "expected_output", "") or ""
                            
                            print(f"   [{idx+1}/{len(test_cases_data)}] Evaluating...")
                            print(f"      Input: {input_text[:80]}...")
                            print(f"      Output: {output_text[:80]}...")
                            
                            try:
                                result: ScorerResult = await run_custom_scorer(
                                    scorer_config=scorer,
                                    input_text=input_text,
                                    output_text=output_text,
                                    expected_text=expected_text,
                                )
                                
                                scorer_scores.append({
                                    "test_case_idx": idx,
                                    "label": result.label,
                                    "score": result.score,
                                    "passed": result.passed,
                                    "raw_response": result.raw_response,
                                })
                                
                                status_icon = "✅" if result.passed else "❌"
                                print(f"      {status_icon} Result: {result.label} (score={result.score:.2f}, passed={result.passed})")
                                if result.total_tokens:
                                    print(f"      📊 Tokens: {result.total_tokens} (prompt={result.prompt_tokens}, completion={result.completion_tokens})")
                                
                                # Merge scorer result into test case results
                                if idx < len(results):
                                    if "metric_scores" not in results[idx]:
                                        results[idx]["metric_scores"] = {}
                                    results[idx]["metric_scores"][scorer_name] = {
                                        "score": result.score,
                                        "label": result.label,
                                        "passed": result.passed,
                                        "reason": result.reason if result.reason else (result.raw_response if result.raw_response else ""),
                                    }
                                
                            except Exception as scorer_err:
                                print(f"      ❌ Error: {scorer_err}")
                                scorer_scores.append({
                                    "test_case_idx": idx,
                                    "label": "ERROR",
                                    "score": 0.0,
                                    "passed": False,
                                    "raw_response": str(scorer_err),
                                })
                        
                        custom_scorer_results[scorer_id] = scorer_scores
                        
                        # Calculate average score for this scorer
                        if scorer_scores:
                            avg_score = sum(s["score"] for s in scorer_scores) / len(scorer_scores)
                            passed_count = sum(1 for s in scorer_scores if s["passed"])
                            print(f"\n   📈 Scorer Summary: avg_score={avg_score:.3f}, passed={passed_count}/{len(scorer_scores)}")
                else:
                    print("   ⚪ No enabled LLM scorers found for this project")
                    
            except Exception as scorer_load_err:
                print(f"⚠️ Error loading/running custom scorers: {scorer_load_err}")
                traceback.print_exc()
        
        print(f"\n{'='*50}\n")

        # 4.25 Run gatekeeper quality gate on the latest summary (if suite is available)
        gatekeeper_result: dict[str, Any] | None = None
        try:
            suite_path = evaluation_module_path / "suits" / "suite_core.yaml"
            latest_summary: Path | None = None

            try:
                summaries = list(Path(output_dir).glob("deepeval_summary_*.json"))
                if summaries:
                    latest_summary = max(summaries, key=lambda p: p.stat().st_mtime)
            except Exception:
                latest_summary = None

            if latest_summary and suite_path.is_file():
                print("\n🔒 Running gatekeeper quality gate...")
                gate_result = evaluate_gate(
                    summary_path=str(latest_summary),
                    suite_path=str(suite_path.resolve()),
                )
                gatekeeper_result = gate_result.to_dict()
                status = "PASSED" if gate_result.passed else "FAILED"
                print(f"[Gatekeeper] {status} — checked_metrics={gate_result.checked_metrics}")
                if gate_result.fail_reasons:
                    print("Fail reasons:")
                    for r in gate_result.fail_reasons:
                        print(f"  - {r}")
            else:
                if not latest_summary:
                    print("Gatekeeper skipped: no deepeval_summary_*.json found.")
                if not suite_path.is_file():
                    print(f"Gatekeeper skipped: suite file not found at {suite_path}")
        except Exception as ge:
            print(f"Gatekeeper error: {ge}")

        # 4.5 Persist per-log metric scores to log metadata
        # Map display names back to camelCase keys for frontend compatibility
        display_to_camel = {
            "Answer Relevancy": "answerRelevancy",
            "Faithfulness": "faithfulness",
            "Contextual Relevancy": "contextualRelevancy",
            "Contextual Recall": "contextualRecall",
            "Contextual Precision": "contextualPrecision",
            "Bias": "bias",
            "Toxicity": "toxicity",
            "Hallucination": "hallucination",
            "Answer Correctness": "answerCorrectness",
            "Coherence": "coherence",
            "Tonality": "tonality",
            "Safety": "safety",
            "Knowledge Retention": "knowledgeRetention",
            "Conversation Completeness": "conversationCompleteness",
            "Conversation Relevancy": "conversationRelevancy",
            "Role Adherence": "roleAdherence",
            "Task Completion": "taskCompletion",
            "Tool Correctness": "toolCorrectness",
            "Summarization": "summarization",
            "RAGAS": "ragas",
            # Conversational metrics
            "Turn Relevancy": "turnRelevancy",
            "Conversation Coherence": "conversationCoherence",
            "Conversation Helpfulness": "conversationHelpfulness",
            "Conversation Safety": "conversationSafety",
            "Conversation Quality": "conversationQuality",
            # G-Eval variants
            "g_eval_correctness": "answerCorrectness",
            "g_eval_coherence": "coherence",
            "g_eval_tonality": "tonality",
            "g_eval_safety": "safety",
        }
        
        try:
            print(f"📝 Updating {len(results)} logs with metric scores...")
            for idx, result in enumerate(results):
                log_id = test_cases_data[idx]["metadata"].get("log_id") if idx < len(test_cases_data) else None
                if log_id:
                    # Normalize metric keys to camelCase
                    raw_scores = result.get("metric_scores", {})
                    normalized_scores = {}
                    for display_name, score_data in raw_scores.items():
                        camel_key = display_to_camel.get(display_name, display_name)
                        normalized_scores[camel_key] = score_data
                    
                    await crud.update_log_metadata(
                        db=db,
                        log_id=log_id,
                        organization_id=organization_id,
                        metadata={"metric_scores": normalized_scores},
                    )
                    print(f"   ✅ Updated log {log_id[:8]}... with {len(normalized_scores)} metrics")
                else:
                    print(f"   ⚠️ No log_id found for result {idx}")
        except Exception as e:
            print(f"⚠️ Failed to update log metadata with metric scores: {e}")
            traceback.print_exc()
        
        # 5. Store Results
        print(f"\n💾 Storing results...")
        
        # Calculate summary statistics
        total_prompts = len(results)
        avg_scores = {}
        
        # Map snake_case config keys to display names AND camelCase frontend keys
        # Note: For conversational datasets, different metric names are used
        metric_config_map = {
            # Universal Core (single-turn)
            "answer_relevancy": {"display": "Relevance", "camel": "answerRelevancy"},
            "correctness": {"display": "Correctness", "camel": "correctness"},
            "completeness": {"display": "Completeness", "camel": "completeness"},
            "hallucination": {"display": "Hallucination", "camel": "hallucination"},
            "instruction_following": {"display": "Instruction Following", "camel": "instructionFollowing"},
            "toxicity": {"display": "Toxicity", "camel": "toxicity"},
            "bias": {"display": "Bias", "camel": "bias"},
            # RAG-specific
            "context_relevancy": {"display": "Context Relevancy", "camel": "contextRelevancy"},
            "context_precision": {"display": "Context Precision", "camel": "contextPrecision"},
            "context_recall": {"display": "Context Recall", "camel": "contextRecall"},
            "faithfulness": {"display": "Faithfulness", "camel": "faithfulness"},
            # Agent-specific
            "tool_selection": {"display": "Tool Selection", "camel": "toolSelection"},
            "tool_correctness": {"display": "Tool Correctness", "camel": "toolCorrectness"},
            "action_relevance": {"display": "Action Relevance", "camel": "actionRelevance"},
            "planning_quality": {"display": "Planning Quality", "camel": "planningQuality"},
        }
        
        # Conversational metric names (for multi-turn datasets)
        # These map to the same config keys but have different display names
        conversational_metric_map = {
            "answer_relevancy": {"display": "Turn Relevancy", "camel": "turnRelevancy"},
            "correctness": {"display": "Conversation Coherence", "camel": "conversationCoherence"},
            "instruction_following": {"display": "Conversation Helpfulness", "camel": "conversationHelpfulness"},
            "toxicity": {"display": "Conversation Safety", "camel": "conversationSafety"},
            "bias": {"display": "Conversation Safety", "camel": "conversationSafety"},  # Combined into safety
        }
        
        # Check if this is a conversational evaluation by looking at the results
        is_conversational = any(r.get("is_conversational", False) for r in results)

        # For conversational datasets, also collect scores from conversational metric names
        if is_conversational:
            # Collect all unique metric names from results
            all_metric_names = set()
            for r in results:
                all_metric_names.update(r.get("metric_scores", {}).keys())
            
            print(f"📊 Found conversational metrics: {all_metric_names}")
            
            # Process each metric found in results
            for metric_name in all_metric_names:
                scores: list[float] = []
                for r in results:
                    score_obj = r.get("metric_scores", {}).get(metric_name)
                    if isinstance(score_obj, dict):
                        score_val = score_obj.get("score")
                        if isinstance(score_val, (int, float)):
                            scores.append(float(score_val))
                
                if scores:
                    avg_score = sum(scores) / len(scores)
                    # Convert metric name to camelCase for frontend
                    camel_key = "".join(
                        word.capitalize() if i > 0 else word.lower()
                        for i, word in enumerate(metric_name.split())
                    )
                    avg_scores[camel_key] = avg_score
                    await crud.create_metric(
                        db=db,
                        project_id=config.get("project_id"),
                        metric_name=camel_key,
                        metric_type="quality",
                        value=avg_score,
                        organization_id=organization_id,
                        experiment_id=experiment_id,
                    )
                    print(f"   ✅ Saved {metric_name}: {avg_score:.3f}")
        else:
            # Single-turn: use standard metric mapping
            for metric_key, enabled in deepeval_metrics_config.items():
                if enabled:
                    mapping = metric_config_map.get(metric_key, {"display": metric_key, "camel": metric_key})
                    display_name = mapping["display"]
                    camel_key = mapping["camel"]
                    scores: list[float] = []
                    for r in results:
                        score_obj = r.get("metric_scores", {}).get(display_name)
                        if isinstance(score_obj, dict):
                            score_val = score_obj.get("score")
                            if isinstance(score_val, (int, float)):
                                scores.append(float(score_val))
                    if scores:
                        avg_score = sum(scores) / len(scores)
                        # Store with camelCase key for frontend compatibility
                        avg_scores[camel_key] = avg_score
                        await crud.create_metric(
                            db=db,
                            project_id=config.get("project_id"),
                            metric_name=camel_key,  # Use camelCase for DB too
                            metric_type="quality",
                            value=avg_score,
                            organization_id=organization_id,
                            experiment_id=experiment_id,
                        )
        
        # 5.1 Store Custom Scorer Results (same format as DeepEval metrics)
        if custom_scorer_results:
            print(f"💾 Storing custom scorer results...")
            for scorer_id, scorer_scores in custom_scorer_results.items():
                if scorer_scores:
                    # Find scorer info from enabled_scorers
                    scorer_name = scorer_id
                    metric_key = scorer_id
                    for s in enabled_scorers:
                        if s.get("id") == scorer_id:
                            scorer_name = s.get("name", scorer_id)
                            metric_key = s.get("metricKey", scorer_id)
                            break
                    
                    # Calculate average
                    avg_score = sum(s["score"] for s in scorer_scores) / len(scorer_scores)
                    passed_rate = sum(1 for s in scorer_scores if s["passed"]) / len(scorer_scores)
                    
                    # Store in avg_scores with metricKey (same as DeepEval metrics)
                    avg_scores[metric_key] = avg_score
                    
                    # Store as metric (same format as DeepEval metrics)
                    await crud.create_metric(
                        db=db,
                        project_id=config.get("project_id"),
                        metric_name=metric_key,
                        metric_type="quality",  # Same type as DeepEval metrics
                        value=avg_score,
                        organization_id=organization_id,
                        experiment_id=experiment_id,
                    )
                    print(f"   ✅ Saved {scorer_name} ({metric_key}): avg={avg_score:.3f}, pass_rate={passed_rate:.1%}")
        
        # Update experiment with results
        experiment_results: Dict[str, Any] = {
            "total_prompts": total_prompts,
            "avg_scores": avg_scores,  # Contains both DeepEval and custom scorer averages
            "detailed_results": results[:10],  # Store first 10 for preview (includes custom scorer scores in metric_scores)
            "completed_at": datetime.now().isoformat(),
        }
        if gatekeeper_result is not None:
            experiment_results["gatekeeper"] = gatekeeper_result
        
        await crud.update_experiment_status(
            db=db,
            experiment_id=experiment_id,
            organization_id=organization_id,
            status="completed",
            results=experiment_results,
        )
        
        print(f"\n✅ Evaluation completed successfully!")
        print(f"   Total prompts: {total_prompts}")
        print(f"   Average scores: {avg_scores}")
        
        return experiment_results
        
    except Exception as e:
        error_msg = f"Evaluation failed: {str(e)}"
        print(f"\n❌ {error_msg}")
        traceback.print_exc()
        
        try:
            await crud.update_experiment_status(
                db=db,
                experiment_id=experiment_id,
                organization_id=organization_id,
                status="failed",
                error_message=error_msg,
            )
        except:
            pass
        
        return {"error": error_msg}

