"""A small storage boundary around Moss and its in-memory test double."""

from __future__ import annotations

import asyncio
import copy
import json
import math
import os
import re
import time
import uuid
from abc import ABC, abstractmethod
from typing import Any

from dotenv import load_dotenv
from moss import DocumentInfo, GetDocumentsOptions, MossClient, MutationOptions, QueryOptions


Document = dict[str, Any]
SearchResult = dict[str, Any]
_TOKEN_PATTERN = re.compile(r"\b\w+\b")


class Store(ABC):
    """Interface shared by the production and in-memory storage backends."""

    @abstractmethod
    def add_docs(self, index_name: str, docs: list[Document]) -> None:
        """Add documents shaped as ``{'text': str, 'metadata': dict}``."""

    @abstractmethod
    def search(
        self,
        index_name: str,
        query_text: str,
        lat: float | None = None,
        lng: float | None = None,
        radius_m: float | None = None,
        filters: dict | None = None,
        top_k: int = 5,
    ) -> list[SearchResult]:
        """Return matching documents as text, score, and metadata."""

    @abstractmethod
    def update_metadata(self, index_name: str, place_id: str, updates: dict) -> None:
        """Apply metadata updates to every document for ``place_id``."""

    @abstractmethod
    def delete_where(self, index_name: str, filters: dict) -> None:
        """Delete every document whose metadata exactly matches ``filters``."""

    @classmethod
    def create(cls, backend: str | None = None) -> Store:
        """Build the configured backend, defaulting to the in-memory store."""
        selected_backend = (backend or os.getenv("STORE_BACKEND", "fake")).lower()
        if selected_backend == "fake":
            return FakeStore()
        if selected_backend == "moss":
            return MossStore()
        raise ValueError(f"Unsupported STORE_BACKEND: {selected_backend}")


class FakeStore(Store):
    """In-memory Store used for deterministic unit tests and local plumbing."""

    def __init__(self) -> None:
        self._indexes: dict[str, list[Document]] = {}

    def add_docs(self, index_name: str, docs: list[Document]) -> None:
        index = self._indexes.setdefault(index_name, [])
        index.extend(copy.deepcopy(docs))

    def search(
        self,
        index_name: str,
        query_text: str,
        lat: float | None = None,
        lng: float | None = None,
        radius_m: float | None = None,
        filters: dict | None = None,
        top_k: int = 5,
    ) -> list[SearchResult]:
        query_terms = _tokens(query_text)
        matches: list[SearchResult] = []
        for doc in self._indexes.get(index_name, []):
            metadata = doc["metadata"]
            if not _matches_filters(metadata, filters):
                continue
            if not _within_radius(metadata, lat, lng, radius_m):
                continue
            score = float(len(query_terms & _tokens(doc["text"])))
            matches.append(
                {
                    "text": doc["text"],
                    "score": score,
                    "metadata": copy.deepcopy(metadata),
                }
            )
        matches.sort(key=lambda result: result["score"], reverse=True)
        return matches[:top_k]

    def update_metadata(self, index_name: str, place_id: str, updates: dict) -> None:
        for doc in self._indexes.get(index_name, []):
            if doc["metadata"].get("place_id") == place_id:
                doc["metadata"].update(copy.deepcopy(updates))

    def delete_where(self, index_name: str, filters: dict) -> None:
        self._indexes[index_name] = [
            doc
            for doc in self._indexes.get(index_name, [])
            if not _matches_filters(doc["metadata"], filters)
        ]


