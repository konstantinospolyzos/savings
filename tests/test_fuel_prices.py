"""Tests for tools/fetch_fuel_prices.py with a small workbook shaped like the EU history file.
Run: python -m unittest discover -s tests -p "test_*.py"
"""
import datetime as dt
import io
import json
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "tools"))
import fetch_fuel_prices as f  # noqa: E402


def workbook(rows):
    """Like the real file: three header rows, newest week first, a Notes row at the end."""
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Prices with taxes"
    ws.append(["Consumer prices", "CTR", "EU_price_with_tax_euro95", "CTR", "SE_exchange_rate",
               "SE_price_with_tax_euro95", "SE_price_with_tax_diesel"])
    ws.append([None, None, "Euro-super 95", None, None, "Euro-super 95", "Diesel"])
    ws.append(["Date", None, "1000 l", None, None, "1000 l", "1000 l"])
    for r in rows:
        ws.append(r)
    ws.append(["Notes:", None, None, None, None, None, None])
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


class ParseTest(unittest.TestCase):
    def test_kronor_per_litre(self):
        data = workbook([
            [dt.datetime(2026, 10, 19), "EU_", 1991.3, "SE_", 0.09005763688760808, 1639.949567723343, 2040.3458213256488],
            [dt.datetime(2026, 10, 12), "EU_", 2009.6, "SE_", 0.08931362479346223, 1692.4931898361094, 2049.6583753851646],
        ])
        p = f.parse(data)
        # 1 639.95 € per 1000 l at 0.09006 € per krona = 18.21 kr a litre
        self.assertEqual(p["95"], [["2026-10-12", 18.95], ["2026-10-19", 18.21]])
        self.assertEqual(p["diesel"][-1], ["2026-10-19", 22.66])

    def test_skips_gaps_and_nonsense(self):
        data = workbook([
            [dt.datetime(2026, 10, 19), "EU_", 1, "SE_", 0.09, None, 2000],       # no 95 price that week
            [dt.datetime(2026, 10, 12), "EU_", 1, "SE_", None, 1600, 2000],       # no exchange rate
            [dt.datetime(2026, 10, 5), "EU_", 1, "SE_", 0.09, 16000, 2000],       # 177 kr a litre: a typo
            [dt.datetime(2026, 9, 28), "EU_", 1, "SE_", 0.09, 1620, 2000],
        ])
        p = f.parse(data)
        self.assertEqual(p["95"], [["2026-09-28", 18.0]])
        self.assertEqual([d for d, _ in p["diesel"]], ["2026-09-28", "2026-10-05", "2026-10-19"])

    def test_missing_columns_stop_the_run(self):
        import openpyxl
        wb = openpyxl.Workbook()
        wb.active.title = "Prices with taxes"
        wb.active.append(["Date", "SE_exchange_rate"])
        out = io.BytesIO()
        wb.save(out)
        with self.assertRaises(SystemExit):
            f.parse(out.getvalue())

    def test_never_writes_a_short_file(self):
        rows = [[dt.datetime(2026, 10, 19), "EU_", 1, "SE_", 0.09, 1640, 2040]]
        with tempfile.TemporaryDirectory() as tmp:
            xlsx, target = os.path.join(tmp, "h.xlsx"), os.path.join(tmp, "prices.json")
            open(xlsx, "wb").write(workbook(rows))
            json.dump({"prices": {"95": [["2005-01-03", 9.6]]}}, open(target, "w"))
            sys.argv = ["x", target, xlsx]
            with self.assertRaises(SystemExit):
                f.main()
            self.assertEqual(json.load(open(target))["prices"]["95"], [["2005-01-03", 9.6]])   # untouched

    def test_writes_and_then_says_nothing_new(self):
        start = dt.datetime(2015, 1, 5)
        rows = [[start + dt.timedelta(weeks=k), "EU_", 1, "SE_", 0.09, 1500 + k, 1800 + k] for k in range(600)][::-1]
        with tempfile.TemporaryDirectory() as tmp:
            xlsx, target = os.path.join(tmp, "h.xlsx"), os.path.join(tmp, "prices.json")
            open(xlsx, "wb").write(workbook(rows))
            sys.argv = ["x", target, xlsx]
            f.main()
            first = json.load(open(target))
            self.assertEqual(len(first["prices"]["95"]), 600)
            self.assertEqual(first["latest"], (start + dt.timedelta(weeks=599)).date().isoformat())
            f.main()                                    # same numbers: the file stays as it was
            self.assertEqual(json.load(open(target))["updated"], first["updated"])


if __name__ == "__main__":
    unittest.main()
