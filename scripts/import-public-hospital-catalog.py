#!/usr/bin/env python3
"""
Import unni CSV + med_platforms XLSX into public_hospital_stores (Neon).
Usage: set DATABASE_URL, then:
  python scripts/import-public-hospital-catalog.py
Optional:
  PUBLIC_CATALOG_GEOCODE=1  — fill district centroids via Nominatim (slow, ~1 req/s)
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

import pandas as pd
import psycopg2
from psycopg2.extras import execute_batch

ROOT = Path(__file__).resolve().parents[1]
CATALOG_DIR = ROOT / "data" / "catalog"
UNNI_CSV = Path(os.environ.get("IMPORT_UNNI_CSV", CATALOG_DIR / "unni_hospitals.csv"))
PLAT_XLSX = Path(os.environ.get("IMPORT_PLATFORMS_XLSX", CATALOG_DIR / "med_platforms_hospitals.xlsx"))

REGION_ALIASES = {
    "서울특별시": "서울",
    "부산광역시": "부산",
    "대구광역시": "대구",
    "인천광역시": "인천",
    "광주광역시": "광주",
    "대전광역시": "대전",
    "울산광역시": "울산",
    "세종특별자치시": "세종",
    "경기도": "경기",
    "강원특별자치도": "강원",
    "강원도": "강원",
    "충청북도": "충북",
    "충청남도": "충남",
    "전라북도": "전북",
    "전라남도": "전남",
    "경상북도": "경북",
    "경상남도": "경남",
    "제주특별자치도": "제주",
}


def norm_phone(p: str) -> str:
    return re.sub(r"\D", "", p or "")[:20]


def norm_name(n: str) -> str:
    return re.sub(r"\s+", "", (n or "").strip())


def parse_region_district(addr: str, region: str = "", district: str = "") -> tuple[str, str]:
    region = (region or "").strip()
    district = (district or "").strip()
    if region and district:
        region = REGION_ALIASES.get(region, region)
        return region, district
    addr = (addr or "").strip()
    if not addr:
        return region, district
    parts = addr.split()
    if len(parts) >= 2:
        r = REGION_ALIASES.get(parts[0], parts[0])
        return r, parts[1]
    return region, district


def ext_key_platform(platform: str, name: str, phone: str, url: str) -> str:
    base = f"{platform}|{norm_phone(phone)}|{norm_name(name)}|{url or ''}"
    if url:
        return f"plat:{platform}:{hashlib.sha1(url.encode()).hexdigest()[:16]}"
    return f"plat:{platform}:{hashlib.sha1(base.encode()).hexdigest()[:16]}"


def load_unni() -> list[dict]:
    if not UNNI_CSV.exists():
        print("missing", UNNI_CSV, file=sys.stderr)
        return []
    df = pd.read_csv(UNNI_CSV, encoding="utf-8-sig", dtype=str).fillna("")
    rows = []
    for _, r in df.iterrows():
        hid = str(r.get("병원ID", "")).strip()
        name = str(r.get("병원명", "")).strip()
        if not name:
            continue
        region, district = parse_region_district(
            str(r.get("주소", "")),
            str(r.get("시도", "")),
            str(r.get("시군구", "")),
        )
        rows.append(
            {
                "external_key": f"unni:{hid or hashlib.sha1(name.encode()).hexdigest()[:12]}",
                "source_platform": "강남언니",
                "name": name[:200],
                "phone": str(r.get("전화번호", ""))[:40],
                "email": str(r.get("이메일", ""))[:120],
                "address": str(r.get("주소", ""))[:500],
                "region": region[:40],
                "district": district[:60],
                "postal_code": str(r.get("우편번호", ""))[:12],
                "area_label": str(r.get("지역명", ""))[:80],
                "rating": str(r.get("평점", ""))[:20],
                "review_count": int(re.sub(r"\D", "", str(r.get("리뷰수", "") or "0")) or 0),
                "event_count": int(re.sub(r"\D", "", str(r.get("이벤트수", "") or "0")) or 0),
                "summary": str(r.get("소개", ""))[:1500],
                "profile_url": str(r.get("프로필URL", ""))[:500],
                "collection_method": str(r.get("수집방식", ""))[:80],
            }
        )
    return rows


def load_platforms() -> list[dict]:
    if not PLAT_XLSX.exists():
        print("missing", PLAT_XLSX, file=sys.stderr)
        return []
    df = pd.read_excel(PLAT_XLSX, dtype=str).fillna("")
    rows = []
    for _, r in df.iterrows():
        platform = str(r.get("플랫폼", "")).strip() or "플랫폼"
        name = str(r.get("상호", "")).strip() or str(r.get("성명", "")).strip()
        if not name:
            continue
        addr = str(r.get("주소", "")).strip()
        region, district = parse_region_district(addr)
        phone = str(r.get("연락처", "")).strip()
        url = str(r.get("URL", "")).strip()
        rows.append(
            {
                "external_key": ext_key_platform(platform, name, phone, url),
                "source_platform": platform[:80],
                "name": name[:200],
                "phone": phone[:40],
                "email": str(r.get("이메일", ""))[:120],
                "address": addr[:500],
                "region": region[:40],
                "district": district[:60],
                "postal_code": "",
                "area_label": "",
                "rating": "",
                "review_count": 0,
                "event_count": 0,
                "summary": str(r.get("비고", ""))[:1500],
                "profile_url": url[:500],
                "collection_method": str(r.get("수집방식", ""))[:80],
            }
        )
    return rows


def nominatim_district(region: str, district: str) -> tuple[float, float] | None:
    q = f"{region} {district}, South Korea"
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": q, "format": "json", "limit": 1}
    )
    req = urllib.request.Request(url, headers={"User-Agent": "MEDIPICK-catalog/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode())
        if not data:
            return None
        return float(data[0]["lat"]), float(data[0]["lon"])
    except Exception:
        return None


def jitter(name: str, lat: float, lng: float) -> tuple[float, float]:
    h = 0
    for ch in name[:40]:
        h = (h * 31 + ord(ch)) % 100000
    return lat + ((h % 100) - 50) * 0.00025, lng + ((h // 100 % 100) - 50) * 0.00025


SIDO_CENTERS: dict[str, tuple[float, float]] = {
    "서울": (37.5665, 126.9780),
    "부산": (35.1796, 129.0756),
    "대구": (35.8714, 128.6014),
    "인천": (37.4563, 126.7052),
    "광주": (35.1595, 126.8526),
    "대전": (36.3504, 127.3845),
    "울산": (35.5384, 129.3114),
    "세종": (36.4800, 127.2890),
    "경기": (37.4138, 127.5183),
    "강원": (37.8228, 128.1555),
    "충북": (36.6357, 127.4917),
    "충남": (36.5184, 126.8000),
    "전북": (35.7175, 127.1530),
    "전남": (34.8679, 126.9910),
    "경북": (36.4919, 128.8889),
    "경남": (35.4606, 128.2132),
    "제주": (33.4996, 126.5312),
}


def apply_sido_geocodes(cur) -> None:
    for region, (lat, lng) in SIDO_CENTERS.items():
        cur.execute(
            """
            INSERT INTO geo_district_cache (region, district, latitude, longitude, source, updated_at)
            VALUES (%s, '', %s, %s, 'sido_centroid', NOW())
            ON CONFLICT (region, district) DO NOTHING
            """,
            (region, lat, lng),
        )
    cur.execute(
        """
        UPDATE public_hospital_stores p
        SET latitude = g.latitude + (MOD(hashtext(p.name), 100) - 50) * 0.00035,
            longitude = g.longitude + (MOD(hashtext(p.name || COALESCE(p.phone,'')), 100) - 50) * 0.00035,
            geocode_status = 'approx',
            coordinate_source = 'sido_centroid+jitter',
            updated_at = NOW()
        FROM geo_district_cache g
        WHERE p.region = g.region AND g.district = ''
          AND (p.latitude IS NULL OR p.geocode_status = 'pending')
        """
    )


def apply_geocodes_nominatim(cur) -> None:
    cur.execute(
        """
        SELECT DISTINCT region, district FROM public_hospital_stores
        WHERE region <> '' AND district <> ''
        """
    )
    pairs = cur.fetchall()
    for region, district in pairs:
        cur.execute(
            "SELECT latitude, longitude FROM geo_district_cache WHERE region=%s AND district=%s",
            (region, district),
        )
        if cur.fetchone():
            continue
        coords = nominatim_district(region, district)
        time.sleep(1.05)
        if not coords:
            continue
        cur.execute(
            """
            INSERT INTO geo_district_cache (region, district, latitude, longitude, source, updated_at)
            VALUES (%s, %s, %s, %s, 'nominatim', NOW())
            ON CONFLICT (region, district) DO NOTHING
            """,
            (region, district, coords[0], coords[1]),
        )
    cur.execute(
        """
        UPDATE public_hospital_stores p
        SET latitude = g.latitude + (MOD(hashtext(p.name), 100) - 50) * 0.00025,
            longitude = g.longitude + (MOD(hashtext(p.name || p.phone), 100) - 50) * 0.00025,
            geocode_status = 'approx',
            coordinate_source = 'district_centroid+jitter',
            updated_at = NOW()
        FROM geo_district_cache g
        WHERE p.region = g.region AND p.district = g.district AND g.district <> ''
        """
    )


def main() -> None:
    url = os.environ.get("DATABASE_URL")
    if not url:
        print("DATABASE_URL required", file=sys.stderr)
        sys.exit(1)

    rows = load_unni() + load_platforms()
    print("parsed rows", len(rows), "unni+platforms")

    conn = psycopg2.connect(url)
    conn.autocommit = False
    cur = conn.cursor()

    sql = """
    INSERT INTO public_hospital_stores (
      external_key, source_platform, store_listing, name, phone, email, address,
      region, district, postal_code, area_label, rating, review_count, event_count,
      summary, profile_url, collection_method, geocode_status, updated_at, created_at
    ) VALUES (
      %(external_key)s, %(source_platform)s, 'listed', %(name)s, %(phone)s, %(email)s, %(address)s,
      %(region)s, %(district)s, %(postal_code)s, %(area_label)s, %(rating)s, %(review_count)s, %(event_count)s,
      %(summary)s, %(profile_url)s, %(collection_method)s, 'pending', NOW(), NOW()
    )
    ON CONFLICT (external_key) DO UPDATE SET
      name = EXCLUDED.name,
      phone = EXCLUDED.phone,
      address = EXCLUDED.address,
      region = EXCLUDED.region,
      district = EXCLUDED.district,
      summary = EXCLUDED.summary,
      profile_url = EXCLUDED.profile_url,
      updated_at = NOW()
    """

    batch_size = 500
    for i in range(0, len(rows), batch_size):
        execute_batch(cur, sql, rows[i : i + batch_size])

    conn.commit()
    print("upserted", len(rows))

    print("applying sido-level map coordinates (approx)...")
    apply_sido_geocodes(cur)
    conn.commit()

    if os.environ.get("PUBLIC_CATALOG_GEOCODE", "").strip() in ("1", "true", "yes"):
        print("geocoding districts (Nominatim, slow)...")
        apply_geocodes_nominatim(cur)
        conn.commit()
    else:
        print("district Nominatim skipped (PUBLIC_CATALOG_GEOCODE=1 to refine)")

    cur.execute("SELECT count(*) FROM public_hospital_stores")
    print("total stores", cur.fetchone()[0])
    cur.execute("SELECT count(*) FROM public_hospital_stores WHERE latitude IS NOT NULL")
    print("with coordinates", cur.fetchone()[0])

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
