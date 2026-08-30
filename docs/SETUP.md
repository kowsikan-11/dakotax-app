# Setting it up

About fifteen minutes, once. You need a Google account and, for the last part, a
GitHub account.

---

## 1. Create the sheet

1. Go to <https://sheets.new> and name the spreadsheet — *Dakotax Milk Register*
   is a fine name.
2. **File → Settings → Time zone.** Set it to your local zone (India:
   *(GMT+05:30) India Standard Time*). The script stamps every record from this,
   so getting it right now saves confusion later.

## 2. Add the script

1. **Extensions → Apps Script.** A new tab opens with an empty `Code.gs`.
2. Select everything in the editor and replace it with the contents of
   [`apps-script/Code.gs`](../apps-script/Code.gs) from this repository.
3. Optional but tidy: click the gear (**Project Settings**) and tick *Show
   "appsscript.json" manifest file in editor*, then paste in
   [`apps-script/appsscript.json`](../apps-script/appsscript.json). It sets the
   timezone and the web-app access up front.
4. Save (**Ctrl/Cmd + S**).

## 3. Build the tabs

1. In the function dropdown at the top of the editor, choose **setup**.
2. Click **Run**.
3. Google asks for permission the first time. This is the step that stops most
   people, so here it is click by click:

   1. A dialog appears: **Authorization required — this project requires your
      permission to access your data.** Choose **Review permissions**.
   2. A window opens listing your Google accounts. Pick the one that owns the
      spreadsheet.
   3. You land on **Google hasn't verified this app**. Click **Advanced** at the
      bottom left, then **Go to *(your project name)* (unsafe)**.

      Nothing is unsafe here. Google shows that screen for every script it has
      not put through its review programme, which includes every script anyone
      writes for their own sheet. The code you are approving is the `Code.gs`
      sitting in the editor in front of you.
   4. The consent screen lists what the script wants: **See, edit, create and
      delete only the specific Google Drive files you use with this app.** That
      is the sheet this script is attached to, and nothing else in your Drive.
      Click **Allow**.

   You do this once, as the owner. Because the web app is deployed with
   **Execute as: Me** (step 5), no worker is ever asked to authorise anything.

4. Back on the sheet you now have eight tabs — **Suppliers**, **Collections**,
   **Advances**, **Payments** on the buy side; **Customers**, **Sales**,
   **Receipts** on the sell side; and **Settings** — with headers frozen and
   dropdowns on the status, shift, type and mode columns.

Want something on the dashboard before you start? Run **loadSampleData** once —
four suppliers, three customers and a week of entries on both sides. Delete
those rows when you are done.

## 4. Check the settings

Open the **Settings** tab and adjust the values in column B:

| Key | Set it to |
|---|---|
| `business_name` | What should appear in the app header |
| `currency` | `INR`, `USD`, `EUR` or `GBP` |
| `default_rate` | What you normally pay a supplier per litre |
| `default_sale_rate` | What you normally charge a customer per litre |
| `shift_cutover_hour` | The hour Evening begins, `0`–`23`. `12` means noon |
| `allow_future_dates` | `no`, unless you really want ahead-dated entries |
| `max_litres_per_entry` | A little above your largest realistic delivery |

You can also change all of these later from the app's Settings page.

## 5. Deploy the web app

1. In the Apps Script editor: **Deploy → New deployment**.
2. Click the gear beside *Select type* and choose **Web app**.
3. Fill in:
   - **Description** — `v1`
   - **Execute as** — **Me**. The script runs with your access to the sheet, so
     workers never need access to the sheet itself.
   - **Who has access** — **Anyone**. This is what lets workers use it with no
     login. (If your Google Workspace hides this option, the closest is *Anyone
     within your organisation*, and each worker will have to sign in.)
4. **Deploy**, approve if asked, and copy the **Web app URL**. It looks like:

   ```
   https://script.google.com/macros/s/AKfycb…long…/exec
   ```

   Keep this link. It is both the address and the password.

> **Changed `Code.gs` later?** Use **Deploy → Manage deployments → edit (pencil)
> → Version: New version → Deploy.** That keeps the same URL. Creating a *new
> deployment* gives you a different URL and every device would need re-pasting.

## 6. Put the link into the site

Open `assets/js/config.local.js` and set your own `/exec` URL:

```js
window.DAKOTAX_API_URL = 'https://script.google.com/macros/s/AKfycb…/exec';
```

