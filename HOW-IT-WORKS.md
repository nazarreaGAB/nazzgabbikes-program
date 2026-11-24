# How NazzGab Bikes Works (UI → API → COBOL)

A study guide. For everything you can click in the shop it shows what runs, in which file, and where COBOL gets involved.

## The big picture

```
index.html + app.js          server.js                         backend/shop.cbl
(browser)                    (Node API, port 4173)             (compiled to backend/shop)
─────────────────────        ──────────────────────────        ───────────────────────────
user clicks a button  ─────▶ checks the request shape   ─────▶ validates + calculates money
shows what comes back ◀───── turns COBOL text into JSON ◀───── prints result lines
```

Three rules to remember:
1. The **browser never calculates money.** It only displays numbers it receives.
2. The **API never calculates money either.** It checks the shape of the request, passes data to COBOL, and parses the answer.
3. **COBOL does every business calculation:** quantity checks, stock checks, discounts, promo codes, VAT, shipping, total.

## Every UI action, traced through the code

| # | What the user does | Frontend function (`app.js`) | API route (`server.js`) | COBOL paragraph (`backend/shop.cbl`) |
|---|---|---|---|---|
| 1 | Opens the page | `loadProducts()` | `GET /api/products` → `productsView()` | none (Node reads its `CATALOG` and in-memory `stock`) |
| 2 | Header pill shows "COBOL connected" | `refreshStatus()` | `GET /api/status` → `spawnCobol(['STATUS'])` | `MAIN-PARA`, `WHEN "STATUS"` prints `COBOL\|CONNECTED` |
| 3 | Clicks a category chip, types in search, or picks a sort order | `renderChips()`, `renderGrid()` | none, handled in the browser | none |
| 4 | Clicks **+ / −** on a product card | `set()` inside `productCard()` | none, only changes the number in the box | none |
| 5 | Clicks **Add** (a toast says what was added) | `addToCart()` → `requestQuote()` | `POST /api/quote` → `priceOrder('QUOTE')` | `DO-ORDER` → `READ-ITEMS` → `CHECK-PROMO` → `PRICE-ORDER` → `PRINT-RESULT` |
| 6 | Changes a quantity or clicks **Remove** in the cart | `setCartQty()` → `requestQuote()` | `POST /api/quote` (same as above) | same as above |
| 7 | Types a promo code or clicks a code chip | `setPromo()` (waits 350 ms) → `requestQuote()` | `POST /api/quote` | `CHECK-PROMO` accepts or rejects; `PRICE-ORDER` applies it |
| 8 | Sees subtotal, VAT, shipping, total | `renderCart()` | numbers come from `parseResult()` | `PRICE-ORDER` computes, `PRINT-RESULT` prints the `T\|...` line |
| 9 | Clicks **Place order** | `checkout()` | `POST /api/checkout` → `priceOrder('CHECKOUT')` | same paragraphs as a quote |
| 10 | Sees the receipt pop-up | `showReceipt()` | response includes `orderId`, `items`, `totalCents`, `products` | none |
| 11 | Stock numbers drop after an order | `state.products = result.data.products` → `renderGrid()` | `stock = result.remaining` (only after COBOL accepted) | `READ-ITEMS` computes `O-REMAIN = O-STOCK - O-QTY` |
| 12 | Clicks **Reset stock** | `resetStock()` | `POST /api/reset` → `freshStock()` | none |
| 13 | Orders more than is available | error text appears in the cart | COBOL error `E06` becomes HTTP 409 | `READ-ITEMS`, `IF O-QTY > O-STOCK` |
| 14 | Refreshes the page with items in the basket | `restoreBasket()` then `requestQuote()` | `POST /api/quote` | same as #5 |
| 15 | Opens the page with no server (preview) | `loadProducts()` falls back to `PREVIEW_ROWS` | none | none; checkout stays disabled |

The basket is remembered in the browser's `localStorage` (functions `saveBasket()` and `restoreBasket()`), so a refresh does not empty it. That is only the basket. Prices and totals are always asked from COBOL again.

## What happens during one quote or checkout, step by step

Example: 3 LED Light Sets with promo `RIDE10`.

1. **`app.js` → `requestQuote()`** builds `{ items: [{id:'led-light-set', quantity:3}], promo:'RIDE10' }` and sends `POST api/quote`.
2. **`server.js` → `handleApi()`** matches `POST /api/quote` and calls `priceOrder('QUOTE', body)`.
3. **`buildInput()`** checks the shape (known product id, whole-number quantity, no duplicates, promo is letters and digits) and writes the lines COBOL will read. There is one 21-character record per catalogue product:
   ```
   QUOTE
   RIDE10
   16
   +000000003850000000000008      ← Roadster Pro: quantity 0
   ...
   +000003000125000000040         ← LED Light Set: sign, qty 000003, price 00125000, stock 000040
   ```
