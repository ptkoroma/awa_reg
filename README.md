# VIP Guest Registration

A browser database-backed event staff app for registering VIP guests, assigning them manually to named tables, and enforcing 12 seats per table across up to 25 tables.

## Use

Serve the folder locally and open `index.html` in a browser:

```sh
python3 -m http.server 4173
```

Then visit `http://localhost:4173/index.html`. Data is saved in the browser's IndexedDB database on that device. Existing `localStorage` data is migrated into the database the first time the app loads.

## Staging With Vercel + Supabase

Run the SQL in `supabase/schema.sql` in your Supabase project first.

Set these Vercel environment variables for the staging deployment:

```sh
SUPABASE_URL=https://your-project-ref.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
VIP_EVENT_ID=default
```

When those variables are present, the app uses Supabase as the shared event database. Without them, it falls back to IndexedDB for local development.

Create staff accounts in Supabase before sharing the staging link:

1. Open Supabase Authentication.
2. Go to Users.
3. Click Add user.
4. Enter each staff member's email and password.
5. Confirm the user if Supabase prompts for email confirmation.

Only signed-in staff can read or update the guest database.

For local Supabase testing without Vercel, copy `config.example.js` to `config.js`, fill in the same values, and add this line before `vip-db.js` in each HTML file while testing:

```html
<script src="config.js"></script>
```

Open `seating.html` to view the same data as a graphical seating chart.

Open `checkin.html` for a fast tablet-friendly door check-in view.

## Features

- Add VIP guests by full name.
- Add private staff notes for each VIP.
- Edit guest names after registration.
- Assign VIP categories: `Sponsor` or `Head of Table`.
- Warn staff before adding duplicate guest names.
- Assign each guest to one named table.
- Assign and edit seat numbers from 1-12.
- Hard block when a table reaches 12 guests.
- Limit each event to 25 tables.
- Show assignment warnings for duplicate names, missing seats, duplicate seats, full tables without a head, and tables with more than one Head of Table.
- Undo the last dashboard change.
- Add custom table names such as `Sponsors`, `Honorees`, or sponsor names.
- Edit table names and delete empty tables.
- Set guest status to `Not Arrived`, `Checked In`, `Seated`, or `No Show`.
- Store the check-in timestamp when a guest is marked `Checked In`.
- Use a dedicated fast check-in page for door staff.
- Review registration data on an analytics page with mono charts, event readiness score, table heat map, warnings, guest drilldown, and live refresh mode.
- Use global search across guests, tables, seats, VIP categories, statuses, and notes.
- Filter table views by all tables, full tables only, or open seats only.
- Import CSV, TSV, XLSX, or XLS guest lists.
- Preview imports before guests are added.
- Export the current list to CSV.
- Download and restore JSON backups of all database-backed event data with safer validation.
- Clear local event data after an event with a confirmation prompt.
- Print table assignments.
- View and print a graphical table layout with 12 seats per table.
- Drag VIPs between tables from the graphical seating view.
- Show a color legend for table colors on the seating view.
- Use fullscreen mode for the graphical seating view.
- Color-code tables using the event palette, including Purple, Gold, Kelly Green, Neon colors, Silver, White, and Pantone Purple.
- Save event name and logo in the browser database.

## Import Format

CSV and Excel files work best with these headers:

```csv
Full Name,Table,Seat,VIP Category,Status,Notes
Ada Lovelace,Sponsors,1,Head of Table,Checked In,Escort to stage
Grace Hopper,Honorees,2,Sponsor,Not Arrived,Vegetarian meal
```

Excel import loads the SheetJS library from a CDN the first time it is used. CSV import works offline.
