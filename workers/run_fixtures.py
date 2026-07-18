"""Run the local SideQuest fixture worker."""

from __future__ import annotations

from lib.store import Store
from workers.fixtures import load_fixtures


def main() -> None:
    counts = load_fixtures(Store.create())
    print(
        "fixture cycle: "
        f"landmarks={counts['landmarks']} events={counts['events']} captions={counts['captions']}"
    )


if __name__ == "__main__":
    main()
