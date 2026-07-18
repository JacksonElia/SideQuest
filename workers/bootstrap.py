"""Load Wikipedia summaries for landmarks into the SideQuest places index."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote

import httpx

from lib.store import Store


INDEX_NAME = "sidequest-places"
WIKIPEDIA_EXTRACT_URL = (
    "https://en.wikipedia.org/w/api.php?action=query&prop=extracts&explaintext=1"
    "&format=json&redirects=1&titles={}"
)
CHUNK_SIZE_TOKENS = 300
LANDMARKS_PATH = Path(__file__).resolve().parents[1] / "data" / "landmarks.json"


def _chunk_text(text: str, chunk_size: int = CHUNK_SIZE_TOKENS) -> list[str]:
    """Split text into word-based chunks of approximately ``chunk_size`` tokens."""
    words = text.split()
    return [" ".join(words[start : start + chunk_size]) for start in range(0, len(words), chunk_size)]


def _fetched_at() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _metadata(place: dict, fetched_at: str) -> dict:
    """Build the complete SideQuest metadata record for a Wikipedia chunk."""
    return {
        "place_id": place["place_id"],
        "name": place["name"],
        "lat": place["lat"],
        "lng": place["lng"],
        "kind": place["kind"],
        "indoor": place["indoor"],
        "viewpoint": place["viewpoint"],
        "photogenic": place["photogenic"],
        "wind_exposed": place["wind_exposed"],
        "busyness_pct": 0,
        "busyness_at": fetched_at,
        "heat_score": 1,
        "open_now": True,
        "event_time": None,
        "lang": "en",
        "source": "wikipedia",
        "fetched_at": fetched_at,
        "is_fixture": False,
    }


def main() -> int:
    """Fetch, replace, and index one Wikipedia summary per configured landmark."""
    places = json.loads(LANDMARKS_PATH.read_text(encoding="utf-8"))
    store = Store.create()

    with httpx.Client(
        timeout=15.0,
        follow_redirects=True,
        headers={"User-Agent": "SideQuest/1.0 (hackathon project; contact: dongm5858@gmail.com)"},
    ) as client:
        for place in places:
            try:
                response = client.get(WIKIPEDIA_EXTRACT_URL.format(quote(place["name"], safe="")))
                if response.status_code == httpx.codes.NOT_FOUND:
                    print(f"{place['place_id']}: skipped (Wikipedia page not found)")
                    continue
                response.raise_for_status()

                pages = response.json().get("query", {}).get("pages", {})
                extract = next(
                    (page.get("extract", "") for page in pages.values()), ""
                ).strip()
                chunks = _chunk_text(extract)
                if not chunks:
                    print(f"{place['place_id']}: skipped (Wikipedia extract was empty)")
                    continue

                fetched_at = _fetched_at()
                docs = [
                    {"text": chunk, "metadata": _metadata(place, fetched_at)}
                    for chunk in chunks
                ]
                store.delete_where(
                    INDEX_NAME,
                    {"place_id": place["place_id"], "source": "wikipedia", "is_fixture": False},
                )
                store.add_docs(INDEX_NAME, docs)
                print(f"{place['place_id']}: indexed {len(docs)} Wikipedia chunk(s)")
            except (httpx.HTTPError, ValueError, KeyError) as error:
                print(f"{place.get('place_id', 'unknown')}: skipped ({type(error).__name__})", file=sys.stderr)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
