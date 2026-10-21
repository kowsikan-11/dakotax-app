# Dakotax Milk Collection

A milk register for a collection centre, made for phones. It keeps **both sides
of the book**: milk bought from suppliers (you pay them) and milk sold to
customers (they pay you).

The site is plain HTML, CSS and JavaScript — no build step — published with
GitHub Pages. The data lives in a Google Sheet, behind a Google Apps Script web
app, so every phone reads and writes the same register.

**Version 2** — new screens, English and Tamil, instant saving that keeps
working without signal, and search and filters built for thousands of people.

---

## Upgrading from the first version

Do the sheet script first, then the website. Each half also works with the
other half's old version, so nothing breaks in between.

**1. The sheet script (about 3 minutes)**

1. Open the Google Sheet → **Extensions → Apps Script**.
2. Select everything in `Code.gs` and replace it with
   [`apps-script/Code.gs`](apps-script/Code.gs). Save.
3. In the function list at the top choose **setup**, then **Run**. It only adds
   missing columns and removes completely empty columns — your rows are not
   touched.
4. **Deploy → Manage deployments →** pencil (**Edit**) **→ Version: New version
   → Deploy.** The web-app link stays the same, so no phone needs changing.

**2. The website (on a computer)**

1. Unzip the download.
2. In the repository on github.com: **Add file → Upload files**, drag in
   everything inside the unzipped folder (`index.html`, `manifest.webmanifest`,
   `assets`, `apps-script`, `docs`, `README.md` …) and **Commit changes**.
   `assets/js/config.local.js` already holds your sheet link.
3. Optional tidy-up — these old files are no longer used and can be deleted on
   GitHub (open the file → **⋯ → Delete file**):
   `assets/js/pages/collection.js`, `assets/js/pages/payments.js`,
   `assets/js/pages/suppliers.js`, and the **top-level** `config.local.js`
   (keep the one inside `assets/js`).
4. GitHub Pages publishes in a minute or two. On each phone, open the site and
   pull down to refresh once.

---

## The screens

The bar at the bottom of a phone: **Home · Milk In · Milk Out · People · More**.
**More** holds **Pay supplier, Collect money, Advances, Reports, Settings**, the
language and the appearance. On a computer the same pages sit in a side rail.

| Page | What it is for |
|---|---|
| **Home** | Today's milk in and out, how far this round has got, the last 14 days, this month, the biggest suppliers and customers. |
| **Milk In** (green) | Milk you buy. Choose the supplier, type the litres, save. |
| **Milk Out** (blue) | Milk you sell. Choose the customer, type the litres, save. |
| **People** | Suppliers and customers: add, change, stop, call, download a list. |
| **Pay supplier** | Adds up a supplier's milk for some dates, takes back advance if you want, records the payment. |
| **Collect money** | Money received from a customer; shows who owes you most. |
| **Advances** | Money given to a supplier before their bill, and money taken back. |
| **Reports** | Totals for any dates, per supplier or customer, with files for the accountant. |
| **Settings** | Language, appearance, saving, sheet space, rates and rules, sheet link. |

Milk In and Milk Out are separate pages with their own colour and their own
address (`#/in`, `#/out`), so one can never show up when the other was tapped.

## Saving

- **Instant.** Save puts the entry on the screen at once and sends it to the
  sheet in the background. The top bar shows *Sending…*, then *Saved*.
- **No signal? Keep working.** Entries wait on the phone (*Offline · 3
  waiting*) and go out together when the signal comes back — even if the app
  was closed in between.
- **Never twice.** Every save carries its own number, so a save repeated on a
  weak connection is recognised by the sheet instead of creating a second row.
- **Checked twice.** A second entry for the same person in the same round is
  stopped on the phone before sending, and the sheet checks again.
- **When the sheet refuses something** (for example, someone else already
  entered that supplier on another phone), the entry is marked *Not saved* with
  the reason; tap it to fix or remove it.

## Thousands of people

Built for a centre with 2,000 suppliers and 1,000 customers.

- **Find anyone fast.** Every place you choose a person opens a search. Type
  the number (`125`, `S125` or `S0125` all find S0125 first), part of the name,
  the village or area, or part of the mobile number. **Enter** (or **Go** on the
  phone keyboard) takes the best match — on Milk In and Milk Out it then jumps
  straight to the litres.
- **Filters.** On Milk In / Milk Out: *Not recorded yet* and *Recorded* for this
  round. On Pay supplier and Advances: *Has advance*. On Collect money: *Owes
  money*, *In credit*. Each button shows how many.
- **Village / area.** Narrow any list to one village (suppliers) or area
  (customers). The chooser remembers it, so a round can be worked village by
  village.
- **Order** by number or by name — on People also by advance or by what is owed.
- **Long lists stay smooth.** Lists draw the first part and load more as you
  scroll. The round's entries, the "who owes you" list and report tables have
  their own search box.
- **Quick start-up.** A big centre gets today's rows and the totals for the
  rest of the month, not every row, so the app opens quickly on a weak signal.

## Sheet space — please read at a big centre

Google allows **10 million cells** in one spreadsheet file, counting every cell
of every tab, empty ones too. When the file is full, **new entries cannot be
saved**.

