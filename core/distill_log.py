"""
Distillation training-data collector.

Every fresh (non-cached) Claude call is a free training example for the
future fine-tuned model: the exact prompt the app built (including RAG
filing context) paired with the output Claude produced. Logged as JSONL —
one example per line — in the chat-style shape fine-tuning frameworks
(Unsloth/TRL) expect, so the file is usable as a dataset without a
conversion step.

Best-effort by design: logging must never break or slow the user-facing
call that triggered it. Disable with DISTILL_LOG_DISABLED=1; relocate
with DISTILL_LOG_PATH (e.g. onto a persistent volume on hosted deploys —
ephemeral disks lose the log on redeploy).
"""

from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

LOG_PATH = Path(os.getenv("DISTILL_LOG_PATH")
                or (Path(__file__).parent.parent / "data" / "distill_log.jsonl"))

_ENABLED = os.getenv("DISTILL_LOG_DISABLED") != "1"
_lock = threading.Lock()


def log_example(task: str, system: str, prompt: str, output: str,
                model: str, meta: dict | None = None) -> None:
    """Append one (prompt, output) training example. Never raises."""
    if not _ENABLED or not output or not output.strip():
        return
    try:
        record = {
            "ts": time.time(),
            "task": task,
            "model": model,
            "meta": meta or {},
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": prompt},
                {"role": "assistant", "content": output},
            ],
        }
        line = json.dumps(record, ensure_ascii=False)
        with _lock:
            LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
            with open(LOG_PATH, "a", encoding="utf-8") as f:
                f.write(line + "\n")
    except Exception:
        pass
