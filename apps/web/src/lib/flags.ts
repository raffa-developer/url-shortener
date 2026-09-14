const REGIONAL_INDICATOR_A = 0x1f1e6;

/** Converts an ISO 3166-1 alpha-2 code into its flag emoji. */
export function countryFlag(country: string | null | undefined): string | null {
  if (!country) {
    return null;
  }

  const code = country.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    return null;
  }

  return String.fromCodePoint(
    ...[...code].map((char) => REGIONAL_INDICATOR_A + char.charCodeAt(0) - 65),
  );
}
