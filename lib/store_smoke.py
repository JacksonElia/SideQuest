"""Manual smoke check for the real Moss-backed Store."""

from __future__ import annotations

import json
import os
import sys

from dotenv import load_dotenv

from lib.store import MossStore


INDEX_NAME = "smoke-test"


def main() -> int:
    load_dotenv()
    if not os.getenv("MOSS_PROJECT_ID") or not os.getenv("MOSS_PROJECT_KEY"):
        print(
            "Missing Moss credentials: set MOSS_PROJECT_ID and MOSS_PROJECT_KEY in .env.",
            file=sys.stderr,
        )
        return 1

    store = MossStore()
    store.add_docs(
        INDEX_NAME,
        [
            {
                "text": "The smoke test gallery has a quiet art exhibit.",
                "metadata": {"place_id": "smoke-gallery", "kind": "gallery"},
            },
            {
                "text": "The smoke test park has a sunny lawn.",
                "metadata": {"place_id": "smoke-park", "kind": "park"},
            },
            {
                "text": "The smoke test cafe serves morning coffee.",
                "metadata": {"place_id": "smoke-cafe", "kind": "cafe"},
            },
        ],
    )
    results = store.search(INDEX_NAME, "quiet art gallery")
    print(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
