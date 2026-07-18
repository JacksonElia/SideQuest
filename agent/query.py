"""Retrieve the most relevant nearby SideQuest places."""

from __future__ import annotations

import argparse
import json
import time

from lib.store import MossStore, Store


INDEX_NAME = "sidequest-places"
_CANDIDATE_COUNT = 100

# The query path is intentionally backed by one long-lived store.  In
# particular, MossStore loads the places index here rather than on every query.
STORE = Store.create()
if isinstance(STORE, MossStore):
    STORE.load_index(INDEX_NAME)


def query(
    user_lat: float,
    user_lng: float,
    utterance: str,
    constraints: dict | None = None,
    place_id: str | None = None,
) -> dict:
    """Return up to five distinct nearby places ranked by semantic relevance."""
    conditioned_constraints, warnings = _apply_context(constraints or {})
    filters = _native_filters(conditioned_constraints, place_id)
    radius_m = float(conditioned_constraints.get("radius_min", 15)) * 80

    started_at = time.perf_counter()
    try:
        candidates = STORE.search(
            INDEX_NAME,
            utterance,
            lat=user_lat,
            lng=user_lng,
            radius_m=radius_m,
            filters=filters or None,
            top_k=_CANDIDATE_COUNT,
        )
    except Exception:
        candidates = []
        warnings = [*warnings, "Nearby places are temporarily unavailable."]
    latency_ms = (time.perf_counter() - started_at) * 1000

    return {
        "chunks": _distinct_places(candidates, conditioned_constraints),
        "latency_ms": latency_ms,
        "warnings": warnings,
        "user_facts": [],
    }


def _apply_context(constraints: dict) -> tuple[dict, list[str]]:
    """Use context conditioning when its track is available to this checkout."""
    try:
        from agent.context import apply_context
    except ModuleNotFoundError as error:
        if error.name != "agent.context":
            raise
        return dict(constraints), []
    return apply_context(dict(constraints))


def _native_filters(constraints: dict, place_id: str | None) -> dict:
    """Use only exact filters at the Store boundary; numeric values are encoded."""
    filters = {
        key: constraints[key]
        for key in ("indoor", "lang")
        if key in constraints
    }
    if place_id is not None:
        filters["place_id"] = place_id
    return filters


def _distinct_places(candidates: list[dict], constraints: dict) -> list[dict]:
    """Apply encoded numeric constraints and retain the best chunk for each place."""
    max_busyness = constraints.get("max_busyness")
    chunks: list[dict] = []
    seen_place_ids: set[str] = set()
    for candidate in candidates:
        metadata = candidate.get("metadata", {})
        if (
            max_busyness is not None
            and _as_number(metadata.get("busyness_pct")) > float(max_busyness)
        ):
            continue
        resolved_place_id = metadata.get("place_id")
        if not resolved_place_id or resolved_place_id in seen_place_ids:
            continue
        seen_place_ids.add(resolved_place_id)
        chunks.append(candidate)
        if len(chunks) == 5:
            break
    return chunks


def _as_number(value: object) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return float("inf")


def main() -> None:
    parser = argparse.ArgumentParser(description="Query nearby SideQuest places.")
    parser.add_argument("utterance")
    args = parser.parse_args()
    print(json.dumps(query(37.7793, -122.3931, args.utterance), indent=2))


if __name__ == "__main__":
    main()
