#!/usr/bin/env python3
"""Safely reconcile official HIRA hospital WGS84 coordinates with MEDIPICK.

Defaults to a dry-run. Requires a locally downloaded, legitimately licensed
HIRA hospital CSV/XLSX with name, address, X/lon and Y/lat columns.
No Google geocoding content is cached or written.
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import psycopg2

from hira_coordinate_safety import (attest_official_source, reviewed_plan_equals,
                                    row_key, sha256_file)


def clean(value: object) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()



def first(row: dict, *aliases: str) -> str:
    normalized = {re.sub(r"[^a-z0-9가-힣]", "", str(k).lower()): v for k, v in row.items()}
    for name in aliases:
        value = normalized.get(re.sub(r"[^a-z0-9가-힣]", "", name.lower()))
        if value is not None and clean(value):
            return clean(value)
    return ""


def source_rows(path: Path):
    if path.suffix.lower() in {".xlsx", ".xls"}:
        # HIRA's hospital-info workbook is a single selected file inside their ZIP.
        frame = pd.read_excel(path, dtype=str).fillna("")
        for item in frame.to_dict(orient="records"):
            yield item
    elif path.suffix.lower() == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            yield from csv.DictReader(handle)
    else:
        raise ValueError("CSV 또는 XLSX 파일만 지원합니다")


def valid_wgs84(lat: str, lon: str) -> tuple[float, float] | None:
    try:
        y, x = float(lat), float(lon)
        if 33.0 <= y <= 39.5 and 124.0 <= x <= 132.0:
            return (y, x)
    except (ValueError, TypeError):
        pass
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path, help="HIRA hospital CSV or XLSX (WGS84 X/Y)")
    parser.add_argument("--source-tag", required=True, help="HIRA snapshot date, e.g. HIRA-20260930")
    parser.add_argument("--report", type=Path, help="Append-safe audit path; must not already exist")
    parser.add_argument("--apply", action="store_true", help="Explicitly write audited, exact matches")
    parser.add_argument("--max-updates", type=int, default=100, help="Hard upper bound for updates")
    parser.add_argument("--source-sha256", help="Pre-reviewed official source bytes (required for --apply)")
    parser.add_argument("--official-source-page", help="Official source catalog page (operator attestation)")
    parser.add_argument("--reviewed-report", type=Path, help="Existing manually reviewed DRY_RUN JSONL")
    parser.add_argument("--reviewed-report-sha256", help="SHA-256 of the immutable reviewed JSONL")
    args = parser.parse_args()
    if not args.source.is_file():
        parser.error("원본 파일을 확인할 수 없습니다")
    if args.max_updates < 1 or args.max_updates > 5000:
        parser.error("--max-updates 범위는 1..5000")
    if not re.fullmatch(r"HIRA-\d{8}", args.source_tag):
        parser.error("--source-tag는 HIRA-YYYYMMDD 형식이어야 합니다")
    if args.apply:
        if not all((args.source_sha256, args.official_source_page,
                    args.reviewed_report, args.reviewed_report_sha256)):
            parser.error("--apply requires --source-sha256, --official-source-page, "
                         "--reviewed-report and --reviewed-report-sha256")
        try:
            attest_official_source(args.source, args.source_sha256, args.official_source_page)
        except ValueError as error:
            parser.error(str(error))
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        parser.error("DATABASE_URL이 설정되지 않았습니다")
    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id,name,address,latitude,longitude,geocode_status
                FROM public_hospital_stores
                WHERE store_listing = 'listed' AND btrim(address) <> ''
            """)
            existing = cur.fetchall()
        index: dict[tuple[str, str, str], list[tuple]] = {}
        for hospital in existing:
            key = row_key(hospital[1], hospital[2])
            if key:
                index.setdefault(key, []).append(hospital)

        candidates: dict[int, dict] = {}
        source_key_counts: dict[tuple[str, str, str], int] = {}
        conflicts: set[int] = set()
        counters = {"source_rows": 0, "no_coordinates": 0, "no_address_key": 0,
                    "no_match": 0, "ambiguous": 0, "exact_already": 0}
        for row in source_rows(args.source):
            counters["source_rows"] += 1
            name = first(row, "요양기관명", "병원명", "기관명", "yadmNm")
            address = first(row, "도로명주소", "주소", "소재지", "addr")
            coords = valid_wgs84(
                first(row, "Y좌표", "YPos", "위도", "latitude", "Y"),
                first(row, "X좌표", "XPos", "경도", "longitude", "X"),
            )
            if not coords:
                counters["no_coordinates"] += 1
                continue
            key = row_key(name, address)
            if not key:
                counters["no_address_key"] += 1
                continue
            source_key_counts[key] = source_key_counts.get(key, 0) + 1
            matches = index.get(key, [])
            if not matches:
                counters["no_match"] += 1
                continue
            if len(matches) != 1:
                counters["ambiguous"] += 1
                continue
            target = matches[0]
            hid = int(target[0])
            if target[5] == "exact":
                counters["exact_already"] += 1
                continue
            proposed = {
                "id": hid, "name": target[1], "address": target[2],
                "old_latitude": target[3], "old_longitude": target[4],
                "new_latitude": coords[0], "new_longitude": coords[1],
                "source": args.source_tag, "matched": "name+road_number+district",
            }
            previous = candidates.get(hid)
            if previous and (previous["new_latitude"], previous["new_longitude"]) != coords:
                conflicts.add(hid)
            else:
                candidates[hid] = proposed
        # Even identical duplicate source rows cannot prove a unique hospital match.
        duplicate_keys = {key for key, n in source_key_counts.items() if n > 1}
        for key in duplicate_keys:
            for target in index.get(key, []):
                conflicts.add(int(target[0]))
        counters["duplicate_source_keys"] = len(duplicate_keys)
        for hid in conflicts:
            candidates.pop(hid, None)
        proposals = sorted(candidates.values(), key=lambda x: x["id"])
        counters["source_conflict"] = len(conflicts)
        counters["proposed"] = len(proposals)

        # Never update if there are more candidates than the explicitly capped batch.
        if args.apply and len(proposals) > args.max_updates:
            raise RuntimeError("검증 대상이 상한을 초과했습니다. 범위를 분할하여 재검수하세요.")
        if args.apply:
            if not proposals:
                raise RuntimeError("검수 승인 가능한 좌표가 0건이므로 DB 반영을 차단합니다.")
            if not reviewed_plan_equals(args.reviewed_report, args.reviewed_report_sha256, proposals):
                raise RuntimeError("기존 DRY_RUN 감사 SHA-256 또는 현재 후보가 불일치: DB 반영을 차단합니다.")
        report = args.report or Path("data/catalog") / (
            "hira_coordinate_audit_" + args.source_tag + "_" +
            datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ") + ".jsonl"
        )
        report.parent.mkdir(parents=True, exist_ok=True)
        if report.resolve() == args.source.resolve():
            raise RuntimeError("감사 파일 경로가 원본 파일과 같습니다")
        # Exclusive create: never overwrite an earlier verification record.
        with report.open("x", encoding="utf-8") as audit:
            for rec in proposals:
                audit.write(json.dumps(rec, ensure_ascii=False) + "\n")
        if args.apply:
            with conn.cursor() as cur:
                count = 0
                for r in proposals:
                    cur.execute("""
                        UPDATE public_hospital_stores
                        SET latitude=%s, longitude=%s, geocode_status='exact',
                            coordinate_source=%s, updated_at=NOW()
                        WHERE id=%s AND name=%s AND address=%s
                          AND geocode_status <> 'exact'
                    """, (r["new_latitude"], r["new_longitude"],
                          "hira_official:" + args.source_tag, r["id"], r["name"], r["address"]))
                    count += cur.rowcount
                if count != len(proposals):
                    raise RuntimeError("업데이트 충돌: 대상 원본이 변경되었습니다. 전체 롤백")
            conn.commit()
            counters["updated"] = count
        else:
            conn.rollback()
            counters["updated"] = 0
        print(json.dumps({"mode": "APPLIED" if args.apply else "DRY_RUN",
                          "source": args.source_tag, "audit": str(report),
                          "source_sha256": sha256_file(args.source),
                          "audit_sha256": sha256_file(report),
                          "independently_verified_official": False,
                          **counters}, ensure_ascii=False))
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
