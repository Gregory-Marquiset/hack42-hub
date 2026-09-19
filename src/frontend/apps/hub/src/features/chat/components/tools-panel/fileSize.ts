const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

/**
 * A size in bytes, as people read it: "1.5 MB", "820 kB". A limit set in
 * binary multiples (`20 * 1024 * 1024`) reads with `base` 1024 as "20 MB".
 */
export const formatFileSize = (
  bytes: number,
  locale: string,
  base: 1000 | 1024 = 1000,
): string => {
  let value = Math.max(bytes, 0);
  let unit = 0;
  while (value >= base && unit < UNITS.length - 1) {
    value /= base;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: UNITS[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit === 0 || value >= 10 ? 0 : 1,
  }).format(value);
};
