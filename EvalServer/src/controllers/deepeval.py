"""
DeepEval Controller

Handles DeepEval evaluation requests, background task execution,
and result retrieval.

Shared-schema multi-tenancy: Uses organization_id for tenant isolation.
"""

import sys
import os
import json
import asyncio
import traceback
from pathlib import Path
from datetime import datetime
from typing import Dict, Any, Optional
from fastapi import HTTPException, BackgroundTasks, UploadFile
from fastapi.responses import JSONResponse

# Add EvaluationModule to path
eval_module_path = str(Path(__file__).parent.parent.parent.parent / "EvaluationModule" / "src")
if eval_module_path not in sys.path:
    sys.path.insert(0, eval_module_path)

from database.redis import get_job_status, set_job_status, delete_job_status
from database.db import get_db
from crud.deepeval_datasets import create_user_dataset, list_user_datasets
from crud.deepeval_scorers import (
    list_scorers,
    create_scorer,
    update_scorer,
    delete_scorer,
    get_scorer_by_id,
)
from utils.run_custom_scorer import run_custom_scorer

METRICS = [
    {
        "name": "answer_relevancy",
        "display_name": "Answer Relevancy",
        "description": "Measures if the answer is relevant to the input",
        "requires_context": False,
        "requires_openai_key": True,
        "score_interpretation": "Higher is better (0.0 - 1.0)"
    },
    {
        "name": "faithfulness",
        "display_name": "Faithfulness",
        "description": "Checks if the answer is faithful to the provided context",
        "requires_context": True,
        "requires_openai_key": True,
        "score_interpretation": "Higher is better (0.0 - 1.0)"
    },
    {
        "name": "contextual_relevancy",
        "display_name": "Contextual Relevancy",
        "description": "Evaluates if the context is relevant to the input",
        "requires_context": True,
        "requires_openai_key": True,
        "score_interpretation": "Higher is better (0.0 - 1.0)"
    },
    {
        "name": "hallucination",
        "display_name": "Hallucination Detection",
        "description": "Detects hallucinations or fabricated information in the output",
        "requires_context": True,
        "requires_openai_key": True,
        "score_interpretation": "Lower is better (0.0 - 1.0)"
    },
    {
        "name": "bias",
        "display_name": "Bias Detection",
        "description": "Identifies potential biases in responses",
        "requires_context": False,
        "requires_openai_key": True,
        "score_interpretation": "Lower is better (0.0 - 1.0)"
    },
    {
        "name": "toxicity",
        "display_name": "Toxicity Detection",
        "description": "Detects toxic or harmful content",
        "requires_context": False,
        "requires_openai_key": True,
        "score_interpretation": "Lower is better (0.0 - 1.0)"
    },
    # Agent-specific metrics (Reasoning Layer)
    {
        "name": "plan_quality",
        "display_name": "Plan Quality",
        "description": "Evaluates the quality and coherence of the agent's planning and task decomposition",
        "requires_context": False,
        "requires_openai_key": True,
        "requires_tools": True,
        "category": "agent_reasoning",
        "score_interpretation": "Higher is better (0.0 - 1.0)"
    },
    {
        "name": "plan_adherence",
        "display_name": "Plan Adherence",
        "description": "Measures how well the agent follows its own plan during execution",
        "requires_context": False,
        "requires_openai_key": True,
        "requires_tools": True,
        "category": "agent_reasoning",
        "score_interpretation": "Higher is better (0.0 - 1.0)"
    },
    # Agent-specific metrics (Action Layer)
    {
        "name": "tool_correctness",
        "display_name": "Tool Correctness",
        "description": "Evaluates if the agent selected the correct tools for the task",
        "requires_context": False,
        "requires_openai_key": True,
        "requires_tools": True,
        "category": "agent_action",
        "score_interpretation": "Higher is better (0.0 - 1.0)"
    },
    {
        "name": "argument_correctness",
        "display_name": "Argument Correctness",
        "description": "Evaluates if the agent provided correct arguments/parameters to tools",
        "requires_context": False,
        "requires_openai_key": True,
        "requires_tools": True,
        "category": "agent_action",
        "score_interpretation": "Higher is better (0.0 - 1.0)"
    },
    # Agent-specific metrics (Execution)
    {
        "name": "task_completion",
        "display_name": "Task Completion",
        "description": "Measures whether the agent successfully completed the requested task",
        "requires_context": False,
        "requires_openai_key": True,
        "requires_tools": True,
        "category": "agent_execution",
        "score_interpretation": "Higher is better (0.0 - 1.0)"
    },
    {
        "name": "step_efficiency",
        "display_name": "Step Efficiency",
        "description": "Evaluates if the agent completed the task with minimal unnecessary steps",
        "requires_context": False,
        "requires_openai_key": True,
        "requires_tools": True,
        "category": "agent_execution",
        "score_interpretation": "Higher is better (0.0 - 1.0)"
    }
]


# In-memory storage for evaluation results (can be replaced with database)
DEEPEVAL_RESULTS = {}
DEEPEVAL_STATUS = {}