4. **`spawnCobol()`** starts `backend/shop`, writes those lines to its stdin, and prints `[API -> COBOL] ...` in the terminal so you can watch it happen.
5. **COBOL `MAIN-PARA`** reads the command and runs `DO-ORDER`:
   - `READ-ITEMS` checks every record: valid sign and digits, not negative, at most 50, not more than the stock. It counts how many items were ordered.
   - An empty basket is rejected (`E02`).
   - `CHECK-PROMO` rejects unknown codes (`E08`).
   - `PRICE-ORDER` calculates each line (3+ items = 5% off, 5+ = 10% off), the subtotal, the promo discount, 12% VAT, shipping (free from ₱5,000) and the total.
   - `PRINT-RESULT` prints `OK`, one `R|...` line per product and one `T|...` totals line. If anything failed it prints `ERR|code|position|message` instead.
6. **`parseResult()`** in `server.js` reads that text. On `ERR` it throws an HTTP error (409 for stock, 400 for the rest). On success it builds JSON.
7. **For a checkout only**, `priceOrder()` then does `stock = result.remaining`. This is the only place stock changes, and it happens after COBOL said yes. It also creates the order id.
8. **`app.js`** receives the JSON and `renderCart()` or `showReceipt()` displays it.

## The business rules (and where they live)

All of these are in `backend/shop.cbl`. The numbers are declared at the top of `WORKING-STORAGE` so they are easy to find.

| Rule | COBOL location |
|---|---|
| 3+ same item = 5% off, 5+ = 10% off | `WS-RATE-3`, `WS-RATE-5`, the `EVALUATE TRUE` in `PRICE-ORDER` |
| `RIDE10`: 10% off the subtotal | `EVALUATE WS-PROMO` in `PRICE-ORDER` |
| `WELCOME500`: ₱500 off if subtotal ≥ ₱5,000 | same `EVALUATE`, error `E09` if too small |
| VAT 12% | `WS-VAT-RATE`, `COMPUTE WS-VAT ROUNDED` |
| Shipping ₱250, free from ₱5,000 | `WS-SHIP-FEE`, `WS-FREE-SHIP-MIN` |
| Max 50 per item, no negatives, no overselling | `READ-ITEMS` |

Money is stored as whole centavos (`4290000` means ₱42,900.00), so there are no decimal rounding surprises.

Error codes: `E02` empty basket or bad count · `E03` quantity not a whole number · `E04` negative or over 50 · `E05` unknown product · `E06` not enough stock · `E07` duplicate product · `E08` unknown promo · `E09` promo minimum not met.

## Questions you should be able to answer

- **Where is the price of a bike stored?** In the `CATALOG` list near the top of `server.js` (`priceCents`). Node passes it to COBOL on every request.
- **Where is the stock stored?** In the Node process memory (`stock` in `server.js`). It resets when the server restarts.
- **Who decides the total?** COBOL, in `PRICE-ORDER`.
- **What if someone edits the price in the browser?** It has no effect. The browser never sends prices, only product ids and quantities. Node adds the real price from `CATALOG`.
- **What stops overselling?** The `IF O-QTY(WS-I) > O-STOCK(WS-I)` check in `READ-ITEMS`, plus `exclusive()` in `server.js`, which runs one order at a time.
- **What if COBOL isn't compiled?** `spawnCobol()` returns a 503 error and the UI shows "COBOL not connected". There is no JavaScript fallback.
- **Why spawn a process to call COBOL?** The COBOL here is a command-line program. It reads stdin and writes stdout, so Node starts it, sends lines in, and reads the result.
- **How does the UI know COBOL is connected?** `refreshStatus()` calls `GET /api/status`, which sends the `STATUS` command to COBOL.
- **What is the browser-only preview?** If `GET api/products` fails (GitHub Pages, or opening `index.html` directly), `loadProducts()` falls back to `PREVIEW_ROWS` and turns checkout off.
- **What does `ROUNDED` do?** It rounds a calculated centavo amount to the nearest whole centavo instead of cutting off the decimals.
- **What is the 21-character record?** `sign(1) + quantity(6) + unit price in centavos(8) + stock(6)`. The `MOVE WS-IN-LINE(2:6) TO O-QTY` lines in `READ-ITEMS` cut it back into fields.
- **What does `npm start` do before the server starts?** `package.json` has a `prestart` script that runs `scripts/build-cobol.js --soft`. It installs GnuCOBOL if needed and compiles `shop.cbl` when the program is missing or out of date.
