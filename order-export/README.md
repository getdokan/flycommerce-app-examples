# Order Export

Download a store's orders as a CSV file. The merchant picks a period and the columns on a page inside their FlyCommerce dashboard, clicks **Download CSV**, and gets one row per order: any of number, date, customer, email, status, total and currency. A Settings page keeps how the file is named and which columns are checked to start with.

It's the smallest useful FlyCommerce app, and the place to start. It shows the three things every app does:

1. **Install:** the store sends the merchant to the app with a one-time code, and the app keeps the store's credential (`src/install.ts`).
2. **Know who's asking:** the page calls the app's server with a session token, and the server verifies it before trusting the store it names (`src/session.ts`).
3. **Read the store:** the server reads the orders as that user, a page at a time, and turns them into CSV (`src/export.ts`, `src/csv.ts`).

Then it lets the merchant choose: the columns, defined once in `src/columns.ts`, and per-store settings kept in one JSON file (`src/settings.ts`, `src/data.ts`).

No webhooks, no database, no background jobs. When you need those, the [Building apps](https://developers.flycommerce.com/docs/apps) guide covers them.

## Run it

You need Node 22 or later. No FlyCommerce account: the emulator plays the store, the hub and the dashboard.

```bash
npm install
npm run dev
```

Open the dashboard address it prints (`http://127.0.0.1:4003/apps/export`), pick a period and the columns, and click **Download CSV**. On **Settings**, change the file name format and the default columns. The emulator's store has a month of orders, including customers named `Sam O"Neil, Jr` and `=HYPERLINK(...)`, so you can see how the file keeps them safe.

```bash
npm test        # the export, end to end against the emulator
```

## Files

| File                         | What it does                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `src/server.ts`              | Every route in one table, and `createApp()`. Start here.                                                        |
| `src/install.ts`             | The install URL: swaps the code for the store's credential                                                      |
| `src/session.ts`             | `whoIsAsking()`: verifies the session token                                                                     |
| `src/export.ts`              | `GET /api/export`: reads the orders in the period as the user and answers a CSV file                            |
| `src/columns.ts`             | The columns, defined once: a key, a header, and how to read the value from an order                             |
| `src/csv.ts`                 | CSV that Excel and Google Sheets read safely                                                                    |
| `src/settings.ts`            | `GET` and `PUT /api/settings`: the file name format and the default columns, checked before saving              |
| `src/data.ts`                | Each store's settings in one JSON file, with defaults for a store that saved none                               |
| `src/pages/ExportOrders.tsx` | The export page: a period, the columns and a button, built with [`@flycommerce/ui`](https://ui.flycommerce.com) |
| `src/pages/Settings.tsx`     | The settings page: a file name format with a live preview, and the default columns                              |
| `src/pages/ColumnChoice.tsx` | The column checkboxes both pages share                                                                          |
| `src/pages/fileName.ts`      | Fills in the file name format with the store and the merchant's local dates                                     |
| `src/dev.ts`                 | `npm run dev`: the emulator, sample orders, the app and the example dashboard                                   |
| `test/export.test.ts`        | Install, the session check, paging, CSV safety, the chosen columns, and settings kept per store                 |

[TUTORIAL.md](TUTORIAL.md) builds the app in four steps, each tagged in git (`order-export-step-1` to `-4`).

## Run it on a real store

1. In the [developer portal](https://developers.flycommerce.com), create an app, request the `orders.read` permission, and set the install URL to `https://<your-app>/auth/callback`.
2. Create a version, put your App ID, version and URL in `app-config.json`, and upload it to that version.
3. Copy `.env.example` to `.env` and fill it in. Then `npm run build && npm start`, somewhere the dashboard can reach over HTTPS.
4. Install the app on a store you own: it's under **Apps → Your apps** until it's published.

## What it doesn't do

- **Very large periods.** The file is built in memory. For tens of thousands of orders, stream the rows as they arrive instead.
- **Keep customer data.** The app keeps only each store's settings. Customer names and emails pass through the server on their way to the merchant; the app neither stores nor logs them. Keep it that way if you change it.
