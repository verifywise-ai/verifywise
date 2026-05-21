from fastapi import APIRouter
from .. import app as _app
from ..models import DatasetList

router = APIRouter()


@router.get("/datasets", response_model=DatasetList)
def list_datasets():
    datasets_dir = _app.GRS_ROOT / "datasets"
    if not datasets_dir.exists():
        return DatasetList(versions=[])
    dirs = [d for d in datasets_dir.iterdir() if d.is_dir() and not d.name.startswith(".")]
    dirs.sort(key=lambda d: d.stat().st_mtime, reverse=True)
    return DatasetList(versions=[d.name for d in dirs])
