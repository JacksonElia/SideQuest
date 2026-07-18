import pytest

from lib.store import FakeStore, Store


@pytest.fixture
def store():
    fake = FakeStore()
    fake.add_docs(
        "places",
        [
            {
                "text": "South Park has sunny lawns and coffee nearby.",
                "metadata": {"place_id": "south-park", "lat": 37.7800, "lng": -122.3930, "indoor": False},
            },
            {
                "text": "A quiet indoor gallery has contemporary art.",
                "metadata": {"place_id": "gallery", "lat": 37.7810, "lng": -122.3940, "indoor": True},
            },
            {
                "text": "Oracle Park hosts baseball games.",
                "metadata": {"place_id": "oracle-park", "lat": 37.7780, "lng": -122.3890, "indoor": False},
            },
        ],
    )
    return fake


def test_search_ranks_keyword_overlap(store):
    results = store.search("places", "quiet art gallery")

    assert [result["metadata"]["place_id"] for result in results] == ["gallery", "south-park", "oracle-park"]
    assert results[0]["score"] > results[1]["score"]


def test_search_applies_radius_and_exact_metadata_filters(store):
    results = store.search(
        "places",
        "park gallery",
        lat=37.7800,
        lng=-122.3930,
        radius_m=150,
        filters={"indoor": True},
    )

    assert [result["metadata"]["place_id"] for result in results] == ["gallery"]


def test_update_metadata_and_delete_where(store):
    store.update_metadata("places", "south-park", {"busyness_pct": 35})

    updated = store.search("places", "south park", filters={"busyness_pct": 35})
    assert updated[0]["metadata"]["place_id"] == "south-park"

    store.delete_where("places", {"indoor": True})
    assert [result["metadata"]["place_id"] for result in store.search("places", "gallery")] == ["south-park", "oracle-park"]


def test_factory_defaults_to_fake(monkeypatch):
    monkeypatch.delenv("STORE_BACKEND", raising=False)

    assert isinstance(Store.create(), FakeStore)
