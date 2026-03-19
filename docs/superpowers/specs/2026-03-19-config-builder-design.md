# Config Builder Script — Design Spec

**Date:** 2026-03-19
**Status:** Approved
**Scope:** CLI script to replace admin panel batch ingestion with a Gemini-powered wage agreement analyzer

---

## Problem

The current batch ingestion process lives in the admin panel (ZIP upload or Google Drive import). It scans photos of contract forms via Gemini and extracts `ContractType` JSON. This approach has several issues:

1. The `Rules` type is too flat — single rate numbers can't express tiered leader premiums, conditional pension rates, 15-minute billing increments, or surcharges
2. Ingestion is oriented around scanning contract form images, not analyzing official wage agreement documents
3. The process conflates configuration ingestion (data that drives the app) with PDF template filling (output the app produces)
4. The admin panel UI is overkill for a task that runs infrequently (onboarding 2-5 locals)

## Solution

A CLI script at `functions/src/scripts/config-builder.ts` that:

1. Accepts wage agreement PDF(s) as input
2. Sends them to Gemini with an upgraded extraction prompt
3. Validates the output against a new, richer `Rules` type system
4. Writes results as `PendingContractType` records to the database
5. Admin reviews, edits, and approves in the existing admin panel review queue

---

## 1. New Rules Type System

### Base Building Blocks

```typescript
type Tier = {
  min: number;
  max: number | null;       // null = unlimited (e.g., 60+)
  value: number;
  label?: string;            // e.g., "Small ensemble (2-30)"
};

type ConditionField =
  | "contractTypeId"    // which contract type is active
  | "ensembleSize"      // alias for numberOfMusicians
  | "numberOfMusicians" // personnel count
  | "engagementType"    // selected wage scale / engagement type
  | string;             // extensible for future conditions

type Condition = {
  field: ConditionField;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";
  value: string | number | string[];
};
```

### Rule Variants

```typescript
type PercentageRule = {
  type: "percentage";
  rate: number;
  basis: string[];            // e.g., ["totalScaleWages", "overtimePay"]
  pensionable: boolean;
  description?: string;
};

type TieredRule = {
  type: "tiered";
  tiers: Tier[];
  unit: "multiplier" | "percentage" | "flat";
  basis?: string[];
  pensionable: boolean;
  description?: string;
};

type FlatRule = {
  type: "flat";
  amount: number;
  per: "musician" | "service" | "engagement";
  pensionable: boolean;
  description?: string;
};

type ConditionalRule = {
  type: "conditional";
  conditions: Condition[];
  rule: PercentageRule | TieredRule | FlatRule;
  fallback?: PercentageRule | TieredRule | FlatRule;
  // Note: pensionability is derived from the active branch at evaluation time.
  // If condition branch has pensionable: true but fallback has pensionable: false,
  // the engine evaluates the condition first, then reads pensionable from the
  // matched branch.
};

type SurchargeRule = {
  id: string;
  label: string;              // e.g., "After Midnight Premium"
  type: "multiplier" | "percentage" | "flat";
  value: number;
  trigger: string;            // e.g., "time_after_midnight", "onstage"
  pensionable: boolean;
};
```

### Main Rules Interface

```typescript
type Rules = {
  // Typed core
  overtime?: PercentageRule | TieredRule;
  leaderPremium?: TieredRule | PercentageRule;
  pension?: PercentageRule | ConditionalRule;
  health?: FlatRule;
  workDues?: PercentageRule;
  doubling?: TieredRule | PercentageRule;
  billing?: {
    increment: number;        // minutes (e.g., 15)
    minimum: number;          // minutes (e.g., 120 for 2 hours)
  };
  surcharges?: SurchargeRule[];
  rehearsal?: {
    separateScale: boolean;
    overtimeApplies: boolean;
  };

  // Extension slot
  extensions?: ExtensionRule[];
};

type ExtensionRule = {
  id: string;
  label: string;
  description: string;
  rule: PercentageRule | TieredRule | FlatRule | ConditionalRule;
};
```

### Pensionable vs. Non-Pensionable

Each rule carries a `pensionable: boolean` flag. This is determined by the local's wage agreement — not universal. The calculation engine sums only `pensionable: true` rule outputs to compute the pension basis.

Examples:
- Scale wages, overtime, leader premiums, doubling → typically pensionable
- Cartage, mileage, parking, travel → typically non-pensionable

### Atlanta Local 148-462 Examples

