"""
Prometheux reasoning sidecar.

Wraps the `prometheux-chain` SDK (the only supported programmatic surface) behind a
small HTTP API the Node app calls. Facts are embedded directly in the Vadalog program
text — no database binding required.

Run from the project root:  uvicorn sidecar.main:app --port 8000 --reload
"""
import os

import prometheux_chain as px
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

# Load env from the project root (sidecar is started from there).
load_dotenv(".env.local")
load_dotenv(".env")

ORG = os.environ.get("PMTX_ORG", "")
USER = os.environ.get("PMTX_USER", "")
# Optional: target a specific Compute Pool machine (e.g. "PX_4_16_GP"). When the
# platform has a machine selected/running this can be left unset.
COMPUTE = os.environ.get("PMTX_COMPUTE") or None
# Prefer an explicit JARVISPY_URL if provided; otherwise derive from ORG/USER.
# PMTX_TOKEN is read from the environment by the SDK itself.
JARVISPY_URL = os.environ.get("JARVISPY_URL") or (
    f"https://api.prometheux.ai/jarvispy/{ORG}/{USER}"
)
px.config.set("JARVISPY_URL", JARVISPY_URL)

app = FastAPI(title="prometheux-sidecar")


class DeriveRequest(BaseModel):
    program: str          # full Vadalog: facts + rules + @output("...")
    output_predicate: str  # the predicate named in @output(...)
    page_size: int = 1000


@app.get("/health")
def health() -> dict:
    return {"ok": True, "jarvispy_url": JARVISPY_URL, "compute": COMPUTE}


def _log(msg: str) -> None:
    """Structured stdout line so the sidecar terminal shows real Prometheux usage."""
    print(f"[PROMETHEUX] {msg}", flush=True)


def _count_rows(results) -> object:
    """Best-effort row count from the backend's opaque results blob (logging only)."""
    try:
        facts = results.get("facts") if isinstance(results, dict) else None
        return len(facts) if isinstance(facts, list) else "?"
    except Exception:
        return "?"


@app.post("/derive")
def derive(req: DeriveRequest) -> dict:
    program_lines = req.program.splitlines()
    _log(
        f"/derive output={req.output_predicate!r} "
        f"lines={len(program_lines)} bytes={len(req.program)} compute={COMPUTE or 'auto'}"
    )
    # Echo the full Vadalog program (facts + rules) so the symbolic reasoning is visible.
    _log("Vadalog program ↓\n" + req.program)
    try:
        compute_kwargs = {"compute": COMPUTE} if COMPUTE else {}
        project_id = px.save_project(project_name="sidecar_run")
        _log(f"save_project → project_id={project_id}")
        # Clear any stale concepts left by a previous run in this project.
        try:
            px.cleanup_concepts(project_id)
        except Exception:
            pass
        px.save_concept(project_id=project_id, definition=req.program, **compute_kwargs)
        _log(f"run_concept({req.output_predicate!r}) → evaluating rules on Vadalog engine…")
        px.run_concept(
            project_id=project_id,
            concept_name=req.output_predicate,
            persist_outputs=True,
            **compute_kwargs,
        )
        results = px.fetch_results(
            project_id=project_id,
            output_predicate=req.output_predicate,
            page_size=req.page_size,
        )
        _log(f"fetch_results({req.output_predicate!r}) → derivedRows={_count_rows(results)}")
        # `results` is the backend's opaque JSON `data` — returned as-is; the Node
        # side normalizes once the real shape is confirmed by the smoke test.
        return {"project_id": project_id, "results": results}
    except Exception as e:  # SDK raises plain Exception on non-success / 401 / 404
        _log(f"derive FAILED: {e}")
        raise HTTPException(status_code=502, detail=str(e))
