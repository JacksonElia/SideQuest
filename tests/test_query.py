from agent import query as query_module
from lib.store import FakeStore


def test_query_applies_context_filters_radius_and_deduplicates(monkeypatch):
    store = FakeStore()
    store.add_docs(
        "sidequest-places",
        [
            {
                "text": "quiet park with a garden",
                "metadata": {
                    "place_id": "park",
                    "lat": 37.7800,
                    "lng": -122.3930,
                    "indoor": False,
                    "lang": "en",
                    "busyness_pct": 20,
                },
            },
            {
                "text": "quiet park",
                "metadata": {
                    "place_id": "park",
                    "lat": 37.7800,
                    "lng": -122.3930,
                    "indoor": False,
                    "lang": "en",
                    "busyness_pct": 20,
                },
            },
            {
                "text": "quiet park with crowds",
                "metadata": {
                    "place_id": "crowded-park",
                    "lat": 37.7800,
                    "lng": -122.3930,
                    "indoor": False,
                    "lang": "en",
                    "busyness_pct": "90",
                },
            },
            {
                "text": "quiet park far away",
                "metadata": {
                    "place_id": "far-park",
                    "lat": 37.8000,
                    "lng": -122.3930,
                    "indoor": False,
                    "lang": "en",
                    "busyness_pct": 10,
                },
            },
        ],
    )
    monkeypatch.setattr(query_module, "STORE", store)
    monkeypatch.setattr(
        query_module,
        "_apply_context",
        lambda constraints: ({**constraints, "max_busyness": 50}, ["rain expected"]),
    )

    result = query_module.query(
        37.7800,
        -122.3930,
        "quiet park",
        {"radius_min": 1, "indoor": False, "lang": "en"},
    )

    assert [chunk["metadata"]["place_id"] for chunk in result["chunks"]] == ["park"]
    assert result["chunks"][0]["text"] == "quiet park with a garden"
    assert result["warnings"] == ["rain expected"]
    assert result["latency_ms"] >= 0
