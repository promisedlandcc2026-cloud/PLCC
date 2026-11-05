
/** PLCC gives in Ugandan shillings: "UGX 50,000" (no cents). */
export const CURRENCY_CODE = 'UGX';
const CURRENCY_STRIP = /UGX|USh|Ushs?|shs?|[$,\s]/gi;
const ugx = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'UGX',
  currencyDisplay: 'code',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export const formatCurrency = (val: number | string | null | undefined): string => {
  const num = typeof val === 'string' ? parseFloat(val.replace(CURRENCY_STRIP, '')) : Number(val);
  return ugx.format(Number.isFinite(num) ? num : 0).replace(/\u00a0/g, ' ');
};

export const parseAmount = (val: number | string): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const parsed = parseFloat(val.toString().replace(CURRENCY_STRIP, ''));
  return isNaN(parsed) ? 0 : parsed;
};
