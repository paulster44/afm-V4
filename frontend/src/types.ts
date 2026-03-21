

// --- AUTH TYPES ---
export type User = {
  uid: string;
  email: string;
  role: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  isGod: boolean;
};

export type UserUsage = {
  uid: string;
  email: string;
  totalContracts: number;
  totalVersions: number;
  totalActions: number;
  lastActive: string | null;
};

export type UsageStats = {
  totalContractsLifetime: number;
  totalVersionsLifetime: number;
  contractsToday: number;
  versionsToday: number;
  userUsage: UserUsage[];
};


// --- CONTRACT TYPES ---

export type Field = {
  id: string;
  label: string;
  type: 'text' | 'date' | 'time' | 'currency' | 'number' | 'textarea' | 'select';
  required: boolean;
  placeholder?: string;
  options?: string[];
  min?: number;
  minLength?: number;
  defaultValue?: number | string;
  description?: string;
  group?: string;
  dataSource?: 'wageScales';
  subtracts?: boolean; // When true, this field's value is subtracted from the total (e.g. deposit)
};

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

export type SummaryItem = {
  id: string;
  label: string;
};

export type WageScale = {
  id: string;
  name: string;
  rate: number;
  duration: number; // in hours
  description?: string;
};

export type AdditionalFee = {
  id: string;
  name: string;
  rate: number;
  category: string;
  perMusician: boolean;
};

export type Currency = {
  symbol: string;
  code: string;
};

export type StepMeta = {
  description?: string;
  condition?: {
    field: string;
    operator: 'eq' | 'neq' | 'gt' | 'exists';
    value: string | number | boolean;
  };
};

export type ContractType = {
  id: string;
  name: string;
  formIdentifier: string;
  fields: Field[];
  rules?: Rules;
  summary: SummaryItem[];
  wageScales?: WageScale[];
  additionalFees?: AdditionalFee[];
  signatureType?: 'engagement' | 'media_report' | 'member' | 'petitioner';
  currency?: Currency;
  jurisdiction?: string;
  legalText?: {
    preamble?: string;
    [key: string]: string | undefined;
  };
  calculationModel?: 'live_engagement' | 'media_report' | 'contribution_only';
  stepMeta?: Record<string, StepMeta>;
  pdfTemplateFields?: Record<string, string>;
  extractionNotes?: string[];
};


export type Config = {
  localId: number;
  localName: string;
  currency: Currency;
  contractTypes: ContractType[];
};

export type FormData = {
  [key: string]: string | number;
};

export type CalculationResult = {
  id: string;
  label: string;
  value: number;
};

export type Person = {
  id: string;
  name: string;
  address: string;
  presentForRehearsal?: boolean;
  role: 'leader' | 'sideperson';
  doubling: boolean;
  cartage: boolean;
  cartageInstrumentId?: string;
};

export type ContractVersion = {
  id: string;
  name: string;
  formData: FormData;
  createdAt: string;
  contractTypeId: string;
  personnel: Person[];
};

export type PendingContractType = {
  id: string;
  localId: number;
  sourceFileName: string;
  status: 'pending' | 'approved' | 'rejected' | 'error';
  parsedData: ContractType | Record<string, never>;
  error: string | null;
  batchId: string;
  createdAt: string;
};

export type SavedContract = {
  id: string;
  name: string;
  baseFormData: FormData;
  contractTypeId: string;
  createdAt: string;
  updatedAt: string;
  versions: ContractVersion[];
  personnel: Person[];
  activeVersionIndex: number | null;
};