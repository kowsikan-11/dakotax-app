# Setting it up

About fifteen minutes, once. You need a Google account and a GitHub account.

> **Already using the first version?** You only need the short
> [upgrade steps in the README](../README.md#upgrading-from-the-first-version).

---

## 1. Create the sheet

1. Go to <https://sheets.new> and name the spreadsheet — *Dakotax Milk Register*
   is a fine name.
2. **File → Settings → Time zone.** Set it to your local zone (India:
   *(GMT+05:30) India Standard Time*). Dates and the morning / evening round
   are worked out from it.

## 2. Add the script

1. **Extensions → Apps Script.** A new tab opens with an empty `Code.gs`.
2. Select everything in the editor and replace it with the contents of
   [`apps-script/Code.gs`](../apps-script/Code.gs).
3. Optional: click the gear (**Project Settings**), tick *Show
   "appsscript.json" manifest file in editor*, and paste in
   [`apps-script/appsscript.json`](../apps-script/appsscript.json). It sets the
   time zone and keeps the script's permission to this one sheet.
4. Save (**Ctrl/Cmd + S**).

## 3. Build the tabs

1. In the function list at the top of the editor, choose **setup**.
2. Click **Run**.
3. Google asks for permission the first time:

   1. **Authorization required** → **Review permissions**.
   2. Pick the Google account that owns the spreadsheet.
   3. On **Google hasn't verified this app**, click **Advanced**, then
      **Go to *(your project name)* (unsafe)**. Google shows this for every
      script written for one's own sheet; the code you are approving is the
      `Code.gs` in front of you.
   4. The script asks to see and edit **only the spreadsheet it is attached
      to**. Click **Allow**.

   You do this once, as the owner. Workers are never asked, because the web app
   runs as you (step 5).

4. The sheet now has eight tabs — **Suppliers**, **Collections**, **Advances**,
   **Payments**, **Customers**, **Sales**, **Receipts**, **Settings** — with
   headers, frozen top rows and dropdowns.

Want to try it first? Run **loadSampleData** once: four suppliers, three
customers and a week of entries. Delete those rows before real use.

Running `setup` again later is safe: it adds missing columns, removes columns
that are completely empty, and never touches your rows.

## 4. Check the settings

Open the **Settings** tab (or later, the app's Settings page):

| Key | Set it to |
|---|---|
| `business_name` | The name to show on Home |
| `currency` | `INR`, `USD`, `EUR` or `GBP` |
| `default_rate` | What you normally pay a supplier per litre |
| `default_sale_rate` | What you normally charge a customer per litre |
| `shift_cutover_hour` | The hour the evening round begins, `0`–`23` (`12` = noon) |
| `allow_future_dates` | `no`, unless you really want ahead-dated entries |
| `max_litres_per_entry` | A little above your largest real delivery |

## 5. Deploy the web app

1. In the Apps Script editor: **Deploy → New deployment**.
2. Click the gear beside *Select type* and choose **Web app**.
3. Fill in:
   - **Execute as** — **Me**.
   - **Who has access** — **Anyone**. Workers then need no login.
4. **Deploy**, approve if asked, and copy the **Web app URL**:

   ```
   https://script.google.com/macros/s/AKfycb…long…/exec
   ```

> **Changed `Code.gs` later?** Use **Deploy → Manage deployments → pencil (Edit)
> → Version: New version → Deploy.** That keeps the same link. A *new
> deployment* would give a different link.

## 6. Put the link into the site

Open `assets/js/config.local.js` and set your `/exec` link:

```js
window.DAKOTAX_API_URL = 'https://script.google.com/macros/s/AKfycb…/exec';
```

Every phone that opens the site is then connected straight away — nothing to
paste. One device can still be pointed at another sheet (a test copy) from
**Settings → Sheet link**; **Disconnect** puts it back.

## 7. Publish with GitHub Pages

1. Create a repository on github.com and upload the files (**Add file → Upload
   files**, drag in everything, **Commit changes**).
2. **Settings → Pages → Build and deployment → Source: Deploy from a branch →
   `main` / `(root)` → Save.**
3. After a minute the address appears on that page, like
   `https://<you>.github.io/<repo>/`. Open it on each phone.

On a phone, **Add to Home screen** from the browser menu gives the app its own
icon.

---

## Day to day

**Milk in (from suppliers)**

1. Open **Milk In** (green). The date and the round are already set from the
   clock — change them only when catching up on an old round.
2. Tap **Supplier**, type the number (`125`) or part of the name, press
   **Go** / **Enter**. The litres box is ready.
3. Type the litres → **Save**. The entry appears in the list below at once and
   is sent in the background.
4. **Not recorded yet** lists who is still to come this round. At a big centre,
   tap **See all … not recorded** to go through them by village or number.

**Milk out (to customers)** — the same on **Milk Out** (blue). The rate comes
from the customer's own rate.

**Money**

- **Pay supplier** at the end of a period: choose the supplier and the dates
  (the last 10-day cycle is already chosen), check the sum, take back advance if
  you want, **Record payment**.
- **Collect money** when a customer pays. What they owe is filled in; change it
  for a part payment. Paying more than they owe shows as credit.
- **Advances** when you hand a supplier money ahead of their bill, or take it
  back.
- **Reports** for totals over any dates, and files for the accountant.

**The top bar** shows the saving state: *Saved*, *Sending…*, *Offline · 3
waiting*, or *2 not saved* — tap it to see the list. The round **த** / **EN**
button beside it switches between Tamil and English.

---

## When something goes wrong

**The top bar says "Offline · n waiting".**
There is no signal. Keep working: the entries are kept on the phone and sent by
themselves when the signal returns. Do not clear the browser's data while
entries are waiting.

**An entry is marked "Not saved".**
The sheet refused it — usually because the same person already has an entry for
that round (perhaps from another phone). Tap it: **Fix and save again**, **Try
again as it is**, or **Remove this entry**.

**Settings says "The sheet script is out of date".**
The site is new but the script is old. Saving still works; paste the new
`Code.gs` and deploy a new version (step 5 note) for faster saves.

**Home says "The sheet file is 80% full".**
Google allows 10 million cells per file. Run `setup` once (it removes empty
columns), then plan to move old months to a separate file — see *Sheet space* in
the [README](../README.md#sheet-space--please-read-at-a-big-centre). Do not delete
old Sales rows by hand: what customers owe is counted from them.

**The page says "The Web App requires you to authorize access to your data."**
The deployment runs as the visitor instead of you. **Deploy → Manage
deployments → Edit** → **Execute as: Me**, **Who has access: Anyone** →
**Version: New version → Deploy**. The link stays the same.

**"No answer from the sheet" / "The sheet link is not working".**
Check that access is *Anyone* and that the link ends in `/exec` (a `/dev` link
only works for the owner).

**"A sheet tab is missing".**
A tab was renamed or deleted. Run `setup` again — it rebuilds what is missing
and leaves existing rows alone.

**Entries save but Home shows nothing for today.**
Check the sheet's time zone (step 1). If the sheet thinks it is another day,
today's entries land on that day.

**An old version still shows on a phone.**
Pull down to refresh, or close the tab and open the site again.
