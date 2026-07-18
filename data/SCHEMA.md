# SideQuest chunk schema

Every document indexed in `sidequest-places` has a prose `text` field and the
following metadata. Conditions and numeric values stay in metadata so they can
be filtered without changing the embedded text.

| Field | Type | Description |
| --- | --- | --- |
| `place_id` | string | Stable slug identifying the place. |
| `name` | string | Display name for the place. |
| `lat` | float | Latitude in WGS 84 decimal degrees. |
| `lng` | float | Longitude in WGS 84 decimal degrees. |
| `kind` | string | Place or document category, such as `park`, `landmark`, `restaurant`, or `event`. |
| `indoor` | boolean | Whether the experience is primarily indoors. |
| `viewpoint` | boolean | Whether the place has a notable view. |
| `photogenic` | boolean | Whether the place is suitable for photography-oriented retrieval. |
| `wind_exposed` | boolean | Whether the place is notably exposed to wind. |
| `busyness_pct` | integer (0-100) | Current or estimated busyness percentage. |
| `busyness_at` | ISO 8601 UTC string | Time at which `busyness_pct` was measured. |
| `heat_score` | integer (1-10) | Social activity score. |
| `open_now` | boolean | Whether the place is currently open. |
| `event_time` | ISO 8601 UTC string or null | Scheduled event start time, when applicable. |
| `lang` | string | Content language code, currently `en` or `es`. |
| `source` | string | Source feed, such as `wikipedia`, `reddit`, `instagram`, or `fixture`. |
| `fetched_at` | ISO 8601 UTC string | Time the source content was retrieved. |
| `is_fixture` | boolean | `true` for fixture content and `false` for verified real content. |

## Example chunk

```json
{
  "text": "South Park is a leafy public square in SoMa.",
  "metadata": {
    "place_id": "south-park",
    "name": "South Park",
    "lat": 37.7804,
    "lng": -122.3934,
    "kind": "park",
    "indoor": false,
    "viewpoint": false,
    "photogenic": true,
    "wind_exposed": false,
    "busyness_pct": 42,
    "busyness_at": "2026-07-18T18:00:00Z",
    "heat_score": 7,
    "open_now": true,
    "event_time": null,
    "lang": "en",
    "source": "wikipedia",
    "fetched_at": "2026-07-18T18:00:00Z",
    "is_fixture": false
  }
}
```
