
import React from 'react';
import type { Field, FormData, WageScale } from '../types';
import Tooltip from './Tooltip';

type DynamicFieldProps = {
  field: Field;
  formData: FormData;
  handleChange: (id: string, value: string | number) => void;
  wageScales?: WageScale[];
  currencySymbol: string;
  error?: string;
  onKeyDown?: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
};

const baseInputClasses = "mt-1 block w-full px-4 py-2 min-h-[44px] leading-normal bg-slate-900 border text-slate-50 transition-shadow rounded-md shadow-sm placeholder-slate-500 focus:outline-none sm:text-sm appearance-none";
const normalBorderClasses = "border-slate-600 focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900";
const errorBorderClasses = "border-red-400 focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-900";


const DynamicField: React.FC<DynamicFieldProps> = ({ field, formData, handleChange, wageScales, currencySymbol, error, onKeyDown }) => {
  const value = formData[field.id] || (field.defaultValue !== undefined ? field.defaultValue : '');
  const commonInputClasses = `${baseInputClasses} ${error ? errorBorderClasses : normalBorderClasses}`;

  const renderField = () => {
    switch (field.type) {
      case 'text':
      case 'date':
      case 'time':
        return (
          <input
            type={field.type}
            id={field.id}
            name={field.id}
            value={value as string}
            onChange={(e) => handleChange(field.id, e.target.value)}
            required={field.required}
            placeholder={field.placeholder}
            className={commonInputClasses}
            aria-invalid={!!error}
            aria-describedby={error ? `${field.id}-error` : undefined}
            onKeyDown={onKeyDown}
          />
        );
      case 'number':
      case 'currency':
        return (
          <div className="relative mt-1 rounded-md shadow-sm">
            {field.type === 'currency' && <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3"><span className="text-slate-500 sm:text-sm">{currencySymbol}</span></div>}
            <input
              type="number"
              id={field.id}
              name={field.id}
              value={value as number}
              onChange={(e) => {
                if (e.target.value === '') {
                  handleChange(field.id, '');
                } else {
                  const num = e.target.valueAsNumber;
                  if (!isNaN(num)) {
                    handleChange(field.id, num);
                  }
                  // If num is NaN, we do nothing, preventing invalid state update.
                  // The input value will be what user typed, but state won't update.
                  // Then on next render, input will revert to old state value.
                }
              }}
              required={field.required}
              placeholder={field.placeholder}
              min={field.min}
              step={field.type === 'currency' ? '0.01' : '1'}
              className={`${commonInputClasses} ${field.type === 'currency' ? 'pl-7' : ''}`}
              aria-invalid={!!error}
              aria-describedby={error ? `${field.id}-error` : undefined}
              onKeyDown={onKeyDown}
            />
          </div>
        );
      case 'textarea':
        return (
          <textarea
            id={field.id}
            name={field.id}
            value={value as string}
            onChange={(e) => handleChange(field.id, e.target.value)}
            required={field.required}
            placeholder={field.placeholder}
            rows={4}
            className={commonInputClasses}
            aria-invalid={!!error}
            aria-describedby={error ? `${field.id}-error` : undefined}
            onKeyDown={onKeyDown}
          />
        );
      case 'select':
        return (
          <select
            id={field.id}
            name={field.id}
            value={value as string}
            onChange={(e) => handleChange(field.id, e.target.value)}
            required={field.required}
            className={commonInputClasses}
            aria-invalid={!!error}
            aria-describedby={error ? `${field.id}-error` : undefined}
            onKeyDown={onKeyDown}
          >
            <option value="">Select an option</option>
            {field.dataSource === 'wageScales' && wageScales ? (
              wageScales.map((scale) => (
                <option key={scale.id} value={scale.id}>{scale.name}</option>
              ))
            ) : (
              field.options?.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))
            )}
          </select>
        );
      default:
        return null;
    }
  };

  return (
    <div className="mb-4">
      <label htmlFor={field.id} className="flex items-center text-sm font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
        <span>
          {field.label}
          {field.required && <span className="text-red-400 ml-1.5">*</span>}
        </span>
        {field.description && (
          <div className="ml-2.5">
            <Tooltip content={field.description}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-slate-500 hover:text-slate-300 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </Tooltip>
          </div>
        )}
      </label>
      {renderField()}
      {error && <p id={`${field.id}-error`} className="mt-1 text-xs text-red-400">{error}</p>}
    </div>
  );
};

export default DynamicField;
