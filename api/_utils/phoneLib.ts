/**
 * libphonenumber-js with its country data passed in explicitly.
 *
 * The package loads its metadata from a JSON file, and some loaders (tsx, some
 * bundlers) hand that JSON back wrapped in `{ default: … }`. Unwrapping it here
 * keeps phone parsing identical in the browser, in Vercel functions and in tests.
 */
import {
  getCountries as coreGetCountries,
  getCountryCallingCode as coreGetCountryCallingCode,
  parsePhoneNumberFromString as coreParse,
  type CountryCode,
  type MetadataJson,
  type PhoneNumber,
} from 'libphonenumber-js/core';
import rawMetadata from 'libphonenumber-js/min/metadata';

const metadata: MetadataJson = ((rawMetadata as any)?.countries
  ? rawMetadata
  : (rawMetadata as any)?.default) as MetadataJson;

export type { CountryCode, PhoneNumber };

export function parsePhoneNumberFromString(text: string, defaultCountry?: CountryCode): PhoneNumber | undefined {
  return defaultCountry ? coreParse(text, defaultCountry, metadata) : coreParse(text, metadata);
}

export function getCountries(): CountryCode[] {
  return coreGetCountries(metadata);
}

export function getCountryCallingCode(country: CountryCode): string {
  return String(coreGetCountryCallingCode(country, metadata));
}
