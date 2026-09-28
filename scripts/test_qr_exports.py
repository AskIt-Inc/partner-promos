#!/usr/bin/env python3
"""Decode generated QR payloads and representative exported card crops."""

import argparse
import io
import json
import re
import sys
import urllib.parse
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "index.html"
FIXTURES = Path(__file__).with_name("qr_export_fixtures.json")
QR_ENDPOINT = "https://api.qrserver.com/v1/create-qr-code/"
QR_QUERY = "size=250x250&format=png&ecc=M&qzone=4&margin=0"


def require_dependencies():
    try:
        from PIL import Image, ImageOps
        import zxingcpp
    except ImportError as error:
        raise SystemExit(
            "QR verification requires Pillow and zxing-cpp; install with "
            "python -m pip install Pillow zxing-cpp"
        ) from error
    return Image, ImageOps, zxingcpp


def read_qr(image, zxingcpp):
    results = zxingcpp.read_barcodes(image)
    return [result.text for result in results if result.text]


def fetch_qr(url, Image, zxingcpp):
    request = urllib.request.Request(url, headers={"User-Agent": "partner-promos-qr-test/1.0"})
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = response.read()
    with Image.open(io.BytesIO(payload)) as image:
        decoded = read_qr(image.convert("RGB"), zxingcpp)
        return image.size, decoded


def verify_source_contract(source):
    assert QR_QUERY in source, "index.html must keep the tested QR generator settings"
    assert "encodeURIComponent(value)" in source, "QR payload must be URL-encoded without changing its value"
    assert "getSessionRegistrationQrSrc(row, canonicalRegistrationUrl)" in source, (
        "session cards must generate QR codes from the registration payload helper"
    )
    assert "getApprovedRegistrationShortUrl(row.qr_payload_url || row.short_url)" in source, (
        "session cards must prefer a compact first-party short URL for QR payloads"
    )
    assert "isCanonicalTrackedRegistrationUrl(canonicalUrl)" in source, (
        "canonical tracked registration URLs must use the generated QR path"
    )


def verify_rendered_pngs(png_dir, fixture, Image, ImageOps, zxingcpp):
    for filename, crop_box in fixture.get("rendered_pngs", {}).items():
        path = png_dir / filename
        if not path.exists():
            raise AssertionError(f"missing rendered QR fixture: {path}")
        with Image.open(path) as image:
            width, height = image.size
            assert width > 0 and height > 0, f"invalid exported dimensions: {path}"
            x, y, crop_width, crop_height = crop_box
            crop = image.convert("RGB").crop((x, y, x + crop_width, y + crop_height))
            dark_pixels = [
                (px, py)
                for py in range(crop.height)
                for px in range(crop.width)
                if max(crop.getpixel((px, py))) < 40
            ]
            assert dark_pixels, f"{path.name} has no QR dark modules"
            min_x = min(px for px, _ in dark_pixels)
            max_x = max(px for px, _ in dark_pixels)
            min_y = min(py for _, py in dark_pixels)
            max_y = max(py for _, py in dark_pixels)
            assert min_x >= 8 and min_y >= 8, f"{path.name} is missing a visible quiet zone"
            assert crop.width - max_x - 1 >= 8 and crop.height - max_y - 1 >= 8, (
                f"{path.name} is missing a visible quiet zone"
            )
            assert min(max_x - min_x + 1, max_y - min_y + 1) >= 200, (
                f"{path.name} QR modules are too small in the native export"
            )
            module_colors = {
                crop.getpixel((px, py))
                for py in range(min_y, max_y + 1)
                for px in range(min_x, max_x + 1)
            }
            assert module_colors <= {(0, 0, 0), (255, 255, 255)}, (
                f"{path.name} QR modules contain antialiased/interpolated colors"
            )
            padded = ImageOps.expand(crop, border=max(12, crop_width // 20), fill="white")
            decoded = read_qr(padded, zxingcpp)
            if fixture["url"] not in decoded:
                enlarged = padded.resize((padded.width * 2, padded.height * 2), Image.Resampling.NEAREST)
                decoded = read_qr(enlarged, zxingcpp)
            assert fixture["url"] in decoded, (
                f"{path.name} did not decode to the canonical fixture URL; decoded={decoded}"
            )
        print(f"decoded rendered {path.name}: {width}x{height}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--png-dir", type=Path, help="also decode rendered PNG crops from this directory")
    args = parser.parse_args()

    Image, ImageOps, zxingcpp = require_dependencies()
    source = SOURCE.read_text(encoding="utf-8")
    verify_source_contract(source)
    fixtures = json.loads(FIXTURES.read_text(encoding="utf-8"))

    for fixture in fixtures:
        value = fixture["url"]
        if "compact first-party" in fixture["name"]:
            assert len(value) < 100, "compact QR payload must remain short"
            assert urllib.parse.urlparse(value).path.startswith("/s/"), (
                "compact QR payload must use the first-party short-link route"
            )
            assert urllib.parse.urlparse(value).query == "", (
                "compact QR payload must not repeat attribution query values"
            )
        qr_url = QR_ENDPOINT + "?" + QR_QUERY + "&data=" + urllib.parse.quote(value, safe="")
        size, decoded = fetch_qr(qr_url, Image, zxingcpp)
        assert value in decoded, f"{fixture['name']} decoded incorrectly: {decoded}"
        print(f"decoded {fixture['name']}: {size[0]}x{size[1]} -> exact URL ({len(value)} chars)")
        if args.png_dir and fixture.get("rendered_pngs"):
            verify_rendered_pngs(args.png_dir, fixture, Image, ImageOps, zxingcpp)


if __name__ == "__main__":
    try:
        main()
    except (AssertionError, urllib.error.URLError, TimeoutError) as error:
        print(f"QR verification failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
