"""Deciding whether Ariane speaks, and what she says.

The rule is one line and everything else serves it: **she answers only when
pinged**. A room full of people talking is not an invitation.

Addressing her means writing `@Ariane`, explicitly. Her name alone is not
enough: a room where people discuss what the assistant said would summon her on
every sentence.

Detection is on the message text, and that is not a shortcut. The Hub emits no
`m.mentions`: `grep -rn "m.mentions" src/frontend/apps/hub/src` returns nothing,
and `MatrixDriver.ts` sends through `sendTextMessage`, which produces only
`msgtype` and `body`. So the body is the only signal there is.
"""

from __future__ import annotations

import logging
import re

from django.conf import settings
from django.core.cache import cache

from bots import albert, matrix

logger = logging.getLogger(__name__)

COMMAND_RE = re.compile(r"(?:^|\s)/(?P<command>[a-z]+)\b", re.IGNORECASE)
QUOTE_RE = re.compile(r"^\s*>.*$", re.MULTILINE)

FAILURE_MESSAGE = (
    "Je ne peux pas répondre pour le moment : mon moteur ne répond pas. "
    "Réessayez dans une minute."
)
ENCRYPTED_MESSAGE = (
    "Ce salon est chiffré, je ne peux pas lire les messages. "
    "Pinguez-moi dans un salon non chiffré."
)
UNKNOWN_COMMAND = (
    "Je ne connais pas cette commande. Écrivez « @{name:s} /aide » pour voir la liste."
)

HELP_COMMAND = "aide"
# `/help` is what people reach for first, English speakers and developers alike.
# Refusing it to be consistently French makes the assistant look broken at the
# exact moment someone is trying to find out how it works.
HELP_ALIASES = {"aide", "help", "?"}


def help_message() -> str:
    """What each command does, and what Ariane reads.

    Built from the same catalogue the composer and the bot use, so a command
    cannot exist without appearing here. The paragraph about what she reads is
    not a legal footnote: she is in every room and answers from the backlog, and
    people are entitled to know that before they ask her anything.
    """
    name = settings.BOTS_PING_NAMES[0].capitalize()
    lines = [
        f"Je réponds uniquement quand on écrit @{name:s} dans un message.",
        "",
        "Je réponds toujours dans un fil, accroché à votre message : la "
        "conversation du salon n'est pas repoussée par mes réponses, et vous "
        "retrouvez la mienne sous la question que vous avez posée.",
        "",
        "Une commande change ma façon de répondre, pas ce qui me déclenche. "
        f"Elle se place après la mention : « @{name:s} /juriste ma question ».",
        "",
    ]
    for entry in albert.catalogue():
        if entry["command"] == HELP_COMMAND:
            continue
        lines.append(
            f"— /{entry['command']:s} — {entry['label']:s} : {entry['description']:s}"
        )
    lines += [
        "",
        "Sans commande, je réponds sur un ton normal.",
        "",
        "Où je travaille : dans chaque salon de groupe non chiffré — on m'y "
        "invite à la création, ou dès que quelqu'un m'y mentionne — et en "
        "conversation directe avec moi. Jamais dans un salon chiffré — je ne "
        "peux pas y lire les messages — ni dans une conversation privée entre "
        "deux personnes.",
        "",
        "Ce que je lis : les messages du salon postérieurs à mon arrivée et, "
        "quand vous me pinguez dans un fil, ce fil. Jamais ce qui a été dit "
        "avant qu'on m'invite, et jamais ce que vous-même n'avez pas le droit "
        "de lire. Je n'ouvre pas les fichiers joints.",
    ]
    return "\n".join(lines)


# How long a handled event id is remembered: far longer than Synapse keeps
# replaying a transaction whose 200 got lost.
SEEN_SECONDS = 24 * 60 * 60


def first_time(event_id: str) -> bool:
    """Record an event as handled, and say whether it was new.

    Synapse replays a transaction until it gets a 200, so the same ping can
    arrive twice. The record lives in the shared cache (Redis in production),
    not in the process: gunicorn runs several workers, and a replay may reach
    another one than the first delivery.
    """
    return cache.add(f"bots:seen:{event_id:s}", True, SEEN_SECONDS)


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
    """The message without the ping and the command, which are addressing, not content."""
    text = strip_quotes(body)
    # The command goes - it is addressing, not content. The mention stays:
    # removing it produced a question that no longer pinged anyone, and the
    # model, reading its own past "write @Ariane to reach me" in the history,
    # refused to answer it.
    text = COMMAND_RE.sub(" ", text)
    return re.sub(r"\s+", " ", text).strip()


def _role(sender: str) -> str:
    return "assistant" if sender == settings.MATRIX_BOT_USER_ID else "user"


