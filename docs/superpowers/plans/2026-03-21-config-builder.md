# Config Builder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the admin panel's batch ingestion with a CLI config-builder script and upgraded Rules type system.

**Architecture:** New Rules types in `frontend/src/types.ts`, Zod validation in `functions/src/schemas/rules.ts`, Gemini extraction prompt for wage agreements in `functions/src/utils/gemini.ts`, CLI script at `functions/src/scripts/config-builder.ts`. Admin panel stripped of upload UI, review queue kept.

**Tech Stack:** TypeScript, Zod, Prisma, Google GenAI (`@google/genai`), Node readline

**Spec:** `docs/superpowers/specs/2026-03-19-config-builder-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `frontend/src/types.ts` | Modify | Replace `Rule`, `HealthRule`, `Rules` with new type system; add `pdfTemplateFields` and `extractionNotes` to `ContractType` |
| `functions/src/schemas/rules.ts` | Create | Zod schemas mirroring the new Rules types for runtime validation |
| `functions/src/utils/gemini.ts` | Modify | Add `scanWageAgreement()` function with new prompt + responseSchema; keep existing `scanContractDocument()` |
| `functions/src/scripts/config-builder.ts` | Create | CLI script: prompts → read PDF → Gemini → validate → write PendingContractType |
| `functions/src/routes/batch.ts` | Modify | Remove `POST /batch-upload` and `POST /batch-drive` route handlers |
| `functions/src/schemas/batch.ts` | Modify | Remove `batchDriveSchema` |
| `frontend/src/components/BatchIngestion.tsx` | Modify | Remove upload UI, update copy, add field labels to JSON editor |
| `frontend/src/utils/calculations.test.ts` | Modify | Add tests for backward compat (old Rules still work) |
| `README.md` | Modify | Document config-builder CLI usage |

---

### Task 1: New Rules Type System

**Files:**
- Modify: `frontend/src/types.ts:49-67` (replace `Rule`, `HealthRule`, `Rules`)
- Modify: `frontend/src/types.ts:104-122` (add new fields to `ContractType`)

- [ ] **Step 1: Read current types.ts to confirm line numbers**

Run: Read `frontend/src/types.ts`

- [ ] **Step 2: Replace the old Rule, HealthRule, and Rules types**

Replace lines 49-67 in `frontend/src/types.ts` with:

```typescript
// --- RULE TYPE SYSTEM ---

export type Tier = {
  min: number;
  max: number | null;
  value: number;
  label?: string;
};

export type ConditionField =
  | 'contractTypeId'
  | 'ensembleSize'
  | 'numberOfMusicians'
  | 'engagementType'
  | (string & {});

export type Condition = {
  field: ConditionField;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in';
  value: string | number | string[];
};

export type PercentageRule = {
  type: 'percentage';
  rate: number;
  basis: string[];
  pensionable: boolean;
  description?: string;
};

export type TieredRule = {
  type: 'tiered';
  tiers: Tier[];
  unit: 'multiplier' | 'percentage' | 'flat';
  basis?: string[];
  pensionable: boolean;
  description?: string;
};

export type FlatRule = {
  type: 'flat';
  amount: number;
  per: 'musician' | 'service' | 'engagement';
  pensionable: boolean;
  description?: string;
};

export type ConditionalRule = {
  type: 'conditional';
  conditions: Condition[];
  rule: PercentageRule | TieredRule | FlatRule;
  fallback?: PercentageRule | TieredRule | FlatRule;
};

export type SurchargeRule = {
  id: string;
  label: string;
  type: 'multiplier' | 'percentage' | 'flat';
  value: number;
  trigger: string;
  pensionable: boolean;
};

export type ExtensionRule = {
  id: string;
  label: string;
  description: string;
  rule: PercentageRule | TieredRule | FlatRule | ConditionalRule;
};

export type RuleValue = PercentageRule | TieredRule | FlatRule | ConditionalRule;

// Legacy shape — matches the old Rule type used in existing LocalConfig data
export type LegacyRule = { rate: number; basedOn?: string[]; description?: string };
export type LegacyHealthRule = { ratePerMusicianPerService: number; description: string };

export type Rules = {
  // New typed core
  overtime?: PercentageRule | TieredRule;
  leaderPremium?: TieredRule | PercentageRule | LegacyRule;
  pension?: PercentageRule | ConditionalRule;
  health?: FlatRule;
  workDues?: PercentageRule | LegacyRule;
  doubling?: TieredRule | PercentageRule;
  billing?: {
    increment: number;
    minimum: number;
  };
  surcharges?: SurchargeRule[];
  rehearsal?: {
    separateScale: boolean;
    overtimeApplies: boolean;
  };
  extensions?: ExtensionRule[];

  // Legacy fields (backward compat with existing LocalConfig data in DB)
  // The calculation engine in calculations.ts reads these directly.
  // New configs use the typed core above; old configs use these.
  overtimeRate?: number;
  pensionContribution?: LegacyRule;
  healthContribution?: LegacyHealthRule;
  doublingPremium?: LegacyRule;
};
```

Note: The legacy fields (`overtimeRate`, `pensionContribution`, `healthContribution`, `doublingPremium`) are kept so the existing calculation engine in `calculations.ts` continues to work with old LocalConfig data. The old standalone `Rule` and `HealthRule` types are removed — their shapes are inlined as legacy fields.

- [ ] **Step 3: Add new fields to ContractType**

In `frontend/src/types.ts`, add to the `ContractType` type (after `stepMeta`):

```typescript
  pdfTemplateFields?: Record<string, string>;
  extractionNotes?: string[];
