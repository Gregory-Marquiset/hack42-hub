import { SearchFilters, emptySearchFilters } from "./types";

export type ParsedSearchQuery = {
  filters: SearchFilters;
  freeText: string;
  raw: string;
};

const KNOWN_TAGS = new Set(["from", "mentions", "has", "before", "during", "after"]);
const VALID_HAS_VALUES = new Set(["image", "video", "link"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const parseSearchQuery = (raw: string): ParsedSearchQuery => {
  const filters = emptySearchFilters();
  const freeTextParts: string[] = [];

  if (!raw.trim()) {
    return { filters, freeText: "", raw };
  }

  // Tokenizer regex: quoted-tag-value | bare-tag-value | quoted-phrase | bare-word
  // Priority: (tag:"value") | (tag:value) | ("phrase") | (word)
  const tokenRegex = /(\w+):"([^"]*)"|(\w+):(\S+)|"([^"]*)"|(\S+)/g;
  let match;

  while ((match = tokenRegex.exec(raw)) !== null) {
    // match[1] = tag name (quoted value), match[2] = quoted value
    // match[3] = tag name (bare value), match[4] = bare value
    // match[5] = quoted phrase
    // match[6] = bare word
    if (match[1]) {
      const tagName = match[1].toLowerCase();
      const value = match[2];
      processTag(tagName, value, filters, freeTextParts);
    } else if (match[3]) {
      const tagName = match[3].toLowerCase();
      const value = match[4];
      processTag(tagName, value, filters, freeTextParts);
    } else if (match[5]) {
      freeTextParts.push(match[5]);
    } else if (match[6]) {
      freeTextParts.push(match[6]);
    }
  }

  const freeText = freeTextParts.join(" ").trim();

  return { filters, freeText, raw };
};

const processTag = (
  tagName: string,
  value: string,
  filters: SearchFilters,
  fallbackFreeText: string[]
) => {
  if (!KNOWN_TAGS.has(tagName)) {
    // Unknown tag: fall through to free text (Discord's forgiving behavior)
    fallbackFreeText.push(`${tagName}:${value}`);
    return;
  }

  switch (tagName) {
    case "from":
    case "mentions":
      filters[tagName].push(value);
      break;

    case "has":
      if (VALID_HAS_VALUES.has(value.toLowerCase())) {
        filters.has.push(value.toLowerCase() as "image" | "video" | "link");
      } else {
        // Invalid has value: fall through to free text
        fallbackFreeText.push(`has:${value}`);
      }
      break;

    case "before":
    case "during":
    case "after":
      if (DATE_PATTERN.test(value)) {
        filters[tagName] = value;
      } else {
        // Invalid date format: fall through to free text
        fallbackFreeText.push(`${tagName}:${value}`);
      }
      break;
  }
};
