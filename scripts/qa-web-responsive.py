#!/usr/bin/env python3
"""MEDIPICK design QA: real HTML/CSS across Chromium, Firefox and WebKit, no live APIs.
Reuses the repository's qa_v32_pages.py set_content() offline rendering pattern.
Artifacts are evidence, not a production/third-party integration pass.
"""
import base64
import json
import mimetypes
import os
import re
from collections import Counter
from pathlib import Path

from bs4 import BeautifulSoup
from playwright.sync_api import sync_playwright

BROWSER_NAME = os.environ.get("MEDIPICK_QA_BROWSER", "chromium").lower()
if BROWSER_NAME not in ("chromium", "firefox", "webkit"):
    raise SystemExit("MEDIPICK_QA_BROWSER must be chromium, firefox or webkit")
ROOT = Path(os.environ.get("MEDIPICK_QA_ROOT", Path(__file__).resolve().parents[1]))
WEB = ROOT / "web"
OUT = Path(os.environ.get("MEDIPICK_QA_OUTPUT", ROOT / "docs" / "agency_qa"))
OUT.mkdir(parents=True, exist_ok=True)
SIZES = [(320, 720), (390, 844), (768, 1024), (1024, 768), (1440, 900)]
PAGES = sorted(WEB.glob("*.html"))
CHROME = (WEB / "assets/site-chrome.js").read_text(encoding="utf-8") if (WEB / "assets/site-chrome.js").is_file() else ""
rows = []

def embed_asset(src):
    if not src.startswith("/assets/"):
        return None
    file = WEB / src.lstrip("/")
    if not file.is_file() or file.stat().st_size > 5_000_000:
        return None
    kind = mimetypes.guess_type(file.name)[0] or "image/png"
    return "data:" + kind + ";base64," + base64.b64encode(file.read_bytes()).decode()

def prepare_html(file):
    soup = BeautifulSoup(file.read_text(encoding="utf-8"), "html.parser")
    ids = [x["id"] for x in soup.select("[id]")]
    duplicate_ids = [i for i, n in Counter(ids).items() if n > 1]
    missing_alt = [x.get("src", "") for x in soup.select("img") if x.get("alt") is None]
    broken_assets = []
    for tag in soup.select("img[src],script[src],link[href]"):
        ref = tag.get("src") or tag.get("href") or ""
        if ref.startswith("/assets/") and not (WEB / ref.lstrip("/")).is_file():
            broken_assets.append(ref)
    for el in soup.select("link[rel~=stylesheet]"):
        src = el.get("href", "")
        path = WEB / src.lstrip("/")
        if not src.startswith("/") or not path.is_file():
            el.decompose()
            continue
        css = path.read_text(encoding="utf-8", errors="replace")
        css = re.sub(r"@import\s+url\(['\"]?https?://.*?;", "", css, flags=re.I)
        def replace_url(match):
            asset = match.group(1).strip().strip("\"'")
            data = embed_asset(asset)
            return "url(" + data + ")" if data else match.group(0)
        css = re.sub(r"url\(([^)]+)\)", replace_url, css)
        style = soup.new_tag("style")
        style.string = css
        el.replace_with(style)
    for img in soup.select("img[src]"):
        data = embed_asset(img.get("src", ""))
        if data: img["src"] = data
    for script in soup.select("script"): script.decompose()
    if CHROME and file.name not in ("offline.html", "admin.html"):
        script = soup.new_tag("script")
        script.string = CHROME
        if soup.body: soup.body.append(script)
    return str(soup), {"duplicate_ids": duplicate_ids, "missing_alt": missing_alt,
                        "broken_assets": sorted(set(broken_assets))}

DYNAMIC_IMAGES = {
    url: embed_asset(url)
    for url in ("/assets/logo-full.svg", "/assets/logo-mark.jpg", "/assets/favicon.svg")
}
DYNAMIC_IMAGES = {url: data for url, data in DYNAMIC_IMAGES.items() if data}

