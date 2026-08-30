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
3. Google asks for permission the first time. Choose your account →
   **Advanced** → *Go to (project name) (unsafe)* → **Allow**. The warning is
   what Google shows for any script that has not been through its review
   programme; you are approving your own code.
4. Back on the sheet you now have five tabs: **Suppliers**, **Collections**,
   **Advances**, **Payments**, **Settings**, with headers frozen and dropdowns
   on the status, shift, type and mode columns.

Want something on the dashboard before you start? Run **loadSampleData** once —
four suppliers and a week of entries. Delete those rows when you are done.

## 4. Check the settings

Open the **Settings** tab and adjust the values in column B:

| Key | Set it to |
|---|---|
| `business_name` | What should appear in the app header |
| `currency` | `INR`, `USD`, `EUR` or `GBP` |
| `default_rate` | Your standard rate per litre |
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

## 6. Open the app

Either way works:

- **Locally.** Download this repository and double-click `index.html`.
- **On the web.** Publish it with GitHub Pages — step 7.

On first open you get a welcome screen. Paste the `/exec` link and choose
**Connect this device**. The app tests the link before it saves it, and remembers
it in that browser.

To connect a worker's phone: send them the site address, have them paste the same
link once. Or skip that by editing `assets/js/config.local.js`, uncommenting the
line and putting your `/exec` URL in it before you publish — then every phone is
connected the moment it opens the page.

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

1. Open the app. It already knows the date and which round it is.
2. **Daily entry** → type part of the supplier's name, ID or mobile number →
   litres → **Save entry**.
3. Everything saved in that round is listed underneath, with the running total,
   so you can check it against the cans before the tanker leaves.
4. **Advances** when money changes hands outside the milk bill.
5. **Payments** at the end of the period: pick the supplier and the dates,
   **Calculate from the register**, check the numbers, record it.
6. **Reports** for a period summary and CSV exports for the accountant.

---

## When something goes wrong

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
