import { Fragment } from "react";

/**
 * A web address in a message, up to the first space. Trailing punctuation is
 * trimmed afterwards: a link at the end of a sentence must not swallow its
 * full stop, and one inside parentheses must not swallow the closing one.
 */
const LINK = /(https?:\/\/[^\s<>"']+)/g;
const TRAILING = /[.,;:!?)\]}»"']+$/;

/** Splits a link from the punctuation that only looks part of it. */
const splitLink = (match: string): [string, string] => {
  const trailing = TRAILING.exec(match)?.[0] ?? "";
  if (!trailing) {
    return [match, ""];
  }
  // A closing parenthesis is part of the link when the link opened one.
  const link = match.slice(0, match.length - trailing.length);
  const opens = (link.match(/\(/g) ?? []).length;
  const closes = (link.match(/\)/g) ?? []).length;
  if (opens > closes && trailing.startsWith(")")) {
    return [`${link})`, trailing.slice(1)];
  }
  return [link, trailing];
};

/**
 * The text of a message, with its web addresses turned into links: an
 * invitation to a call or a transcript document is opened in one click.
 * Everything else stays plain text — the Hub never renders message HTML.
 */
export const MessageText = ({ content }: { content: string }) => (
  <>
    {content.split(LINK).map((part, index) => {
      if (index % 2 === 0 || !part) {
        return <Fragment key={index}>{part}</Fragment>;
      }
      const [href, trailing] = splitLink(part);
      return (
        <Fragment key={index}>
          <a
            className="hub__chat-bubble__link"
            href={href}
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            {href}
          </a>
          {trailing}
        </Fragment>
      );
    })}
  </>
);