def _as_messages(
    events: list[dict], skip_event_id: str | None = None
) -> list[dict[str, str]]:
    """Turn Matrix events into the role/content list Albert expects."""
    messages = []
    for event in events:
        if event.get("type") != "m.room.message":
            continue
        if skip_event_id and event.get("event_id") == skip_event_id:
            continue
        content = event.get("content") or {}
        if content.get(matrix.ASIDE_KEY):
            continue
        body = content.get("body")
        if not body:
            continue
        # Attribution, but as plain text. An XML-ish wrapper was tried first and
        # backfired twice: the model imitated the tags in its own answer, and it
        # copied back its own earlier messages verbatim. A "name: text" prefix
        # carries the same information without teaching a format.
        #
        # Only human turns are prefixed. Ariane's own turns stay bare, which is
        # what the chat API expects of an assistant turn.
        sender = event.get("sender", "inconnu")
        role = _role(sender)
        messages.append(
            {
                "role": role,
                "content": body if role == "assistant" else f"{sender:s} : {body:s}",
            }
        )
    return messages


# Visibility settings under which every member sees the whole backlog, so no
# trimming is needed. Anything else means a newcomer has a horizon.
OPEN_HISTORY = {"shared", "world_readable"}


def visible_to(events: list[dict], horizon: int | None) -> list[dict]:
    """Drop what the person asking is not allowed to read.

    This is the load-bearing check of the whole feature. Ariane reads the room
    with the Application Service token, which sees everything; the person who
    pinged her may have joined yesterday. Handing her summary straight back
    would turn the assistant into a way to read history the server deliberately
    withheld - a leak, and a quiet one, because nothing in the room shows it.

    `horizon` is a timestamp, not a position, so the same cut applies to the
    room timeline and to a thread whose root predates the asker's arrival.

    A horizon of None means the membership could not be established. That drops
    everything: a summary built on nothing is a poor answer, a summary built on
    a failed permission check is an incident.
    """
    if horizon is None:
        return []
    return [
        event for event in events if (event.get("origin_server_ts") or 0) >= horizon
    ]


def history_horizon(room_id: str, asker: str) -> int | None:
    """The oldest timestamp Ariane may use to answer `asker` in this room.

    Two limits, and the later one wins.

    The asker's own: she must never read back history the homeserver withheld
    from them. Under `invited` the server would allow reading from their
    invitation, while this uses their current membership event - stricter than
    the specification, which is the correct direction to be wrong in.

    Her own: an invitation is not retroactive. A room with
    `history_visibility: shared` would hand her everything said before she
    arrived, and summarising that back would turn "we invited the assistant"
    into "the assistant read the archive".
    """
    mine = matrix.joined_at(room_id)
    if mine is None:
        return None

    visibility = matrix.history_visibility(room_id)
    theirs = (
        0 if visibility in OPEN_HISTORY else matrix.membership_since(room_id, asker)
    )
    if theirs is None:
        return None
    return max(mine, theirs)


def thread_root_of(event: dict) -> str | None:
    """The thread this message belongs to, or None when it is in the room.

    Used for reading, not for answering: it decides whether the thread's own
    messages join the context. Where the answer goes is `aside_root`.
    """
    relation = (event.get("content") or {}).get("m.relates_to") or {}
    if relation.get("rel_type") != "m.thread":
        return None
    return relation.get("event_id")


def aside_root(event: dict) -> str:
    """Where Ariane replies: the thread hanging off the message that asked.

    Everything she says goes there - answers, help, refusals, failures. A
    question put to her is between her and the person asking; letting it run
    down the main timeline pushes the room's own conversation off the screen,
    and a room where several people ask her things becomes unreadable. The
    asker gets the reply marker on their own message, and anyone curious can
    open it.

    When the question already came from a thread, that thread is the answer's
    home too - she never opens a second one.
    """
    return thread_root_of(event) or event["event_id"]


def _dedupe(events: list[dict]) -> list[dict]:
    """Keep the first occurrence of each event, preserving order."""
    seen: set[str] = set()
    unique = []
    for event in events:
        event_id = event.get("event_id")
        if not event_id or event_id in seen:
            continue
        seen.add(event_id)
        unique.append(event)
    return unique


def _thread_root(room_id: str, root_id: str) -> list[dict]:
    """The thread's opening message, or nothing when it cannot be read.

    Now that a mention is how she enters a room, being pinged in a thread whose
    root predates her join is ordinary. A room that hides its history from
    newcomers answers that fetch with M_FORBIDDEN or M_NOT_FOUND, and losing the
    root is no reason to lose the answer: the replies are context enough.
    """
    try:
        return [matrix.get_event(room_id, root_id)]
    except matrix.MatrixError as exc:
        logger.info("thread root %s unreadable in %s: %s", root_id, room_id, exc)
        return []


