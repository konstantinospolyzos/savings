#!/usr/bin/env python3
"""Swedish pump prices for petrol 95 and diesel, every week since 2005, into data/fuel-prices.json.

Source: European Commission, Weekly Oil Bulletin ("Price developments 2005 onwards"), CC BY 4.0.
The national average price at the pump on Mondays, taxes included. The file gives euro per
1000 litres and the exchange rate (euro per krona), so kr per litre = price / rate / 1000.

Run by .github/workflows/fuel-prices.yml every morning; it only writes the file when the
numbers changed, and never replaces a good file with a broken one.

Usage: python tools/fetch_fuel_prices.py data/fuel-prices.json [history.xlsx]
"""
import datetime as dt
import io
import json
import re
import sys
import urllib.request

PAGE = "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en"
FALLBACK = ("https://energy.ec.europa.eu/document/download/906e60ca-8b6a-44e7-8589-652854d2fd3f_en"
            "?filename=Weekly_Oil_Bulletin_Prices_History_maticni_4web.xlsx")
UA = {"User-Agent": "savings-tracker fuel prices (github.com/konstantinospolyzos/savings)"}
COLUMNS = {"95": "SE_price_with_tax_euro95", "diesel": "SE_price_with_tax_diesel"}
RATE = "SE_exchange_rate"


def get(url, timeout=120):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=timeout) as r:
        return r.read()


def history_url():
    """The link on the bulletin page (it has stayed the same for years; fall back to it)."""
    try:
        page = get(PAGE, 60).decode("utf-8", "replace")
        m = re.search(r'href="([^"]*Prices_History[^"]*\.xlsx[^"]*)"', page)
        if m:
            href = m.group(1).replace("&amp;", "&")
            return href if href.startswith("http") else "https://energy.ec.europa.eu" + href
    except Exception as err:  # the page is only a convenience
        print("bulletin page not reachable, using the known link:", err)
    return FALLBACK


def parse(xlsx):
    import openpyxl
    wb = openpyxl.load_workbook(io.BytesIO(xlsx), read_only=True, data_only=True)
    rows = list(wb["Prices with taxes"].iter_rows(values_only=True))
    head = {str(h).strip(): i for i, h in enumerate(rows[0]) if h}
    missing = [c for c in [RATE, *COLUMNS.values()] if c not in head]
    if missing:
        raise SystemExit(f"columns not found: {missing}")
    out = {k: [] for k in COLUMNS}
    for row in rows[1:]:
        day = row[0]
        if not isinstance(day, dt.datetime):
            continue
        rate = row[head[RATE]]
        if not isinstance(rate, (int, float)) or rate <= 0:
            continue
        for key, col in COLUMNS.items():
            price = row[head[col]]
            if isinstance(price, (int, float)) and price > 0:
                kr = price / rate / 1000
                if 5 < kr < 60:  # anything else is a typo in the source
                    out[key].append([day.date().isoformat(), round(kr, 2)])
    for key in out:
        out[key].sort()
    return out


def main():
    target = sys.argv[1] if len(sys.argv) > 1 else "data/fuel-prices.json"
    if len(sys.argv) > 2:
        xlsx = open(sys.argv[2], "rb").read()
    else:
        url = history_url()
        print("downloading", url)
        xlsx = get(url)
    prices = parse(xlsx)
    n = len(prices["95"])
    if n < 500:
        raise SystemExit(f"only {n} weeks of petrol 95 prices: not writing the file")
    try:
        old = json.load(open(target))
    except Exception:
        old = None
    if old and old.get("prices") == prices:
        print("no new prices; latest week", prices["95"][-1][0])
        return
    data = {
        "source": "European Commission, Weekly Oil Bulletin",
        "licence": "CC BY 4.0",
        "link": "https://energy.ec.europa.eu/data-and-analysis/weekly-oil-bulletin_en",
        "what": "Average pump price in Sweden on Mondays, taxes included, in kronor per litre",
        "updated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "latest": prices["95"][-1][0],
        "prices": prices,
    }
    with open(target, "w") as f:
        json.dump(data, f, separators=(",", ":"))
        f.write("\n")
    print(f"wrote {target}: {n} weeks, latest {data['latest']}: 95 {prices['95'][-1][1]} kr/l,"
          f" diesel {prices['diesel'][-1][1]} kr/l")


if __name__ == "__main__":
    main()