with sync_playwright() as pw:
    browser_type = getattr(pw, BROWSER_NAME)
    browser_options = {"headless": True}
    if BROWSER_NAME == "chromium": browser_options["args"] = ["--no-sandbox"]
    browser = browser_type.launch(**browser_options)
    for file in PAGES:
        html, prelim = prepare_html(file)
        for width, height in SIZES:
            page = browser.new_page(viewport={"width": width, "height": height},
                                    device_scale_factor=1)
            errors = []
            page.on("pageerror", lambda exc: errors.append(str(exc)))
            try:
                page.set_content(html, wait_until="domcontentloaded", timeout=15000)
                # Resolve dynamically inserted shared navigation logos within the offline DOM.
                page.evaluate("""assets => {
                    document.querySelectorAll('img[src]').forEach(img => {
                        const src = img.getAttribute('src');
                        if (Object.prototype.hasOwnProperty.call(assets, src)) {
                            img.setAttribute('src', assets[src]);
                        }
                    });
                }""", DYNAMIC_IMAGES)
                page.wait_for_timeout(120)
                actual = page.evaluate("""() => {
                    const images = [...document.images];
                    return {
                        scrollWidth: document.documentElement.scrollWidth,
                        viewportWidth: innerWidth,
                        scrollHeight: document.documentElement.scrollHeight,
                        imagesTotal: images.length,
                        imagesLoaded: images.filter(x => x.complete && x.naturalWidth > 0).length,
                        brokenLocalImages: images.filter(x => x.getAttribute('src')?.startsWith('data:') && (!x.complete || x.naturalWidth === 0)).length,
                        buttons: document.querySelectorAll('button').length,
                        links: document.querySelectorAll('a[href]').length,
                        h1: document.querySelector('h1')?.innerText?.slice(0,90) || ''
                    };
                }""")
                row = {"page": file.stem, "width": width, "height": height, **prelim,
                       **actual, "errors": errors, "menu_check": "not_applicable"}
                row["overflow_px"] = max(0, actual["scrollWidth"] - width)
                if width in (320, 390):
                    menu = page.locator("#mpMenuToggle")
                    if menu.count() == 1 and menu.is_visible():
                        bounds = menu.bounding_box()
                        row["menu_right_inset_px"] = round(width - bounds["x"] - bounds["width"], 2) if bounds else -1
                        row["menu_safe_area"] = "passed" if row["menu_right_inset_px"] >= 8 else "failed"
                        menu.click(timeout=3000)
                        opened = page.evaluate("""() => {
                            const m=document.getElementById('mpNavDrawer');
                            const b=document.getElementById('mpMenuToggle');
                            return !!m && !m.hidden && b.getAttribute('aria-expanded') === 'true';
                        }""")
                        page.keyboard.press("Escape")
                        closed = page.evaluate("""() => {
                            const m=document.getElementById('mpNavDrawer');
                            const b=document.getElementById('mpMenuToggle');
                            return !!m && m.hidden && b.getAttribute('aria-expanded') === 'false';
                        }""")
                        row["menu_check"] = "passed" if opened and closed else "failed"
                        # Opening the dialog moves keyboard focus to its Close control,
                        # Escape restores it to the original menu trigger.
                        menu.click(timeout=3000)
                        focus_open = page.evaluate("document.activeElement?.id === 'mpMenuClose'")
                        page.keyboard.press("Shift+Tab")
                        wrapped_to_last = page.evaluate("""() => {
                            const links=[...document.querySelectorAll('#mpNavDrawer a[href]')];
                            return links.length > 0 && document.activeElement === links[links.length-1];
                        }""")
                        page.keyboard.press("Tab")
                        wrapped_to_first = page.evaluate("document.activeElement?.id === 'mpMenuClose'")
                        page.keyboard.press("Escape")
                        focus_return = page.evaluate("document.activeElement?.id === 'mpMenuToggle'")
                        row["keyboard_focus"] = "passed" if (focus_open and wrapped_to_last and wrapped_to_first and focus_return) else "failed"
                rows.append(row)
                if width in (390, 1440):
                    page.screenshot(path=str(OUT / (file.stem + "-" + str(width) + ".png")), timeout=20000)
            except Exception as e:
                rows.append({"page": file.stem, "width": width,
                             "error": str(e)[:500], **prelim})
            finally:
                page.close()
    browser.close()

failures = [row for row in rows if row.get("error") or row.get("overflow_px",0) > 6 or
            row.get("duplicate_ids") or row.get("missing_alt") or
            row.get("broken_assets") or row.get("brokenLocalImages", 0) > 0 or
            row.get("menu_check") == "failed" or row.get("menu_safe_area") == "failed" or row.get("keyboard_focus") == "failed" or row.get("errors")]
report = {
    "mode": "offline actual HTML/CSS across Chromium/Firefox/WebKit, only site-chrome.js for drawer; live APIs and authenticated buttons excluded",
    "browser": BROWSER_NAME,
    "pages": len(PAGES), "sizes": [x[0] for x in SIZES],
    "cases": len(rows), "failures": len(failures), "failed_cases": failures, "rows": rows,
}
(OUT/"report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({k: v for k,v in report.items() if k != "rows"}, ensure_ascii=False, indent=2))
if failures:
    raise SystemExit(1)