| Concept | How it maps |
|---|---|
| Tiered leader premium (1=150%, 2-30=200%, 31-59=250%, 60+=300%) | `leaderPremium` as `TieredRule` with 4 tiers |
| 15-min billing increments, 2hr minimum | `billing: { increment: 15, minimum: 120 }` |
| Per-contract-type pension (Live 11.99%, Demo 14.091%, Club 0%) | `pension` as `ConditionalRule` |
| After-midnight 50% surcharge | `surcharges` array entry |
| Onstage performance 25% surcharge | `surcharges` array entry |
| Sound check 150% rate | `surcharges` array entry |
| Recording doubling (25% first, 15% additional) | `doubling` as `TieredRule` |

---

## 2. Updated ContractType

```typescript
type ContractType = {
  // Existing — optionality preserved to match current types.ts
  id: string;
  name: string;
  formIdentifier: string;
  calculationModel?: "live_engagement" | "media_report" | "contribution_only";
  signatureType?: "engagement" | "media_report" | "member" | "petitioner";
  jurisdiction?: string;
  currency?: Currency;
  fields: Field[];
  wageScales?: WageScale[];
  rules?: Rules;                         // now uses new Rules type (stays optional)
  legalText?: {
    preamble?: string;
    [key: string]: string | undefined;
  };
  additionalFees?: AdditionalFee[];
  summary: SummaryItem[];
  stepMeta?: Record<string, StepMeta>;   // wizard step descriptions & conditional visibility

  // New
  pdfTemplateFields?: Record<string, string>;  // app field → AcroForm field name (populated later)
  extractionNotes?: string[];                   // Gemini uncertainty flags for admin review
};
```

---

## 3. Config Builder Script

**Location:** `functions/src/scripts/config-builder.ts`
**Run command:** `cd functions && npx ts-node src/scripts/config-builder.ts`

### Flow

1. CLI prompts: "Admin email?" — looks up the user ID to populate `createdByUserId` on `PendingContractType` records (required by schema)
2. CLI prompts: "Which local?" — enter ID + name, or select existing from database
3. CLI prompts: "Path to wage agreement PDF(s)" — accepts one or more file paths
4. Reads PDF files, sends to Gemini with upgraded extraction prompt
5. Gemini returns extracted config (new Rules schema, wage scales, contract types, extraction notes)
6. Script validates output at runtime using Zod schemas (see section 3a)
7. Script writes results as `PendingContractType` records to the database (one per extracted contract type)
8. Script prints summary: what was extracted, any extraction notes, and "Review and approve in the admin panel"

### What the script does NOT do

- No interactive review/editing — that happens in the admin panel
- No direct writes to `LocalConfig` — approval flow handles that
- No PDF template field mapping — populated separately

### Dependencies

- Prisma client (direct DB access)
- Gemini utility (reused from `functions/src/utils/gemini.ts`)
- Shared TypeScript types
- `fs` for reading local PDF files
- `readline` or `inquirer` for CLI prompts
- `ts-node` for running TypeScript directly (already a devDependency, used by seed script)

### 3a. Runtime Validation (Zod Schemas)

Gemini output must be validated at runtime, not just at compile time. A Zod schema mirroring the new `Rules` type system will be created at `functions/src/schemas/rules.ts`.

Key validation constraints:
- `tiers` arrays must be sorted by `min` and have non-overlapping ranges
- `tier.min < tier.max` (or `max` is null for unbounded)
- `basis` values must be from the canonical set: `"totalScaleWages"`, `"overtimePay"`, `"totalPremiums"`, `"totalCartage"`, `"totalRehearsal"`, `"subtotalWages"`, `"totalAdditionalFees"`
- `ConditionalRule` must have at least one condition
- `PercentageRule.rate` must be > 0
- `billing.increment` must be a positive integer
- `billing.minimum` must be >= `billing.increment`

If validation fails, the script logs errors and writes the record as `status: 'error'` with the validation message, so the admin can see what went wrong.

---

## 4. Gemini Extraction — Upgraded Prompt

### Changes from current prompt

| Aspect | Current | New |
|---|---|---|
| Input type | Photos of contract forms | Official wage agreement PDFs |
| Output schema | Flat `Rules` (single rates) | New `Rules` type (tiered, conditional, extensions) |
| Uncertainty handling | None | `extractionNotes` array |
| Multi-contract awareness | One contract type per scan | Multiple contract types from one document |
| Pensionable tracking | Not tracked | Every rule has `pensionable` flag |

### What Gemini extracts from a wage agreement

- All wage scales with durations
- Overtime rules (rate, billing increments)
- Leader premium tiers by ensemble size
- Doubling rates (first double vs. additional)
- Pension rates (per contract type if they differ)
- Health & welfare (flat per musician or percentage)
- Work dues
- Surcharges (after-midnight, onstage, sound check, etc.)
- Rehearsal scales (if separate from performance)
- Cartage rates
- Any other rules → captured as `extensions`
- `extractionNotes` for anything uncertain