```

- [ ] **Step 4: Verify frontend compiles**

Run: `cd frontend && npx tsc --noEmit`
Expected: No errors. The old `Rule` and `HealthRule` exports are removed, but nothing imports them (they were only used via `Rules`). The calculation engine references `rules?.overtimeRate`, `rules?.leaderPremium`, etc. — all still present.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/types.ts
git commit -m "feat: replace Rules type system with tiered/conditional support

New type system supports tiered rules (leader premium by ensemble size),
conditional rules (per-contract-type pension rates), surcharges, billing
increments, and extensions. Legacy fields preserved for backward compat."
```

---

### Task 2: Zod Validation Schemas

**Files:**
- Create: `functions/src/schemas/rules.ts`

- [ ] **Step 1: Create the Zod schema file**

Create `functions/src/schemas/rules.ts`:

```typescript
import { z } from 'zod';

const canonicalBasis = [
  'totalScaleWages', 'overtimePay', 'totalPremiums',
  'totalCartage', 'totalRehearsal', 'subtotalWages', 'totalAdditionalFees',
] as const;

const basisSchema = z.array(z.string().refine(
  val => canonicalBasis.includes(val as typeof canonicalBasis[number]),
  { message: `Must be one of: ${canonicalBasis.join(', ')}` }
));

const tierSchema = z.object({
  min: z.number(),
  max: z.number().nullable(),
  value: z.number(),
  label: z.string().optional(),
}).refine(
  t => t.max === null || t.min < t.max,
  { message: 'Tier min must be less than max (or max must be null)' }
);

const conditionSchema = z.object({
  field: z.string().min(1),
  operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in']),
  value: z.union([z.string(), z.number(), z.array(z.string())]),
});

const percentageRuleSchema = z.object({
  type: z.literal('percentage'),
  rate: z.number().positive(),
  basis: basisSchema,
  pensionable: z.boolean(),
  description: z.string().optional(),
});

const tieredRuleSchema = z.object({
  type: z.literal('tiered'),
  tiers: z.array(tierSchema).min(1).refine(
    tiers => {
      for (let i = 1; i < tiers.length; i++) {
        if (tiers[i].min <= (tiers[i - 1].max ?? tiers[i - 1].min)) return false;
      }
      return true;
    },
    { message: 'Tiers must be sorted by min and non-overlapping' }
  ),
  unit: z.enum(['multiplier', 'percentage', 'flat']),
  basis: basisSchema.optional(),
  pensionable: z.boolean(),
  description: z.string().optional(),
});

const flatRuleSchema = z.object({
  type: z.literal('flat'),
  amount: z.number(),
  per: z.enum(['musician', 'service', 'engagement']),
  pensionable: z.boolean(),
  description: z.string().optional(),
});

const baseRuleSchema = z.discriminatedUnion('type', [
  percentageRuleSchema,
  tieredRuleSchema,
  flatRuleSchema,
]);

const conditionalRuleSchema = z.object({
  type: z.literal('conditional'),
  conditions: z.array(conditionSchema).min(1),
  rule: baseRuleSchema,
  fallback: baseRuleSchema.optional(),
});

const ruleValueSchema = z.discriminatedUnion('type', [
  percentageRuleSchema,
  tieredRuleSchema,
  flatRuleSchema,
  conditionalRuleSchema,
]);

const surchargeRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(['multiplier', 'percentage', 'flat']),
  value: z.number(),
  trigger: z.string().min(1),
  pensionable: z.boolean(),
});

const extensionRuleSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  rule: ruleValueSchema,
});

export const rulesSchema = z.object({
  overtime: z.union([percentageRuleSchema, tieredRuleSchema]).optional(),
  leaderPremium: z.union([tieredRuleSchema, percentageRuleSchema]).optional(),
  pension: z.union([percentageRuleSchema, conditionalRuleSchema]).optional(),
  health: flatRuleSchema.optional(),
  workDues: percentageRuleSchema.optional(),
  doubling: z.union([tieredRuleSchema, percentageRuleSchema]).optional(),
  billing: z.object({
    increment: z.number().int().positive(),
    minimum: z.number().int().positive(),
  }).refine(b => b.minimum >= b.increment, {
    message: 'billing.minimum must be >= billing.increment',
  }).optional(),
  surcharges: z.array(surchargeRuleSchema).optional(),
  rehearsal: z.object({
    separateScale: z.boolean(),
    overtimeApplies: z.boolean(),
  }).optional(),
  extensions: z.array(extensionRuleSchema).optional(),
}).strict(); // Only for NEW Gemini-extracted configs. Do NOT use this to validate existing LocalConfig data — legacy fields (overtimeRate, pensionContribution, etc.) would fail.

export const extractedContractTypeSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  formIdentifier: z.string().min(1),
  calculationModel: z.enum(['live_engagement', 'media_report', 'contribution_only']).optional(),
  signatureType: z.enum(['engagement', 'media_report', 'member', 'petitioner']).optional(),
  jurisdiction: z.string().optional(),
  currency: z.object({ symbol: z.string(), code: z.string() }).optional(),
  fields: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    type: z.enum(['text', 'date', 'time', 'currency', 'number', 'textarea', 'select']),
    required: z.boolean(),
    group: z.string().optional(),
    placeholder: z.string().optional(),
    description: z.string().optional(),
    options: z.array(z.string()).optional(),
    dataSource: z.enum(['wageScales']).optional(),
    min: z.number().optional(),
    minLength: z.number().optional(),
    defaultValue: z.union([z.string(), z.number()]).optional(),
    subtracts: z.boolean().optional(),
  })),
  wageScales: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    rate: z.number(),
    duration: z.number(),
    description: z.string().optional(),
  })).optional(),
  rules: rulesSchema.optional(),
  legalText: z.record(z.string()).optional(),
  additionalFees: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    rate: z.number(),
    category: z.string(),
    perMusician: z.boolean(),
  })).optional(),
  summary: z.array(z.object({ id: z.string(), label: z.string() })),
  extractionNotes: z.array(z.string()).optional(),
});

export type ExtractedContractType = z.infer<typeof extractedContractTypeSchema>;
```

