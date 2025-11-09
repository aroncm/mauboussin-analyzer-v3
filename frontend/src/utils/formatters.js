/**
 * Utility functions for formatting numbers and data display
 */

export const formatCurrency = (value, decimals = 1) => {
  if (!value || isNaN(value)) return 'N/A';

  const absValue = Math.abs(value);

  if (absValue >= 1e12) {
    return `$${(value / 1e12).toFixed(decimals)}T`;
  } else if (absValue >= 1e9) {
    return `$${(value / 1e9).toFixed(decimals)}B`;
  } else if (absValue >= 1e6) {
    return `$${(value / 1e6).toFixed(decimals)}M`;
  } else if (absValue >= 1e3) {
    return `$${(value / 1e3).toFixed(decimals)}K`;
  }

  return `$${value.toFixed(decimals)}`;
};

export const formatPercentage = (value, decimals = 1) => {
  if (!value || isNaN(value)) return 'N/A';
  return `${(value * 100).toFixed(decimals)}%`;
};

export const formatNumber = (value, decimals = 2) => {
  if (!value || isNaN(value)) return 'N/A';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
};

export const parseFinancialNumber = (value) => {
  if (value === "None" || value === null || value === undefined || value === "") {
    return 0;
  }
  return parseFloat(value) || 0;
};
