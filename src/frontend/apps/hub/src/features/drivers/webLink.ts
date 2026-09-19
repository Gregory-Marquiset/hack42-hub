/**
 * Whether `url` is an absolute web address (http or https). Links listed with
 * a meeting must be: anything else would be hidden by the archive, refused by
 * the Hub, or rendered as a broken relative link.
 */
export const isWebLink = (url: string): boolean => {
  const trimmed = url.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return false;
  }
  try {
    new URL(trimmed);
    return true;
  } catch {
    return false;
  }
};