def build_context(room_id: str, event: dict) -> tuple[list[dict[str, str]], str | None]:
    """Everything Ariane should have read before answering, and where to answer.

    A thread is never the whole story. It usually opens several messages into a
    conversation, so a thread-only context makes Ariane answer as if the room
    had begun at the root - which is exactly how a colleague who has not read
    the backlog sounds. The room's recent timeline therefore comes first, then
    the thread.

    Outside a thread, the tail of the room is the context and the answer goes to
    the room itself - see `thread_root_of`.
    """
    event_id = event["event_id"]
    root_id = thread_root_of(event)

    # Everything below is cut at the asker's own horizon, so the assistant can
    # never read history back to someone the server kept it from.
    horizon = history_horizon(room_id, event.get("sender", ""))
    room_history = visible_to(
        matrix.recent_messages(room_id, limit=settings.BOTS_ROOM_HISTORY), horizon
    )

    if root_id:
        # A thread inherits the room's rule: its root can predate the asker's
        # arrival just as easily as any other message.
        thread = visible_to(
            [*_thread_root(room_id, root_id), *matrix.thread_replies(room_id, root_id)],
            horizon,
        )
        # The room tail already holds the root and may hold thread replies.
        # `_dedupe` keeps the first copy, so the room's chronology wins and
        # nothing is said twice.
        return (
            _as_messages(_dedupe([*room_history, *thread]), skip_event_id=event_id),
            root_id,
        )

    # No thread: answer in the room, where the question was asked.
    return _as_messages(_dedupe(room_history), skip_event_id=event_id), None


def is_invitation_for_me(event: dict) -> bool:
    """Is this the membership event that invites Ariane into a room?"""
    return (
        event.get("type") == "m.room.member"
        and event.get("state_key") == settings.MATRIX_BOT_USER_ID
        and (event.get("content") or {}).get("membership") == "invite"
    )


def accept_invitation(room_id: str) -> None:
    """Join a room Ariane was just invited to.

    Her horizon starts at her join, so joining late would silently discard the
    messages in between. An encrypted room is joined too: she will not read it,
    but the member list should show she is there and say so rather than leave
    a pending invitation nobody understands.
    """
    try:
        if matrix.ensure_in_room(room_id):
            logger.info("Ariane accepted an invitation to %s", room_id)
    except matrix.MatrixError as exc:
        logger.warning("could not accept the invitation to %s: %s", room_id, exc)


def access_refusal(room_id: str) -> str | None:
    """Why Ariane cannot answer in this room, if she cannot.

    Not being invited comes first, and there is no message for it: she cannot
    post in a room she is not in, so any refusal would fail to send. Silence is
    the only possible outcome, and the composer is where this is prevented - it
    only ever suggests people who are in the room.

    Encryption is checked once she is in: the room state is only readable by
    its members, so asking before joining could not tell an encrypted room
    from a room she may not read yet. An encrypted room is joined anyway when
    she is invited (see `accept_invitation`), so this costs no membership.
    """
    if not matrix.ensure_in_room(room_id):
        logger.info(
            "Ariane was addressed in %s without being invited; staying out", room_id
        )
        return SILENT
    if matrix.is_encrypted(room_id):
        return ENCRYPTED_MESSAGE
    return None


# Distinguishes "refuse with this message" from "say nothing at all". Returning
# an empty string would be indistinguishable from no refusal.
SILENT = "\0"


def canned_reply(command: str | None, unknown: bool) -> str | None:
    """The answer Ariane gives without asking Albert anything, if there is one.

    A command that does not exist, and the help itself - a model asked to recite
    a catalogue invents an entry sooner or later. The unreadable-room case is
    handled earlier, before she even enters.
    """
    if unknown:
        return UNKNOWN_COMMAND.format(name=settings.BOTS_PING_NAMES[0].capitalize())
    if command == HELP_COMMAND:
        return help_message()
    return None


def handle_message(room_id: str, event: dict) -> None:
    """React to one message. Called off the request thread - never blocks Synapse."""
    sender = event.get("sender", "")
    body = (event.get("content") or {}).get("body") or ""

    if sender == settings.MATRIX_BOT_USER_ID:
        return
    if not is_pinged(body):
        return
    if not first_time(event["event_id"]):
        logger.debug("event %s already handled", event["event_id"])
        return

    logger.info("Ariane pinged in %s by %s", room_id, sender)

    try:
        refusal = access_refusal(room_id)
        if refusal is not None:
            if refusal is not SILENT:
                matrix.send_message(
                    room_id, refusal, thread_root=aside_root(event), aside=True
                )
            return
    except matrix.MatrixError as exc:
        logger.warning("could not enter %s: %s", room_id, exc)
        return

    command, unknown = parse_command(body)
    # One destination, always: the thread hanging off the message that asked.
    answer_root = aside_root(event)

    try:
        canned = canned_reply(command, unknown)
        if canned:
            matrix.send_message(
                room_id, canned, thread_root=aside_root(event), aside=True
            )
            return

        messages, _ = build_context(room_id, event)
        question = clean_question(body)
        if question:
            messages.append({"role": "user", "content": question})

        matrix.set_typing(room_id, True)
        try:
            reply = albert.answer(messages, command)
        finally:
            matrix.set_typing(room_id, False)

        matrix.send_message(room_id, reply, thread_root=answer_root)

    except albert.AlbertError as exc:
        # Silence after a ping reads as a broken product. Say something.
        logger.warning("Albert failed: %s", exc)
        matrix.send_message(
            room_id, FAILURE_MESSAGE, thread_root=aside_root(event), aside=True
        )
    except matrix.MatrixError as exc:
        logger.warning("Matrix failed while answering: %s", exc)
