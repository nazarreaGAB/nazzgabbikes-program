# NazzGab Bikes Project

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/nazarreaGAB/spokes-and-co?quickstart=1)

The working shop project follows this path:

**Browser UI → Node.js API → compiled GnuCOBOL checkout**

This is a demo only. It has no payment processing, customer accounts, or personal data. Inventory is held in the running Node process and resets when the server restarts.

## Start Here

You do not need to install Visual Studio, Node.js, or COBOL on your computer. Work in GitHub Codespaces in your browser.

First, the three GitHub words:

- **Fork** means make your own copy of this project in your GitHub account.
- **Codespaces** is an online coding workspace that opens in your browser.
- **Pull** means get newer changes into a copy you already have. You do not need to pull to start.

Do these steps in order:

1. Open the project repository.
2. Click **Fork** near the top-right, then click **Create fork**. You now have your own copy.
3. Open your new fork. Click **Code → Codespaces → Create codespace on main**. Make sure you are on your fork, not the original repository.
4. Wait for setup to finish. It installs Node.js and GnuCOBOL and compiles the COBOL program automatically.
5. In the Codespaces terminal, type `npm start` and press Enter.
6. Open port **4173** when Codespaces offers it, or select port 4173 in the **Ports** tab.

The browser-only preview is optional. GitHub Pages cannot run the Node API or COBOL, so use your Codespace for the real checkout.

Shortcut: the **Open in GitHub Codespaces** badge at the top of this page opens a Codespace straight from this repository.

## If You Edit COBOL

After changing `backend/shop.cbl`, rebuild it before testing:

```
npm run build:cobol
```

Then restart the app with `npm start`. Check `GET /api/status` to confirm that the compiled COBOL program is connected. If `cobc` is missing, use Codespaces: **Rebuild Container** from the Command Palette. (`npm start` also tries to install and build GnuCOBOL by itself when it is missing.)

## Classroom Stages

**UI:** work in `index.html`, `styles.css`, and `app.js`. The browser loads products from the API, keeps basket changes local, and submits the basket only when **Place order** is selected. Opening `index.html` directly is a labeled browser-only preview; its checkout is disabled.

**API:** work in `server.js`. The Node server binds to `0.0.0.0:4173`, serves the UI, validates the request shape, and passes the current catalog, stock, and quantities to the COBOL executable. It updates stock only after a valid COBOL result.

**COBOL:** work in `backend/shop.cbl`. It validates order quantities against stock, rejects an oversell, applies bulk discounts, promo codes, VAT and shipping, calculates remaining stock and total cents, and writes a machine-readable result for the API. Rebuild with `npm run build:cobol`.

## Catalog

| Product | Price | Starting stock |
|---|---|---|
| Roadster Pro 700c | ₱38,500.00 | 8 |
| Aero Carbon R9 | ₱89,900.00 | 3 |
| Trailblazer 29er | ₱42,900.00 | 6 |
| Summit Full-Sus 27.5 | ₱76,500.00 | 4 |
| Cityline Commuter | ₱18,900.00 | 12 |
| Foldie Compact 20in | ₱23,500.00 | 9 |
| Voltride E-City | ₱69,900.00 | 5 |
| E-Trail Mid-Drive | ₱124,900.00 | 2 |
| Aero Helmet | ₱2,850.00 | 25 |
| LED Light Set (F+R) | ₱1,250.00 | 40 |
| Heavy-Duty U-Lock | ₱1,650.00 | 30 |
| Padded Gloves | ₱890.00 | 35 |
| Inner Tube 700c | ₱280.00 | 90 |
| Chain Lube 120ml | ₱420.00 | 60 |
| Floor Pump w/ Gauge | ₱1,480.00 | 20 |
| Disc Brake Pads | ₱750.00 | 45 |

Adding an item changes only the basket. Stock changes after a successful checkout response.

## Business Rules (all calculated in COBOL)

| Rule | Value |
|---|---|
| Bulk discount | 3 or more of the same item: 5% off that line. 5 or more: 10% off that line |
| Promo `RIDE10` | 10% off the subtotal |
| Promo `WELCOME500` | ₱500 off, only if the subtotal is at least ₱5,000 |
| VAT | 12% on the discounted amount |
| Shipping | ₱250, free when the discounted amount is ₱5,000 or more |
| Quantity per item | 0 to 50, whole numbers, never negative |
| Stock | An order can never exceed the stock available |
| Basket | Must contain at least one item |

## API Contract

- `GET /api/status` runs the compiled COBOL health check. A connected response is `{"api":"connected","cobolConnected":true}`. If the executable is missing or fails, the API reports an error and build instructions; it never replaces COBOL calculations with JavaScript.
- `GET /api/products` returns `{ "products": [{ "id", "name", "category", "priceCents", "stock" }] }`.
- `POST /api/quote` accepts `{ "items": [{ "id": "led-light-set", "quantity": 3 }], "promo": "RIDE10" }` and returns COBOL's calculation without changing stock. The UI uses it to show the live total.
- `POST /api/checkout` accepts `{ "items": [{ "id": "aero-helmet", "quantity": 2 }], "promo": "" }`.
- `POST /api/reset` restores the starting stock for all products and returns the refreshed product list. The **Reset stock** button uses this route, so the browser and API stay in sync.

A successful order returns receipt items with quantities and line totals, a price summary, updated products, `orderId`, and `totalCents`. For two Aero Helmets the response has stock 23 and total 638400.

Invalid requests return 400; stock conflicts return 409; an unavailable COBOL executable returns 503. Failed orders do not update stock.

The API and COBOL program exchange one fixed-width input record per catalog product. Each record contains a signed six-digit quantity, eight-digit unit price in cents, and six-digit stock. COBOL returns either an error or the remaining-stock values, line totals, and the money summary in cents.

## Project Map

The default `main` branch is the working app.

- UI: `index.html`, `styles.css`, and `app.js`
- API: `server.js`
- COBOL checkout: `backend/shop.cbl`
- Build script: `scripts/build-cobol.js`
- Codespaces setup: `.devcontainer/`
- Study guide that explains every button and function: [HOW-IT-WORKS.md](HOW-IT-WORKS.md)
