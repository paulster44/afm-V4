import type { FormData, ContractType, Person, CalculationResult, LegacyRule, LegacyHealthRule } from '../types';

// Helper for currency formatting
export const formatCurrency = (value: number, _currencyCode: string, symbol: string) => {
    if (typeof value !== 'number' || isNaN(value)) {
        return `${symbol}0.00`;
    }
    const isNegative = value < 0;
    const fixedValue = Math.abs(value).toFixed(2);
    return isNegative ? `-${symbol}${fixedValue}` : `${symbol}${fixedValue}`;
};

// Calculation logic
export const calculateEngagement = (formData: FormData, contractType: ContractType, personnel: Person[]): CalculationResult[] => {
    const { rules, calculationModel, wageScales } = contractType;
    if (!rules && calculationModel !== 'contribution_only') return [];

    const results: CalculationResult[] = [];
    const getVal = (id: string) => Number(formData[id]) || 0;

    const numberOfMusicians = personnel.length;
    const numberOfRehearsingMusicians = personnel.filter(p => p.presentForRehearsal ?? true).length;

    let totalScaleWages = 0, totalRehearsal = 0, totalOvertime = 0, pensionContribution = 0, healthContribution = 0;
    let totalPremiums = 0, totalCartage = 0, totalAdditionalFees = 0, subtotalWages = 0, pensionableWages = 0, totalCost = 0;

    switch (calculationModel) {
        case 'live_engagement': {
            const engagementTypeId = formData.engagementType as string;
            const baseScale = wageScales?.find(s => s.id === engagementTypeId);

            if (baseScale) {
                personnel.forEach(person => {
                    const personScaleWage = baseScale.rate;
                    totalScaleWages += personScaleWage;

                    // --- Premiums ---
                    if (person.role === 'leader' && rules?.leaderPremium) {
                        // Legacy path: assumes old Rule shape. New typed rules handled in future engine update.
                        totalPremiums += personScaleWage * ((rules.leaderPremium as LegacyRule).rate / 100);
                    }
                    if (person.doubling && rules?.doublingPremium) {
                        // Legacy path: assumes old Rule shape. New typed rules handled in future engine update.
                        totalPremiums += personScaleWage * ((rules.doublingPremium as LegacyRule).rate / 100);
                    }
                });

                // --- Cartage ---
                personnel.forEach(person => {
                    if (person.cartage && person.cartageInstrumentId) {
                        const cartageScale = wageScales?.find(s => s.id === person.cartageInstrumentId);
                        if (cartageScale) {
                            totalCartage += cartageScale.rate;
                        }
                    }
                });

                // --- Auto Overtime ---
                const autoOvertimeHours = Math.max(0, getVal('engagementDuration') - baseScale.duration);
                if (autoOvertimeHours > 0 && baseScale.duration > 0 && rules?.overtimeRate) {
                    const baseHourlyRate = baseScale.rate / baseScale.duration;
                    totalOvertime += autoOvertimeHours * baseHourlyRate * rules.overtimeRate * numberOfMusicians;
                }

                // --- Manual Overtime ---
                const manualOvertimeHours = getVal('overtimeHours');
                if (manualOvertimeHours > 0 && rules?.overtimeRate && baseScale.duration > 0) {
                    const hourlyRate = baseScale.rate / baseScale.duration;
                    totalOvertime += manualOvertimeHours * hourlyRate * rules.overtimeRate * numberOfMusicians;
                }

            } else { // Manual scale logic for T-2 or if no scale selected
                const totalScaleWagesPerMusician = getVal('totalScaleWages');
                const engagementDuration = getVal('engagementDuration');
                const overtimeHours = getVal('overtimeHours');
                totalScaleWages = totalScaleWagesPerMusician * numberOfMusicians;
                if (overtimeHours > 0 && engagementDuration > 0 && rules?.overtimeRate) {
                    const baseHourlyRate = totalScaleWagesPerMusician / engagementDuration;
                    totalOvertime = overtimeHours * baseHourlyRate * rules.overtimeRate * numberOfMusicians;
                }
            }

            totalRehearsal = getVal('rehearsalHours') * getVal('rehearsalRate') * numberOfRehearsingMusicians;

            results.push({ id: 'totalScaleWages', label: 'Total Base Scale Wages', value: totalScaleWages });
            if (totalPremiums > 0) results.push({ id: 'totalPremiums', label: 'Leader/Doubling Premiums', value: totalPremiums });
            if (totalCartage > 0) results.push({ id: 'totalCartage', label: 'Total Cartage', value: totalCartage });
            if (totalRehearsal > 0) results.push({ id: 'totalRehearsalPay', label: 'Total Rehearsal Pay', value: totalRehearsal });
            if (totalOvertime > 0) results.push({ id: 'totalOvertimePay', label: 'Total Overtime Pay', value: totalOvertime });

            // --- Additional Fees ---
            if (contractType.additionalFees?.length) {
                const feeTotalsByCategory: Record<string, number> = {};
                contractType.additionalFees.forEach(fee => {
                    const qty = Number(formData[`fee_${fee.id}`]) || 0;
                    if (qty > 0) {
                        const amount = fee.perMusician ? fee.rate * qty * numberOfMusicians : fee.rate * qty;
                        feeTotalsByCategory[fee.category] = (feeTotalsByCategory[fee.category] || 0) + amount;
                        totalAdditionalFees += amount;
                    }
                });
                Object.entries(feeTotalsByCategory).forEach(([category, total]) => {
                    results.push({ id: `fees_${category.toLowerCase().replace(/\s+/g, '_')}`, label: `${category} Fees`, value: total });
                });
            }

            subtotalWages = totalScaleWages + totalPremiums + totalCartage + totalRehearsal + totalOvertime + totalAdditionalFees;
            results.push({ id: 'subtotalWages', label: 'Subtotal Gross Wages', value: subtotalWages });
            break;
        }
        case 'media_report': {
            const scaleWagesPerSession = getVal('scaleWages');
            const numberOfServices = getVal('numberOfServices') || 1;
            const overtimeHours = getVal('overtimeHours');
            totalScaleWages = scaleWagesPerSession * numberOfMusicians * numberOfServices;
            if (overtimeHours > 0 && rules?.overtimeRate) {
                const baseHourlyRate = scaleWagesPerSession / 3;
                totalOvertime = overtimeHours * baseHourlyRate * rules.overtimeRate * numberOfMusicians;
            }
            results.push({ id: 'totalScaleWages', label: 'Total Session Wages', value: totalScaleWages });
            if (totalOvertime > 0) results.push({ id: 'overtimePay', label: 'Overtime Pay', value: totalOvertime });

            // --- Additional Fees ---
            if (contractType.additionalFees?.length) {
                const feeTotalsByCategory: Record<string, number> = {};
                contractType.additionalFees.forEach(fee => {
                    const qty = Number(formData[`fee_${fee.id}`]) || 0;
                    if (qty > 0) {
                        const amount = fee.perMusician ? fee.rate * qty * numberOfMusicians : fee.rate * qty;
                        feeTotalsByCategory[fee.category] = (feeTotalsByCategory[fee.category] || 0) + amount;
                        totalAdditionalFees += amount;
                    }
                });
                Object.entries(feeTotalsByCategory).forEach(([category, total]) => {
                    results.push({ id: `fees_${category.toLowerCase().replace(/\s+/g, '_')}`, label: `${category} Fees`, value: total });
                });
            }

            subtotalWages = totalScaleWages + totalOvertime + totalAdditionalFees;
            break;
        }
        case 'contribution_only': {
            pensionableWages = getVal('totalPensionableWages');
            const pensionPercentage = getVal('pensionContributionPercentage');
            healthContribution = getVal('healthContributionAmount');

            // --- Additional Fees ---
            if (contractType.additionalFees?.length) {
                const feeTotalsByCategory: Record<string, number> = {};
                contractType.additionalFees.forEach(fee => {
                    const qty = Number(formData[`fee_${fee.id}`]) || 0;
                    if (qty > 0) {
                        const amount = fee.perMusician ? fee.rate * qty * numberOfMusicians : fee.rate * qty;
                        feeTotalsByCategory[fee.category] = (feeTotalsByCategory[fee.category] || 0) + amount;
                        totalAdditionalFees += amount;
                    }
                });
                Object.entries(feeTotalsByCategory).forEach(([category, total]) => {
                    results.push({ id: `fees_${category.toLowerCase().replace(/\s+/g, '_')}`, label: `${category} Fees`, value: total });
                });
            }

            pensionContribution = pensionableWages * (pensionPercentage / 100);
            results.push({ id: 'pensionableWages', label: 'Total Pensionable Wages', value: pensionableWages });
            results.push({ id: 'pensionContribution', label: `Pension Contribution (${pensionPercentage}%)`, value: pensionContribution });
            if (healthContribution > 0) results.push({ id: 'healthContribution', label: 'Health Contribution', value: healthContribution });
            if (totalAdditionalFees > 0) results.push({ id: 'totalAdditionalFees', label: 'Total Additional Fees', value: totalAdditionalFees });
            totalCost = pensionContribution + healthContribution + totalAdditionalFees;
            results.push({ id: 'totalContributions', label: 'Total Contributions Due', value: totalCost });
            return results;
        }
    }

    pensionableWages = totalScaleWages + totalPremiums + totalCartage + totalRehearsal + totalOvertime + totalAdditionalFees; // Pension is typically on all gross wages

    if (rules?.pensionContribution) {
        // Legacy path: assumes old Rule shape. New typed rules handled in future engine update.
        const legacyPension = rules.pensionContribution as LegacyRule;
        pensionContribution = pensionableWages * (legacyPension.rate / 100);
        results.push({ id: 'pensionContribution', label: `Pension (${legacyPension.description || `${legacyPension.rate}%`})`, value: pensionContribution });
    }
    if (rules?.healthContribution) {
        // Legacy path: assumes old Rule shape. New typed rules handled in future engine update.
        const legacyHealth = rules.healthContribution as LegacyHealthRule;
        const services = calculationModel === 'media_report' ? (getVal('numberOfServices') || 1) : 1;
        healthContribution = legacyHealth.ratePerMusicianPerService * numberOfMusicians * services;
        results.push({ id: 'healthContribution', label: `Health & Welfare (${legacyHealth.description})`, value: healthContribution });
    }
    if (rules?.workDues) {
        // Legacy path: assumes old Rule shape. New typed rules handled in future engine update.
        const legacyWorkDues = rules.workDues as LegacyRule;
        results.push({ id: 'workDues', label: `Work Dues (${legacyWorkDues.description || `${legacyWorkDues.rate}%`})`, value: pensionableWages * (legacyWorkDues.rate / 100) });
    }

    const totalBenefits = pensionContribution + healthContribution;
    totalCost = subtotalWages + totalBenefits; // Work dues are typically deducted, not added to purchaser cost.

    if (calculationModel === 'live_engagement' && !wageScales) {
        const perDiem = getVal('perDiem') * numberOfMusicians;
        const travelExpenses = getVal('travelExpenses');
        if (perDiem > 0) results.push({ id: 'totalPerDiem', label: 'Total Per Diem', value: perDiem });
        if (travelExpenses > 0) results.push({ id: 'travelExpenses', label: 'Travel Expenses', value: travelExpenses });
        totalCost += perDiem + travelExpenses;
    }

    // --- Dynamic Currency Fields (e.g., Tips, Custom Costs, Deposits) ---
    const ignoredCurrencyFields = ['rehearsalRate', 'scaleWages', 'totalScaleWages', 'perDiem', 'travelExpenses', 'healthContributionAmount', 'pensionContributionPercentage'];
    let totalDeductions = 0;
    const deductionResults: CalculationResult[] = [];

    contractType.fields.forEach(field => {
        if (field.type === 'currency' && !ignoredCurrencyFields.includes(field.id)) {
            const val = getVal(field.id);
            if (val > 0) {
                // A field is a deduction if explicitly marked with subtracts:true,
                // or if its id contains "deposit" (handles existing DB configs without the flag)
                const isDeduction = field.subtracts === true || field.id.toLowerCase().includes('deposit');
                if (isDeduction) {
                    totalDeductions += val;
                    deductionResults.push({ id: field.id, label: field.label, value: -val });
                } else {
                    results.push({ id: field.id, label: field.label, value: val });
                    totalCost += val;
                }
            }
        }
    });

    results.push({ id: 'totalBenefits', label: 'Total Benefits', value: totalBenefits });
    results.push({ id: 'totalEngagementCost', label: 'Total Engagement Cost', value: totalCost });

    // Deductions (e.g., deposit received) appear after the total, followed by Balance Due
    if (deductionResults.length > 0) {
        deductionResults.forEach(r => results.push(r));
        results.push({ id: 'balanceDue', label: 'Balance Due', value: totalCost - totalDeductions });
    }

    return results;
};
