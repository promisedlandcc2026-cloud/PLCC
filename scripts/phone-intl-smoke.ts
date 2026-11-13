/**
 * International phone numbers: Uganda by default, members abroad by country or +code.
 * Run: npx tsx scripts/phone-intl-smoke.ts
 */
import { formatPhoneForDisplay, isUgandanE164, toE164Intl } from '../api/_utils/ugPhone';
import { joinPhone, splitPhone, isValidPhone } from '../components/common/PhoneInput';

let failed = 0;
function check(label: string, got: unknown, want: unknown) {
  const ok = got === want;
  if (!ok) failed += 1;
  console.log(`  ${ok ? 'OK' : 'FAIL'}: ${label}${ok ? '' : ` (got ${JSON.stringify(got)}, want ${JSON.stringify(want)})`}`);
}

console.log('Server normalising (toE164Intl)');
check('Ugandan local 0772…', toE164Intl('0772 557842'), '+256772557842');
check('Ugandan without 0', toE164Intl('772557842'), '+256772557842');
check('Ugandan with 256', toE164Intl('256 780 914274'), '+256780914274');
check('Ugandan with +256', toE164Intl('+256 780 914 274'), '+256780914274');
check('00 prefix', toE164Intl('00256780914274'), '+256780914274');
check('Kenya with +254', toE164Intl('+254 712 345678'), '+254712345678');
check('Kenya local with country picked', toE164Intl('0712 345678', 'KE'), '+254712345678');
check('UK with +44', toE164Intl('+44 7911 123456'), '+447911123456');
check('US with +1', toE164Intl('+1 (617) 555-0123'), '+16175550123');
check('older US 10-digit still resolves', toE164Intl('(508) 555-1234'), '+15085551234');
check('empty', toE164Intl(''), null);
check('too short', toE164Intl('12345'), null);
check('isUgandanE164', isUgandanE164('+256780914274'), true);

console.log('Display');
check('Uganda display', formatPhoneForDisplay('+256780914274'), '+256 780 914 274');
check('UK display', formatPhoneForDisplay('+447911123456'), '+44 7911 123456');
check('US display', formatPhoneForDisplay('+15085551234'), '+1 (508) 555-1234');

console.log('Phone field (join/split)');
check('join Uganda local', joinPhone('0780 914274', 'UG'), '+256780914274');
check('join Kenya local', joinPhone('0712 345678', 'KE'), '+254712345678');
check('join typed +code overrides picker', joinPhone('+44 7911 123456', 'UG'), '+447911123456');
check('half-typed abroad keeps its code', joinPhone('0712 34', 'KE'), '+25471234');
check('half-typed Uganda stays as typed', joinPhone('0772 55', 'UG'), '0772 55');
check('split Ugandan number', splitPhone('+256780914274').country, 'UG');
check('split Ugandan national format', splitPhone('+256780914274').local, '0780 914274');
check('split Kenyan number', splitPhone('+254712345678').country, 'KE');
check('split legacy local value', splitPhone('0772557842').country, 'UG');
check('isValidPhone', isValidPhone('+256780914274'), true);

if (failed) {
  console.error(`\n${failed} phone check(s) failed.`);
  process.exit(1);
}
console.log('\nAll international phone checks passed.');
