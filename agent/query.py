"""Temporary hardcoded query response that unblocks the other tracks."""

from __future__ import annotations

import argparse
import json


def query(
    user_lat: float,
    user_lng: float,
    utterance: str,
    constraints: dict | None = None,
    place_id: str | None = None,
) -> dict:
    """Return the T1 fixture response without consulting a store or index."""
    return {
        "chunks": [
            {
                "text": "South Park is a leafy neighborhood green surrounded by cafes, a relaxed place to pause between SoMa stops.",
                "score": 0.95,
                "metadata": {
                    "place_id": "south-park",
                    "name": "South Park",
                    "lat": 37.7803,
                    "lng": -122.3932,
                    "kind": "park",
                    "indoor": False,
                    "viewpoint": False,
                    "photogenic": True,
                    "wind_exposed": False,
                    "busyness_pct": 42,
                    "busyness_at": "2026-07-18T18:00:00Z",
                    "heat_score": 7,
                    "open_now": True,
                    "event_time": None,
                    "lang": "en",
                    "source": "fixture",
                    "fetched_at": "2026-07-18T18:00:00Z",
                    "is_fixture": True,
                },
            },
            {
                "text": "Oracle Park sits along the waterfront, with public views of the ballpark and the bay from the surrounding promenade.",
                "score": 0.88,
                "metadata": {
                    "place_id": "oracle-park",
                    "name": "Oracle Park",
                    "lat": 37.7786,
                    "lng": -122.3893,
                    "kind": "landmark",
                    "indoor": False,
                    "viewpoint": True,
                    "photogenic": True,
                    "wind_exposed": True,
                    "busyness_pct": 68,
                    "busyness_at": "2026-07-18T18:00:00Z",
                    "heat_score": 8,
                    "open_now": True,
                    "event_time": None,
                    "lang": "en",
                    "source": "fixture",
                    "fetched_at": "2026-07-18T18:00:00Z",
                    "is_fixture": True,
                },
            },
            {
                "text": "Harborlight Gallery is hosting a small neighborhood opening with local sculpture and conversation.",
                "score": 0.83,
                "metadata": {
                    "place_id": "harborlight-gallery",
                    "name": "Harborlight Gallery",
                    "lat": 37.7831,
                    "lng": -122.3961,
                    "kind": "event",
                    "indoor": True,
                    "viewpoint": False,
                    "photogenic": True,
                    "wind_exposed": False,
                    "busyness_pct": 35,
                    "busyness_at": "2026-07-18T18:00:00Z",
                    "heat_score": 6,
                    "open_now": True,
                    "event_time": "2026-07-18T19:00:00Z",
                    "lang": "en",
                    "source": "fixture",
                    "fetched_at": "2026-07-18T18:00:00Z",
                    "is_fixture": True,
                },
            },
        ],
        "latency_ms": 8.0,
        "warnings": [],
        "user_facts": [],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the SideQuest T1 query stub.")
    parser.add_argument("utterance")
    args = parser.parse_args()
    print(json.dumps(query(37.7793, -122.3931, args.utterance), indent=2))


if __name__ == "__main__":
    main()
