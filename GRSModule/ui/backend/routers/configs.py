from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from .. import app as _app

router = APIRouter()

CONFIG_FILES = {
    "obligations":  "configs/obligations.yaml",
    "mutations":    "configs/mutations.yaml",
    "judge_rubric": "configs/judge_rubric.yaml",
    "models":       "configs/models.yaml",
    "templates":    "configs/templates/base_scenarios.yaml",
    "run_config":   "configs/run_config.yaml",
}


class ConfigContent(BaseModel):
    content: str


def _resolve(name: str):
    rel = CONFIG_FILES.get(name)
    if rel is None:
        raise HTTPException(status_code=404, detail=f"Unknown config: {name}")
    return _app.GRS_ROOT / rel


@router.get("/configs/{name}", response_model=ConfigContent)
def get_config(name: str):
    path = _resolve(name)
    if not path.exists():
        return ConfigContent(content="")
    return ConfigContent(content=path.read_text(encoding="utf-8"))


@router.put("/configs/{name}")
def put_config(name: str, body: ConfigContent):
    path = _resolve(name)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body.content, encoding="utf-8")
    return {"ok": True}
