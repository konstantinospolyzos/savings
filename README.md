# Savings Tracker (web / phone)

The phone version of the Savings Tracker desktop app: same calculations, same tabs, iOS look.
Data is a JSON file in the user's own Google Drive (or on the device only), synced change by change.

- `index.html`, `css/`, `js/`: the app (plain JavaScript modules, no build step)
- `js/config.js`: your Google sign-in client ID (see SETUP.md)
- `js/core.js`: all calculations, ported line by line from `savings_tracker.py`
- `js/store.js`: Google Drive sync, offline queue, import of the desktop `savings.db`
- `js/car.js` + `js/pages/car.js`: the car monitor (the car button in the navigation bar): one or more cars with their details, odometer, fuel, services, inspections, tyres, fixed costs and the purchase papers, saved in the same data file. Its tabs: Car (the car shown), Log, Insights and Garage (all your cars at a glance)
- `js/pages/plan.js`: My plan (the target button at the top): the saving plan you started for this pay period, day by day: this week's money, check-ins, the payday transfers, what it builds and your past plans
- `js/photos.js`: invoice photos and PDFs, kept on the device until they're in the Google Drive folder
- `vendor/pdfjs/`: PDF.js (Apache 2.0), to show PDF invoices in the app
- `img/car-top.webp`: the car seen from above in Your tyres (its background removed)
- `js/pump.js` + `js/pages/pump-sheet.js`: reading a photo of the pump with Claude (your own API key, kept on the device only): litres, price and amount, checked with litres × price = amount
- `data/fuel-prices.json`: Swedish pump prices for petrol 95 and diesel, every week since 2005 (European Commission, Weekly Oil Bulletin, CC BY 4.0). `tools/fetch_fuel_prices.py` updates it, run every morning by `.github/workflows/fuel-prices.yml`
- `vendor/`: sql.js (MIT licence), used only to read `savings.db` files
- `tests/`: checks for the calculations in `core.js`, with hand-worked answers. Run `npm test` (Node 22+); GitHub runs them on every push

Status: all four tabs (Overview, History, Budget, Insights) work like the desktop app.

Setup: see SETUP.md.
