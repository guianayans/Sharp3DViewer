from __future__ import annotations

import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Callable, Optional


def _latest_ply(output_dir: Path) -> Optional[Path]:
    ply_files = list(output_dir.glob("*.ply"))
    if not ply_files:
        return None
    return max(ply_files, key=lambda p: p.stat().st_mtime)


def run_sharp(
    input_image_path: str,
    output_dir: str,
    progress_callback: Optional[Callable[[str], None]] = None,
) -> str:
    """
    Roda o SHARP para uma imagem e retorna o caminho do .ply gerado.
    Lanca excecoes em caso de erro.
    """
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    command = [
        "sharp",
        "predict",
        "-i",
        str(input_image_path),
        "-o",
        str(output_path),
    ]

    env = os.environ.copy()
    env["PYTHONUNBUFFERED"] = "1"

    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        bufsize=1,
        env=env,
    )

    def stream_reader(stream):
        for line in iter(stream.readline, ""):
            cleaned = line.strip()
            if cleaned and progress_callback:
                progress_callback(cleaned)

    stdout_thread = threading.Thread(target=stream_reader, args=(process.stdout,))
    stderr_thread = threading.Thread(target=stream_reader, args=(process.stderr,))
    stdout_thread.start()
    stderr_thread.start()

    return_code = process.wait()
    stdout_thread.join()
    stderr_thread.join()

    if return_code != 0:
        raise RuntimeError("Falha ao executar SHARP. Verifique os logs.")

    # Give filesystem a moment in case SHARP is async about file writes
    time.sleep(0.5)

    ply_file = _latest_ply(output_path)
    if not ply_file:
        raise RuntimeError("Nenhum arquivo .ply foi gerado.")

    return str(ply_file)
