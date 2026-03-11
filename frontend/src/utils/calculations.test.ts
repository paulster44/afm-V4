import { describe, it, expect } from 'vitest';
import { calculateEngagement, formatCurrency } from './calculations';
import type { ContractType, FormData, Person } from '../types';

// ─── Shared test fixtures ────────────────────────────────────────────────────

const musician = (overrides: Partial<Person> = {}): Person => ({
  id: '1',
  name: 'Test Musician',
  address: '123 Main St',
  role: 'sideperson',
  doubling: false,
  cartage: false,
  ...overrides,
});

const liveEngagementContract = (overrides: Partial<ContractType> = {}): ContractType => ({
  id: 'live',
  name: 'Live Engagement',
  formIdentifier: 'T-1',
  fields: [],
  summary: [],
  calculationModel: 'live_engagement',
  rules: {
    overtimeRate: 1.5,
    pensionContribution: { rate: 10, description: '10%' },
    healthContribution: { ratePerMusicianPerService: 5, description: '$5/musician' },
    workDues: { rate: 2, description: '2%' },
    leaderPremium: { rate: 10, description: '10%' },
    doublingPremium: { rate: 20, description: '20%' },
  },
  wageScales: [
    { id: 'scale_concert', name: 'Concert', rate: 100, duration: 3 },
  ],
  ...overrides,
});

// ─── formatCurrency ──────────────────────────────────────────────────────────

describe('formatCurrency', () => {
  it('formats a positive number', () => {
    expect(formatCurrency(100, 'USD', '$')).toBe('$100.00');
  });

  it('formats zero', () => {
    expect(formatCurrency(0, 'USD', '$')).toBe('$0.00');
  });

  it('formats a negative number', () => {
    expect(formatCurrency(-50.5, 'USD', '$')).toBe('-$50.50');
  });

  it('handles NaN gracefully', () => {
    expect(formatCurrency(NaN, 'USD', '$')).toBe('$0.00');
  });
});

// ─── live_engagement model ───────────────────────────────────────────────────

describe('calculateEngagement — live_engagement', () => {
  it('returns base scale wages for a single musician', () => {
    const contract = liveEngagementContract();
    const form: FormData = { engagementType: 'scale_concert', engagementDuration: 3 };
    const results = calculateEngagement(form, contract, [musician()]);
    const wages = results.find(r => r.id === 'totalScaleWages');
    expect(wages?.value).toBe(100);
  });

  it('multiplies scale by number of musicians', () => {
    const contract = liveEngagementContract();
    const form: FormData = { engagementType: 'scale_concert', engagementDuration: 3 };
    const results = calculateEngagement(form, contract, [musician(), musician({ id: '2' })]);
    const wages = results.find(r => r.id === 'totalScaleWages');
    expect(wages?.value).toBe(200);
  });

  it('adds a leader premium (10% of scale)', () => {
    const contract = liveEngagementContract();
    const form: FormData = { engagementType: 'scale_concert', engagementDuration: 3 };
    const results = calculateEngagement(form, contract, [musician({ role: 'leader' })]);
    const premiums = results.find(r => r.id === 'totalPremiums');
    expect(premiums?.value).toBe(10); // 10% of $100
  });

  it('adds a doubling premium (20% of scale)', () => {
    const contract = liveEngagementContract();
    const form: FormData = { engagementType: 'scale_concert', engagementDuration: 3 };
    const results = calculateEngagement(form, contract, [musician({ doubling: true })]);
    const premiums = results.find(r => r.id === 'totalPremiums');
    expect(premiums?.value).toBe(20); // 20% of $100
  });

  it('calculates auto overtime when duration exceeds scale duration', () => {
    const contract = liveEngagementContract();
    // Scale is 3hr/$100. Playing 4hrs = 1hr overtime at 1.5×
    // Hourly = $100/3 ≈ 33.33. OT = 1hr × 33.33 × 1.5 = 50.00
    const form: FormData = { engagementType: 'scale_concert', engagementDuration: 4 };
    const results = calculateEngagement(form, contract, [musician()]);
    const ot = results.find(r => r.id === 'totalOvertimePay');
    expect(ot?.value).toBeCloseTo(50, 1);
  });

  it('calculates pension contribution on gross wages', () => {
    const contract = liveEngagementContract();
    const form: FormData = { engagementType: 'scale_concert', engagementDuration: 3 };
    const results = calculateEngagement(form, contract, [musician()]);
    const pension = results.find(r => r.id === 'pensionContribution');
    expect(pension?.value).toBe(10); // 10% of $100
  });

  it('calculates health & welfare per musician', () => {
    const contract = liveEngagementContract();
    const form: FormData = { engagementType: 'scale_concert', engagementDuration: 3 };
    const results = calculateEngagement(form, contract, [musician(), musician({ id: '2' })]);
    const health = results.find(r => r.id === 'healthContribution');
    expect(health?.value).toBe(10); // $5 × 2 musicians
  });

  it('subtracts deposit from total and shows balance due', () => {
    const contract = liveEngagementContract({
      fields: [{ id: 'depositReceived', label: 'Deposit Received', type: 'currency', required: false }],
    });
    const form: FormData = { engagementType: 'scale_concert', engagementDuration: 3, depositReceived: 50 };
    const results = calculateEngagement(form, contract, [musician()]);
    const deposit = results.find(r => r.id === 'depositReceived');
    const balance = results.find(r => r.id === 'balanceDue');
    expect(deposit?.value).toBe(-50);
    expect(balance).toBeDefined();
  });

  it('adds rehearsal pay when rehearsal hours and rate are provided', () => {
    const contract = liveEngagementContract();
    const form: FormData = {
      engagementType: 'scale_concert',
      engagementDuration: 3,
      rehearsalHours: 2,
      rehearsalRate: 25,
    };
    const results = calculateEngagement(form, contract, [musician()]);
    const rehearsal = results.find(r => r.id === 'totalRehearsalPay');
    expect(rehearsal?.value).toBe(50); // 2hrs × $25
  });

  it('returns empty array when no rules and model is not contribution_only', () => {
    const contract = liveEngagementContract({ rules: undefined });
    const form: FormData = { engagementType: 'scale_concert', engagementDuration: 3 };
    const results = calculateEngagement(form, contract, [musician()]);
    expect(results).toEqual([]);
  });
});

