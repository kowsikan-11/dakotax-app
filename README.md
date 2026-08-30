# Dakotax Milk Collection

A milk register for a collection centre, keeping **both sides of the book**:
milk bought from suppliers (money out) and milk sold to customers (money in).

The front end is a static site — plain HTML, CSS and JavaScript, no build step —
that any phone can open. The back end is a Google Apps Script web app in front of
a Google Sheet, so every device reads and writes the same data.

Seven sections: **Dashboard**, **Daily entry**, **People**, **Advances**,
**Money**, **Reports**, **Settings**.

---

## Both sides, one app

|  | Suppliers | Customers |
|---|---|---|
| Milk | comes in | goes out |
| Money | you pay them | they pay you |
| Master list | People → Suppliers | People → Customers |
| Daily entry | Daily entry → Milk in | Daily entry → Milk out |
| Money owed | Advances given, recovered later | A running balance: delivered less received |
| Settling up | Money → Pay a supplier | Money → Collect from a customer |

Every page that has two sides carries the same switch at the top, so the date,
shift and duplicate rules behave identically whichever way the milk is moving.

## What it does

- **Auto date and shift.** The entry page fills in today's date and picks
  Morning or Evening from the clock (the cutover hour is a setting). Both can be
  changed before saving — you are never locked into the guess.
- **One entry per party, per date, per shift.** On both sides. The script
  refuses a second one and names the entry that already exists, with its litres,
  so you can tell a mistake from a genuine second weighing.
- **Advances that reconcile.** Money given to a supplier and money taken back
  are one ledger. A recovery larger than the outstanding balance is refused, and
  recovering inside a payment also writes the Advances row, so the balance is
  the same number wherever you look.
- **A running balance per customer.** Each delivery adds to what they owe, each
  receipt takes it off. Paying ahead simply shows as credit. Nothing to
  reconcile, and the number is current the moment you save.
- **Payments computed from the register.** Pick a supplier and a period and the
  app totals the milk, subtracts what was already paid for that exact period,
  and shows the advance still outstanding before you commit anything.
- **Margin.** The dashboard and reports put litres in above the line and litres
  out below it, so the day's gap is the margin. Money margin is on the tiles.
- **Reports and CSV.** Filter by period, party and shift; export a supplier or
  customer summary, or every underlying row. Excel opens the files directly.
- **Light and dark.** The app follows whatever the phone or computer is set to,
  and the button in the header pins it to light or dark for that device.
- **Works on a phone.** Tab bar on small screens, a rail on desktop; tables fold
  into readable cards; the charts are hand-drawn SVG, so there is no chart
  library to download over a weak connection.

## Repository layout

```
.
├── index.html                  the whole app shell
├── assets/
│   ├── css/app.css             design tokens and every component
│   └── js/
│       ├── config.local.js     the sheet link built into the site
│       ├── util.js             dates, formatting, DOM helper, CSV
│       ├── api.js              endpoint config + POST/JSONP transport
│       ├── charts.js           stacked, ranked and diverging SVG charts
│       ├── ui.js               messages, fields, tables, pickers, mode switch
│       ├── store.js            shared state and derived reads
│       ├── pages/
│       │   ├── dashboard.js    both sides, margin, today's register
│       │   ├── entry.js        milk in / milk out
│       │   ├── people.js       suppliers / customers
│       │   ├── advances.js     money out ahead of a supplier's bill
│       │   ├── money.js        pay a supplier / collect from a customer
│       │   ├── reports.js      period reports, either side or both
│       │   └── settings.js     appearance, sheet link, sheet settings
│       └── app.js              navigation, routing, theme, first-run screen
├── apps-script/
│   ├── Code.gs                 the entire API + setup()
│   └── appsscript.json         manifest (timezone, scopes, web-app access)
├── docs/SETUP.md               the step-by-step install
├── .github/workflows/          GitHub Pages deployment
└── .nojekyll                   serve files as-is
```

## Quick start

1. Follow **[docs/SETUP.md](docs/SETUP.md)** to create the sheet, paste in
   `apps-script/Code.gs`, run `setup`, and deploy the web app.
2. Put your `/exec` link in `assets/js/config.local.js`.
3. Open `index.html`, or publish it with GitHub Pages.

Because the link is built into the site, a new phone, a reinstalled browser or a
different computer is connected the moment it opens the page — nobody is asked
to paste anything. A single device can still point itself at another sheet from
**Settings → Sheet connection**, and **Disconnect** puts it back on the built-in
link.

## Sheet structure

`setup()` creates eight tabs with these exact headers. The script reads by header
name, so you can widen or reorder columns, but do not rename them.

**The buy side**

| Sheet | Columns |
|---|---|
| **Suppliers** | `supplier_id`, `name`, `mobile`, `village`, `rate_per_litre`, `status`, `created_at` |
| **Collections** | `entry_id`, `date`, `supplier_id`, `supplier_name`, `shift`, `litres`, `fat`, `snf`, `rate_per_litre`, `amount`, `note`, `recorded_at` |
| **Advances** | `advance_id`, `date`, `supplier_id`, `supplier_name`, `type`, `amount`, `note`, `recorded_at` |
| **Payments** | `payment_id`, `date`, `supplier_id`, `supplier_name`, `period_from`, `period_to`, `milk_amount`, `advance_recovered`, `net_amount`, `mode`, `reference`, `note`, `recorded_at` |

