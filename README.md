# Savings Tracker (web / phone)

The phone version of the Savings Tracker desktop app: same calculations, same tabs, iOS look.
Data is a JSON file in the user's own Google Drive (or on the device only), synced change by change.

- `index.html`, `css/`, `js/`: the app (plain JavaScript modules, no build step)
- `js/config.js`: your Google sign-in client ID (see SETUP.md)
- `js/core.js`: all calculations, ported line by line from `savings_tracker.py`
- `js/store.js`: Google Drive sync, offline queue, import of the desktop `savings.db`
- `js/car.js` + `js/pages/car.js`: the car monitor (the car button in the navigation bar): one or more cars with their details, odometer, fuel, services, inspections, tyres, fixed costs and the purchase papers, saved in the same data file. Its tabs: Car (the car shown, with what's due: tyres, service and inspection), Log, Charts and Garage (all your cars at a glance: specs, fixed costs, purchase). A car can count in the Budget's fixed costs (its fixed costs + fuel a month), so its costs are entered once
- `js/pages/plan.js`: My plan (a tab): the payday checklist (log the month, save the budget, start a plan, move the money), then pick a saving plan from the budget you saved on the Budget tab and follow it day by day: this week's money, check-ins, the payday transfers, what it builds, your action plan and your past plans
- `js/photos.js`: invoice photos and PDFs, kept on the device until they're in the Google Drive folder
- `vendor/pdfjs/`: PDF.js (Apache 2.0), to show PDF invoices in the app
- `img/car-top.webp`: the car seen from above in Your tyres (its background removed)
- `js/pump.js` + `js/pages/pump-sheet.js`: reading a photo of the pump with Claude (your own API key, kept on the device only): litres, price and amount, checked with litres × price = amount
- `data/fuel-prices.json`: Swedish pump prices for petrol 95 and diesel, every week since 2005 (European Commission, Weekly Oil Bulletin, CC BY 4.0). `tools/fetch_fuel_prices.py` updates it, run every morning by `.github/workflows/fuel-prices.yml`
- `vendor/`: sql.js (MIT licence), used only to read `savings.db` files
- `tests/`: checks for the calculations in `core.js`, with hand-worked answers. Run `npm test` (Node 22+); GitHub runs them on every push

Status: the savings tabs are Overview, My plan, Budget, History and Insights. Overview, Budget, History and Insights work like the desktop app (the action plan is on My plan here).

Setup: see SETUP.md.
