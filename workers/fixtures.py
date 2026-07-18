"""Populate the development index with repeatable SideQuest fixture content."""

from __future__ import annotations

import json
import random
from datetime import UTC, datetime, time, timedelta, timezone
from pathlib import Path
from typing import Any

from lib.store import Store


INDEX_NAME = "sidequest-places"
FIXTURE_FILTER = {"source": "fixture", "is_fixture": True}
_LANDMARKS_PATH = Path(__file__).parents[1] / "data" / "landmarks.json"
# The fixture date is the July hackathon date, when San Francisco observes PDT.
# A fixed offset avoids requiring the uninstalled Windows time-zone database.
_SAN_FRANCISCO = timezone(timedelta(hours=-7))

_EVENTS = (
    ("Waterfront sunset walk", 18, "A guided waterfront walk begins near {name}."),
    ("Neighborhood trivia night", 19, "A casual neighborhood trivia night is happening at {name}."),
    ("Bay-view photo meetup", 19, "A photo meetup gathers at {name} for bay views."),
    ("Local makers pop-up", 20, "A small local makers pop-up is on tonight at {name}."),
    ("Evening art conversation", 21, "An informal art conversation is scheduled at {name}."),
)

_CAPTIONS = (
    "Golden-hour colors made this stop worth the walk.",
    "A favorite little city view from today.",
    "Found a calm moment between the downtown rush.",
    "Waterfront light and a breezy afternoon.",
    "Saving this perspective for the next visit.",
    "A quick detour with a surprisingly great backdrop.",
    "City textures, open sky, and a good long walk.",
    "One of those corners that photographs itself.",
    "A pause here made the whole route better.",
    "The view was even better in person.",
    "An easy place to linger with a camera.",
    "Tonight's walk came with a postcard-worthy scene.",
)


def load_fixtures(store: Store, now: datetime | None = None) -> dict[str, int]:
    """Replace the complete fixture feed and return counts written to ``store``."""
    fetched_at = _as_utc(now or datetime.now(UTC))
    landmarks = _load_landmarks()
    busyness_by_place = {
        landmark["place_id"]: random.randint(20, 90) for landmark in landmarks
    }

    # FakeStore has no upsert behavior. Replacing this worker's complete fixture
    # feed before adding records keeps both supported Store backends idempotent.
    store.delete_where(INDEX_NAME, FIXTURE_FILTER)

    landmark_docs = [
        _landmark_doc(landmark, fetched_at, busyness_by_place[landmark["place_id"]])
        for landmark in landmarks
    ]
    store.add_docs(INDEX_NAME, landmark_docs)
    for place_id, busyness_pct in busyness_by_place.items():
        store.update_metadata(
            INDEX_NAME,
            place_id,
            {"busyness_pct": busyness_pct, "busyness_at": fetched_at},
        )

    photogenic = [landmark for landmark in landmarks if landmark["photogenic"]]
    event_docs = _event_docs(photogenic, fetched_at, busyness_by_place)
    caption_docs = _caption_docs(photogenic, fetched_at, busyness_by_place)
    store.add_docs(INDEX_NAME, event_docs + caption_docs)

    return {
        "landmarks": len(landmark_docs),
        "events": len(event_docs),
        "captions": len(caption_docs),
    }


def _load_landmarks() -> list[dict[str, Any]]:
    with _LANDMARKS_PATH.open(encoding="utf-8") as landmarks_file:
        return json.load(landmarks_file)


def _landmark_doc(landmark: dict[str, Any], fetched_at: str, busyness_pct: int) -> dict:
    return {
        "text": f"{landmark['name']} is a SideQuest stop in San Francisco.",
        "metadata": _metadata(landmark, fetched_at, busyness_pct),
    }


def _event_docs(
    photogenic: list[dict[str, Any]], fetched_at: str, busyness_by_place: dict[str, int]
) -> list[dict]:
    tonight = datetime.fromisoformat(fetched_at).astimezone(_SAN_FRANCISCO).date()
    docs = []
    for event_number, (title, hour, description) in enumerate(_EVENTS):
        landmark = photogenic[event_number]
        event_time = datetime.combine(tonight, time(hour), tzinfo=_SAN_FRANCISCO).astimezone(UTC)
        metadata = _metadata(landmark, fetched_at, busyness_by_place[landmark["place_id"]])
        metadata.update({"kind": "event", "event_time": _as_utc(event_time), "heat_score": 6})
        docs.append({"text": f"Event: {title}. {description.format(name=landmark['name'])}", "metadata": metadata})
    return docs


def _caption_docs(
    photogenic: list[dict[str, Any]], fetched_at: str, busyness_by_place: dict[str, int]
) -> list[dict]:
    docs = []
    for caption_number, caption in enumerate(_CAPTIONS):
        landmark = photogenic[caption_number % len(photogenic)]
        metadata = _metadata(landmark, fetched_at, busyness_by_place[landmark["place_id"]])
        metadata.update({"kind": "caption", "heat_score": caption_number % 10 + 1})
        docs.append({"text": f"Instagram-style caption about {landmark['name']}: {caption}", "metadata": metadata})
    return docs


def _metadata(landmark: dict[str, Any], fetched_at: str, busyness_pct: int) -> dict:
    return {
        **landmark,
        "busyness_pct": busyness_pct,
        "busyness_at": fetched_at,
        "heat_score": 1,
        "open_now": True,
        "event_time": None,
        "lang": "en",
        "source": "fixture",
        "fetched_at": fetched_at,
        "is_fixture": True,
    }


def _as_utc(value: datetime) -> str:
    return value.astimezone(UTC).isoformat().replace("+00:00", "Z")