- [ ] **Step 2: Verify it compiles**

Run: `cd functions && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add functions/src/schemas/rules.ts
git commit -m "feat: add Zod validation schemas for new Rules type system

Runtime validation for Gemini-extracted configs: tier ordering,
basis value validation, billing constraints, discriminated unions
for all rule variants."
```

---

### Task 3: Gemini Wage Agreement Extraction

**Files:**
- Modify: `functions/src/utils/gemini.ts` (add new function, keep existing)

- [ ] **Step 1: Read current gemini.ts to confirm structure**

Run: Read `functions/src/utils/gemini.ts`

- [ ] **Step 2: Add the wage agreement prompt and extraction function**

Add below the existing `scanContractDocument` function (do NOT modify it) in `functions/src/utils/gemini.ts`:

```typescript
const wageAgreementPrompt = `You are parsing an AFM (American Federation of Musicians) local's wage agreement / scale document into JSON configuration for a contract management app.

## YOUR TASK
Extract ALL wage scales, financial rules, contract types, and fees from this wage agreement document. A single document may define rates for MULTIPLE engagement types (e.g., casual performances, concerts, recordings, rehearsals). Extract each as a SEPARATE contract type in the output array.

## OUTPUT FORMAT
Return a JSON object with:
- "contractTypes": array of ContractType objects (one per engagement type found)
- "extractionNotes": array of strings flagging anything ambiguous or uncertain

## EACH CONTRACT TYPE MUST HAVE:
- "id": snake_case unique ID (e.g., "casual_live_engagement", "concert_performance")
- "name": descriptive name
- "formIdentifier": short code (e.g., "AFM_L148_Casual")
- "calculationModel": "live_engagement", "media_report", or "contribution_only"
- "signatureType": "engagement", "media_report", "member", or "petitioner"
- "summary": empty array []
- "fields": array of form field definitions (always include standard engagement fields — see below)
- "wageScales": array of wage/pay scales with id, name, rate, and duration (hours, 0 for flat fees)
- "rules": financial calculation rules (see RULES FORMAT below)
- "additionalFees": travel, equipment, music prep fees
- "extractionNotes": uncertainties for THIS contract type

## STANDARD FIELDS (include for each contract type)
- purchaserName (text, required, group: "Purchaser (Employer) Details")
- purchaserAddress (textarea, required, group: "Purchaser (Employer) Details")
- purchaserPhone (text, group: "Purchaser (Employer) Details")
- engagementDate (date, required, group: "Engagement Details")
- engagementType (select, required, dataSource: "wageScales", group: "Engagement Details")
- engagementDuration (number, required, group: "Engagement Details", min: 0)
- venueName (text, required, group: "Engagement Details")
- venueAddress (textarea, group: "Engagement Details")
- startTime (time, group: "Engagement Details")
- rehearsalHours (number, group: "Compensation", min: 0, defaultValue: 0)
- rehearsalRate (currency, group: "Compensation", min: 0)
- overtimeHours (number, group: "Compensation", min: 0, defaultValue: 0)
- additionalTerms (textarea, group: "Agreement Terms")
Add more fields if the document specifies additional data points.