// ─── media_report model ──────────────────────────────────────────────────────

describe('calculateEngagement — media_report', () => {
  const mediaContract = (): ContractType => ({
    id: 'media',
    name: 'Media Report',
    formIdentifier: 'B-4',
    fields: [],
    summary: [],
    calculationModel: 'media_report',
    rules: {
      overtimeRate: 1.5,
      pensionContribution: { rate: 10, description: '10%' },
    },
  });

  it('calculates session wages across musicians and services', () => {
    const form: FormData = { scaleWages: 100, numberOfServices: 2 };
    const results = calculateEngagement(form, mediaContract(), [musician(), musician({ id: '2' })]);
    const wages = results.find(r => r.id === 'totalScaleWages');
    expect(wages?.value).toBe(400); // $100 × 2 musicians × 2 services
  });

  it('calculates overtime using 3-hour session baseline', () => {
    // Base $100/3hr = $33.33/hr. 1hr OT × 1.5 × 1 musician = $50
    const form: FormData = { scaleWages: 100, numberOfServices: 1, overtimeHours: 1 };
    const results = calculateEngagement(form, mediaContract(), [musician()]);
    const ot = results.find(r => r.id === 'overtimePay');
    expect(ot?.value).toBeCloseTo(50, 1);
  });
});

// ─── contribution_only model ─────────────────────────────────────────────────

describe('calculateEngagement — contribution_only', () => {
  const contributionContract = (): ContractType => ({
    id: 'contrib',
    name: 'Contribution Only',
    formIdentifier: 'T-3',
    fields: [],
    summary: [],
    calculationModel: 'contribution_only',
  });

  it('calculates pension from pensionable wages and percentage', () => {
    const form: FormData = { totalPensionableWages: 1000, pensionContributionPercentage: 12 };
    const results = calculateEngagement(form, contributionContract(), []);
    const pension = results.find(r => r.id === 'pensionContribution');
    expect(pension?.value).toBe(120); // 12% of $1000
  });

  it('includes health contribution when provided', () => {
    const form: FormData = {
      totalPensionableWages: 1000,
      pensionContributionPercentage: 10,
      healthContributionAmount: 75,
    };
    const results = calculateEngagement(form, contributionContract(), []);
    const health = results.find(r => r.id === 'healthContribution');
    expect(health?.value).toBe(75);
  });

  it('returns total contributions due', () => {
    const form: FormData = {
      totalPensionableWages: 1000,
      pensionContributionPercentage: 10,
      healthContributionAmount: 50,
    };
    const results = calculateEngagement(form, contributionContract(), []);
    const total = results.find(r => r.id === 'totalContributions');
    expect(total?.value).toBe(150); // $100 pension + $50 health
  });
});