### Model

- `gemini-3.1-flash-lite-preview` (unchanged)
- Structured JSON response with `responseSchema` — the new schema must mirror the Zod/TypeScript types for the new `Rules` structure. This will be defined as a sub-task during implementation since it's a direct translation of the TypeScript types into JSON Schema format.
- Truncated response repair logic carries over

---

## 5. Admin Panel Changes

### Removed

- ZIP upload form and handler
- Google Drive import form and handler
- Calls to `POST /api/admin/batch-upload` and `POST /api/admin/batch-drive`

### Kept (unchanged)

- Review queue (PendingContractType records grouped by batch)
- Status filter (All, Pending, Approved, Rejected)
- Review modal with JSON editor
- Approve / Reject / Delete actions
- All backend routes for pending items (GET, PUT, POST approve/reject, DELETE)

### Changed

- Tab label: "Batch Ingestion" → "Config Review"
- Info banner: "Use the config-builder CLI to ingest new wage agreements. Items appear here for review."
- JSON editor: Add labeled side panel showing human-readable field names alongside raw JSON
- Audit all user-facing strings for references to ZIP/Drive upload (empty-state messages, button labels, tooltips) and update to reference the CLI script

---

## 6. Backend Route Changes

### Removed

- `POST /api/admin/batch-upload` — ZIP upload handler
- `POST /api/admin/batch-drive` — Google Drive import handler

### Kept (unchanged)

- `GET /api/admin/batch-pending` — List pending items
- `PUT /api/admin/batch-pending/:id` — Edit parsed JSON
- `POST /api/admin/batch-pending/:id/approve` — Approve and merge into LocalConfig
- `POST /api/admin/batch-pending/:id/reject` — Reject
- `DELETE /api/admin/batch-pending/:id` — Delete

---

## 7. Out of Scope

These are app-level changes that happen separately:

1. **PDF template filling** — The app fills AcroForm PDFs (LS-1, B-series) with calculated results. `pdfTemplateFields` exists on `ContractType` but stays empty until this is built.
2. **Calculation engine rewrite** — The engine needs updating to evaluate the new `Rules` type (tiers, conditions, pensionable tracking). Follow-on task.
3. **Backward compatibility migration** — Existing `LocalConfig` records with the old flat `Rules` format keep working as-is. No auto-migration. Any existing `PendingContractType` records still in `pending` status should be approved, rejected, or deleted before deploying the new system, since the review UI will be updated for the new schema.
4. **Form-driven wizard redesign** — Users selecting the actual AFM form (LS-1, B-7) at the top of the wizard, driving which questions are asked. Separate UX project.

---

## 8. Available PDF Forms

12 fillable AcroForm PDFs located at `/Users/paulpivetta/development/AFM V4 Stuff/PDF Forms (Old)/`:

| Form | Purpose | Fields |
|---|---|---|
| LS-1 | National AFM single engagement contract | 165 |
| single_fillable | Local 802 single engagement contract | 191 |
| B-3 | Local commercial announcements | 705 |
| B-4 | Phonograph records, soundtracks, video promos | 402 |
| B-5 | Demonstration recording (audio only) | 170 |
| B-6 | National TV/radio commercial announcements | 648 |
| B-7 | All motion pictures | 413 |
| B-8 | Videotape/live TV/cable/public TV | 412 |
| B-9 | Limited pressing recording | 415 |
| B-10 | Syndicated/public/local radio | 402 |
| B-11 | Symphony, opera & ballet audio-visual | 367 |
| B-12 | Radio to non-commercial recording (symphonic) | 240 |

All are genuine AcroForms fillable by `pdf-lib`. Field naming is inconsistent across forms — each `ContractType` will need its own `pdfTemplateFields` mapping.

---

## 9. File Changes Summary

| File | Action |
|---|---|
| `frontend/src/types.ts` | Replace `Rules`, `Rule`, `HealthRule` types with new type system |
| `functions/src/scripts/config-builder.ts` | New file — CLI script |
| `functions/src/schemas/rules.ts` | New file — Zod validation schemas for new Rules type |
| `functions/src/utils/gemini.ts` | Add new extraction prompt for wage agreements |
| `frontend/src/components/BatchIngestion.tsx` | Remove upload UI, add labeled JSON editor, rename tab, update all copy |
| `functions/src/routes/batch.ts` | Remove upload/drive route handlers |
| `functions/src/schemas/batch.ts` | Remove upload/drive validation schemas |
| `README.md` | Update with config builder docs, architecture changes |
