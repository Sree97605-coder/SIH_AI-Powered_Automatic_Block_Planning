from __future__ import annotations

import os
import tempfile
from pathlib import Path


TEST_INTEGRATED_DIR = Path(tempfile.mkdtemp(prefix="rail-block-planning-integrated-"))
os.environ["INTEGRATED_DIR"] = str(TEST_INTEGRATED_DIR)