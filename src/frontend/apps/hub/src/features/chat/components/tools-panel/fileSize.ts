const UNITS = ["byte", "kilobyte", "megabyte", "gigabyte"] as const;

/** A size in bytes, as people read it: "1.5 MB", "820 kB". */
export const formatFileSize = (bytes: number, locale: string): string => {
  let value = Math.max(bytes, 0);
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: UNITS[unit],
    unitDisplay: "short",
    maximumFractionDigits: unit === 0 || value >= 10 ? 0 : 1,
  }).format(value);
};
