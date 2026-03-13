# AFM Smart Contract Generator

**A full-stack, configuration-driven web application for generating, calculating, versioning, and exporting union-compliant musician contracts for AFM (American Federation of Musicians) and CFM (Canadian Federation of Musicians) locals across North America.**

Live: [afm-smart-contracts-app.web.app](https://afm-smart-contracts-app.web.app)

---

## Table of Contents

- [How It Works](#how-it-works)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Frontend Deep Dive](#frontend-deep-dive)
- [Backend Deep Dive](#backend-deep-dive)
- [Database Schema](#database-schema)
- [Authentication Flow](#authentication-flow)
- [Configuration System](#configuration-system)
- [Calculation Engine](#calculation-engine)
- [PDF Generation](#pdf-generation)
- [Email Integration](#email-integration)
- [Admin Panel](#admin-panel)
- [Role System](#role-system)
- [Security](#security)
- [Type System & Validation](#type-system--validation)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Deployment](#deployment)
- [Recent Refactoring](#recent-refactoring)

---

## How It Works

Every AFM/CFM local has unique contracts, wage scales, overtime rules, pension rates, and legal clauses. Instead of building a separate app for each local, this platform uses a **configuration-driven architecture** — all contract forms, financial rules, and legal text are defined in JSON configuration objects stored in the database. The React frontend reads these configs at runtime and dynamically assembles the UI, validation rules, and calculation logic.

**User flow:**

1. Sign in via Google OAuth or email/password (with email verification)
2. Select an AFM Local from a dropdown (e.g., Local 47 Los Angeles, Local 802 New York)
3. Choose a contract type from that local's available templates
4. Fill out the dynamically generated form (engagement details, dates, wages)
5. Add musicians to the personnel roster (leader, sidepersons, doubling, cartage)
6. View real-time financial calculations (wages, overtime, pension, health, work dues)
7. Save the contract to the cloud, create named version snapshots
8. Export to PDF or email the completed contract directly from the browser

---

## Architecture Overview

```
Browser                          Firebase Hosting (CDN)
  |                                      |
  |  React SPA (Vite build)              |
  |  - Firebase Auth (client SDK)        |
  |  - jsPDF (client-side PDF)           |
  |                                      |
  |  /api/* requests ──────────────────> Firebase Cloud Functions (2nd Gen)
                                         |
                                    Express.js API
                                    - Firebase Admin SDK (token verification)
                                    - Prisma ORM
                                    - Zod validation
                                    - Resend (email)
                                    - Google Gemini AI (contract scanning)
                                         |
                                    Google Cloud SQL
                                    (PostgreSQL 17)
```

The frontend is a React 18 SPA served from Firebase Hosting's global CDN. All `/api/*` requests are rewritten to a Firebase Cloud Function running Express.js. The backend connects to a PostgreSQL database on Google Cloud SQL via Prisma ORM. Firebase Authentication handles identity; the backend verifies tokens and manages authorization.

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|---|---|---|
| React | 18.2 | UI framework |
| Vite | 5.x | Build tool and dev server |
| TypeScript | 5.2 | Type safety |
| Tailwind CSS | 3.x | Utility-first styling |
| Firebase JS SDK | 12.x | Client-side authentication (Google OAuth, email/password) |
| jsPDF | 2.5 | Client-side PDF generation |
| jspdf-autotable | 3.8 | Table rendering plugin for jsPDF |
| html2canvas | 1.4 | HTML-to-canvas rendering (PDF support) |

### Backend

| Technology | Version | Purpose |
|---|---|---|
| Node.js | 20 | Runtime |
| Express | 4.19 | HTTP framework |
| Prisma | 5.14 | PostgreSQL ORM with migrations |
| Firebase Admin SDK | 13.7 | Token verification, user management (disable/delete) |
| Firebase Functions | 7.0 | Cloud Function runtime (2nd Gen, scales to zero) |
| Zod | 3.23 | Request body validation schemas |
| @google/genai | 1.23 | Gemini AI SDK (contract scanner + batch ingestion) |
| Resend | 6.9 | Transactional email delivery |
| adm-zip | 0.5 | ZIP file extraction (batch upload) |
| Busboy | 1.6 | Multipart form data parsing (PDF email attachments, file uploads) |
| Helmet | 7.1 | HTTP security headers |
| express-rate-limit | 7.2 | Rate limiting (100 requests / 15 minutes) |

### Infrastructure

| Service | Purpose |
|---|---|
| Firebase Hosting | Static frontend delivery via global CDN |
| Firebase Cloud Functions (2nd Gen) | Serverless API hosting (Cloud Run under the hood) |
| Google Cloud SQL | Managed PostgreSQL 17 (db-f1-micro) |
| Firebase Authentication | Identity provider (Google OAuth + email/password) |
| Resend | Outbound email with PDF attachments |

---

## Project Structure

```
afm-v4/
├── frontend/                          # React SPA
│   ├── src/
│   │   ├── App.tsx                    # Root component, hash-based routing, auth/suspension gates
│   │   ├── index.tsx                  # React DOM entry point
│   │   ├── types.ts                   # All TypeScript type definitions (see Type System section)
│   │   │
│   │   ├── components/
│   │   │   ├── ContractWizard.tsx     # Main contract builder — orchestrates hooks, step-based wizard
│   │   │   ├── WizardProgress.tsx     # Step progress bar with clickable dots and labels
│   │   │   ├── WizardStepView.tsx     # Renders a single wizard step (form fields or personnel)
│   │   │   ├── WizardReviewStep.tsx   # Final review step with summary, actions, email history
│   │   │   ├── BatchIngestion.tsx     # Batch contract type ingestion (ZIP upload or Google Drive)
│   │   │   ├── LoginPage.tsx          # Google OAuth + email/password sign-in with verification
│   │   │   ├── LocalSelector.tsx      # Local union dropdown (fetches from /api/locals)
│   │   │   ├── AdminPanel.tsx         # Multi-tab admin: scanner, batch, notes, usage, users, configs
│   │   │   ├── AdminRoute.tsx         # Auth guard wrapper (admin/god only)
│   │   │   ├── LocalConfigEditor.tsx  # CRUD editor for LocalConfig records (admin)
│   │   │   ├── UsageDashboard.tsx     # Per-user usage statistics dashboard (admin)
│   │   │   ├── AnnouncementBanner.tsx # Dismissible global announcement banner
│   │   │   ├── OpenContractModal.tsx  # Browse/filter/load/delete saved contracts
│   │   │   ├── EmailModal.tsx         # Email form with recipient, subject, message
│   │   │   ├── DynamicField.tsx       # Renders form fields by type (text, date, currency, select, etc.)
│   │   │   ├── Accordion.tsx          # Animated accordion for form field groups
│   │   │   └── Tooltip.tsx            # UI tooltip component
│   │   │
│   │   ├── hooks/
│   │   │   ├── useConfig.ts           # Fetches local config from /api/locals/:id
│   │   │   ├── useContractStorage.ts  # CRUD for saved contracts via REST API
│   │   │   ├── useContractForm.ts     # Form state, validation, keyboard navigation
│   │   │   ├── usePersonnelRoster.ts  # Musician roster: add/remove/update, leader roles, SSNs
│   │   │   ├── useDraftPersistence.ts # Auto-save to localStorage (500ms debounce), restore on revisit
│   │   │   ├── useVersionManagement.ts# Contract version snapshots, save/load/delete
│   │   │   └── useWizardNavigation.ts # Step-based wizard navigation with conditional steps
│   │   │
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx         # Firebase auth state, auto-provisioning, suspension detection
│   │   │
│   │   ├── services/
│   │   │   └── pdfGenerator.ts        # Multi-page PDF builder (jsPDF + autotable)
│   │   │
│   │   └── utils/
│   │       ├── firebase.ts            # Firebase client initialization (session persistence)
│   │       └── calculations.ts        # Financial calculation engine (3 models)
│   │
│   ├── index.html                     # SPA entry HTML
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── vite.config.ts                 # Vite config with /api proxy for local dev
│
├── functions/                         # Express.js Backend
│   ├── src/
│   │   ├── index.ts                   # Express app setup, rate limiting, route mounting, CF export
│   │   │
│   │   ├── routes/
│   │   │   ├── auth.ts                # GET /api/auth/me — auto-provision user + workspace
│   │   │   ├── contracts.ts           # CRUD for contracts + version snapshots
│   │   │   ├── locals.ts              # CRUD for LocalConfig (public read, admin write)
│   │   │   ├── admin.ts               # User management, announcements, usage stats, notes, scan
│   │   │   ├── batch.ts               # Batch contract ingestion (ZIP upload, Google Drive, review)
│   │   │   ├── email.ts               # POST /api/email — send PDF via Resend + email logging
│   │   │   ├── announcements.ts       # GET /api/announcements/latest
│   │   │   ├── workspaces.ts          # Workspace management (multi-tenant scaffolding)
│   │   │   └── items.ts               # Workspace items (multi-tenant scaffolding)
│   │   │
│   │   ├── middleware/
│   │   │   ├── auth.ts                # requireAuth, requireAdmin, requireGod + suspension check
│   │   │   └── tenant.ts              # requireWorkspace (workspace-scoped validation)
│   │   │
│   │   ├── schemas/
│   │   │   ├── contracts.ts           # Zod schemas for contract/version request bodies
│   │   │   ├── admin.ts               # Zod schemas for role update, announcement creation
│   │   │   ├── batch.ts               # Zod schemas for batch ingestion endpoints
│   │   │   └── locals.ts              # Zod schemas for LocalConfig create/update
│   │   │
│   │   └── utils/
│   │       ├── prisma.ts              # Singleton PrismaClient instance
│   │       ├── firebase.ts            # Firebase Admin SDK initialization
│   │       └── gemini.ts              # Gemini AI document scanner (structured JSON extraction)
│   │
│   ├── prisma/
│   │   ├── schema.prisma              # Database schema definition
│   │   └── migrations/                # Sequential SQL migration files
│   │
│   ├── package.json
│   └── tsconfig.json
│
└── firebase.json                      # Hosting rewrites + Cloud Functions config
```

---

## Frontend Deep Dive

### Routing

Hash-based routing without React Router. The `AppContent` component in `App.tsx` listens to `window.location.hash` via a `hashchange` event listener.

| Hash | What renders |
|---|---|
| (empty) | `LocalSelector` → `MainAppView` with `ContractWizard` |
| `#admin` | `AdminPanel` (wrapped in `AdminRoute` guard) |
| (unauthenticated) | `LoginPage` |
| (suspended) | Suspension notice screen with date |

### ContractWizard — The Core Component

`ContractWizard.tsx` is the main contract building interface, presented as a **step-based wizard**. Form field groups from the contract config become individual steps, with a final review step for summary, export, and email actions. It orchestrates six custom hooks:

| Hook | Responsibility |
|---|---|
| `useContractForm` | Form field state (`formData`), validation errors, field grouping, keyboard shortcuts |
| `usePersonnelRoster` | Musician list (`personnel[]`), SSN tracking (client-only, never sent to server), leader/sideperson roles, duplicate detection |
| `useDraftPersistence` | Auto-saves form + personnel to `localStorage` every 500ms (debounced). Keyed by `{localId}_{userId}_{contractTypeId}`. Restores drafts on revisit or contract type switch |
| `useVersionManagement` | Named version snapshots. Save/load/delete versions via the contracts API. Tracks `activeVersionIndex` for PDF export |
| `useContractStorage` | REST API CRUD wrapper. `saveContract()`, `updateContract()`, `loadContract()`, `deleteContract()` |
| `useWizardNavigation` | Step index tracking, conditional step visibility (via `stepMeta` conditions), next/back/goto navigation |

**Wizard UI components:**
- `WizardProgress` — Clickable step dots with labels, shows current step and completion state
- `WizardStepView` — Renders a single step's form fields or the personnel roster
- `WizardReviewStep` — Final review: read-only summary of all data, calculation results, action buttons (save, PDF, email), version management, and email send history

**Conditional steps:** Contract configs can define `stepMeta` with conditions (e.g., show the "Overtime" step only when `engagementDuration > 3`). The `useWizardNavigation` hook evaluates these conditions against the current form data and filters the visible step list dynamically.

**State coordination pattern:** The `activeVersionId` state lives in `ContractWizard` (not in any hook) and acts as a "dirty flag." When form data or personnel changes, hooks call an `onDirty` callback that sets `activeVersionId` to null, indicating the current form has diverged from the last saved snapshot. The `resetForm` function is also kept in `ContractWizard` as an orchestrator that calls each hook's individual reset.

### DynamicField — Config-Driven Form Fields

`DynamicField.tsx` renders a single form field based on its `Field.type` from the contract configuration. Supported types:

| Type | Renders |
|---|---|
| `text` | Standard text input |
| `date` | Date picker |
| `time` | Time input |
| `currency` | Number input with currency symbol prefix |
| `number` | Number input with optional min constraint |
| `textarea` | Multi-line text area |
| `select` | Dropdown. If `dataSource: 'wageScales'`, options are populated from the contract type's wage scales |

### Auth Persistence

Firebase auth is configured with `browserSessionPersistence` — the session ends when the browser tab or window is closed. There is no "remember me" or persistent login across sessions.

---

## Backend Deep Dive

### Express App Setup (`index.ts`)

The Express app configures:
- **Helmet** for HTTP security headers
- **CORS** with an explicit origin allowlist (`localhost:5173`, `*.web.app`, `*.firebaseapp.com`)
- **Rate limiting** at 100 requests per 15-minute window
- **Cookie parser** for token fallback
- **JSON body parser** with 10MB limit (for contract data)

On production startup (`NODE_ENV === 'production'`), the app asynchronously runs `prisma migrate deploy` to apply pending database migrations.

The app is exported both as a Firebase Cloud Function (`onRequest({ memory: "512MiB" }, app)`) and supports standalone execution (`node dist/index.js`) for Cloud Run or local development.

### API Endpoints

#### Auth — `/api/auth`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/me` | Required | Auto-provisions Firebase user in PostgreSQL. Creates User + default Workspace + OWNER Membership on first login. Returns `{ user: { id, email, role, isAdmin, isGod } }`. GOD role is hardcoded for `paulpivetta@gmail.com` |

#### Locals — `/api/locals`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/` | Public | List all locals (id + name) for the LocalSelector dropdown |
| `GET` | `/:id` | Public | Return full JSON config for a specific local |
| `POST` | `/` | Admin | Create a new LocalConfig record (Zod validated) |
| `PUT` | `/:id` | Admin | Update a LocalConfig record (Zod validated) |
| `DELETE` | `/:id` | Admin | Delete a LocalConfig record |

#### Contracts — `/api/contracts`

All routes require authentication. Ownership is verified on write operations.

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List user's contracts, optionally filtered by `?localId=` |
| `POST` | `/` | Create contract with optional version snapshots (Zod validated) |
| `PUT` | `/:id` | Update contract. Versions are replaced via `deleteMany` + `create` (Zod validated) |
| `DELETE` | `/:id` | Delete contract (cascade deletes versions) |
| `POST` | `/:id/versions` | Save a named version snapshot (Zod validated) |
| `DELETE` | `/:id/versions/:versionId` | Delete a specific version snapshot |

#### Admin — `/api/admin`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/users` | GOD | List all users with contract counts and suspension status |
| `PUT` | `/users/:id/role` | GOD | Change user role (USER/ADMIN/SUPERADMIN/GOD) |
| `DELETE` | `/users/:id` | GOD | Permanently delete user from Prisma + Firebase Auth. Cleans up orphaned workspaces. Self-delete protected |
| `PUT` | `/users/:id/suspend` | GOD | Toggle suspend/unsuspend. Syncs `disabled` flag to Firebase Auth. Self-suspend protected |
| `POST` | `/announcements` | Admin | Create global announcement (deactivates all previous) |
| `DELETE` | `/announcements` | Admin | Deactivate the current active announcement |
| `GET` | `/usage` | Admin | Aggregate usage stats: lifetime totals, today's activity, per-user breakdown |
| `POST` | `/scan` | SuperAdmin | Upload a contract image for Gemini AI extraction (returns structured JSON) |
| `GET` | `/notes` | SuperAdmin | List top-level admin notes with replies (pinned first, then by date) |
| `POST` | `/notes` | SuperAdmin | Create a new admin note or reply to an existing one |
| `PUT` | `/notes/:id/pin` | GOD | Toggle pin status on a note |
| `DELETE` | `/notes/:id` | GOD | Delete an admin note (cascades to replies) |
| `POST` | `/batch-upload` | SuperAdmin | Upload a ZIP of contract documents for batch Gemini processing |
| `POST` | `/batch-drive` | SuperAdmin | Import files from a public Google Drive folder for batch processing |
| `GET` | `/batch-pending` | SuperAdmin | List pending contract type items (filterable by localId, status, batchId) |
| `PUT` | `/batch-pending/:id` | SuperAdmin | Edit the parsed JSON of a pending item |
| `POST` | `/batch-pending/:id/approve` | SuperAdmin | Approve and merge a pending contract type into the local's config |
| `POST` | `/batch-pending/:id/reject` | SuperAdmin | Mark a pending item as rejected |
| `DELETE` | `/batch-pending/:id` | SuperAdmin | Permanently delete a pending item |

#### Email — `/api/email`

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/` | Required | Accepts `multipart/form-data` with `to`, `subject`, `message`, `contractId`, `referenceNumber` fields and a `pdf` file attachment. Sends via Resend API and logs to `EmailLog` table if tied to a saved contract |

#### Announcements — `/api/announcements`

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/latest` | Required | Returns the most recent active announcement (if any) |

### Middleware

**`requireAuth`**: Extracts Bearer token from `Authorization` header (or falls back to `req.cookies.token`). Verifies via Firebase Admin SDK's `verifyIdToken()`. Looks up the user in PostgreSQL by email. Checks `suspendedAt` — returns 403 with suspension timestamp if set. Attaches `req.user` with `{ id, email, role }`.

**`requireAdmin`**: Passes if `role` is `ADMIN`, `SUPERADMIN`, or `GOD`. Returns 403 otherwise.

**`requireSuperAdmin`**: Passes if `role` is `SUPERADMIN` or `GOD`. Returns 403 otherwise.

**`requireGod`**: Passes only if `role` is exactly `GOD`. Returns 403 otherwise.

---

## Database Schema

Defined in `functions/prisma/schema.prisma`. PostgreSQL 17 on Google Cloud SQL.

### Models

**User**
```
id           String    @id (UUID — set to Firebase UID on creation)
email        String    @unique
name         String?
passwordHash String?
role         String    @default("USER")   — "USER" | "ADMIN" | "SUPERADMIN" | "GOD"
suspendedAt  DateTime?                    — null = active, non-null = suspended since
createdAt    DateTime
updatedAt    DateTime
```
Relations: `memberships[]`, `oauths[]`, `contracts[]`, `announcements[]` — all cascade on delete.

**Workspace**
```
id          String
name        String
ownerUserId String    — plain string, NOT a foreign key (no cascade)
```
Relations: `memberships[]`, `invites[]`, `items[]`

**Membership** (User ↔ Workspace join table)
```
userId      String
workspaceId String
role        String    @default("MEMBER")  — "OWNER" | "ADMIN" | "MEMBER"
```
Unique constraint on `[userId, workspaceId]`. Cascades on both User and Workspace delete.

**Contract**
```
userId             String
localId            Int
contractTypeId     String
name               String
baseFormData       Json    — the form field values as a key-value object
personnel          Json    — array of Person objects
activeVersionIndex Int?    — which version snapshot is currently "active"
```
Indexed on `[userId, localId]`. Cascades on User delete.

**ContractVersion**
```
contractId     String
name           String     — user-assigned snapshot name
formData       Json       — full form state at time of snapshot
personnel      Json       — full personnel roster at time of snapshot
contractTypeId String
```
Cascades on Contract delete.

**Announcement**
```
message         String
isActive        Boolean   @default(true)
createdByUserId String
```
Only one announcement is active at a time (enforced via a Prisma transaction that deactivates all before creating a new one).

**LocalConfig**
```
id     Int     @id    — corresponds to the AFM local number (e.g., 47, 802)
name   String         — display name (e.g., "Local 47 – Los Angeles")
config Json           — the full JSON config object (see Configuration System)
```

**EmailLog**
```
id              String
contractId      String    — FK to Contract
recipientEmail  String
referenceNumber String    — the PDF reference number sent
subject         String
sentAt          DateTime
```
Cascades on Contract delete. Tracks every email sent for a contract, displayed in the review step.

**AdminNote**
```
id              String
content         String
category        String    @default("General")
isPinned        Boolean   @default(false)
parentId        String?   — self-referential FK for threaded replies
createdByUserId String
createdByEmail  String
createdAt       DateTime
```
Self-referential relation: top-level notes have `parentId = null`, replies point to a parent note. Cascade on parent delete removes all replies. Indexed on `createdAt` and `parentId`.

**PendingContractType**
```
id              String
localId         Int       — target local for the contract type
sourceFileName  String    — original document filename
status          String    — "pending" | "approved" | "rejected" | "error"
parsedData      Json      — Gemini-extracted ContractType JSON
error           String?   — error message if parsing failed
createdByUserId String
batchId         String    — groups files from a single upload
createdAt       DateTime
```
Indexed on `[localId, status]` and `[batchId]`. Represents AI-extracted contract types awaiting admin review.

**Other models:** `OAuthAccount` (provider auth links), `Invite` (workspace invitations with token + expiry), `Item` (workspace items — multi-tenant scaffolding).

### Cascade Map (User Deletion)

When a user is deleted, the following cascades automatically via Prisma:
- All `OAuthAccount` records
- All `Membership` records
- All `Contract` records (which cascade their `ContractVersion` and `EmailLog` records)
- All `Announcement` records they created

`Workspace` records where the user is `ownerUserId` are cleaned up manually in the delete endpoint (no FK relation exists).

---

## Authentication Flow

```
1. User clicks "Sign in with Google" or enters email/password
2. Firebase verifies credentials, returns an ID token
3. Email/password users must verify their email first (unverified = immediate sign-out)
4. AuthContext detects the token via onAuthStateChanged
5. GET /api/auth/me called with Authorization: Bearer {token}
6. Backend: verifyIdToken() → findUnique by email → check suspendedAt
7. If new user: create User + Workspace + Membership in a transaction
8. If suspended: return 403 with suspendedAt timestamp
9. Frontend stores user state; all subsequent API calls include the Bearer token
10. Session ends when browser tab/window is closed (browserSessionPersistence)
```

When a suspended user attempts to log in, they see a dedicated screen showing "Account Suspended" with the exact suspension date and instructions to contact their administrator. The Firebase account is also disabled to prevent new token issuance.

---

## Configuration System

Each AFM Local's contract definitions are stored as a JSON object in the `LocalConfig.config` column. The structure:

```typescript
{
  localId: number;           // e.g., 47
  localName: string;         // e.g., "Local 47 – Los Angeles"
  currency: {
    symbol: string;          // e.g., "$" or "C$"
    code: string;            // e.g., "USD" or "CAD"
  };
  contractTypes: ContractType[];  // array of available contract templates
}
```

Each `ContractType` defines:

| Property | Description |
|---|---|
| `id` | Unique identifier (e.g., `live_engagement_standard`) |
| `name` | Display name (e.g., "Standard Live Engagement") |
| `formIdentifier` | Short code used in PDF filenames |
| `calculationModel` | One of: `live_engagement`, `media_report`, `contribution_only` |
| `signatureType` | One of: `engagement`, `media_report`, `member`, `petitioner` |
| `jurisdiction` | Optional (e.g., "Canada (Ontario)") |
| `currency` | Optional override of the local's default currency |
| `fields[]` | Array of form field definitions (see DynamicField) |
| `wageScales[]` | Array of wage scales with id, name, rate, duration |
| `rules` | Financial rules: overtime rate, leader/doubling premiums, pension, health, work dues |
| `legalText` | Preamble + named legal clauses for PDF output |
| `summary[]` | Ordered list of calculation result IDs to display |

Configs are managed at runtime through the Admin Panel's LocalConfig Editor — no redeployment needed.

---

## Calculation Engine

`frontend/src/utils/calculations.ts` — a pure function with zero React dependencies.

`calculateEngagement(formData, contractType, personnel)` returns an array of `{ id, label, value }` results.

### Three Calculation Models

**`live_engagement`** — Standard live performance contracts
1. Base scale wages (from selected wage scale rate x number of musicians, or manual entry)
2. Leader premium (percentage of base scale, per leader)
3. Doubling premium (percentage of base scale, per doubling musician)
4. Cartage fees (from cartage scale lookup, per musician with cartage)
5. Rehearsal wages (rehearsal rate x hours x rehearsing musicians)
6. Overtime — **auto-calculated** when engagement duration exceeds the wage scale's included hours, plus any manual overtime hours
7. Additional fees (per category, from `additionalFees[]` config — per-musician or flat)
8. Subtotal gross wages
9. Pension contribution (percentage of pensionable wages)
10. Health contribution (flat rate per musician per service)
11. Work dues (percentage of specified wage components)
12. Total engagement cost

**`media_report`** — Recording/media contracts
1. Base scale wages (scale rate x number of musicians x number of services)
2. Overtime
3. Additional fees
4. Pension contribution
5. Health contribution
6. Work dues
7. Total cost

**`contribution_only`** — Simplified pension/health-only contracts
1. Total pensionable wages (entered directly)
2. Pension contribution (user-specified percentage)
3. Health contribution (entered directly)
4. Additional fees
5. Total contributions

### Deposits & Balance Due

Currency fields marked with `subtracts: true` (or whose `id` contains "deposit") are treated as deductions. They appear after the Total Engagement Cost as negative line items, followed by a **Balance Due** line showing the net amount.

### Additional Fees

Contract types can define an `additionalFees[]` array with fee categories. Each fee has a rate and a `perMusician` flag. The calculation engine groups fees by category and shows category subtotals in the results.

All monetary values are formatted via `formatCurrency(value, currencyCode, symbol)` which handles negative values and configurable currency symbols.

---

## PDF Generation

`frontend/src/services/pdfGenerator.ts` — runs entirely client-side using **jsPDF** + **jspdf-autotable**.

### PDF Sections (in order)

1. **Header** — Contract type name + local name (centered, bold)
2. **Engagement Details** — Auto-generated table of all non-empty form fields (striped rows, blue header)
3. **Personnel** — Table with Name, Address, and a blank SSN/SIN column for manual entry on paper (dark header)
4. **Calculation Summary** — Financial breakdown table (green header, grid lines)
5. **Legal Text** — Preamble in italics, then sequentially numbered clauses. Conditional rendering: if `formData.disputeResolution` is set, only the matching clause (arbitration vs. court action) is included
6. **Signature Lines** — "Signature of Purchaser" and "Signature of Musician/Leader" with date lines
7. **Footer** — Every page: reference number (`YYYYMMDD-{5-digit-random}`) + "Page X of Y"

**Output:** Returns `{ blob: Blob, fileName: string }` where fileName is `{formIdentifier}_{purchaserName}.pdf` (lowercased, special characters replaced with underscores).

---

## Email Integration

The frontend generates a PDF blob client-side, then sends it to `POST /api/email` as `multipart/form-data`:

| Field | Description |
|---|---|
| `to` | Recipient email address |
| `subject` | Email subject line |
| `message` | Optional body text |
| `pdf` | The PDF file binary |

The backend uses **Busboy** to parse the multipart stream (handles both Cloud Functions' `rawBody` buffer and standard Node.js `pipe` for Cloud Run). The email is sent via **Resend** with the PDF as an attachment.

From address: `AFM Smart Contracts <{EMAIL_SENDER}>` (configurable via environment variable).

---

## Admin Panel

The admin panel (`/#admin`) is a multi-tab interface with role-gated sections:

### Contract Scanner (SuperAdmin+)
Upload a photo of a physical union contract document. **Google Gemini 2.5 Flash** analyzes the image server-side and extracts all fields, wage scales, rules, and legal text into a structured `ContractType` JSON object using a strict response schema. The output can be copied and pasted into the LocalConfig Editor.

### Batch Ingestion (SuperAdmin+)
Bulk-import contract types from physical documents. Two ingestion modes:

- **ZIP Upload** — Upload a ZIP file (up to 50MB, max 15 files) containing contract documents (PDF, PNG, JPG, DOC, DOCX). Each file is processed through Gemini AI server-side and stored as a `PendingContractType` record.
- **Google Drive** — Provide a public Google Drive folder URL. The backend lists and downloads supported files from the folder, processing each through Gemini AI.

After upload, a review panel shows all pending items with status badges (pending/approved/rejected/error). Admins can:
- **Edit** the AI-extracted JSON before approval
- **Approve** to merge the contract type into the target local's config
- **Reject** or **Delete** unwanted results
- Filter by status

### Admin Notes (SuperAdmin+)
Threaded note-taking system for admin communication. Top-level notes with categories, replies, and pin functionality. GOD users can pin and delete notes; SUPERADMIN+ can create notes and replies.

### Usage Dashboard (Admin+)
Real-time usage statistics fetched from the database:
- Total contracts and versions (lifetime + today)
- Per-user breakdown: email, contract count, version count, last active date

### Announcements (Admin+)
Publish a global announcement that appears as a dismissible banner at the top of the app for all users. Publishing a new announcement automatically deactivates the previous one. Can also deactivate the current announcement.

### Local Configs (GOD only)
Form-based CRUD editor for `LocalConfig` records. Create/edit/delete entire local union configurations (including all their contract types, wage scales, and rules) directly from the browser.

### Users & Roles (GOD only)
Full user management table with:
- **Role dropdown** — change any user's role between USER, ADMIN, SUPERADMIN, and GOD
- **Suspend button** — toggle account suspension (yellow = suspend, green = unsuspend). Syncs to Firebase Auth to prevent new logins. Suspended users see a dedicated notice screen
- **Delete button** — permanently remove a user with a confirmation dialog. Deletes all their data (contracts, versions, memberships, workspaces) and removes their Firebase Auth account
- **Suspended badge** — yellow badge next to suspended user emails
- Self-protection: cannot change your own role, suspend yourself, or delete yourself

---

## Role System

Four-tier role hierarchy:

| Role | Permissions |
|---|---|
| `USER` | Create/edit/save/export own contracts |
| `ADMIN` | Everything USER can do + Usage Dashboard, Announcements |
| `SUPERADMIN` | Everything ADMIN can do + AI Scanner, Batch Ingestion, Admin Notes |
| `GOD` | Everything SUPERADMIN can do + User management (role changes, suspend, delete), Local Configs tab |

GOD role is initially hardcoded for `paulpivetta@gmail.com` in the auto-provisioning endpoint. Additional GOD/SUPERADMIN users can only be assigned by an existing GOD user.

Admins cannot view other users' private contracts — the role system enforces separation of power.

---

## Security

### Transport & Headers

- **HTTPS only** — Firebase Hosting enforces HTTPS on all connections. HTTP requests are automatically redirected.
- **Helmet** — Sets secure HTTP headers on every response: `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Strict-Transport-Security`, `X-XSS-Protection`, and others. Prevents clickjacking, MIME-type sniffing, and common injection vectors.
- **CORS allowlist** — The backend only accepts requests from explicitly listed origins (`localhost:5173` for dev, the two Firebase Hosting domains for production). Credentials mode is enabled for cookie-based token fallback.

### Authentication & Authorization

- **Firebase ID token verification** — Every authenticated request is verified cryptographically via `firebase-admin`'s `verifyIdToken()`. Tokens are JWTs signed by Google's servers; the backend never handles raw passwords for OAuth users.
- **Email verification required** — Email/password users must verify their address before gaining access. Unverified sessions are immediately signed out client-side.
- **Session-only persistence** — Auth state uses `browserSessionPersistence`, meaning sessions end when the browser tab or window closes. No persistent cookies or "remember me" tokens are stored.
- **Three-tier role enforcement** — Every admin endpoint is guarded by `requireAdmin` or `requireGod` middleware. Role checks happen server-side after token verification — the frontend role display is cosmetic; the backend is the authority.
- **Ownership verification** — Contract CRUD operations verify `userId` ownership before allowing updates or deletes. Users cannot access or modify other users' contracts.
- **Self-protection guards** — GOD users cannot delete, suspend, or demote themselves, preventing accidental lockout.

### Account Suspension (Dual-Layer)

Suspended accounts are blocked at two levels:
1. **Firebase Auth** — `auth.updateUser(uid, { disabled: true })` prevents new token issuance. The user cannot log in.
2. **Prisma middleware check** — `requireAuth` checks `suspendedAt` on every request. This closes the gap where existing Firebase tokens remain valid for up to 1 hour after disabling. Even with a cached token, a suspended user gets a 403 immediately.

### Rate Limiting

- **100 requests per 15 minutes** per IP address via `express-rate-limit`. Applies to all API endpoints. Returns 429 when exceeded.

### Input Validation

- **Zod schemas** on all write endpoints — Request bodies are parsed and validated before reaching business logic. Invalid data returns 400 with structured error details. This prevents malformed JSON from being stored in the database's `Json` columns.
- **Parameterized queries** — Prisma ORM generates parameterized SQL for all database operations, preventing SQL injection.
- **Content-Type checking** — The `useConfig` hook verifies response Content-Type headers to prevent Firebase Hosting's SPA rewrite from returning `index.html` as JSON (which would succeed with status 200 but contain HTML).

### Data Privacy

- **SSN/SIN numbers are client-only** — The personnel roster tracks SSN/SIN numbers in component state for display purposes, but they are never sent to the server or stored in the database. The PDF output includes a blank SSN/SIN column for manual entry on paper.
- **Admin data isolation** — Admins can view usage statistics (contract counts, last active dates) but cannot access other users' contract content. Only the owning user can read their contract data.
- **Firebase Auth best-effort cleanup** — When deleting a user, the Firebase Auth account is removed in addition to the database records, preventing orphaned auth accounts from lingering.

### Infrastructure

- **Scales to zero** — Cloud Functions (2nd Gen) spin down when idle, reducing attack surface during periods of no traffic.
- **Cloud SQL** — PostgreSQL runs on Google Cloud SQL with Google-managed encryption at rest, automated backups, and network isolation (Unix socket connections from Cloud Functions, no public IP exposure to the function).
- **No secrets in code** — All sensitive values (database URL, API keys, Resend key) are loaded from environment variables, never committed to the repository.

---

## Type System & Validation

### Frontend Types (`frontend/src/types.ts`)

All TypeScript types are defined in a single canonical file:

- `User` — auth state (uid, email, role, isAdmin, isSuperAdmin, isGod)
- `Config` — top-level local config (localId, localName, currency, contractTypes)
- `ContractType` — contract template definition (with optional `stepMeta`, `additionalFees`)
- `Field` — form field definition (type, label, validation, options, group, `subtracts` flag)
- `Rules` — financial rules (overtime, premiums, pension, health, work dues)
- `WageScale` — wage scale definition (id, name, rate, duration)
- `AdditionalFee` — fee definition (id, name, rate, category, perMusician)
- `StepMeta` — conditional step visibility rules (field, operator, value)
- `Currency` — currency symbol and code
- `Person` — musician in the roster (name, address, role, doubling, cartage, presentForRehearsal)
- `FormData` — `Record<string, string | number>` key-value form state
- `CalculationResult` — `{ id, label, value }` financial line item
- `ContractVersion` — named snapshot with formData + personnel
- `PendingContractType` — batch-ingested contract type awaiting review
- `SavedContract` — persisted contract with versions array

### Backend Validation (Zod Schemas)

All route handlers that accept request bodies use Zod schemas for runtime validation, following the pattern established in `workspaces.ts`:

- `functions/src/schemas/contracts.ts` — `createContractSchema`, `updateContractSchema`, `createVersionSchema`
- `functions/src/schemas/admin.ts` — `updateRoleSchema` (enum: USER/ADMIN/SUPERADMIN/GOD), `createAnnouncementSchema`
- `functions/src/schemas/batch.ts` — `batchPendingQuerySchema`, `updateParsedDataSchema`, `batchDriveSchema`
- `functions/src/schemas/locals.ts` — `createLocalSchema`, `updateLocalSchema`

Invalid requests receive a 400 response with Zod error details. JSON blob fields (formData, personnel, config) use `Prisma.InputJsonValue` transforms for type compatibility.

The `AuthRequest` interface in `auth.ts` uses a `UserRole` union type (`'USER' | 'ADMIN' | 'SUPERADMIN' | 'GOD'`) instead of a plain string.

---

## Environment Variables

### Frontend (`frontend/.env`)

All must be prefixed with `VITE_` for Vite to expose them to the client bundle.

| Variable | Description |
|---|---|
| `VITE_FIREBASE_API_KEY` | Firebase web API key |
| `VITE_FIREBASE_AUTH_DOMAIN` | Auth domain (e.g., `project.firebaseapp.com`) |
| `VITE_FIREBASE_PROJECT_ID` | Firebase project ID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage bucket |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase app ID |

### Backend (`functions/.env`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string. Uses Unix socket on Cloud SQL: `postgresql://user:pass@localhost/db?host=/cloudsql/project:region:instance` |
| `RESEND_API_KEY` | Yes | Resend API key for outbound email |
| `EMAIL_SENDER` | No | From address (default: `contracts@fakturflow.phonikamedia.com`) |
| `PORT` | No | HTTP port for standalone mode (default: `8080`) |
| `NODE_ENV` | No | Set to `production` to trigger auto-migration on startup |
| `GEMINI_API_KEY` | No | Google Gemini API key (contract scanner + batch ingestion) |
| `GOOGLE_DRIVE_API_KEY` | No | Google API key with Drive read scope (batch Drive ingestion) |

Firebase Admin SDK authenticates automatically via Application Default Credentials in Cloud Functions — no service account key needed in production.

---

## Local Development

### Prerequisites

- Node.js 20.x
- Firebase CLI (`npm install -g firebase-tools`)
- A PostgreSQL database (local or Cloud SQL via proxy)

### Database Setup

```bash
cd functions
cp .env.example .env  # Edit DATABASE_URL to point to your database
npm install
npx prisma migrate dev
```

### Run Backend

```bash
cd functions
npm run dev
```

### Run Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend runs at `http://localhost:5173` with Vite proxying `/api/*` requests to the backend.

### Connecting to Cloud SQL Locally

If using the production database for development:

```bash
cloud-sql-proxy PROJECT:REGION:INSTANCE --port=5433
```

Then set `DATABASE_URL` to `postgresql://user:pass@127.0.0.1:5433/dbname`.

---

## Deployment

The entire stack deploys to Google Cloud / Firebase with:

```bash
# 1. Run pending database migrations
cd functions
npx prisma migrate deploy

# 2. Deploy everything
cd ..
firebase deploy
```

**What `firebase deploy` does:**

1. **Functions:** Compiles the Express backend (`tsc`), runs `prisma generate` via `postinstall`, packages and uploads to Cloud Functions (2nd Gen). The function runs on Cloud Run with 512MB memory, scales to zero when idle.

2. **Hosting:** Builds the Vite React frontend into static files (`frontend/dist/`), uploads to Firebase's global CDN edge nodes. Configures URL rewrites: `/api/**` routes to the Cloud Function, everything else serves `index.html` (SPA fallback).

### Rollback

If a deployment breaks production, roll back to the previous known-good state:

```bash
git checkout main
firebase deploy
```

---

## Changelog

### March 2026 — Wizard UX, Batch Ingestion, Deposits, Email Logging

**Step-Based Wizard**
- Replaced the single-page accordion contract form with a step-by-step wizard
- New components: `WizardProgress`, `WizardStepView`, `WizardReviewStep`
- New hook: `useWizardNavigation` with conditional step visibility via `stepMeta`
- Review step shows read-only summary, calculation results, all actions, and email history

**Batch Contract Ingestion**
- New admin tab for bulk-importing contract types from document scans
- ZIP upload (up to 15 files, 50MB) or Google Drive folder URL
- Server-side Gemini AI processing with review/approve/reject workflow
- New Prisma model: `PendingContractType`
- New backend routes: `batch.ts` with full CRUD for pending items

**Deposit & Balance Due**
- Currency fields with `subtracts: true` or IDs containing "deposit" are treated as deductions
- Deductions display as negative values after Total Engagement Cost
- New "Balance Due" line shows net amount

**Additional Fees System**
- Contract types can define `additionalFees[]` with categories and per-musician flags
- Fees are grouped by category in calculation results

**Email Logging**
- Email sends are logged to `EmailLog` table with recipient, reference number, and subject
- Review step displays email send history for the current contract

**Admin Notes**
- Threaded note-taking system for admin communication
- Categories, replies, and pin functionality
- New Prisma model: `AdminNote` with self-referential replies

**SUPERADMIN Role**
- New role tier between ADMIN and GOD
- Controls access to AI Scanner, Batch Ingestion, and Admin Notes
- New middleware: `requireSuperAdmin`

**Gemini AI moved server-side**
- `@google/genai` moved from frontend to backend dependency
- Scanner and batch ingestion both proxy through Express (keeps API key off the client)

**PDF Reference Number**
- Changed from timestamp-based to `YYYYMMDD-{5-digit-random}` format using creation date

### Earlier — Dead Code Removal, Decomposition, Type Safety

**Dead Code Removal**
Deleted 68 files: a ghost root-level frontend app (duplicate `src/`, `App.tsx`, `index.html`, `components/`, `hooks/`, etc.), deprecated infrastructure files (`Dockerfile`, `cloudbuild.yaml`, `docker-compose.yml`, `nginx.conf`), and unused Firebase Data Connect boilerplate (`dataconnect/` directory with a movie review example schema).

**ContractWizard Decomposition**
Broke an 819-line monolithic component into focused files:
- `utils/calculations.ts` — pure calculation engine
- `hooks/usePersonnelRoster.ts` — personnel state management
- `hooks/useContractForm.ts` — form state and validation
- `hooks/useDraftPersistence.ts` — localStorage auto-save
- `hooks/useVersionManagement.ts` — version snapshots

**Backend Type Safety**
Added Zod validation schemas to all backend routes. Eliminated every `any` type. Tightened `AuthRequest.role` to a union type. Fixed a bug in `locals.ts` where a new `PrismaClient()` was instantiated per-request.

**User Management**
Added delete and suspend functionality to the admin panel. Delete permanently removes a user from both PostgreSQL (cascade) and Firebase Auth. Suspend toggles a `suspendedAt` timestamp and disables the Firebase account.
