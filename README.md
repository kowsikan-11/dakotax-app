# Dakotax Milk Collection

A milk collection register for a village collection centre. The front end is a
static site — plain HTML, CSS and JavaScript, no build step — that any phone can
open. The back end is a Google Apps Script web app in front of a Google Sheet,
so every device reads and writes the same data.

Six sections: **Dashboard**, **Daily entry**, **Suppliers**, **Advances**,
**Payments**, **Reports**, plus **Settings**.

---

## What it does

- **Auto date and shift.** The entry page fills in today's date and picks
  Morning or Evening from the clock (the cutover hour is a setting). Both can be
  changed before saving — you are never locked into the guess.
- **One entry per supplier, per date, per shift.** The script refuses a second
  one and names the entry that already exists, with its litres, so you can tell
  a mistake from a genuine second weighing.
- **Advances that reconcile.** Money given out and money taken back are one
  ledger. A recovery larger than the outstanding balance is refused. Recovering
  an advance inside a payment also writes the Advances row, so the balance is
  the same number wherever you look at it.
- **Payments computed from the register.** Pick a supplier and a period and the
  app totals the milk, subtracts what was already paid for that exact period,
  and shows the advance still outstanding before you commit anything.
- **Reports and CSV.** Filter by period, supplier and shift; export a supplier
  summary or every underlying entry. Excel opens the files directly.
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
│       ├── config.local.js     optional: hard-wire the sheet link
│       ├── util.js             dates, formatting, DOM helper, CSV
│       ├── api.js              endpoint config + POST/JSONP transport
│       ├── charts.js           SVG stacked columns and ranked bars
│       ├── ui.js               messages, fields, tables, supplier picker
│       ├── store.js            shared state and derived reads
│       ├── pages/              one file per section
│       └── app.js              navigation, routing, first-run screen
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
2. Open `index.html` — locally by double-clicking it, or from GitHub Pages.
3. Paste the `/exec` link on the welcome screen. It is remembered on that
   device.

To skip step 3 on every phone, put the link in `assets/js/config.local.js` and
commit it.

## Sheet structure

`setup()` creates five tabs with these exact headers. The script reads by header
name, so you can widen or reorder columns, but do not rename them.

| Sheet | Columns |
|---|---|
| **Suppliers** | `supplier_id`, `name`, `mobile`, `village`, `rate_per_litre`, `status`, `created_at` |
| **Collections** | `entry_id`, `date`, `supplier_id`, `supplier_name`, `shift`, `litres`, `fat`, `snf`, `rate_per_litre`, `amount`, `note`, `recorded_at` |
| **Advances** | `advance_id`, `date`, `supplier_id`, `supplier_name`, `type`, `amount`, `note`, `recorded_at` |
| **Payments** | `payment_id`, `date`, `supplier_id`, `supplier_name`, `period_from`, `period_to`, `milk_amount`, `advance_recovered`, `net_amount`, `mode`, `reference`, `note`, `recorded_at` |
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
| `default_rate` | 32 | Rate suggested when a supplier has none |
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
| Supplier must exist and be active | *"Lakshmi Devi is marked Inactive. Set them back to Active…"* |
| Litres > 0 and under the cap | *"Litres looks like a typing mistake — the limit is 200."* |
| One entry per date + supplier + shift | *"Ravi Kumar already has a Morning entry for 30 Aug 2026 (8.5 L)…"* |
| Supplier ID unique, no spaces | *"Supplier ID 'S001' already belongs to Ravi Kumar."* |
| Mobile 6–15 digits, optional `+` | *"Mobile number should be 6 to 15 digits…"* |
| Advance recovery ≤ outstanding | *"Ravi Kumar has an outstanding advance of 2000.00…"* |
| One payment per supplier + period | *"Ravi Kumar was already paid for 1 Aug 2026 to 31 Aug 2026…"* |

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

## Colour

Chart series use ochre for the morning round and indigo for the evening one —
the same two colours the app's accent switches between, so the shift you are
recording is legible without reading a word. The pair, plus the teal used for
single-series charts, was checked for colour-vision deficiency and for contrast
against both the light and dark surfaces; dark mode uses its own steps rather
than a flipped copy. Every chart also ships a legend, direct labels and a
matching table, so nothing depends on colour alone.

## Security

The deployment described here is **open**: anyone with the `/exec` link can read
and write the sheet. That is deliberate — workers get no login — but it means
the link is the only protection. Keep it inside the worker group and re-deploy
with a new URL if it leaks.

To tighten it later, the smallest change is deploying with access set to
**Anyone within your organisation**, which costs each worker a Google sign-in.
A shared PIN checked in `route()` against a Settings key is the middle option.

## Editing the data by hand

The sheet stays a normal sheet. Adding a supplier row by hand works as long as
`supplier_id` is unique. Editing litres by hand does **not** recalculate
`amount` — the app does that on save — so change both, or make the edit through
the app.

## Licence

Use it, change it, ship it.