That is the whole connection step. Every device that opens the site is connected
the moment the page loads — no key to paste on a new phone, and a reinstalled
browser or a different computer just works.

Then open the app either way:

- **Locally.** Download this repository and double-click `index.html`.
- **On the web.** Publish it with GitHub Pages — step 7.

If you ever need one device pointed at a different sheet (a test copy, say), set
it from **Settings → Sheet connection** on that device. **Disconnect** puts it
back on the link built into the site.

> Because the link is in the page source, anyone who can open the site can read
> it. That is the same exposure as sharing the site address itself, which is the
> trade-off of a deployment with access set to *Anyone*. If the link leaks,
> create a **new deployment** (which issues a fresh URL), put that URL in
> `config.local.js`, and publish again.

## 7. Publish with GitHub Pages

```bash
git init
git add .
git commit -m "Dakotax milk collection"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

In the repository on GitHub: **Settings → Pages → Build and deployment →
Source: GitHub Actions**. The workflow in `.github/workflows/deploy-pages.yml`
runs on each push to `main`; open the **Actions** tab to watch it and to get the
published address.

The site is static, so it is free, fast, and there is nothing to keep running.

## 8. Day-to-day

**Milk coming in**

1. Open the app. It already knows the date and which round it is.
2. **Daily entry**, with the switch on **Milk in** → type part of the supplier's
   name, ID or mobile number → litres → **Save entry**.
3. Everything saved in that round is listed underneath, with the running total,
   so you can check it against the cans before the tanker leaves.

**Milk going out**

4. Same page, switch to **Milk out** → pick the customer → litres →
   **Save delivery**. The rate comes from the customer's own selling rate.

**Money**

5. **Advances** when you hand a supplier money ahead of their bill.
6. **Money → Pay a supplier** at the end of the period: pick the supplier and
   the dates, **Calculate from the register**, check the numbers, record it.
7. **Money → Collect from a customer** when they pay. The amount is pre-filled
   with everything they owe; change it for a part payment. Paying more than they
   owe is fine — the extra shows as credit.
8. **Reports** for a period summary on either side, or **Both sides** for the
   margin, plus CSV exports for the accountant.

## 9. Appearance

The app follows whatever the phone or computer is set to. The round button in
the header cycles **match my system → always light → always dark**, and the same
choice is in **Settings → Appearance**. It is remembered on that device only, so
the clerk's phone and the office computer can differ.

---

## When something goes wrong

**The page says "The Web App requires you to authorize access to your data."**

The deployment is running as *whoever opens it* rather than as you, so Google
asks each visitor for their own permission — and an anonymous worker has no way
to give it. Fix the deployment rather than clicking through the prompt:

1. Apps Script editor → **Deploy → Manage deployments**.
2. Click the pencil (**Edit**) on the active deployment.
3. Set **Execute as** to **Me (your@email)** and **Who has access** to
   **Anyone**.
4. Set **Version** to **New version**, then **Deploy**.

The URL stays the same, so nothing needs re-pasting. Reload the app and the
prompt is gone.

Two related cases:

- **You see it as the owner, in the editor, when you first run `setup`.** That
  one is expected — work through step 3 above and it never comes back.
- **Your Google Workspace has no "Anyone" option**, only *Anyone within
  (organisation)*. Then every worker must be signed in to a work account, and
  each one authorises once on their first visit. If that is not workable, ask
  your Workspace admin to allow the app, or run the sheet from a personal
  Google account instead.

**"The web-app link could not be reached."**
Access is probably not set to *Anyone*. Open **Deploy → Manage deployments**,
edit the deployment, and check. Also confirm the link ends in `/exec` and not
`/dev` — a `/dev` link only works while you are signed in as the owner.

**"The link did not return app data."**
Usually a `/dev` URL, or a deployment made before `Code.gs` was pasted in.
Re-deploy with **New version**.

**"The sheet 'Collections' is missing."**
`setup` has not been run on this spreadsheet, or a tab was renamed. Run `setup`
again — it leaves existing rows alone.

**Entries save but the dashboard is empty.**
Check the sheet's timezone (step 1). If the sheet thinks it is a different day
from the phone, today's entries land on yesterday.

**A duplicate warning you disagree with.**
The rule is one entry per supplier, per date, per shift. If a supplier really
delivered twice in one round, add the second lot to the existing entry rather
than creating a new row — the message names the entry so you can find it.

**Two people saving at the same time.**
Handled: writes are serialised. If the second one waits too long it is told to
try again rather than being silently dropped.
