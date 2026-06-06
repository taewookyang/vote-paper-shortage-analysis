"""Build a compact, projected Songpa-gu administrative-dong map for the dashboard."""
from __future__ import annotations

import json
import math
import tempfile
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VERSION = "20260401"
SOURCE_URL = (
    "https://raw.githubusercontent.com/vuski/admdongkor/master/"
    f"ver{VERSION}/HangJeongDong_ver{VERSION}.geojson"
)
OUTPUTS = [
    ROOT / "data" / "processed" / "dashboard" / "songpa_boundaries_2026.json",
    ROOT / "dashboard" / "public" / "data" / "songpa_boundaries_2026.json",
]
WIDTH = 620
HEIGHT = 500
PADDING = 14


def load_source() -> dict:
    cache = Path(tempfile.gettempdir()) / f"HangJeongDong_ver{VERSION}.geojson"
    if not cache.exists():
        print(f"Downloading {SOURCE_URL}")
        urllib.request.urlretrieve(SOURCE_URL, cache)
    return json.loads(cache.read_text(encoding="utf-8"))


def iter_rings(geometry: dict):
    coordinates = geometry["coordinates"]
    if geometry["type"] == "Polygon":
        yield from coordinates
    elif geometry["type"] == "MultiPolygon":
        for polygon in coordinates:
            yield from polygon
    else:
        raise ValueError(f"Unsupported geometry type: {geometry['type']}")


def projected_point(point: list[float], mean_latitude: float) -> tuple[float, float]:
    longitude, latitude = point
    return longitude * math.cos(math.radians(mean_latitude)), latitude


def ring_centroid(ring: list[tuple[float, float]]) -> tuple[float, float, float]:
    twice_area = 0.0
    centroid_x = 0.0
    centroid_y = 0.0
    for index, (x1, y1) in enumerate(ring):
        x2, y2 = ring[(index + 1) % len(ring)]
        cross = x1 * y2 - x2 * y1
        twice_area += cross
        centroid_x += (x1 + x2) * cross
        centroid_y += (y1 + y2) * cross
    if abs(twice_area) < 1e-12:
        return ring[0][0], ring[0][1], 0.0
    return (
        centroid_x / (3 * twice_area),
        centroid_y / (3 * twice_area),
        twice_area / 2,
    )


def build_payload(source: dict) -> dict:
    songpa = [
        feature
        for feature in source["features"]
        if feature.get("properties", {}).get("adm_nm", "").startswith("서울특별시 송파구 ")
    ]
    if len(songpa) != 27:
        raise ValueError(f"Expected 27 Songpa dongs, found {len(songpa)}")

    latitudes = [
        point[1]
        for feature in songpa
        for ring in iter_rings(feature["geometry"])
        for point in ring
    ]
    mean_latitude = sum(latitudes) / len(latitudes)
    projected = [
        projected_point(point, mean_latitude)
        for feature in songpa
        for ring in iter_rings(feature["geometry"])
        for point in ring
    ]
    min_x = min(point[0] for point in projected)
    max_x = max(point[0] for point in projected)
    min_y = min(point[1] for point in projected)
    max_y = max(point[1] for point in projected)
    scale = min(
        (WIDTH - PADDING * 2) / (max_x - min_x),
        (HEIGHT - PADDING * 2) / (max_y - min_y),
    )
    offset_x = (WIDTH - (max_x - min_x) * scale) / 2
    offset_y = (HEIGHT - (max_y - min_y) * scale) / 2

    def screen(point: list[float]) -> tuple[float, float]:
        x, y = projected_point(point, mean_latitude)
        return (
            offset_x + (x - min_x) * scale,
            HEIGHT - offset_y - (y - min_y) * scale,
        )

    features = []
    for feature in songpa:
        paths = []
        centroid_parts = []
        for ring in iter_rings(feature["geometry"]):
            screen_ring = [screen(point) for point in ring]
            if len(screen_ring) < 3:
                continue
            paths.append(
                "M"
                + " L".join(f"{x:.1f},{y:.1f}" for x, y in screen_ring)
                + " Z"
            )
            centroid_parts.append(ring_centroid(screen_ring))

        outer_parts = [part for part in centroid_parts if part[2] > 0] or centroid_parts
        weight = sum(abs(part[2]) for part in outer_parts) or 1
        centroid = [
            round(sum(part[0] * abs(part[2]) for part in outer_parts) / weight, 1),
            round(sum(part[1] * abs(part[2]) for part in outer_parts) / weight, 1),
        ]
        properties = feature["properties"]
        features.append(
            {
                "name": properties["adm_nm"].split()[-1],
                "code": properties["adm_cd2"],
                "path": " ".join(paths),
                "centroid": centroid,
            }
        )

    return {
        "viewBox": f"0 0 {WIDTH} {HEIGHT}",
        "source": {
            "repository": "https://github.com/vuski/admdongkor",
            "sourceUrl": SOURCE_URL,
            "version": VERSION,
            "attribution": "vuski/admdongkor, 통계청 SGIS 기반",
        },
        "features": sorted(features, key=lambda item: item["name"]),
    }


def main() -> None:
    payload = build_payload(load_source())
    for output in OUTPUTS:
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"Wrote {output.relative_to(ROOT)}")
    print(f"Songpa features: {len(payload['features'])}")


if __name__ == "__main__":
    main()
