"""Make `core` and `api` importable from the tests.

pytest puts the *test* directory on sys.path, not the repo root, so
`from core.analysis import ...` only resolves by accident when the runner
happens to add the working directory — which `python -m pytest` does and a
bare `pytest` does not. Adding the root explicitly makes both work.
"""

import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))
