# Config Builder CLI — Usage Guide

## What It Does

The config builder reads AFM local wage agreement PDFs from your machine, sends them to Gemini AI for extraction, validates the output, and writes the results to the database as `PendingContractType` records. You then review and approve them in the web app's Admin Panel > Config Review tab.

## Prerequisites

### 1. Cloud SQL Auth Proxy

The script connects to the production PostgreSQL database via Cloud SQL. You need the Cloud SQL Auth Proxy running locally.

**Install** (if you haven't already):
```bash
# macOS
brew install cloud-sql-proxy

# Or download directly
curl -o cloud-sql-proxy https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/v2.14.3/cloud-sql-proxy.darwin.arm64
chmod +x cloud-sql-proxy
```

**Run** (in a separate terminal — leave it running):
```bash
cloud-sql-proxy afm-smart-contracts-app:us-central1:afm-smart-contracts-app-fdc
```

You should see output like:
```
Listening on /cloudsql/afm-smart-contracts-app:us-central1:afm-smart-contracts-app-fdc
```

> **Note:** You must be authenticated with `gcloud auth application-default login` for the proxy to connect.

### 2. Environment Variables

The script reads from `functions/.env`. Make sure these are set:

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (already configured for Cloud SQL socket) |
| `GEMINI_API_KEY` | Yes | Google Gemini API key for AI extraction |

### 3. Dependencies

```bash
cd functions && npm install
```

This also runs `prisma generate` via the `postinstall` script.

---

## Running the Script

```bash
cd functions && npm run config-builder
```

This runs `ts-node src/scripts/config-builder.ts`.

---

## Step-by-Step Walkthrough

### Step 1: Admin Email

```
=== AFM Config Builder ===

Admin email: paulpivetta@gmail.com
  Authenticated as: paulpivetta@gmail.com (clxyz123...)
```

Enter your email address. It must match an existing user in the database. This is used to record who created the pending items (`createdByUserId`).

**If it fails:** `Error: No user found with email "..."` — the email doesn't exist in the `User` table. Sign in to the web app first to create your user record.

### Step 2: Select or Create a Local

The script lists all existing locals:

```
Existing locals:
  47 — Local 47 – Los Angeles
  802 — Local 802 – New York City

Local ID (number, or "new" to create):
```

**To use an existing local:** Type the ID number (e.g., `47`).

**To create a new local:** Type `new`, then fill in the details:

```
Local ID (number, or "new" to create): new
  New local ID (number): 148
  Local name: Atlanta Local 148-462
  Currency symbol [$]: $
  Currency code [USD]: USD
  Created local 148 — Atlanta Local 148-462
```

- **Local ID** — The official AFM local number (e.g., 148, 47, 802)
- **Local name** — Display name shown in the app
- **Currency symbol** — Defaults to `$`. Use `C$` for Canadian locals
- **Currency code** — Defaults to `USD`. Use `CAD` for Canadian locals

### Step 3: Provide PDF Paths

```
Path to wage agreement PDF(s) (comma-separated): /Users/paulpivetta/development/AFM - Atlanta Local/wage-scales-2025.pdf
```

**Single file:**
```
/path/to/wage-agreement.pdf
```

**Multiple files** (comma-separated):
```
/path/to/casual-rates.pdf, /path/to/recording-rates.pdf, /path/to/rehearsal-scales.pdf
```

**Supported formats:** PDF (`.pdf`), PNG (`.png`), JPG/JPEG (`.jpg`, `.jpeg`)

**Tips:**
- Use absolute paths to avoid issues
- You can drag a file from Finder into the terminal to paste its path
- The script validates that all files exist before processing

### Step 4: Processing

The script processes each file sequentially:

```
Processing: wage-scales-2025.pdf...
  Extraction notes:
    - Unclear if cartage is pensionable — document says 'subject to local bylaws'
    - Leader premium tiers inferred from examples, not explicitly stated
  Extracted: Casual Live Engagement (casual_live_engagement)
  Extracted: Concert Performance (concert_performance)
  Extracted: Recording Session (recording_session)

=== Done ===
  Batch ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
  Extracted: 3 contract types
  Errors: 0

  Review and approve in the admin panel.
```

**What happens during processing:**
1. The PDF is read from disk and base64-encoded
2. Sent to Gemini AI (`gemini-3.1-flash-lite-preview`) with a specialized wage agreement prompt
3. Gemini extracts all contract types, wage scales, financial rules, and legal text
4. Each extracted contract type is validated against the Zod schema
5. Valid items are written to `PendingContractType` with status `pending`
6. Invalid items are written with status `error` and the validation error message

**Processing time:** Typically 15-45 seconds per PDF depending on document length.

### Step 5: Review in Admin Panel

1. Go to [afm-smart-contracts-app.web.app/#admin](https://afm-smart-contracts-app.web.app/#admin)
2. Click the **Config Review** tab
3. You'll see your batch with all extracted items
4. Click **Review** on each pending item
5. Check the JSON — pay attention to:
   - `extractionNotes` — AI uncertainty flags (review these carefully)
   - `wageScales` — verify rates and durations match the source document
   - `rules` — check pension %, overtime rates, health amounts
   - `fields` — form field definitions
6. Edit the JSON if needed (use the **Field Reference** dropdown for guidance)
7. Click **Approve** to merge into the local's config, or **Reject** to discard

---

## Troubleshooting

### "Error: No user found with email"
Sign in to the web app first to create your user record, then retry.

### "GEMINI_API_KEY is not configured on the server"
Add `GEMINI_API_KEY=your-key-here` to `functions/.env`.

### "Error: File not found"
Check the file path. Use absolute paths. Drag the file from Finder into the terminal.

### "AI response was truncated and could not be repaired"
The document was too large or complex for a single Gemini call. Try splitting it into smaller PDFs (e.g., separate sections by engagement type).

### Validation errors
The extracted data didn't match the expected schema. Common issues:
- Missing required fields (e.g., `summary` must be an array, even if empty)
- Invalid tier ordering (tiers must be sorted by `min`, non-overlapping)
- Invalid basis values (must be one of: `totalScaleWages`, `overtimePay`, `totalPremiums`, `totalCartage`, `totalRehearsal`, `subtotalWages`, `totalAdditionalFees`)

Items with validation errors are still saved with status `error` — you can view and manually fix them in the admin panel.

### Cloud SQL Proxy connection errors
Make sure:
1. The proxy is running in a separate terminal
2. You're authenticated: `gcloud auth application-default login`
3. The socket path in `DATABASE_URL` matches the proxy's instance name

---

## Example: Full Session

```bash
$ cd functions && npm run config-builder

=== AFM Config Builder ===

Admin email: paulpivetta@gmail.com
  Authenticated as: paulpivetta@gmail.com (clxyz123...)

Existing locals:
  47 — Local 47 – Los Angeles

Local ID (number, or "new" to create): new
  New local ID (number): 148
  Local name: Atlanta Local 148-462
  Currency symbol [$]: $
  Currency code [USD]: USD
  Created local 148 — Atlanta Local 148-462

Path to wage agreement PDF(s): /Users/paulpivetta/development/AFM - Atlanta Local/wage-scales.pdf

Processing: wage-scales.pdf...
  Extraction notes:
    - Holiday surcharge percentage not specified — defaulted to 50%
  Extracted: Casual Live Performance (casual_live_performance)
  Extracted: Concert Engagement (concert_engagement)

=== Done ===
  Batch ID: 7f3a9b2c-...
  Extracted: 2 contract types
  Errors: 0

  Review and approve in the admin panel.
```

Then go to the admin panel, review each item, and approve.
