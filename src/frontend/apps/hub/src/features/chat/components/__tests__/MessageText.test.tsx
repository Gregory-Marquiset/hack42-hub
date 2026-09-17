// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { MessageText } from "../MessageText";

const links = () =>
  Array.from(document.querySelectorAll("a")).map((link) => ({
    href: link.getAttribute("href"),
    text: link.textContent,
    rel: link.getAttribute("rel"),
    target: link.getAttribute("target"),
  }));

describe("MessageText", () => {
  afterEach(cleanup);

  it("turns a web address into a link opened in a new tab", () => {
    render(
      <MessageText content="Rejoignez-la : https://meet.example.com/abc-def" />,
    );

    expect(links()).toEqual([
      {
        href: "https://meet.example.com/abc-def",
        text: "https://meet.example.com/abc-def",
        rel: "noopener noreferrer nofollow",
        target: "_blank",
      },
    ]);
  });

  it("keeps the text around the links, on every line", () => {
    const { container } = render(
      <MessageText
        content={"Avant http://a.test/1 après\nhttps://b.test/2 !"}
      />,
    );

    expect(container.textContent).toBe(
      "Avant http://a.test/1 après\nhttps://b.test/2 !",
    );
    expect(links().map((link) => link.href)).toEqual([
      "http://a.test/1",
      "https://b.test/2",
    ]);
  });

  it("leaves the punctuation that ends a sentence out of the link", () => {
    render(<MessageText content="Voir https://docs.test/doc-1/, et aussi." />);

    expect(links()[0].href).toBe("https://docs.test/doc-1/");
    expect(screen.getByText(/, et aussi\./)).toBeTruthy();
  });

  it("keeps a closing parenthesis the address opened", () => {
    render(<MessageText content="(voir https://a.test/x_(y) et la suite)" />);

    expect(links()[0].href).toBe("https://a.test/x_(y)");
  });

  it("links nothing in a message without an address", () => {
    render(<MessageText content="Bonjour à tous, pas de lien ici." />);

    expect(links()).toEqual([]);
  });

  it("leaves other schemes alone", () => {
    render(<MessageText content="javascript:alert(1) et mailto:a@b.test" />);

    expect(links()).toEqual([]);
  });
});