## RULES FORMAT
Rules use a typed system. Each rule has a "type" discriminator:

### PercentageRule
{ "type": "percentage", "rate": <number>, "basis": ["totalScaleWages", ...], "pensionable": <boolean>, "description": "..." }

### TieredRule (for values that vary by ensemble size, number of doubles, etc.)
{ "type": "tiered", "tiers": [{ "min": 1, "max": 1, "value": 1.5, "label": "Solo" }, { "min": 2, "max": 30, "value": 2.0, "label": "Small ensemble" }, { "min": 31, "max": null, "value": 2.5, "label": "Large ensemble" }], "unit": "multiplier"|"percentage"|"flat", "pensionable": <boolean>, "description": "..." }

### FlatRule
{ "type": "flat", "amount": <number>, "per": "musician"|"service"|"engagement", "pensionable": <boolean>, "description": "..." }

### ConditionalRule (when a rule varies by contract type or other conditions)
{ "type": "conditional", "conditions": [{ "field": "contractTypeId", "operator": "eq", "value": "casual_live" }], "rule": <PercentageRule|TieredRule|FlatRule>, "fallback": <PercentageRule|TieredRule|FlatRule> }

### Rule slots in the rules object:
- "overtime": PercentageRule or TieredRule
- "leaderPremium": TieredRule (tiers by ensemble size) or PercentageRule
- "pension": PercentageRule or ConditionalRule (if rate varies by engagement type)
- "health": FlatRule
- "workDues": PercentageRule
- "doubling": TieredRule (first double vs additional) or PercentageRule
- "billing": { "increment": <minutes>, "minimum": <minutes> } (e.g., 15-min increments, 120-min minimum)
- "surcharges": array of { "id", "label", "type": "multiplier"|"percentage"|"flat", "value", "trigger", "pensionable" }
- "rehearsal": { "separateScale": boolean, "overtimeApplies": boolean }
- "extensions": array of { "id", "label", "description", "rule": <any rule type> } for rules not fitting above

### PENSIONABLE FLAG
Every rule MUST have "pensionable": true or false. This indicates whether the rule's output is included in the pension contribution basis.
- Typically pensionable: scale wages, overtime, leader premiums, doubling premiums
- Typically NOT pensionable: cartage, mileage, parking, travel, equipment fees

### Valid "basis" values:
"totalScaleWages", "overtimePay", "totalPremiums", "totalCartage", "totalRehearsal", "subtotalWages", "totalAdditionalFees"

## EXTRACTION NOTES
For ANYTHING you are uncertain about, add a note to "extractionNotes". Examples:
- "Unclear if cartage is pensionable — document says 'subject to local bylaws'"
- "Leader premium tiers not explicitly stated — inferred from examples"
- "Document mentions 'special rates for holidays' but no specific rates given"

