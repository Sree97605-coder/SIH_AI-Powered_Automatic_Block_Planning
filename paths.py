"""Compatibility shim for deployments that import the top-level module name `paths`.

This project stores the canonical implementation under `src/paths.py`, but some
local and deployment environments only have the repository root on `sys.path`.
Providing a root-level alias keeps both import styles working:

    from paths import DATA_DIR, INTEGRATED_DIR, ensure_data_on_path
    from src.paths import DATA_DIR, INTEGRATED_DIR, ensure_data_on_path
"""

from src.paths import *  # noqa: F401,F403
