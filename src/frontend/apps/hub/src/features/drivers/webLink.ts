/** A scheme, a host, then anything but spaces. */
const WEB_LINK = /^https?:\/\/[^\s/?#]+\S*$/i;

/**
 * Whether `url` is an absolute web address (http or https). Links listed with
 * a meeting must be: anything else would be hidden by the archive, refused by
 * the Hub, or rendered as a broken relative link.
 */
export const isWebLink = (url: string): boolean => WEB_LINK.test(url.trim());
