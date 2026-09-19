"""The history boundary: what Ariane may use, per asker.

This is the load-bearing check of the whole assistant. She reads with the
Application Service token, which sees every room on the server; the person who
pinged her may have joined yesterday. Without this cut, asking her for a summary
would read back history the homeserver deliberately withheld - a leak, and a
silent one, because nothing in the room shows it happened.

So it gets tests of its own, and they are deliberately written from the outside:
given a list of events and a horizon, what comes out.
"""

from django.core.cache import cache
from django.test import override_settings

import pytest

from bots import handlers, matrix

pytestmark = pytest.mark.django_db


def message(event_id: str, timestamp: int, body: str = "x") -> dict:
    """A minimal room message, dated."""
    return {
        "type": "m.room.message",
        "event_id": event_id,
        "origin_server_ts": timestamp,
        "sender": "@someone:localhost",
        "content": {"msgtype": "m.text", "body": body},
    }


BEFORE = message("$old", 1_000, "secret dit avant l'arrivee")
AFTER = message("$new", 3_000, "dit apres l'arrivee")


def test_no_horizon_drops_everything():
    """An unestablished membership must not fall back to "show everything".

    A summary built on nothing is a poor answer. A summary built on a failed
    permission check is an incident, so the failure mode is closed.
    """
    assert handlers.visible_to([BEFORE, AFTER], None) == []


def test_open_history_keeps_everything():
    """`shared` and `world_readable` let every member read the backlog."""
    assert handlers.visible_to([BEFORE, AFTER], 0) == [BEFORE, AFTER]


def test_horizon_cuts_what_predates_the_asker():
    """The message posted before they arrived is gone; the later one stays."""
    assert handlers.visible_to([BEFORE, AFTER], 2_000) == [AFTER]


def test_horizon_keeps_an_event_posted_exactly_at_the_boundary():
    """The join instant itself is readable - the cut is inclusive."""
    boundary = message("$at", 2_000)
    assert handlers.visible_to([boundary], 2_000) == [boundary]


def test_event_without_timestamp_is_dropped():
    """An undated event cannot be proven readable, so it is not used."""
    assert handlers.visible_to([{"type": "m.room.message", "event_id": "$?"}], 1) == []


@override_settings(BOTS_PING_NAMES=["ariane"])
def test_thread_root_older_than_the_asker_is_cut_too():
    """A thread is not a loophole.

    The first version of this check searched for `m.room.member` events inside
    the list, which a thread fetched from `/relations` never contains - so it
    cut nothing there. The horizon is a timestamp for exactly that reason.
    """
    root = message("$root", 500, "racine anterieure a l'arrivee")
    reply = message("$reply", 4_000, "reponse posterieure")
    assert handlers.visible_to([root, reply], 2_000) == [reply]


def test_horizon_is_the_later_of_the_two_memberships(monkeypatch):
    """Ariane's own arrival caps the context, even in an open-history room.

    An invitation is not retroactive. A `shared` room would hand her everything
    said before she joined, and summarising that back turns "we invited the
    assistant" into "the assistant read the archive".
    """
    monkeypatch.setattr(matrix, "history_visibility", lambda _room: "shared")
    monkeypatch.setattr(matrix, "joined_at", lambda _room: 5_000)

    assert handlers.history_horizon("!r:localhost", "@asker:localhost") == 5_000


def test_horizon_takes_the_asker_when_they_arrived_last(monkeypatch):
    """The stricter of the two limits always wins."""
    monkeypatch.setattr(matrix, "history_visibility", lambda _room: "joined")
    monkeypatch.setattr(matrix, "joined_at", lambda _room: 1_000)
    monkeypatch.setattr(matrix, "membership_since", lambda _room, _user: 9_000)

    assert handlers.history_horizon("!r:localhost", "@asker:localhost") == 9_000


def test_no_horizon_when_ariane_is_not_a_member(monkeypatch):
    """Unknown membership drops everything rather than allowing everything."""
    monkeypatch.setattr(matrix, "joined_at", lambda _room: None)

    assert handlers.history_horizon("!r:localhost", "@asker:localhost") is None


def threaded(event_id: str, timestamp: int, root_id: str) -> dict:
    """A message posted inside a thread."""
    event = message(event_id, timestamp)
    event["content"]["m.relates_to"] = {"rel_type": "m.thread", "event_id": root_id}
    return event


def test_an_unreadable_thread_root_costs_the_root_not_the_answer(monkeypatch):
    """Being pinged in a thread older than her arrival must still get an answer.

    A mention is how she enters a room, so a thread that opened before she was
    invited is the ordinary case. A room that hides its history from newcomers
    refuses the root fetch, and that must degrade to "no root" rather than
    abort the reply.
    """
    root_id = "$root"
    reply = threaded("$reply", 3_000, root_id)
    ping = threaded("$ping", 4_000, root_id)

    def refuse(_room_id: str, _event_id: str) -> dict:
        raise matrix.MatrixError("M_FORBIDDEN")

    monkeypatch.setattr(matrix, "get_event", refuse)
    monkeypatch.setattr(matrix, "recent_messages", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(matrix, "thread_replies", lambda *_args: [reply])
    monkeypatch.setattr(handlers, "history_horizon", lambda *_args: 0)

    messages, answer_root = handlers.build_context("!room:localhost", ping)

    assert answer_root == root_id
    assert [entry["role"] for entry in messages] == ["user"]


def test_a_readable_thread_root_is_part_of_the_context(monkeypatch):
    """The ordinary case still reads the message the thread opened on."""
    root_id = "$root"
    root = message(root_id, 2_000, "la question de depart")
    ping = threaded("$ping", 4_000, root_id)

    monkeypatch.setattr(matrix, "get_event", lambda *_args: root)
    monkeypatch.setattr(matrix, "recent_messages", lambda *_args, **_kwargs: [])
    monkeypatch.setattr(matrix, "thread_replies", lambda *_args: [])
    monkeypatch.setattr(handlers, "history_horizon", lambda *_args: 0)

    messages, _ = handlers.build_context("!room:localhost", ping)

    assert "la question de depart" in messages[0]["content"]


def test_a_replayed_event_is_handled_once():
    """Synapse replaying a transaction must not get a second answer.

    The record is in the shared cache, so it holds across the workers.
    """
    cache.delete("bots:seen:$replayed")

    assert handlers.first_time("$replayed") is True
    assert handlers.first_time("$replayed") is False
    cache.delete("bots:seen:$replayed")


def test_she_always_answers_in_a_thread():
    """A question put to her is between her and the person asking.

    Letting answers run down the main timeline pushes the room's own
    conversation off the screen, and a room where several people ask her
    things becomes unreadable.
    """
    from_room = {
        "event_id": "$asked",
        "content": {"msgtype": "m.text", "body": "@Ariane bonjour"},
    }

    assert handlers.aside_root(from_room) == "$asked"


def test_a_question_from_a_thread_stays_in_that_thread():
    """She never opens a second thread on top of the one being used."""
    from_thread = {
        "event_id": "$asked",
        "content": {
            "msgtype": "m.text",
            "body": "@Ariane et ensuite ?",
            "m.relates_to": {"rel_type": "m.thread", "event_id": "$root"},
        },
    }

    assert handlers.aside_root(from_thread) == "$root"
