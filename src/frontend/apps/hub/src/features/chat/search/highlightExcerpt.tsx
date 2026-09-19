import { ReactNode } from "react";

interface HighlightExcerptProps {
  excerpt: string;
  matchRanges: [number, number][];
}

const renderHighlightedExcerpt = (
  excerpt: string,
  matchRanges: [number, number][],
): ReactNode[] => {
  if (!matchRanges.length) {
    return [excerpt];
  }

  // Sort ranges by start position
  const sorted = [...matchRanges].sort((a, b) => a[0] - b[0]);

  const parts: ReactNode[] = [];
  let lastEnd = 0;

  for (const [start, end] of sorted) {
    // Add non-highlighted part before this match
    if (start > lastEnd) {
      parts.push(excerpt.substring(lastEnd, start));
    }

    // Add highlighted match
    parts.push(
      <mark
        key={`mark-${start}-${end}`}
        className="hub__message-search__highlight"
      >
        {excerpt.substring(start, end)}
      </mark>,
    );

    lastEnd = end;
  }

  // Add any remaining non-highlighted text
  if (lastEnd < excerpt.length) {
    parts.push(excerpt.substring(lastEnd));
  }

  return parts;
};

export const HighlightedExcerpt = ({
  excerpt,
  matchRanges,
}: HighlightExcerptProps) => (
  <span>{renderHighlightedExcerpt(excerpt, matchRanges)}</span>
);
