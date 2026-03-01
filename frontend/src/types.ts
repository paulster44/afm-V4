

// --- AUTH TYPES ---
export type User = {
  uid: string;
  email: string;
  role: string;
  isAdmin: boolean;
  isGod: boolean;
};

// --- USAGE STATS TYPES ---
export type UserUsage = {
  uid: string;
  email: string;
  totalTokens: number;
  lastActive: string;
};

export type UsageStats = {
  totalTokensLifetime: number;
  totalTokensToday: number;
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

export type Currency = {
  symbol: string;
  code: string;
};

export type ContractType = {
  id: string;
  name: string;
  formIdentifier: string;
  fields: Field[];
  rules?: Rules;
  summary: SummaryItem[];
  wageScales?: WageScale[];
  signatureType?: 'engagement' | 'media_report' | 'member' | 'petitioner';
  currency?: Currency;
  jurisdiction?: string;
  legalText?: {
    preamble?: string;
    [key: string]: string | undefined;
  };
  calculationModel?: 'live_engagement' | 'media_report' | 'contribution_only';
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