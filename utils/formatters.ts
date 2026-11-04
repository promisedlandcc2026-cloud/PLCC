
export const formatCurrency = (val: number | string): string => {
  const num = typeof val === 'string' ? parseFloat(val.replace(/[$,]/g, '')) : val;
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
};

export const parseAmount = (val: number | string): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const parsed = parseFloat(val.toString().replace(/[$,]/g, ''));
  return isNaN(parsed) ? 0 : parsed;
};
