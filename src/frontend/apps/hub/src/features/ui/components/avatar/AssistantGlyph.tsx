/**
 * The assistant's face: a rounded head, a short antenna and a visor with two
 * eyes. Drawn in `currentColor` so it takes the avatar's text colour, and the
 * eyes are cut out of the visor (even-odd fill) so the bubble's own background
 * shows through whatever palette colour it carries.
 *
 * Always decorative: the surrounding `Avatar` carries the accessible name.
 */
export const AssistantGlyph = () => (
  <svg
    className="hub__avatar__glyph"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <line x1="12" y1="2.5" x2="12" y2="5.5" />
    <rect x="4" y="6" width="16" height="14" rx="6" />
    <path
      fill="currentColor"
      fillRule="evenodd"
      stroke="none"
      d="M9 10.5h6a2.5 2.5 0 0 1 0 5H9a2.5 2.5 0 0 1 0-5Zm1.5 2.5a1 1 0 1 1-2 0a1 1 0 0 1 2 0Zm5 0a1 1 0 1 1-2 0a1 1 0 0 1 2 0Z"
    />
  </svg>
);