async def create_deepeval_evaluation_controller(
    background_tasks: BackgroundTasks,
    config_data: dict,
    organization_id: int
) -> JSONResponse:
    """
    Create and start a DeepEval evaluation in the background.

    Args:
        background_tasks: FastAPI background tasks
        config_data: Evaluation configuration
        organization_id: Organization ID for tenant isolation

    Returns:
        JSONResponse with evaluation ID and status
    """
    try:
        # Generate evaluation ID
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        eval_id = f"deepeval_{organization_id}_{timestamp}"

        # Store initial status
        DEEPEVAL_STATUS[eval_id] = {
            "eval_id": eval_id,
            "status": "pending",
            "organization_id": organization_id,
            "config": config_data,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "progress": "0/0 prompts evaluated"
        }

        # Add background task
        background_tasks.add_task(
            run_deepeval_evaluation_task,
            eval_id=eval_id,
            config_data=config_data,
            organization_id=organization_id
        )
        
        return JSONResponse(
            status_code=202,
            content={
                "eval_id": eval_id,
                "status": "pending",
                "message": "DeepEval evaluation started",
                "created_at": DEEPEVAL_STATUS[eval_id]["created_at"]
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to start evaluation: {str(e)}"
        )


async def run_deepeval_evaluation_task(
    eval_id: str,
    config_data: dict,
    organization_id: int
):
    """
    Background task to run DeepEval evaluation.

    Args:
        eval_id: Unique evaluation ID
        config_data: Evaluation configuration
        organization_id: Organization ID for tenant isolation
    """
    try:
        # Force use of asyncio event loop (not uvloop)
        import os
        os.environ['PYTHONASYNCIODEBUG'] = '1'

        # Update status to running
        DEEPEVAL_STATUS[eval_id]["status"] = "running"
        DEEPEVAL_STATUS[eval_id]["updated_at"] = datetime.now().isoformat()

        print(f"[DeepEval] Starting evaluation {eval_id} for organization {organization_id}")

        # Import DeepEval components
        from deepeval_engine.deepeval_evaluator import DeepEvalEvaluator
        from deepeval_engine.evaluation_dataset import EvaluationDataset
        from deepeval_engine.model_runner import ModelRunner
        from deepeval.test_case import LLMTestCase
        
        # Load evaluation dataset
        dataset = EvaluationDataset()
        prompts = dataset.get_all_prompts()
        
        # Apply filters from config
        dataset_config = config_data.get("dataset", {})
        
        if dataset_config.get("categories"):
            prompts = [p for p in prompts if p["category"] in dataset_config["categories"]]
        
        if dataset_config.get("difficulties"):
            prompts = [p for p in prompts if p["difficulty"] in dataset_config["difficulties"]]
        
        if dataset_config.get("ids"):
            prompts = [p for p in prompts if p["id"] in dataset_config["ids"]]
        
        if dataset_config.get("limit"):
            prompts = prompts[:dataset_config["limit"]]
        
        print(f"[DeepEval] Loaded {len(prompts)} prompts")
        
        # Update progress
        DEEPEVAL_STATUS[eval_id]["progress"] = f"0/{len(prompts)} prompts evaluated"
        DEEPEVAL_STATUS[eval_id]["total_prompts"] = len(prompts)
        
        # Initialize model runner
        model_config = config_data.get("model", {})
        model_runner = ModelRunner(
            model_name=model_config.get("name", "TinyLlama/TinyLlama-1.1B-Chat-v1.0"),
            provider=model_config.get("provider", "huggingface")
        )
        
        print(f"[DeepEval] Initialized model runner")
        
        # Generate responses
        test_cases_data = []
        generation_config = model_config.get("generation", {})
        
        for i, prompt_data in enumerate(prompts, 1):
            try:
                # Generate response
                response = model_runner.generate(
                    prompt=prompt_data['prompt'],
                    max_tokens=generation_config.get("max_tokens", 500),
                    temperature=generation_config.get("temperature", 0.7),
                    top_p=generation_config.get("top_p", 0.9),
                )
                
                # Create test case
                test_case = LLMTestCase(
                    input=prompt_data['prompt'],
                    actual_output=response,
                    expected_output=prompt_data['expected_output'],
                    context=[
                        f"Category: {prompt_data['category']}",
                        f"Difficulty: {prompt_data['difficulty']}",
                    ],
                    retrieval_context=[prompt_data['expected_output']]
                )
                
                # Format metadata
                metadata = {
                    "sample_id": prompt_data['id'],
                    "category": prompt_data['category'],
                    "difficulty": prompt_data['difficulty'],
                    "prompt": prompt_data['prompt'],
                    "expected_output": prompt_data['expected_output'],
                    "expected_keywords": prompt_data.get('expected_keywords', []),
                    "protected_attributes": {
                        "category": prompt_data['category'],
                        "difficulty": prompt_data['difficulty']
                    }
                }
                
                test_cases_data.append({
                    "test_case": test_case,
                    "metadata": metadata
                })
                
                # Update progress
                DEEPEVAL_STATUS[eval_id]["progress"] = f"{i}/{len(prompts)} prompts evaluated"
                DEEPEVAL_STATUS[eval_id]["updated_at"] = datetime.now().isoformat()
                
                print(f"[DeepEval] Generated response {i}/{len(prompts)}: {prompt_data['id']}")
                
            except Exception as e:
                print(f"[DeepEval] Error generating response for {prompt_data['id']}: {e}")
                continue
        
        print(f"[DeepEval] Generated {len(test_cases_data)} test cases")

        # Extract and set LLM API keys from config for metrics evaluation
        judge_config = config_data.get("judgeLlm", {})
        if judge_config and judge_config.get("apiKey"):
            judge_provider = judge_config.get("provider", "").lower()
            judge_key = judge_config["apiKey"]

            # Map provider to environment variable name
            provider_env_map = {
                "openai": "OPENAI_API_KEY",
                "anthropic": "ANTHROPIC_API_KEY",
                "google": "GEMINI_API_KEY",
                "xai": "XAI_API_KEY",
            }

            if judge_provider in provider_env_map:
                os.environ[provider_env_map[judge_provider]] = judge_key
                print(f"[DeepEval] Set {provider_env_map[judge_provider]} for judge LLM")

        # Initialize evaluator
        class SimpleConfig:
            def __init__(self):
                self.model = type('obj', (object,), {
                    'model_id': model_config.get("name", "unknown")
                })()
                self.dataset = type('obj', (object,), {
                    'name': 'evaluation_dataset'
                })()
        
        simple_config = SimpleConfig()
        config_manager = type('obj', (object,), {'config': simple_config})()
        
        output_dir = f"artifacts/deepeval_results/{organization_id}/{eval_id}"
        evaluator = DeepEvalEvaluator(
            config_manager=config_manager,
            output_dir=output_dir,
            metric_thresholds=config_data.get("metric_thresholds", {})
        )
        
        print(f"[DeepEval] Running evaluation with metrics")
        
        # Run evaluation
        metrics_config = config_data.get("metrics", {
            "answer_relevancy": True,
            "bias": True,
            "toxicity": True,
        })
        
        results = evaluator.run_evaluation(
            test_cases_data=test_cases_data,
            metrics_config=metrics_config
        )
        
        # Store results
        DEEPEVAL_RESULTS[eval_id] = {
            "eval_id": eval_id,
            "organization_id": organization_id,
            "status": "completed",
            "config": config_data,
            "results": results,
            "summary": evaluator.generate_summary_dict(results),
            "created_at": DEEPEVAL_STATUS[eval_id]["created_at"],
            "completed_at": datetime.now().isoformat()
        }
        
        # Update status
        DEEPEVAL_STATUS[eval_id]["status"] = "completed"
        DEEPEVAL_STATUS[eval_id]["updated_at"] = datetime.now().isoformat()
        DEEPEVAL_STATUS[eval_id]["completed_at"] = datetime.now().isoformat()
        
        print(f"[DeepEval] Evaluation {eval_id} completed successfully")
        
    except Exception as e:
        print(f"[DeepEval] Evaluation {eval_id} failed: {e}")
        traceback.print_exc()
        
        # Update status to failed
        DEEPEVAL_STATUS[eval_id]["status"] = "failed"
        DEEPEVAL_STATUS[eval_id]["error"] = str(e)
        DEEPEVAL_STATUS[eval_id]["updated_at"] = datetime.now().isoformat()


async def get_deepeval_evaluation_status_controller(
    eval_id: str,
    organization_id: int
) -> JSONResponse:
    """
    Get the status of a DeepEval evaluation.

    Args:
        eval_id: Evaluation ID
        organization_id: Organization ID for tenant isolation

    Returns:
        JSONResponse with evaluation status
    """
    if eval_id not in DEEPEVAL_STATUS:
        raise HTTPException(
            status_code=404,
            detail=f"Evaluation {eval_id} not found"
        )

    status_data = DEEPEVAL_STATUS[eval_id]

    # Verify organization
    if status_data.get("organization_id") != organization_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    return JSONResponse(
        status_code=200,
        content=status_data
    )


async def get_deepeval_evaluation_results_controller(
    eval_id: str,
    organization_id: int
) -> JSONResponse:
    """
    Get the results of a completed DeepEval evaluation.

    Args:
        eval_id: Evaluation ID
        organization_id: Organization ID for tenant isolation

    Returns:
        JSONResponse with evaluation results
    """
    if eval_id not in DEEPEVAL_RESULTS:
        # Check if evaluation exists but isn't complete
        if eval_id in DEEPEVAL_STATUS:
            status = DEEPEVAL_STATUS[eval_id]["status"]
            if status == "pending" or status == "running":
                raise HTTPException(
                    status_code=202,
                    detail=f"Evaluation is still {status}"
                )
            elif status == "failed":
                raise HTTPException(
                    status_code=500,
                    detail=f"Evaluation failed: {DEEPEVAL_STATUS[eval_id].get('error', 'Unknown error')}"
                )

        raise HTTPException(
            status_code=404,
            detail=f"Evaluation results for {eval_id} not found"
        )

    results_data = DEEPEVAL_RESULTS[eval_id]

    # Verify organization
    if results_data.get("organization_id") != organization_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    return JSONResponse(
        status_code=200,
        content=results_data
    )


async def get_all_deepeval_evaluations_controller(organization_id: int) -> JSONResponse:
    """
    Get all DeepEval evaluations for an organization.

    Args:
        organization_id: Organization ID for tenant isolation

    Returns:
        JSONResponse with list of evaluations
    """
    org_evaluations = []

    for eval_id, status_data in DEEPEVAL_STATUS.items():
        if status_data.get("organization_id") == organization_id:
            evaluation_summary = {
                "eval_id": eval_id,
                "status": status_data["status"],
                "created_at": status_data["created_at"],
                "updated_at": status_data["updated_at"],
                "progress": status_data.get("progress", "Unknown"),
            }
            
            # Add model info if available
            if "config" in status_data:
                model_config = status_data["config"].get("model", {})
                evaluation_summary["model"] = model_config.get("name", "Unknown")
            
            # Add summary stats if completed
            if eval_id in DEEPEVAL_RESULTS:
                summary = DEEPEVAL_RESULTS[eval_id].get("summary", {})
                evaluation_summary["total_samples"] = summary.get("total_samples", 0)
                evaluation_summary["completed_at"] = DEEPEVAL_RESULTS[eval_id].get("completed_at")
            
            org_evaluations.append(evaluation_summary)
    
    # Sort by created_at descending
    org_evaluations.sort(key=lambda x: x["created_at"], reverse=True)
    
    return JSONResponse(
        status_code=200,
        content={"evaluations": org_evaluations}
    )


async def delete_deepeval_evaluation_controller(
    eval_id: str,
    organization_id: int
) -> JSONResponse:
    """
    Delete a DeepEval evaluation and its results.

    Args:
        eval_id: Evaluation ID
        organization_id: Organization ID for tenant isolation

    Returns:
        JSONResponse with deletion confirmation
    """
    if eval_id not in DEEPEVAL_STATUS:
        raise HTTPException(
            status_code=404,
            detail=f"Evaluation {eval_id} not found"
        )

    status_data = DEEPEVAL_STATUS[eval_id]

    # Verify organization
    if status_data.get("organization_id") != organization_id:
        raise HTTPException(
            status_code=403,
            detail="Access denied"
        )

    # Delete from both storages
    if eval_id in DEEPEVAL_STATUS:
        del DEEPEVAL_STATUS[eval_id]

    if eval_id in DEEPEVAL_RESULTS:
        del DEEPEVAL_RESULTS[eval_id]

    # Delete files if they exist
    try:
        output_dir = Path(f"artifacts/deepeval_results/{organization_id}/{eval_id}")
        if output_dir.exists():
            import shutil
            shutil.rmtree(output_dir)
    except Exception as e:
        print(f"[DeepEval] Warning: Could not delete files for {eval_id}: {e}")
    
    return JSONResponse(
        status_code=200,
        content={
            "message": "Evaluation deleted successfully",
            "eval_id": eval_id
        }
    )
  

async def get_available_deepeval_metrics_controller() -> JSONResponse:
    """
    Get list of available DeepEval metrics with descriptions.
    
    Returns:
        JSONResponse with available metrics
    """
    global METRICS

    return JSONResponse(
        status_code=200,
        content={"metrics": METRICS}
    )


async def get_evaluation_dataset_info_controller() -> JSONResponse:
    """
    Get information about the evaluation dataset.
    
    Returns:
        JSONResponse with dataset statistics
    """
    try:
        from deepeval_engine.evaluation_dataset import EvaluationDataset

        dataset = EvaluationDataset()
        stats = dataset.get_statistics()
        
        # Get all prompts for detailed info
        prompts = dataset.get_all_prompts()
        
        # Build category details
        category_details = {}
        for prompt in prompts:
            category = prompt["category"]
            if category not in category_details:
                category_details[category] = {
                    "count": 0,
                    "difficulties": {"easy": 0, "medium": 0, "hard": 0}
                }
            category_details[category]["count"] += 1
            category_details[category]["difficulties"][prompt["difficulty"]] += 1
        
        return JSONResponse(
            status_code=200,
            content={
                "total_prompts": stats["total_prompts"],
                "categories": stats["category_list"],
                "difficulties": list(stats["difficulties"].keys()),
                "category_counts": stats["categories"],
                "difficulty_counts": stats["difficulties"],
                "category_details": category_details
            }
        )
        
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to get dataset info: {str(e)}"
        )


