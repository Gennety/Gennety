import { defaultLocale } from "@/i18n/config";

export interface CountryOption {
  code: string;
  flag: string;
  name: string;
  englishName: string;
  searchValue: string;
}

const EXCLUDED_REGION_CODES = new Set([
  "AC",
  "AN",
  "AQ",
  "BU",
  "BV",
  "CP",
  "CQ",
  "CS",
  "DG",
  "EA",
  "EU",
  "EZ",
  "FX",
  "GS",
  "HM",
  "IC",
  "IO",
  "QO",
  "SU",
  "TA",
  "TF",
  "TP",
  "UK",
  "UM",
  "UN",
  "YU",
  "ZR",
]);

const countryCache = new Map<string, CountryOption[]>();
const englishRegionDisplayNames = buildRegionDisplayNames("en");

function normalizeSearchValue(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, "and")
    .trim();
}

function buildRegionDisplayNames(locale: string) {
  return new Intl.DisplayNames([locale || defaultLocale], { type: "region" });
}

function toFlagEmoji(code: string): string {
  return String.fromCodePoint(
    ...code
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0))
  );
}

export function isSupportedCountryCode(code: string): boolean {
  const normalized = code.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalized) || EXCLUDED_REGION_CODES.has(normalized)) {
    return false;
  }

  const englishName = englishRegionDisplayNames.of(normalized);
  return Boolean(englishName && englishName !== normalized && englishName !== "Unknown Region");
}

export function getCountryName(code: string, locale: string = defaultLocale): string | null {
  if (!isSupportedCountryCode(code)) {
    return null;
  }

  return buildRegionDisplayNames(locale).of(code.toUpperCase()) ?? null;
}

export function getCountryOptions(locale: string = defaultLocale): CountryOption[] {
  const normalizedLocale = locale || defaultLocale;
  const cached = countryCache.get(normalizedLocale);

  if (cached) {
    return cached;
  }

  const localizedDisplayNames = buildRegionDisplayNames(normalizedLocale);
  const collator = new Intl.Collator(normalizedLocale);
  const options: CountryOption[] = [];

  for (let first = 65; first <= 90; first += 1) {
    for (let second = 65; second <= 90; second += 1) {
      const code = String.fromCharCode(first, second);

      if (!isSupportedCountryCode(code)) {
        continue;
      }

      const englishName = englishRegionDisplayNames.of(code);
      if (!englishName) {
        continue;
      }

      const localizedName = localizedDisplayNames.of(code) ?? englishName;

      options.push({
        code,
        flag: toFlagEmoji(code),
        name: localizedName,
        englishName,
        searchValue: normalizeSearchValue(`${localizedName} ${englishName} ${code}`),
      });
    }
  }

  options.sort((left, right) => collator.compare(left.name, right.name));
  countryCache.set(normalizedLocale, options);

  return options;
}

export function matchesCountryQuery(option: CountryOption, query: string): boolean {
  return option.searchValue.includes(normalizeSearchValue(query));
}
