"""What a message says to Ariane, wherever it was written.

A conversation (`bots.handlers`) and the chat of a call
(`core.meeting_assistant`) read their messages the same way: whether she is
pinged, which command is used, and what the question is. The answers she gives
without asking Albert are shared too, except the help, which says what she
reads - and that depends on where she is asked.
"""

from __future__ import annotations

import re
from collections.abc import Callable

from django.conf import settings

from bots import albert

COMMAND_RE = re.compile(r"(?:^|\s)/(?P<command>[a-z]+)\b", re.IGNORECASE)
QUOTE_RE = re.compile(r"^\s*>.*$", re.MULTILINE)

FAILURE_MESSAGE = (
    "Je ne peux pas répondre pour le moment : mon moteur ne répond pas. "
    "Réessayez dans une minute."
)
UNKNOWN_COMMAND = (
    "Je ne connais pas cette commande. Écrivez « @{name:s} /aide » pour voir la liste."
)

HELP_COMMAND = "aide"
# `/help` is what people reach for first, English speakers and developers alike.
# Refusing it to be consistently French makes the assistant look broken at the
# exact moment someone is trying to find out how it works.
HELP_ALIASES = {"aide", "help", "?"}


def assistant_name() -> str:
    """The name people ping, as they see it."""
    return settings.BOTS_PING_NAMES[0].capitalize()


def strip_quotes(body: str) -> str:
    """Drop quoted lines before looking for the ping.

    Matrix replies carry the quoted original prefixed with `> `. Ariane's own
    name is in there whenever someone replies to her, so without this she pings
    herself forever.
    """
    return QUOTE_RE.sub("", body)


def ping_pattern() -> re.Pattern[str]:
    """Match an explicit `@name` addressed to the assistant.

    The `@` is required, and that is the whole point: without it any sentence
    that merely says her name out loud - "Ariane nous a repondu hier" - would
    summon her. `\b` after the name keeps `@ariane` from matching `@arianette`,
    and the leading boundary keeps it from matching an email address.
    """
    names = "|".join(re.escape(name) for name in settings.BOTS_PING_NAMES)
    return re.compile(rf"(?:^|[^\w@])@({names:s})\b", re.IGNORECASE)


def is_pinged(body: str) -> bool:
    """Does this message explicitly address Ariane with an `@`?"""
    return bool(ping_pattern().search(strip_quotes(body)))


def parse_command(body: str) -> tuple[str | None, bool]:
    """Return the persona asked for, and whether an unknown one was used."""
    found = COMMAND_RE.search(strip_quotes(body))
    if not found:
        return None, False
    command = found.group("command").lower()
    if command in HELP_ALIASES:
        return HELP_COMMAND, False
    if command in albert.PERSONAS and command is not None:
        return command, False
    return None, True


def clean_question(body: str) -> str:
    """The message without the command, which is addressing, not content."""
    text = strip_quotes(body)
    # The command goes - it is addressing, not content. The mention stays:
    # removing it produced a question that no longer pinged anyone, and the
    # model, reading its own past "write @Ariane to reach me" in the history,
    # refused to answer it.
    text = COMMAND_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def command_lines() -> list[str]:
    """One line per command, for the help.

    Built from the same catalogue the composer and the bot use, so a command
    cannot exist without appearing here.
    """
    return [
        f"— /{entry['command']:s} — {entry['label']:s} : {entry['description']:s}"
        for entry in albert.catalogue()
        if entry["command"] != HELP_COMMAND
    ]


def canned_reply(
    command: str | None, unknown: bool, help_message: Callable[[], str]
) -> str | None:
    """The answer Ariane gives without asking Albert anything, if there is one.

    A command that does not exist, and the help itself - a model asked to recite
    a catalogue invents an entry sooner or later. `help_message` is the help of
    the place she is asked in.
    """
    if unknown:
        return UNKNOWN_COMMAND.format(name=assistant_name())
    if command == HELP_COMMAND:
        return help_message()
    return None
