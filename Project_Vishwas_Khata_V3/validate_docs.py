"""Backwards-compatible entry point for V2 documentation checks.

V1's former checker hard-coded 15 paths and seven Mermaid blocks. Running that
against a corrected V2 package would be misleading. This delegates to the
V2 cross-contract and executable SQLite oracle validator.
"""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).resolve().parent/'verification'/'verify_v2.py'),run_name='__main__')