async def upload_deepeval_dataset_controller(
    dataset: UploadFile,
    organization_id: int,
    org_id: str,
    dataset_type: str = "chatbot",
    turn_type: str = "single-turn",
    user_id: Optional[str] = None,
) -> JSONResponse:
    """
    Upload a custom dataset JSON file for DeepEval and return a server-relative path
    that can be referenced in evaluation configs as dataset.path.
    """
    try:
        if not dataset:
            raise HTTPException(status_code=400, detail="No dataset file provided")

        # Validate dataset_type
        valid_types = ["chatbot", "rag", "agent"]
        if dataset_type not in valid_types:
            dataset_type = "chatbot"
        
        # Validate turn_type
        valid_turn_types = ["single-turn", "multi-turn"]
        if turn_type not in valid_turn_types:
            turn_type = "single-turn"

        # Basic content-type check (best-effort)
        content_type = (dataset.content_type or "").lower()
        if "json" not in content_type and not dataset.filename.lower().endswith(".json"):
            raise HTTPException(status_code=400, detail="Dataset must be a JSON file")

        # Read and validate JSON
        content_bytes = await dataset.read()
        try:
            data = json.loads(content_bytes.decode("utf-8"))
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Invalid JSON: {e}")

        # Minimal schema check: expect a list of prompt objects
        if not isinstance(data, list):
            raise HTTPException(status_code=400, detail="Dataset JSON must be an array of prompt objects")

        # Build upload path (Docker: /app/data/uploads, Local: EvaluationModule/data/uploads)
        uploads_root = _get_uploads_root()
        uploads_dir = uploads_root / str(organization_id)
        uploads_dir.mkdir(parents=True, exist_ok=True)

        # Use only the original filename, no timestamp prefix
        original_name = dataset.filename.replace("/", "_").replace("\\", "_")
        if original_name.lower().endswith(".json"):
            original_name = original_name[:-5]
        
        # Extract dataset name from filename (clean it up) - just the file name
        # Apply title case so each word is capitalized
        dataset_name = original_name.replace("_", " ").replace("-", " ").strip().title()
        if not dataset_name:
            dataset_name = "Untitled Dataset"
        
        # Count prompts - only count items with actual content
        prompt_count = 0
        if isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    # Single-turn: check if prompt field has content
                    if item.get("prompt") and str(item.get("prompt", "")).strip():
                        prompt_count += 1
                    # Multi-turn: check if turns array has at least one turn with content
                    elif item.get("turns") and isinstance(item.get("turns"), list) and len(item.get("turns", [])) > 0:
                        # Verify at least one turn has content
                        has_content = any(
                            turn.get("content") and str(turn.get("content", "")).strip()
                            for turn in item.get("turns", [])
                            if isinstance(turn, dict)
                        )
                        if has_content:
                            prompt_count += 1
        
        # Use original filename without timestamp prefix
        filename = f"{original_name}.json"
        full_path = uploads_dir / filename

        # If file exists, add a suffix to both filename and display name
        counter = 1
        final_dataset_name = dataset_name
        while full_path.exists():
            filename = f"{original_name}_{counter}.json"
            final_dataset_name = f"{dataset_name} ({counter + 1})"
            full_path = uploads_dir / filename
            counter += 1

        # Save pretty JSON back to disk to ensure UTF-8 and normalized formatting
        with open(full_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

        # Return path relative to EvaluationModule for runner consumption
        relative_path = str(Path("data") / "uploads" / str(organization_id) / filename)
        # Also persist metadata in DB for Datasets tab with clean name and prompt count
        try:
            async with get_db() as db:
                await create_user_dataset(
                    organization_id=organization_id,
                    db=db,
                    name=final_dataset_name,
                    path=relative_path,
                    size=len(content_bytes),
                    prompt_count=prompt_count,
                    dataset_type=dataset_type,
                    turn_type=turn_type,
                    created_by=user_id,
                )
                await db.commit()
        except Exception:
            pass

        return JSONResponse(
            status_code=201,
            content={
                "message": "Dataset uploaded successfully",
                "path": relative_path,
                "filename": filename,
                "size": len(content_bytes),
                "organizationId": organization_id,
                "datasetType": dataset_type,
                "turnType": turn_type,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload dataset: {str(e)}"
        )


def _safe_evalmodule_data_root() -> Path:
    """
    Returns the path to built-in datasets.
    In Docker: /app/datasets
    In development: EvaluationModule/data/datasets (relative to repo root)
    """
    # Check for Docker environment first (datasets copied to /app/datasets)
    docker_datasets = Path("/app/datasets")
    if docker_datasets.exists():
        return docker_datasets

    # Fallback for local development
    root_path = Path(__file__).parent.parent.parent.parent
    evaluation_module_path = root_path / "EvaluationModule"
    return evaluation_module_path / "data" / "datasets"


def _get_evaluation_module_path() -> Path:
    """
    Returns the path to EvaluationModule/data directory.
    Used for user uploads and other data files.
    """
    root_path = Path(__file__).parent.parent.parent.parent
    return root_path / "EvaluationModule" / "data"


def _get_uploads_root() -> Path:
    """
    Returns the path to user uploads directory.
    In Docker: /app/data/uploads (mounted as volume for persistence)
    In development: EvaluationModule/data/uploads (relative to repo root)
    """
    # Check for Docker environment first
    docker_uploads = Path("/app/data/uploads")
    if docker_uploads.exists():
        return docker_uploads

    # Fallback for local development
    root_path = Path(__file__).parent.parent.parent.parent
    return root_path / "EvaluationModule" / "data" / "uploads"


def _extract_dataset_stats(file_path: Path) -> dict:
    """
    Extract statistics from a dataset JSON file.
    Returns test count, categories, difficulty distribution, and topics.
    """
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, list):
            return {}

        total_tests = len(data)
        categories = set()
        difficulties = {"easy": 0, "medium": 0, "hard": 0}

        for item in data:
            if isinstance(item, dict):
                if "category" in item:
                    categories.add(item["category"])
                if "difficulty" in item:
                    diff = item.get("difficulty", "").lower()
                    if diff in difficulties:
                        difficulties[diff] += 1

        return {
            "test_count": total_tests,
            "categories": sorted(list(categories)),
            "category_count": len(categories),
            "difficulty": difficulties,
        }
    except Exception:
        return {}


def _load_dataset_metadata(file_path: Path) -> dict:
    """
    Load optional metadata from a companion .meta.json file.
    Returns description, tags, and other metadata if available.
    """
    meta_path = file_path.with_suffix(".meta.json")
    if meta_path.exists():
        try:
            with open(meta_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {}


async def list_deepeval_datasets_controller() -> JSONResponse:
    """
    List available built-in datasets grouped by use case.
    Looks under EvaluationModule/data/datasets.
    Includes statistics (test count, categories, difficulty) and metadata.
    """
    base = _safe_evalmodule_data_root()
    result = {
        "chatbot": [],
        "rag": [],
        "agent": [],
        "safety": [],
    }
    try:
        subdirs = ["chatbot", "rag", "agent", "safety"]
        for sub in subdirs:
            sd = base / sub
            if not sd.exists():
                continue
            for f in sd.glob("*.json"):
                # Skip metadata files
                if f.stem.endswith(".meta"):
                    continue

                stats = _extract_dataset_stats(f)
                metadata = _load_dataset_metadata(f)

                dataset_info = {
                    "key": f"{sub}/{f.name}",
                    "name": f.stem.replace("_", " ").title(),
                    "path": str(f.relative_to(base)),
                    "use_case": sub,
                    **stats,
                    **metadata,
                }
                result[sub].append(dataset_info)

        return JSONResponse(status_code=200, content={"datasets": result})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list datasets: {e}")


async def read_deepeval_dataset_controller(path: str) -> JSONResponse:
    """
    Return the JSON contents of a dataset at a relative path.
    Path can be:
    - Relative to datasets folder (e.g., "chatbot/chatbot_basic.json")
    - For uploads: "data/uploads/{organization_id}/file.json"
    """
    try:
        # Security: Early rejection of suspicious path patterns
        if ".." in path or path.startswith("/") or path.startswith("\\"):
            raise HTTPException(status_code=400, detail="Invalid dataset path: path traversal not allowed")

        target = None
        allowed_base = None

        # Check if it's a user upload path (starts with "data/uploads/")
        if path.startswith("data/uploads/"):
            # Extract org_folder and filename from path: "data/uploads/{organization_id}/{filename}"
            path_parts = path.split("/")
            if len(path_parts) >= 4:
                org_folder = path_parts[2]
                filename = "/".join(path_parts[3:])
                uploads_root = _get_uploads_root()
                target = (uploads_root / org_folder / filename).resolve()
                allowed_base = (uploads_root / org_folder).resolve()
            else:
                raise HTTPException(status_code=400, detail="Invalid upload path format")
        else:
            # Built-in dataset path (e.g., "chatbot/chatbot_basic.json")
            datasets_base = _safe_evalmodule_data_root()
            target = (datasets_base / path).resolve()
            allowed_base = datasets_base.resolve()

        # Security check: ensure resolved target is inside allowed directory
        try:
            target.relative_to(allowed_base)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid dataset path: access denied")

        if not target.is_file():
            raise HTTPException(status_code=404, detail="Dataset file not found")

        with open(target, "r", encoding="utf-8") as f:
            data = json.load(f)

        if not isinstance(data, list):
            raise HTTPException(status_code=400, detail="Dataset file is not a list of prompts")

        return JSONResponse(status_code=200, content={"path": path, "prompts": data})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read dataset: {e}")
    # End of read_deepeval_dataset_controller


async def list_user_datasets_controller(
    organization_id: int,
    org_id: Optional[str] = None,
) -> JSONResponse:
    """
    List user-uploaded datasets from the database (organization-scoped).
    Optionally filter by org_id.
    """
    try:
        async with get_db() as db:
            items = await list_user_datasets(organization_id=organization_id, db=db)
            return JSONResponse(status_code=200, content={"datasets": items})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list user datasets: {e}")


async def delete_user_datasets_controller(organization_id: int, paths: list[str]) -> JSONResponse:
    """
    Delete user-uploaded datasets by paths (organization-scoped).
    Security: Only allows deletion within the organization's own uploads directory.
    """
    try:
        uploads_root = _get_uploads_root()
        org_uploads_dir = (uploads_root / str(organization_id)).resolve()
        deleted_count = 0

        async with get_db() as db:
            from crud.deepeval_datasets import delete_user_datasets

            # Delete from database
            await delete_user_datasets(organization_id=organization_id, db=db, paths=paths)

            # Delete physical files
            for path in paths:
                try:
                    # Path format: "data/uploads/{organization_id}/{filename}"
                    path_parts = path.split("/")
                    if len(path_parts) >= 4 and path_parts[2] == str(organization_id):
                        filename = "/".join(path_parts[3:])
                        file_path = (org_uploads_dir / filename).resolve()
                        # Security check: ensure file is within organization's uploads directory
                        if file_path.is_relative_to(org_uploads_dir) and file_path.is_file():
                            file_path.unlink()
                            deleted_count += 1
                        else:
                            print(f"Security: Blocked deletion of {path} - outside org directory")
                    else:
                        print(f"Security: Blocked deletion of {path} - invalid path or wrong org")
                except Exception as e:
                    print(f"Failed to delete file {path}: {e}")

            await db.commit()

        return JSONResponse(
            status_code=200,
            content={"message": f"Deleted {deleted_count} dataset(s)", "deleted": deleted_count}
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete datasets: {e}")


# ==================== SCORERS ====================

async def list_deepeval_scorers_controller(
    organization_id: int,
    org_id: Optional[str] = None,
) -> JSONResponse:
    """
    List scorer definitions for the current organization (optionally filtered by project).
    """
    try:
        async with get_db() as db:
            items = await list_scorers(organization_id=organization_id, db=db)
            return JSONResponse(status_code=200, content={"scorers": items})
    except Exception as e:
        error_str = str(e).lower()
        # If the table doesn't exist yet, return empty list instead of 500 error
        if "does not exist" in error_str or "undefined" in error_str or "relation" in error_str:
            return JSONResponse(status_code=200, content={"scorers": []})
        raise HTTPException(status_code=500, detail=f"Failed to list scorers: {e}")


async def create_deepeval_scorer_controller(
    *,
    organization_id: int,
    payload: Dict[str, Any],
) -> JSONResponse:
    """
    Create a new scorer definition.

    Expected payload (fields optional except name, type, metric_key):
    {
      "id": "optional custom id; generated if missing",
      "projectId": "project_123" | null,
      "name": "Answer correctness (LLM)",
      "description": "...",
      "type": "llm" | "builtin" | "custom",
      "metricKey": "answer_correctness",
      "config": { ... scorer-specific config ... },
      "enabled": true,
      "defaultThreshold": 0.7,
      "weight": 1.0
    }
    """
    from uuid import uuid4

    scorer_id = payload.get("id") or f"scorer_{uuid4().hex}"
    org_id = payload.get("orgId")
    name = payload.get("name")
    scorer_type = payload.get("type") or "llm"
    metric_key = payload.get("metricKey")

    if not name or not metric_key:
        raise HTTPException(status_code=400, detail="Both 'name' and 'metricKey' are required")

    description = payload.get("description")
    config = payload.get("config") or {}
    enabled = bool(payload.get("enabled", True))
    default_threshold = payload.get("defaultThreshold")
    weight = payload.get("weight")
    created_by = payload.get("createdBy")

    try:
        async with get_db() as db:
            created = await create_scorer(
                scorer_id=scorer_id,
                name=name,
                description=description,
                scorer_type=scorer_type,
                metric_key=metric_key,
                config=config,
                enabled=enabled,
                default_threshold=default_threshold,
                weight=weight,
                organization_id=organization_id,
                created_by=created_by,
                db=db,
            )
            await db.commit()

        if not created:
            raise HTTPException(status_code=500, detail="Failed to create scorer")

        return JSONResponse(status_code=201, content=created)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create scorer: {e}")


async def update_deepeval_scorer_controller(
    scorer_id: str,
    *,
    organization_id: int,
    payload: Dict[str, Any],
) -> JSONResponse:
    """
    Update an existing scorer definition.
    """
    try:
        async with get_db() as db:
            updated = await update_scorer(
                scorer_id=scorer_id,
                organization_id=organization_id,
                name=payload.get("name"),
                description=payload.get("description"),
                scorer_type=payload.get("type"),
                metric_key=payload.get("metricKey"),
                config=payload.get("config"),
                enabled=payload.get("enabled"),
                default_threshold=payload.get("defaultThreshold"),
                weight=payload.get("weight"),
                db=db,
            )
            await db.commit()

        if not updated:
            raise HTTPException(status_code=404, detail="Scorer not found")

        return JSONResponse(status_code=200, content=updated)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update scorer: {e}")


async def delete_deepeval_scorer_controller(
    scorer_id: str,
    *,
    organization_id: int,
) -> JSONResponse:
    """
    Delete a scorer definition.
    """
    try:
        async with get_db() as db:
            deleted = await delete_scorer(scorer_id=scorer_id, organization_id=organization_id, db=db)
            await db.commit()

        if not deleted:
            raise HTTPException(status_code=404, detail="Scorer not found")

        return JSONResponse(
            status_code=200,
            content={"message": "Scorer deleted successfully", "id": scorer_id},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete scorer: {e}")


async def test_deepeval_scorer_controller(
    scorer_id: str,
    *,
    organization_id: int,
    payload: Dict[str, Any],
) -> JSONResponse:
    """
    Test a scorer with sample input/output data.

    Expected payload:
    {
      "input": "The source text to evaluate...",
      "output": "The model's output to judge...",
      "expected": "Optional expected/reference output..."
    }
    """
    try:
        # Get scorer config from database
        async with get_db() as db:
            scorer = await get_scorer_by_id(scorer_id=scorer_id, organization_id=organization_id, db=db)
        
        if not scorer:
            raise HTTPException(status_code=404, detail="Scorer not found")
        
        if scorer.get("type") != "llm":
            raise HTTPException(
                status_code=400, 
                detail="Only LLM judge scorers can be tested via this endpoint"
            )
        
        # Extract test data from payload
        input_text = payload.get("input", "")
        output_text = payload.get("output", "")
        expected_text = payload.get("expected", "")
        
        if not input_text or not output_text:
            raise HTTPException(
                status_code=400,
                detail="Both 'input' and 'output' are required for testing"
            )
        
        # Run the scorer
        result = await run_custom_scorer(
            scorer_config=scorer,
            input_text=input_text,
            output_text=output_text,
            expected_text=expected_text,
        )
        
        return JSONResponse(
            status_code=200,
            content={
                "scorerId": result.scorer_id,
                "scorerName": result.scorer_name,
                "label": result.label,
                "score": result.score,
                "passed": result.passed,
                "rawResponse": result.raw_response,
                "tokenUsage": {
                    "promptTokens": result.prompt_tokens,
                    "completionTokens": result.completion_tokens,
                    "totalTokens": result.total_tokens,
                } if result.total_tokens else None,
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to test scorer: {e}")


# ==================== MODELS ====================


async def list_deepeval_models_controller(
    organization_id: int,
    org_id: Optional[str] = None,
) -> JSONResponse:
    """
    List saved model configurations for the current organization.
    """
    from crud.deepeval_models import list_models

    try:
        async with get_db() as db:
            items = await list_models(organization_id=organization_id, db=db)
            return JSONResponse(status_code=200, content={"models": items})
    except Exception as e:
        error_str = str(e).lower()
        # If the table doesn't exist yet, return empty list instead of 500 error
        if "does not exist" in error_str or "undefined" in error_str or "relation" in error_str:
            return JSONResponse(status_code=200, content={"models": []})
        raise HTTPException(status_code=500, detail=f"Failed to list models: {e}")


async def create_deepeval_model_controller(
    *,
    organization_id: int,
    payload: Dict[str, Any],
) -> JSONResponse:
    """
    Create a new saved model configuration.

    Expected payload:
    {
      "id": "optional custom id; generated if missing",
      "orgId": "org_123" | null,
      "name": "gpt-4o",
      "provider": "openai",
      "endpointUrl": "optional custom endpoint"
    }
    """
    from uuid import uuid4
    from crud.deepeval_models import create_model

    model_id = payload.get("id") or f"model_{uuid4().hex}"
    org_id = payload.get("orgId")
    name = payload.get("name")
    provider = payload.get("provider")

    if not org_id:
        raise HTTPException(status_code=400, detail="'orgId' is required")
    if not name or not provider:
        raise HTTPException(status_code=400, detail="Both 'name' and 'provider' are required")

    endpoint_url = payload.get("endpointUrl")
    created_by = payload.get("createdBy")

    try:
        async with get_db() as db:
            created = await create_model(
                model_id=model_id,
                name=name,
                provider=provider,
                endpoint_url=endpoint_url,
                organization_id=organization_id,
                created_by=created_by,
                db=db,
            )
            await db.commit()

        if not created:
            raise HTTPException(status_code=500, detail="Failed to create model")

        return JSONResponse(status_code=201, content={"model": created})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create model: {e}")


async def update_deepeval_model_controller(
    model_id: str,
    *,
    organization_id: int,
    payload: Dict[str, Any],
) -> JSONResponse:
    """
    Update an existing saved model configuration.
    """
    from crud.deepeval_models import update_model

    try:
        async with get_db() as db:
            updated = await update_model(
                model_id=model_id,
                organization_id=organization_id,
                name=payload.get("name"),
                provider=payload.get("provider"),
                endpoint_url=payload.get("endpointUrl"),
                db=db,
            )
            await db.commit()

        if not updated:
            raise HTTPException(status_code=404, detail="Model not found")

        return JSONResponse(status_code=200, content={"model": updated})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update model: {e}")


async def delete_deepeval_model_controller(
    model_id: str,
    *,
    organization_id: int,
) -> JSONResponse:
    """
    Delete a saved model configuration.
    """
    from crud.deepeval_models import delete_model

    try:
        async with get_db() as db:
            deleted = await delete_model(model_id=model_id, organization_id=organization_id, db=db)
            await db.commit()

        if not deleted:
            raise HTTPException(status_code=404, detail="Model not found")

        return JSONResponse(
            status_code=200,
            content={"message": "Model deleted", "modelId": model_id},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete model: {e}")


# ==================== LATEST MODEL/SCORER FOR EXPERIMENTS ====================


async def get_latest_model_controller(
    organization_id: int,
    org_id: Optional[str] = None,
) -> JSONResponse:
    """
    Get the most recently added/updated model configuration.
    Used for auto-populating experiment forms.
    """
    from crud.deepeval_models import get_latest_model

    try:
        async with get_db() as db:
            model = await get_latest_model(organization_id=organization_id, db=db)
            return JSONResponse(status_code=200, content={"model": model})
    except Exception as e:
        error_str = str(e).lower()
        if "does not exist" in error_str or "undefined" in error_str or "relation" in error_str:
            return JSONResponse(status_code=200, content={"model": None})
        raise HTTPException(status_code=500, detail=f"Failed to get latest model: {e}")


async def get_latest_scorer_controller(
    organization_id: int,
    org_id: Optional[str] = None,
) -> JSONResponse:
    """
    Get the most recently added/updated scorer (judge) configuration.
    Used for auto-populating experiment forms.
    """
    from crud.deepeval_scorers import get_latest_scorer

    try:
        async with get_db() as db:
            scorer = await get_latest_scorer(organization_id=organization_id, db=db)
            return JSONResponse(status_code=200, content={"scorer": scorer})
    except Exception as e:
        error_str = str(e).lower()
        if "does not exist" in error_str or "undefined" in error_str or "relation" in error_str:
            return JSONResponse(status_code=200, content={"scorer": None})
        raise HTTPException(status_code=500, detail=f"Failed to get latest scorer: {e}")