A rough guide: 2,000 suppliers twice a day is about 4,000 Milk In rows a day —
about 48,000 cells a day on that tab alone. With Milk Out on top, a very busy
centre can fill a file in five or six months.

- **Settings** shows how full the file is. **Home** warns from 80%.
- `setup` removes completely empty columns (a new tab has 26), which can free
  more than half the space of a sheet made with the old version.
- Moving old months out needs care: what a customer owes is worked out from
  every sale ever recorded, so **do not delete old Sales rows by hand**. An
  archive tool that moves finished months to a separate file and carries the
  balances forward can be added when your file gets near 80%.

## Sheet structure

`setup()` creates eight tabs with these headers. The script reads by header
name, so you can reorder columns or add your own to the right, but do not rename
these.

| Sheet | Columns |
|---|---|
| **Suppliers** | `supplier_id`, `name`, `mobile`, `village`, `rate_per_litre`, `status`, `created_at` |
| **Collections** (milk in) | `entry_id`, `date`, `supplier_id`, `supplier_name`, `shift`, `litres`, `fat`, `snf`, `rate_per_litre`, `amount`, `note`, `recorded_at` |
| **Advances** | `advance_id`, `date`, `supplier_id`, `supplier_name`, `type`, `amount`, `note`, `recorded_at` |
| **Payments** | `payment_id`, `date`, `supplier_id`, `supplier_name`, `period_from`, `period_to`, `milk_amount`, `advance_recovered`, `net_amount`, `mode`, `reference`, `note`, `recorded_at` |
| **Customers** | `customer_id`, `name`, `mobile`, `address`, `rate_per_litre`, `status`, `created_at` |
| **Sales** (milk out) | `sale_id`, `date`, `customer_id`, `customer_name`, `shift`, `litres`, `rate_per_litre`, `amount`, `note`, `recorded_at` |
| **Receipts** | `receipt_id`, `date`, `customer_id`, `customer_name`, `amount`, `mode`, `reference`, `note`, `recorded_at` |
| **Settings** | `key`, `value`, `note` |

Dates are plain text `yyyy-mm-dd`. `status` is `Active` / `Inactive`, `shift`
is `Morning` / `Evening`, `type` is `Given` / `Recovered`. Those columns carry
dropdowns, so typing in the sheet by hand is guarded too.

### Settings keys

| Key | Default | What it changes |
|---|---|---|
| `business_name` | Dakotax Milk Collection | Name on Home |
| `currency` | INR | Currency symbol used everywhere |
| `default_rate` | 32 | Rate **paid to a supplier** who has no rate of their own |
| `default_sale_rate` | 40 | Rate **charged to a customer** who has no rate of their own |
| `shift_cutover_hour` | 12 | Before this hour the app picks Morning, from it Evening |
| `allow_future_dates` | no | Whether an entry may be dated ahead |
| `max_litres_per_entry` | 200 | Stops a slipped decimal point (850 instead of 8.5) |

These can also be changed from the app's Settings page.

## Rules the sheet enforces

Checked in `Code.gs`, so they hold whichever phone sends the request:

- one Milk In entry per supplier, per date, per round — and the same for Milk Out;
- litres above 0 and under the limit; no future dates unless allowed;
- stopped people cannot get new entries;
- IDs unique, no spaces; mobile 6–15 digits;
- an advance taken back can never be more than what is outstanding;
- one payment per supplier per exact period;
- the same amount received twice in a day is saved with a warning.

Two people saving at the same moment are handled one after the other.

## Repository layout

```
.
├── index.html                  the app shell
├── manifest.webmanifest        "Add to home screen" details
├── assets/
│   ├── css/app.css             every style, light and dark
│   ├── img/                    app icons
│   └── js/
│       ├── config.local.js     the sheet link built into the site
│       ├── i18n.js             English and Tamil
│       ├── util.js             dates, numbers, small helpers
│       ├── api.js              talking to the sheet (POST, JSONP fallback)
│       ├── store.js            the data on the phone, the save queue, search
│       ├── ui.js               fields, choosers, sheets, lists, messages
│       ├── charts.js           the SVG charts
│       ├── app.js              pages, navigation, top bar
│       └── pages/              home, milk in/out, people, money, advances, reports, settings
├── apps-script/
│   ├── Code.gs                 the whole sheet script, with setup()
│   └── appsscript.json         manifest (time zone, web-app access)
└── docs/SETUP.md               step-by-step install and help
```

## Security

The web app is deployed with access **Anyone**: whoever has the `/exec` link can
read and write the register, and the link is inside the site's source. Keep the
site address within your workers. If it leaks, make a **new deployment** (new
link), put it in `assets/js/config.local.js`, and upload again.

## Editing the data by hand

The sheet stays an ordinary sheet. Adding a row by hand works when the ID is
unique. Editing litres does **not** recalculate `amount`, so change both or use
the app.

To start quickly the script keeps a few totals for a while. Changes made
through the app are counted at once; a change typed straight into the sheet
shows in what customers owe within 30 minutes, and — at a big centre — in the
day totals of older days within 6 hours. **Settings → Refresh from sheet**
reloads the recent rows at once.

## Licence

Use it, change it, ship it.