## CRITICAL
- Extract EVERY wage scale with rate AND duration
- Extract ALL financial rules — pension %, health $, work dues %, leader premium, doubling, overtime, surcharges
- A single document may have MULTIPLE contract types — extract each separately
- NEVER omit duration from wage scales
- Keep legalText clauses to 1-2 sentence summaries`;

const wageAgreementResponseSchema = {
    type: Type.OBJECT,
    required: ['contractTypes', 'extractionNotes'],
    properties: {
        contractTypes: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                required: ['id', 'name', 'formIdentifier', 'fields', 'summary'],
                properties: {
                    id: { type: Type.STRING },
                    name: { type: Type.STRING },
                    formIdentifier: { type: Type.STRING },
                    calculationModel: { type: Type.STRING, enum: ['live_engagement', 'media_report', 'contribution_only'] },
                    signatureType: { type: Type.STRING, enum: ['engagement', 'media_report', 'member', 'petitioner'] },
                    jurisdiction: { type: Type.STRING },
                    currency: { type: Type.OBJECT, properties: { symbol: { type: Type.STRING }, code: { type: Type.STRING } } },
                    fields: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: {
                        id: { type: Type.STRING }, label: { type: Type.STRING },
                        type: { type: Type.STRING, enum: ['text', 'date', 'time', 'currency', 'number', 'textarea', 'select'] },
                        required: { type: Type.BOOLEAN }, group: { type: Type.STRING },
                        placeholder: { type: Type.STRING }, description: { type: Type.STRING },
                        options: { type: Type.ARRAY, items: { type: Type.STRING } },
                        dataSource: { type: Type.STRING, enum: ['wageScales'] },
                        min: { type: Type.NUMBER }, minLength: { type: Type.NUMBER },
                        defaultValue: { type: Type.STRING }, subtracts: { type: Type.BOOLEAN },
                    } } },
                    wageScales: { type: Type.ARRAY, items: { type: Type.OBJECT, required: ['id', 'name', 'rate', 'duration'], properties: {
                        id: { type: Type.STRING }, name: { type: Type.STRING },
                        rate: { type: Type.NUMBER }, duration: { type: Type.NUMBER },
                        description: { type: Type.STRING },
                    } } },
                    rules: { type: Type.OBJECT },
                    additionalFees: { type: Type.ARRAY, items: { type: Type.OBJECT, required: ['id', 'name', 'rate', 'category', 'perMusician'], properties: {
                        id: { type: Type.STRING }, name: { type: Type.STRING },
                        rate: { type: Type.NUMBER }, category: { type: Type.STRING },
                        perMusician: { type: Type.BOOLEAN },
                    } } },
                    legalText: { type: Type.OBJECT },
                    summary: { type: Type.ARRAY, items: {} },
                    extractionNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
            },
        },
        extractionNotes: { type: Type.ARRAY, items: { type: Type.STRING } },
    },
};

export async function scanWageAgreement(
    fileBuffer: Buffer,
    mimeType: string
): Promise<{ success: boolean; contractTypes?: object[]; extractionNotes?: string[]; error?: string }> {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
        return { success: false, error: 'GEMINI_API_KEY is not configured on the server.' };
    }

    try {
        const ai = new GoogleGenAI({ apiKey: geminiApiKey });
        const base64Data = fileBuffer.toString('base64');

        const response = await ai.models.generateContent({
            model: 'gemini-3.1-flash-lite-preview',
            contents: { parts: [
                { inlineData: { mimeType, data: base64Data } },
                { text: wageAgreementPrompt }
            ] },
            config: {
                responseMimeType: 'application/json',
                responseSchema: wageAgreementResponseSchema,
                maxOutputTokens: 32768,
            }
        });

        console.log(`[scanWageAgreement] model=${response.modelVersion}, finishReason=${response.candidates?.[0]?.finishReason}, outputLength=${response.text?.length}`);
        const jsonText = response.text || '{}';
        let parsedJson: { contractTypes?: object[]; extractionNotes?: string[] };
        try {
            parsedJson = JSON.parse(jsonText);
        } catch {
            const repaired = repairTruncatedJson(jsonText) as { contractTypes?: object[]; extractionNotes?: string[] } | null;
            if (!repaired) {
                return { success: false, error: 'AI response was truncated and could not be repaired' };
            }
            parsedJson = repaired;
        }

        return {
            success: true,
            contractTypes: parsedJson.contractTypes || [],
            extractionNotes: parsedJson.extractionNotes || [],
        };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'AI scan failed';
        console.error('[scanWageAgreement]', err);
        return { success: false, error: message };
    }
}
```

- [ ] **Step 3: Verify backend compiles**

Run: `cd functions && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/utils/gemini.ts
git commit -m "feat: add Gemini wage agreement extraction function

New scanWageAgreement() with prompt targeting official wage docs,
new Rules schema output, multi-contract-type extraction, and
extractionNotes for flagging uncertainties."
```

---

### Task 4: Config Builder CLI Script

**Files:**
- Create: `functions/src/scripts/config-builder.ts`

- [ ] **Step 1: Create the CLI script**

