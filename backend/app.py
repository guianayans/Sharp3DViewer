from __future__ import annotations

import json
import re
import shutil
import threading
import time
import uuid
from pathlib import Path

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from sharp_runner import run_sharp

BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
GAUSSIANS_DIR = BASE_DIR / "gaussians"

ALLOWED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}

app = FastAPI(title="Sharp 3D Viewer API")

jobs = {}
jobs_lock = threading.Lock()

# Ensure required folders exist
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
GAUSSIANS_DIR.mkdir(parents=True, exist_ok=True)

app.mount("/gaussians", StaticFiles(directory=GAUSSIANS_DIR), name="gaussians")


def update_job(job_id: str, **updates) -> None:
    with jobs_lock:
        job = jobs.get(job_id, {})
        job.update(updates)
        jobs[job_id] = job


def parse_progress(line: str, current: int) -> int:
    percent_match = re.search(r"(\\d{1,3})%", line)
    lowered = line.lower()

    if "download" in lowered and percent_match:
        pct = min(100, int(percent_match.group(1)))
        return max(current, int(pct * 0.3))

    if "processing" in lowered:
        return max(current, 40)

    if "saving 3dgs" in lowered:
        return max(current, 90)

    if percent_match:
        pct = min(99, int(percent_match.group(1)))
        return max(current, pct)

    return current


def process_job(job_id: str, image_path: Path) -> None:
    update_job(job_id, status="running", progress=10, message="Inicializando")

    def on_progress(line: str) -> None:
        with jobs_lock:
            current = jobs.get(job_id, {}).get("progress", 10)
        next_progress = parse_progress(line, current)
        update_job(job_id, progress=next_progress, message=line)

    try:
        ply_path = run_sharp(str(image_path), str(GAUSSIANS_DIR), progress_callback=on_progress)
    except Exception as exc:
        update_job(job_id, status="error", progress=100, message=str(exc))
        return

    update_job(
        job_id,
        status="done",
        progress=100,
        message="Concluido",
        plyUrl=f"/gaussians/{Path(ply_path).name}",
    )


@app.post("/api/upload-image")
async def upload_image(file: UploadFile = File(...)) -> JSONResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Arquivo nao enviado.")

    content_type = (file.content_type or "").lower()
    if not content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail="Arquivo deve ser uma imagem.")

    suffix = Path(file.filename).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        suffix = ".png"

    image_id = uuid.uuid4().hex
    image_path = UPLOADS_DIR / f"{image_id}{suffix}"

    try:
        with image_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as exc:  # pragma: no cover - basic IO failure
        raise HTTPException(status_code=500, detail=f"Falha ao salvar imagem: {exc}") from exc

    job_id = uuid.uuid4().hex
    update_job(job_id, status="queued", progress=5, message="Arquivo recebido")

    threading.Thread(target=process_job, args=(job_id, image_path), daemon=True).start()

    return JSONResponse({"status": "queued", "jobId": job_id})


@app.get("/api/progress/{job_id}")
def stream_progress(job_id: str) -> StreamingResponse:
    with jobs_lock:
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="Job nao encontrado.")

    def event_stream():
        last_payload = None
        while True:
            with jobs_lock:
                job = jobs.get(job_id, {})

            payload = {
                "status": job.get("status"),
                "progress": job.get("progress", 0),
                "message": job.get("message", ""),
                "plyUrl": job.get("plyUrl"),
            }

            if payload != last_payload:
                yield f"data: {json.dumps(payload)}\\n\\n"
                last_payload = payload

            if payload["status"] in ("done", "error"):
                break

            time.sleep(0.5)

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.get("/api/progress/{job_id}/status")
def progress_status(job_id: str) -> JSONResponse:
    with jobs_lock:
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="Job nao encontrado.")
        job = jobs[job_id].copy()

    payload = {
        "status": job.get("status"),
        "progress": job.get("progress", 0),
        "message": job.get("message", ""),
        "plyUrl": job.get("plyUrl"),
    }
    return JSONResponse(payload)


@app.get("/api/gaussians")
def list_gaussians() -> JSONResponse:
    items = []
    for ply_file in GAUSSIANS_DIR.glob("*.ply"):
        stat = ply_file.stat()
        items.append(
            {
                "name": ply_file.name,
                "size": stat.st_size,
                "updatedAt": stat.st_mtime,
                "plyUrl": f"/gaussians/{ply_file.name}",
            }
        )

    items.sort(key=lambda item: item["updatedAt"], reverse=True)
    return JSONResponse({"items": items})


@app.delete("/api/gaussians/{filename}")
def delete_gaussian(filename: str) -> JSONResponse:
    safe_name = Path(filename).name
    if not safe_name.endswith(".ply"):
        raise HTTPException(status_code=400, detail="Arquivo invalido.")

    target_path = GAUSSIANS_DIR / safe_name
    if not target_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo nao encontrado.")

    target_path.unlink()
    return JSONResponse({"status": "ok"})


def sanitize_name(value: str) -> str:
    cleaned = re.sub(r"[\\s]+", "_", value.strip())
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "", cleaned)
    return cleaned


def unique_ply_path(base_name: str) -> Path:
    safe_name = sanitize_name(base_name)
    if not safe_name:
        safe_name = uuid.uuid4().hex

    target_name = f"{safe_name}.ply"
    target_path = GAUSSIANS_DIR / target_name
    counter = 1
    while target_path.exists():
        target_name = f"{safe_name}-{counter}.ply"
        target_path = GAUSSIANS_DIR / target_name
        counter += 1
    return target_path


@app.post("/api/upload-ply")
async def upload_ply(file: UploadFile = File(...)) -> JSONResponse:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Arquivo nao enviado.")

    if not file.filename.lower().endswith(".ply"):
        raise HTTPException(status_code=400, detail="Envie um arquivo .ply.")

    target_path = unique_ply_path(Path(file.filename).stem)

    try:
        with target_path.open("wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Falha ao salvar .ply: {exc}") from exc

    return JSONResponse({"status": "ok", "plyUrl": f"/gaussians/{target_path.name}"})


@app.post("/api/gaussians/rename")
def rename_gaussian(payload: dict) -> JSONResponse:
    current = payload.get("current")
    new_name = payload.get("newName")

    if not current or not new_name:
        raise HTTPException(status_code=400, detail="Parametros invalidos.")

    current_name = Path(current).name
    current_path = GAUSSIANS_DIR / current_name

    if not current_path.exists():
        raise HTTPException(status_code=404, detail="Arquivo nao encontrado.")

    target_path = unique_ply_path(new_name)

    current_path.rename(target_path)

    return JSONResponse({"status": "ok", "plyUrl": f"/gaussians/{target_path.name}"})
