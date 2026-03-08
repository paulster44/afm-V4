

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

export type Rule = {
  rate: number;
  basedOn?: string[];
  description?: string;
};

export type HealthRule = {
  ratePerMusicianPerService: number;
  description: string;
};

export type Rules = {
  overtimeRate?: number;
  pensionContribution?: Rule;
  healthContribution?: HealthRule;
  workDues?: Rule;
  doublingPremium?: Rule;
  leaderPremium?: Rule;
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