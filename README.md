# Savings Tracker (web / phone)

The phone version of the Savings Tracker desktop app: same calculations, same tabs, iOS look.
Data is a JSON file in the user's own Google Drive (or on the device only), synced change by change.

- `index.html`, `css/`, `js/`: the app (plain JavaScript modules, no build step)
- `js/config.js`: your Google sign-in client ID (see SETUP.md)
- `js/core.js`: all calculations, ported line by line from `savings_tracker.py`
- `js/store.js`: Google Drive sync, offline queue, import of the desktop `savings.db`
- `vendor/`: sql.js (MIT licence), used only to read `savings.db` files

Status: stage 1 of 3. Overview, History and adding/editing months are done. Budget and Insights come next.

Setup: see SETUP.md.