class MossStore(Store):
    """Synchronous Store wrapper around the real Moss SDK."""

    def __init__(self) -> None:
        load_dotenv()
        project_id = os.getenv("MOSS_PROJECT_ID")
        project_key = os.getenv("MOSS_PROJECT_KEY")
        if not project_id or not project_key:
            raise ValueError("MOSS_PROJECT_ID and MOSS_PROJECT_KEY must be set in .env")
        self._client = MossClient(project_id, project_key)
        self._loaded_indexes: set[str] = set()

    def load_index(self, index_name: str) -> bool:
        """Load an existing index once so later queries stay on the hot path."""
        if index_name in self._loaded_indexes:
            return True
        if not self._ensure_index(index_name):
            return False
        _run(self._client.load_index(index_name))
        self._loaded_indexes.add(index_name)
        return True

    def add_docs(self, index_name: str, docs: list[Document]) -> None:
        moss_docs = [self._to_moss_doc(index_name, doc) for doc in docs]
        existed = self._ensure_index(index_name, moss_docs)
        if moss_docs and existed:
            _run(self._client.add_docs(index_name, moss_docs, MutationOptions(upsert=True)))

    def search(
        self,
        index_name: str,
        query_text: str,
        lat: float | None = None,
        lng: float | None = None,
        radius_m: float | None = None,
        filters: dict | None = None,
        top_k: int = 5,
    ) -> list[SearchResult]:
        if not self.load_index(index_name):
            return []
        candidate_count = max(top_k, 100) if filters or radius_m is not None else top_k
        response = _run(self._client.query(index_name, query_text, QueryOptions(top_k=candidate_count)))
        matches = [
            {
                "text": doc.text,
                "score": float(doc.score),
                "metadata": _decode_metadata(dict(doc.metadata or {})),
            }
            for doc in response.docs
            if _matches_filters(_decode_metadata(dict(doc.metadata or {})), filters)
            and _within_radius(_decode_metadata(dict(doc.metadata or {})), lat, lng, radius_m)
        ]
        matches.sort(key=lambda result: result["score"], reverse=True)
        return matches[:top_k]

    def update_metadata(self, index_name: str, place_id: str, updates: dict) -> None:
        if not self._ensure_index(index_name):
            return
        docs = self._matching_moss_docs(index_name, {"place_id": place_id})
        changed_docs = [
            DocumentInfo(
                id=doc.id,
                text=doc.text,
                metadata=_encode_metadata({**_decode_metadata(dict(doc.metadata or {})), **updates}),
                payload=doc.payload,
            )
            for doc in docs
        ]
        if changed_docs:
            _run(self._client.add_docs(index_name, changed_docs, MutationOptions(upsert=True)))

    def delete_where(self, index_name: str, filters: dict) -> None:
        if not self._ensure_index(index_name):
            return
        doc_ids = [doc.id for doc in self._matching_moss_docs(index_name, filters)]
        if doc_ids:
            _run(self._client.delete_docs(index_name, doc_ids))

    def _ensure_index(self, index_name: str, docs: list[DocumentInfo] | None = None) -> bool:
        """Return whether the index exists, creating it from supplied documents if missing."""
        try:
            _run(self._client.get_index(index_name))
            return True
        except RuntimeError as error:
            if "INDEX_NOT_FOUND" not in str(error).upper():
                raise
            if not docs:
                return False
            _run(self._client.create_index(index_name, docs or []))
            self._wait_until_ready(index_name)
            return False

    def _matching_moss_docs(self, index_name: str, filters: dict) -> list[DocumentInfo]:
        docs = _run(self._client.get_docs(index_name, GetDocumentsOptions()))
        return [doc for doc in docs if _matches_filters(_decode_metadata(dict(doc.metadata or {})), filters)]

    def _wait_until_ready(self, index_name: str, timeout_s: float = 60.0) -> None:
        deadline = time.monotonic() + timeout_s
        while True:
            status = _run(self._client.get_index(index_name)).status
            if status == "Ready":
                return
            if status == "Failed":
                raise RuntimeError(f"Moss index '{index_name}' failed to build")
            if time.monotonic() >= deadline:
                raise TimeoutError(f"Moss index '{index_name}' was not Ready within {timeout_s:.0f}s")
            time.sleep(1)

    @staticmethod
    def _to_moss_doc(index_name: str, doc: Document) -> DocumentInfo:
        text = doc["text"]
        metadata = dict(doc["metadata"])
        doc_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{index_name}:{metadata.get('place_id', '')}:{text}"))
        return DocumentInfo(id=doc_id, text=text, metadata=_encode_metadata(metadata))


def _tokens(text: str) -> set[str]:
    return set(_TOKEN_PATTERN.findall(text.lower()))


def _matches_filters(metadata: dict, filters: dict | None) -> bool:
    return not filters or all(metadata.get(key) == value for key, value in filters.items())


def _encode_metadata(metadata: dict) -> dict[str, str]:
    return {key: json.dumps(value, separators=(",", ":")) for key, value in metadata.items()}


def _decode_metadata(metadata: dict[str, str]) -> dict:
    decoded: dict = {}
    for key, value in metadata.items():
        try:
            decoded[key] = json.loads(value)
        except (TypeError, json.JSONDecodeError):
            decoded[key] = value
    return decoded


def _within_radius(
    metadata: dict,
    lat: float | None,
    lng: float | None,
    radius_m: float | None,
) -> bool:
    if radius_m is None:
        return True
    if lat is None or lng is None:
        raise ValueError("lat and lng are required when radius_m is set")
    if "lat" not in metadata or "lng" not in metadata:
        return False
    return _haversine_m(lat, lng, float(metadata["lat"]), float(metadata["lng"])) <= radius_m


def _haversine_m(lat_a: float, lng_a: float, lat_b: float, lng_b: float) -> float:
    earth_radius_m = 6_371_000
    lat_delta = math.radians(lat_b - lat_a)
    lng_delta = math.radians(lng_b - lng_a)
    a = (
        math.sin(lat_delta / 2) ** 2
        + math.cos(math.radians(lat_a))
        * math.cos(math.radians(lat_b))
        * math.sin(lng_delta / 2) ** 2
    )
    return 2 * earth_radius_m * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _run(coroutine: Any) -> Any:
    """Run an SDK coroutine from this intentionally synchronous interface."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coroutine)
    raise RuntimeError("MossStore's synchronous interface cannot run inside an event loop")
