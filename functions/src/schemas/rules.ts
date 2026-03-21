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