**The sell side**

| Sheet | Columns |
|---|---|
| **Customers** | `customer_id`, `name`, `mobile`, `address`, `rate_per_litre`, `status`, `created_at` |
| **Sales** | `sale_id`, `date`, `customer_id`, `customer_name`, `shift`, `litres`, `rate_per_litre`, `amount`, `note`, `recorded_at` |
| **Receipts** | `receipt_id`, `date`, `customer_id`, `customer_name`, `amount`, `mode`, `reference`, `note`, `recorded_at` |

**Shared**

| Sheet | Columns |
|---|---|
| **Settings** | `key`, `value`, `note` |

Dates are stored as plain text in `yyyy-mm-dd` so they never shift with a
timezone, and they still sort correctly. `status` is `Active` / `Inactive`,
`shift` is `Morning` / `Evening`, `type` is `Given` / `Recovered`. Those columns
carry dropdowns, so typing in the sheet by hand is guarded too.

### Settings keys

| Key | Default | What it changes |
|---|---|---|
| `business_name` | Dakotax Milk Collection | Name in the app header |
| `currency` | INR | Currency symbol used everywhere |
| `default_rate` | 32 | Rate **paid to a supplier** when they have none of their own |
| `default_sale_rate` | 40 | Rate **charged to a customer** when they have none of their own |
| `shift_cutover_hour` | 12 | Before this hour the app pre-selects Morning |
| `allow_future_dates` | no | Whether an entry may be dated ahead |
| `max_litres_per_entry` | 200 | Guard against a slipped decimal point |

## Validation and duplicate rules

Everything below is enforced in `Code.gs`, so it holds no matter which device or
browser sent the request.

| Rule | Message you get |
|---|---|
| Date must be `yyyy-mm-dd` and real | *"Collection date must look like 2026-08-30."* |
| No future dates unless allowed | *"That date is in the future. Today is 30 Aug 2026."* |
| Party must exist and be active | *"Lakshmi Devi is marked Inactive. Set them back to Active…"* |
| Litres > 0 and under the cap | *"Litres looks like a typing mistake — the limit is 200."* |
| One collection per date + supplier + shift | *"Ravi Kumar already has a Morning entry for 30 Aug 2026 (8.5 L)…"* |
| One delivery per date + customer + shift | *"Amman Sweets already has an Evening delivery for 30 Aug 2026 (6.2 L)…"* |
| Supplier and customer IDs unique, no spaces | *"Customer ID 'C001' already belongs to Sri Balaji Tea Stall."* |
| Mobile 6–15 digits, optional `+` | *"Mobile number should be 6 to 15 digits…"* |
| Advance recovery ≤ outstanding | *"Ravi Kumar has an outstanding advance of 2000.00…"* |
| One payment per supplier + period | *"Ravi Kumar was already paid for 1 Aug 2026 to 31 Aug 2026…"* |
| Same receipt twice in a day | Saved, with a warning — a customer really can pay twice |

Errors carry the offending field name, so the app highlights the input and puts
the message under it rather than only in a toast. Concurrent writes are
serialised with `LockService`, so two clerks saving at once cannot interleave.

## How the front end talks to the sheet

Apps Script does not answer CORS preflight requests, so `api.js` sends every
call as a *simple* `POST` with a `text/plain` body. If that is blocked — some
corporate networks and in-app browsers do — the same call is retried as JSONP,
which no browser treats as cross-origin. `doGet` and `doPost` share one router,
so both roads reach the same code.

## Publishing on GitHub Pages

```bash
git init
git add .
git commit -m "Dakotax milk collection"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

Then **Settings → Pages → Build and deployment → GitHub Actions**. The included
workflow publishes on every push to `main` and prints the address in the run
summary. `.nojekyll` is present so nothing is filtered out.

## Colour and appearance

Chart series use ochre for the morning round and indigo for the evening one —
the same two colours the app's accent switches between, so the shift you are
recording is legible without reading a word. Milk in and milk out are told apart
by **position** rather than a third hue: bought sits above the zero line, sold
below it, which survives any kind of colour blindness and makes the gap between
them the margin. Every palette was checked for colour-vision deficiency and for
contrast against both the light and dark surfaces; dark mode uses its own steps
rather than a flipped copy, and every chart also ships a legend, direct labels
and a matching table, so nothing depends on colour alone.

The theme follows the operating system unless a device pins it. The choice lives
in that browser only and is stamped before the first paint, so a phone set to
dark never flashes white.

## Security

The deployment described here is **open**: anyone with the `/exec` link can read
and write the sheet. That is deliberate — workers get no login — but it means
the link is the only protection, and since it is built into the site, anyone who
can open the page can read it out of the source. That is the same exposure as
sharing the site address. Keep both inside the worker group, and re-deploy with
a new URL if either leaks.

To tighten it later, the smallest change is deploying with access set to
**Anyone within your organisation**, which costs each worker a Google sign-in.
A shared PIN checked in `route()` against a Settings key is the middle option.

## Editing the data by hand

The sheet stays a normal sheet. Adding a row by hand works as long as the ID is
unique. Editing litres by hand does **not** recalculate `amount` — the app does
that on save — so change both, or make the edit through the app.

## Licence

Use it, change it, ship it.
