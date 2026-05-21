from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .routers import datasets, configs, runs, progress, results

GRS_ROOT: Path = Path(__file__).parent.parent.parent

app = FastAPI(title="GRS Module UI", version="0.1.0")

app.include_router(datasets.router, prefix="/api")
app.include_router(configs.router, prefix="/api")
app.include_router(runs.router, prefix="/api")
app.include_router(progress.router, prefix="/api")
app.include_router(results.router, prefix="/api")

# Serve compiled React build in production
_static = Path(__file__).parent / "static"
if _static.exists():
    app.mount("/", StaticFiles(directory=_static, html=True), name="static")