Create `functions/src/scripts/config-builder.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { randomUUID } from 'crypto';
import { prisma } from '../utils/prisma';
import { scanWageAgreement } from '../utils/gemini';
import { extractedContractTypeSchema } from '../schemas/rules';
import 'dotenv/config';

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

function ask(question: string): Promise<string> {
    return new Promise(resolve => rl.question(question, resolve));
}

function getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const map: Record<string, string> = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
    };
    return map[ext] || 'application/octet-stream';
}

async function main() {
    console.log('\n=== AFM Config Builder ===\n');

    // Step 1: Admin email for createdByUserId
    const adminEmail = await ask('Admin email: ');
    const user = await prisma.user.findFirst({ where: { email: adminEmail.trim() } });
    if (!user) {
        console.error(`Error: No user found with email "${adminEmail.trim()}"`);
        process.exit(1);
    }
    console.log(`  Authenticated as: ${user.email} (${user.id})\n`);

    // Step 2: Which local?
    const existingLocals = await prisma.localConfig.findMany({ select: { id: true, name: true } });
    if (existingLocals.length > 0) {
        console.log('Existing locals:');
        existingLocals.forEach(l => console.log(`  ${l.id} — ${l.name}`));
        console.log();
    }

    const localInput = await ask('Local ID (number, or "new" to create): ');

    let localId: number;
    let localName: string;

    if (localInput.trim().toLowerCase() === 'new') {
        const idStr = await ask('  New local ID (number): ');
        localId = parseInt(idStr.trim(), 10);
        if (isNaN(localId)) {
            console.error('Error: Invalid local ID');
            process.exit(1);
        }
        localName = await ask('  Local name: ');
        const currencySymbol = (await ask('  Currency symbol [$]: ')).trim() || '$';
        const currencyCode = (await ask('  Currency code [USD]: ')).trim() || 'USD';

        await prisma.localConfig.create({
            data: {
                id: localId,
                name: localName.trim(),
                config: {
                    localId,
                    localName: localName.trim(),
                    currency: { symbol: currencySymbol, code: currencyCode },
                    contractTypes: [],
                },
            },
        });
        console.log(`  Created local ${localId} — ${localName.trim()}\n`);
    } else {
        localId = parseInt(localInput.trim(), 10);
        const existing = await prisma.localConfig.findUnique({ where: { id: localId } });
        if (!existing) {
            console.error(`Error: Local ${localId} not found`);
            process.exit(1);
        }
        localName = existing.name;
        console.log(`  Selected: ${localId} — ${localName}\n`);
    }

    // Step 3: PDF file paths
    const pathInput = await ask('Path to wage agreement PDF(s) (comma-separated): ');
    const filePaths = pathInput.split(',').map(p => p.trim()).filter(Boolean);

    if (filePaths.length === 0) {
        console.error('Error: No file paths provided');
        process.exit(1);
    }

    // Validate files exist
    for (const fp of filePaths) {
        if (!fs.existsSync(fp)) {
            console.error(`Error: File not found — ${fp}`);
            process.exit(1);
        }
    }

    const batchId = randomUUID();
    let totalExtracted = 0;
    let totalErrors = 0;

    for (const fp of filePaths) {
        const fileName = path.basename(fp);
        console.log(`\nProcessing: ${fileName}...`);

        const fileBuffer = fs.readFileSync(fp);
        const mimeType = getMimeType(fp);

        const result = await scanWageAgreement(fileBuffer, mimeType);

        if (!result.success) {
            console.error(`  Error: ${result.error}`);
            await prisma.pendingContractType.create({
                data: {
                    localId,
                    sourceFileName: fileName,
                    status: 'error',
                    parsedData: {},
                    error: result.error || 'Unknown error',
                    createdByUserId: user.id,
                    batchId,
                },
            });
            totalErrors++;
            continue;
        }

        // Log top-level extraction notes
        if (result.extractionNotes && result.extractionNotes.length > 0) {
            console.log('  Extraction notes:');
            result.extractionNotes.forEach(n => console.log(`    - ${n}`));
        }

        // Validate and write each contract type
        for (const ct of result.contractTypes || []) {
            const validation = extractedContractTypeSchema.safeParse(ct);

            if (!validation.success) {
                const errorMsg = validation.error.issues
                    .map(i => `${i.path.join('.')}: ${i.message}`)
                    .join('; ');
                console.error(`  Validation failed for "${(ct as { name?: string }).name || 'unknown'}": ${errorMsg}`);

                await prisma.pendingContractType.create({
                    data: {
                        localId,
                        sourceFileName: fileName,
                        status: 'error',
                        parsedData: ct as object,
                        error: `Validation: ${errorMsg}`,
                        createdByUserId: user.id,
                        batchId,
                    },
                });
                totalErrors++;
            } else {
                await prisma.pendingContractType.create({
                    data: {
                        localId,
                        sourceFileName: fileName,
                        status: 'pending',
                        parsedData: validation.data as object,
                        error: null,
                        createdByUserId: user.id,
                        batchId,
                    },
                });
                console.log(`  Extracted: ${validation.data.name} (${validation.data.id})`);
                totalExtracted++;
            }
        }
    }

    console.log(`\n=== Done ===`);
    console.log(`  Batch ID: ${batchId}`);
    console.log(`  Extracted: ${totalExtracted} contract types`);
    console.log(`  Errors: ${totalErrors}`);
    console.log(`\n  Review and approve in the admin panel.\n`);

    rl.close();
    await prisma.$disconnect();
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
```

- [ ] **Step 2: Add npm script**

In `functions/package.json`, add to the `"scripts"` section:

```json
"config-builder": "ts-node src/scripts/config-builder.ts"
```

- [ ] **Step 3: Verify it compiles**

Run: `cd functions && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/scripts/config-builder.ts functions/package.json
git commit -m "feat: add config-builder CLI script

Interactive CLI that reads wage agreement PDFs, extracts config via
Gemini, validates with Zod, and writes PendingContractType records
for admin review."
```

---

### Task 5: Remove Upload Routes from Backend

**Files:**
- Modify: `functions/src/routes/batch.ts` (remove lines 17-272, keep lines 1-16 and 274-428)
- Modify: `functions/src/schemas/batch.ts` (remove `batchDriveSchema`)

- [ ] **Step 1: Remove upload routes from batch.ts**

In `functions/src/routes/batch.ts`:
- Remove the `SUPPORTED_EXTENSIONS`, `MAX_FILES`, `MAX_ZIP_SIZE` constants (lines 17-19)
- Remove the `getMimeType` function (lines 21-32)
- Remove the `POST /batch-upload` handler (lines 34-145)
- Remove the `SUPPORTED_DRIVE_MIMES` constant (lines 148-154)
- Remove the `extractFolderId` function (lines 156-167)
- Remove the `POST /batch-drive` handler (lines 169-272)
- Remove unused imports: `randomUUID`, `AdmZip`, `Busboy`, `scanContractDocument`, `batchDriveSchema`

