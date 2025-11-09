import { describe, it, expect } from 'vitest';
import {
  formatCurrency,
  formatPercentage,
  formatNumber,
  parseFinancialNumber
} from './formatters';

describe('formatCurrency', () => {
  it('formats trillions correctly', () => {
    expect(formatCurrency(1500000000000)).toBe('$1.5T');
    expect(formatCurrency(2340000000000, 2)).toBe('$2.34T');
  });

  it('formats billions correctly', () => {
    expect(formatCurrency(1500000000)).toBe('$1.5B');
    expect(formatCurrency(234000000, 2)).toBe('$0.23B');
  });

  it('formats millions correctly', () => {
    expect(formatCurrency(1500000)).toBe('$1.5M');
    expect(formatCurrency(23400000, 0)).toBe('$23M');
  });

  it('formats thousands correctly', () => {
    expect(formatCurrency(1500)).toBe('$1.5K');
    expect(formatCurrency(12345, 2)).toBe('$12.35K');
  });

  it('formats small numbers correctly', () => {
    expect(formatCurrency(123)).toBe('$123.0');
    expect(formatCurrency(50.5, 2)).toBe('$50.50');
  });

  it('handles negative numbers correctly', () => {
    expect(formatCurrency(-1500000000)).toBe('$-1.5B');
    expect(formatCurrency(-50)).toBe('$-50.0');
  });

  it('handles edge cases', () => {
    expect(formatCurrency(0)).toBe('$0.0');
    expect(formatCurrency(null)).toBe('N/A');
    expect(formatCurrency(undefined)).toBe('N/A');
    expect(formatCurrency(NaN)).toBe('N/A');
    expect(formatCurrency('invalid')).toBe('N/A');
  });

  it('respects decimal parameter', () => {
    expect(formatCurrency(1234567890, 0)).toBe('$1B');
    expect(formatCurrency(1234567890, 3)).toBe('$1.235B');
  });
});

describe('formatPercentage', () => {
  it('formats decimals as percentages', () => {
    expect(formatPercentage(0.25)).toBe('25.0%');
    expect(formatPercentage(0.5)).toBe('50.0%');
    expect(formatPercentage(1.0)).toBe('100.0%');
  });

  it('handles small percentages', () => {
    expect(formatPercentage(0.001)).toBe('0.1%');
    expect(formatPercentage(0.0001, 2)).toBe('0.01%');
  });

  it('handles large percentages', () => {
    expect(formatPercentage(2.5)).toBe('250.0%');
    expect(formatPercentage(10)).toBe('1000.0%');
  });

  it('handles negative percentages', () => {
    expect(formatPercentage(-0.15)).toBe('-15.0%');
    expect(formatPercentage(-1.5)).toBe('-150.0%');
  });

  it('handles edge cases', () => {
    expect(formatPercentage(0)).toBe('0.0%');
    expect(formatPercentage(null)).toBe('N/A');
    expect(formatPercentage(undefined)).toBe('N/A');
    expect(formatPercentage(NaN)).toBe('N/A');
  });

  it('respects decimal parameter', () => {
    expect(formatPercentage(0.12345, 0)).toBe('12%');
    expect(formatPercentage(0.12345, 2)).toBe('12.35%');
    expect(formatPercentage(0.12345, 3)).toBe('12.345%');
  });
});

describe('formatNumber', () => {
  it('formats numbers with commas', () => {
    expect(formatNumber(1234567.89)).toBe('1,234,567.89');
    expect(formatNumber(1000)).toBe('1,000.00');
  });

  it('handles decimal precision', () => {
    expect(formatNumber(1234.5678, 0)).toBe('1,235');
    expect(formatNumber(1234.5678, 1)).toBe('1,234.6');
    expect(formatNumber(1234.5678, 3)).toBe('1,234.568');
  });

  it('handles negative numbers', () => {
    expect(formatNumber(-1234567.89)).toBe('-1,234,567.89');
    expect(formatNumber(-50, 0)).toBe('-50');
  });

  it('handles edge cases', () => {
    expect(formatNumber(0)).toBe('0.00');
    expect(formatNumber(null)).toBe('N/A');
    expect(formatNumber(undefined)).toBe('N/A');
    expect(formatNumber(NaN)).toBe('N/A');
  });
});

describe('parseFinancialNumber', () => {
  it('parses valid numbers', () => {
    expect(parseFinancialNumber(123.45)).toBe(123.45);
    expect(parseFinancialNumber('123.45')).toBe(123.45);
    expect(parseFinancialNumber('1000000')).toBe(1000000);
  });

  it('handles "None" string from Alpha Vantage API', () => {
    expect(parseFinancialNumber('None')).toBe(0);
  });

  it('handles null and undefined', () => {
    expect(parseFinancialNumber(null)).toBe(0);
    expect(parseFinancialNumber(undefined)).toBe(0);
  });

  it('handles empty strings', () => {
    expect(parseFinancialNumber('')).toBe(0);
    expect(parseFinancialNumber('   ')).toBe(0);
  });

  it('handles invalid inputs', () => {
    expect(parseFinancialNumber('invalid')).toBe(0);
    expect(parseFinancialNumber({})).toBe(0);
    expect(parseFinancialNumber([])).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(parseFinancialNumber(-123.45)).toBe(-123.45);
    expect(parseFinancialNumber('-123.45')).toBe(-123.45);
  });

  it('handles scientific notation', () => {
    expect(parseFinancialNumber('1.23e6')).toBe(1230000);
    expect(parseFinancialNumber(1.23e6)).toBe(1230000);
  });
});
