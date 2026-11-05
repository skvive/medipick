"""Fail-closed, dependency-free helpers for HIRA coordinate reconciliation.

This module NEVER proves that a user-supplied file is an official HIRA extract.
Origin and snapshot date must be independently checked by an operator.
No database calls or external requests are performed here.
"""
from __future__ import annotations

import hashlib
import hmac
import json
import re
import unicodedata
from pathlib import Path

OFFICIAL_SOURCE_PAGES = frozenset({
    "https://www.data.go.kr/data/15051059/fileData.do",
    "https://opendata.hira.or.kr/op/opc/selectOpenData.do?sno=11925",
})

PROVINCE_ALIASES = {
    "서울특별시": "서울", "서울": "서울",
    "부산광역시": "부산", "부산": "부산",
    "대구광역시": "대구", "대구": "대구",
    "인천광역시": "인천", "인천": "인천",
    "광주광역시": "광주", "광주": "광주",
    "대전광역시": "대전", "대전": "대전",
    "울산광역시": "울산", "울산": "울산",
    "세종특별자치시": "세종", "세종": "세종",
    "경기도": "경기", "경기": "경기",
    "강원도": "강원", "강원특별자치도": "강원", "강원": "강원",
    "충청북도": "충북", "충북": "충북", "충청남도": "충남", "충남": "충남",
    "전라북도": "전북", "전북특별자치도": "전북", "전북": "전북",
    "전라남도": "전남", "전남": "전남",
    "경상북도": "경북", "경북": "경북", "경상남도": "경남", "경남": "경남",
    "제주도": "제주", "제주특별자치도": "제주", "제주": "제주",
})


def _clean(value: object) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).strip()


def norm_name(value: object) -> str:
    return re.sub(r"\s+", "", _clean(value)).lower()


def road_key(address: object) -> str:
    # A road/building-number match, not a fuzzy address or geocode match.
    match = re.search(r"([가-힣0-9·-]+(?:대로|로|길))\s*(\d+(?:-\d+)?)\b", _clean(address))
    return (match.group(1) + match.group(2)).lower() if match else ""


def locality_key(address: object) -> str:
    """Include province and city/district to avoid Seoul 중구 vs Busan 중구 collisions."""
    tokens = _clean(address).replace(",", " ").split()
    if not tokens:
        return ""
    province = PROVINCE_ALIASES.get(tokens[0], "")
    if not province:
        return ""  # Unrecognized/missing region must never be guessed.
    if province == "세종":
        return "세종"
    city = next((token for token in tokens[1:5] if token.endswith("시") and len(token) > 2), "")
    district = next((token for token in tokens[1:5] if token.endswith(("구", "군")) and len(token) > 1), "")
    if not city and not district:
        return ""
    return "|".join(part for part in (province, city, district) if part)


def row_key(name: object, address: object) -> tuple[str, str, str] | None:
    result = (norm_name(name), road_key(address), locality_key(address))
    return result if all(result) else None


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def valid_sha256(value: str) -> bool:
    return re.fullmatch(r"[0-9a-fA-F]{64}", value or "") is not None


def attest_official_source(source_path: Path, expected_sha256: str, page_url: str) -> str:
    """Check operator-provided provenance references, NOT the origin of downloaded bytes."""
    if page_url not in OFFICIAL_SOURCE_PAGES:
        raise ValueError("Official HIRA source page must be one of the allowed canonical URLs")
    if not valid_sha256(expected_sha256):
        raise ValueError("A reviewed 64-character SHA-256 of the source is required")
    actual = sha256_file(source_path)
    if not hmac.compare_digest(actual, expected_sha256.lower()):
        raise ValueError("Source SHA-256 mismatch: refuse to apply")
    return actual


def reviewed_plan_equals(path: Path, reviewed_sha256: str, proposals: list[dict]) -> bool:
    if not valid_sha256(reviewed_sha256):
        return False
    if not path.is_file() or not hmac.compare_digest(sha256_file(path), reviewed_sha256.lower()):
        return False
    content = b"".join(
        (json.dumps(record, ensure_ascii=False) + "\n").encode("utf-8") for record in proposals
    )
    return hmac.compare_digest(path.read_bytes(), content)


def filter_unique_source_keys(rows: list[tuple[tuple[str, str, str], dict]]) -> tuple[list[dict], int]:
    """Remove *all* entries with a repeated key, even identical-coordinate duplicates."""
    counts: dict[tuple[str, str, str], int] = {}
    for key, _ in rows:
        counts[key] = counts.get(key, 0) + 1
    return [record for key, record in rows if counts[key] == 1], sum(1 for key, _ in rows if counts[key] > 1)