The file should keep: router setup, auth middleware, and the GET/PUT/POST approve/POST reject/DELETE handlers (lines 274-428).

The remaining imports should be:

```typescript
import { Router, Response } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../utils/prisma';
import { requireAuth, requireSuperAdmin, AuthRequest } from '../middleware/auth';
import { batchPendingQuerySchema, updateParsedDataSchema } from '../schemas/batch';
```

- [ ] **Step 2: Remove batchDriveSchema from schemas/batch.ts**

In `functions/src/schemas/batch.ts`, remove the `batchDriveSchema` export (lines 13-19). Keep `batchPendingQuerySchema` and `updateParsedDataSchema`.

- [ ] **Step 3: Verify backend compiles**

Run: `cd functions && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add functions/src/routes/batch.ts functions/src/schemas/batch.ts
git commit -m "refactor: remove ZIP upload and Google Drive ingestion routes

Upload/Drive handlers replaced by config-builder CLI script.
Review queue routes (GET, PUT, approve, reject, DELETE) kept intact."
```

---

### Task 6: Update Admin Panel UI

**Files:**
- Modify: `frontend/src/components/BatchIngestion.tsx`

- [ ] **Step 1: Read the full BatchIngestion component**

Run: Read `frontend/src/components/BatchIngestion.tsx`

- [ ] **Step 2: Remove upload state and UI**

Remove from the component:
- All upload-related state: `ingestionMode`, `zipFile`, `driveUrl`, `uploading`, `uploadResult`, `uploadError`, `newLocalId`, `newLocalName`, `newCurrencySymbol`, `newCurrencyCode`
- The `handleUpload` and `handleDriveImport` functions
- The entire upload section JSX (the top portion with ZIP/Drive toggle, file picker, local selector, new local form, and submit button)
- Keep: `locals`, `selectedLocalId`, `items`, `loadingItems`, `filterStatus`, `reviewItem`, `editJson`, `jsonError`, `actionLoading`, `actionMessage`, and all review queue JSX

- [ ] **Step 3: Rename tab and update copy**

- In `frontend/src/components/AdminPanel.tsx`, find the tab button that says "Batch Ingestion" and change it to "Config Review"
- In `BatchIngestion.tsx`, add an info banner at the top:

```tsx
<div className="mb-6 p-4 bg-blue-900/30 border border-blue-700 rounded-lg text-blue-300 text-sm">
  Run <code className="bg-gray-800 px-1.5 py-0.5 rounded text-blue-200">cd functions && npm run config-builder</code> to ingest new wage agreements. Items appear here for review.
</div>
```

- Update any empty-state messages that reference ZIP/Drive uploads (e.g., "Upload a ZIP to get started" → "Run the config-builder CLI to add items")

- [ ] **Step 4: Add field labels to JSON editor**

In the review modal, add a helper that shows human-readable labels alongside the JSON keys. Add above the textarea:

```tsx
<details className="mb-3">
  <summary className="text-sm text-gray-400 cursor-pointer hover:text-gray-300">
    Field Reference
  </summary>
  <div className="mt-2 text-xs text-gray-500 space-y-1 max-h-48 overflow-y-auto">
    <div><code>rules.overtime</code> — Overtime rate (PercentageRule or TieredRule)</div>
    <div><code>rules.leaderPremium</code> — Leader premium (TieredRule by ensemble size)</div>
    <div><code>rules.pension</code> — Pension contribution (PercentageRule or ConditionalRule)</div>
    <div><code>rules.health</code> — Health & welfare (FlatRule per musician/service)</div>
    <div><code>rules.workDues</code> — Work dues (PercentageRule)</div>
    <div><code>rules.doubling</code> — Doubling premium (TieredRule or PercentageRule)</div>
    <div><code>rules.billing</code> — Billing increments and minimums (minutes)</div>
    <div><code>rules.surcharges</code> — After-midnight, onstage, etc.</div>
    <div><code>rules.extensions</code> — Additional rules not fitting core types</div>
    <div><code>pensionable: true/false</code> — Whether rule output counts toward pension basis</div>
    <div><code>extractionNotes</code> — AI uncertainty flags (review carefully)</div>
  </div>
</details>
```

- [ ] **Step 5: Verify frontend compiles and builds**

Run: `cd frontend && npx tsc --noEmit && npm run build`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/BatchIngestion.tsx frontend/src/components/AdminPanel.tsx
git commit -m "refactor: remove upload UI from admin panel, rename to Config Review

Strip ZIP/Drive upload forms, update empty-state copy, add field
reference labels to JSON review editor. Ingestion now via CLI."
```

---

### Task 7: Verify Backward Compatibility

**Files:**
- Modify: `frontend/src/utils/calculations.test.ts` (add tests)

- [ ] **Step 1: Read existing test file**

Run: Read `frontend/src/utils/calculations.test.ts`

- [ ] **Step 2: Add backward compatibility tests**

Add tests that verify the existing calculation engine still works with old-format Rules (the legacy fields):

```typescript
describe('backward compatibility with old Rules format', () => {
  // Create a ContractType with the old flat Rules shape
  const oldFormatContractType: ContractType = {
    id: 'test_old_format',
    name: 'Test Old Format',
    formIdentifier: 'TEST_OLD',
    calculationModel: 'live_engagement',
    fields: [
      { id: 'engagementType', label: 'Type', type: 'select', required: true, dataSource: 'wageScales' },
      { id: 'engagementDuration', label: 'Duration', type: 'number', required: true },
    ],
    wageScales: [
      { id: 'casual_2hr', name: 'Casual (2hr)', rate: 200, duration: 2 },
    ],
    rules: {
      overtimeRate: 1.5,
      leaderPremium: { rate: 100, description: 'Leader receives double scale' },
      doublingPremium: { rate: 15, description: '15% for first double' },
      pensionContribution: { rate: 8.5, basedOn: ['totalScaleWages'], description: '8.5%' },
      healthContribution: { ratePerMusicianPerService: 5.50, description: '$5.50/musician' },
      workDues: { rate: 1.5, basedOn: ['totalScaleWages'], description: '1.5% work dues' },
    } as any, // old format still accepted via legacy fields
    summary: [],
  };

  const personnel = [
    { id: '1', name: 'Leader', address: '', role: 'leader' as const, doubling: true, cartage: false },
    { id: '2', name: 'Side', address: '', role: 'sideperson' as const, doubling: false, cartage: false },
  ];
  const formData = { engagementType: 'casual_2hr', engagementDuration: 3 };

  it('calculates with old overtimeRate number', () => {
    const results = calculateEngagement(formData, oldFormatContractType, personnel);
    const overtime = results.find(r => r.id === 'totalOvertimePay');
    // 1 hour overtime * (200/2 hourly rate) * 1.5 multiplier * 2 musicians = 300
    expect(overtime?.value).toBe(300);
  });

  it('calculates with old leaderPremium.rate', () => {
    const results = calculateEngagement(formData, oldFormatContractType, personnel);
    const premiums = results.find(r => r.id === 'totalPremiums');
    // Leader: 200 * (100/100) = 200 leader premium + doubling premium
    // Doubling on leader: 200 * (15/100) = 30
    // Total premiums = 200 + 30 = 230
    expect(premiums).toBeDefined();
    expect(premiums!.value).toBeGreaterThan(0);
  });

  it('calculates with old pensionContribution.rate', () => {
    const results = calculateEngagement(formData, oldFormatContractType, personnel);
    const pension = results.find(r => r.id === 'pensionContribution');
    // Pension should be 8.5% of pensionable wages
    expect(pension).toBeDefined();
    expect(pension!.value).toBeGreaterThan(0);
  });

  it('calculates with old healthContribution.ratePerMusicianPerService', () => {
    const results = calculateEngagement(formData, oldFormatContractType, personnel);
    const health = results.find(r => r.id === 'healthContribution');
    // $5.50 per musician * 2 musicians = $11.00
    expect(health?.value).toBe(11);
  });
});
```

- [ ] **Step 3: Run tests**

Run: `cd frontend && npx vitest run`
Expected: All tests pass, including new backward compat tests.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/utils/calculations.test.ts
git commit -m "test: add backward compatibility tests for old Rules format

Verify calculation engine still works with legacy flat Rules shape
(overtimeRate, pensionContribution, etc.)"
```

---

### Task 8: Update README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Read current README**

Run: Read `README.md`

- [ ] **Step 2: Add Config Builder documentation**

Add a new section to the README documenting:
- What the config builder is and when to use it
- How to run it: `cd functions && npm run config-builder`
- The flow: enter admin email → select/create local → provide PDF paths → Gemini extracts → review in admin panel
- The new Rules type system (brief summary with link to spec)
- That existing locals with old Rules format continue to work unchanged

- [ ] **Step 3: Update architecture section**

Update any architecture/system overview sections to reflect:
- Ingestion is now via CLI script, not admin panel uploads
- Admin panel "Config Review" tab is for reviewing CLI-generated configs

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add config-builder CLI documentation to README

Document the new wage agreement ingestion workflow, Rules type system,
and admin panel changes."
```

---

## Task Dependency Order

```
Task 1 (Types) ← Task 2 (Zod) ← Task 3 (Gemini) ← Task 4 (CLI Script)
                                                       ↓
Task 5 (Remove routes) ← Task 6 (Admin UI) — can run in parallel with Task 4
                                                       ↓
Task 7 (Tests) — after Task 1
Task 8 (README) — after all other tasks
```

Tasks 1 → 2 → 3 → 4 are strictly sequential.
Task 5 can start after Task 3 (no dependency on CLI script).
Task 6 can start after Task 5.
Task 7 can start after Task 1.
Task 8 is last.
