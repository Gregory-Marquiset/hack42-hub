"""How Ariane reacts to a ping: whether she enters, and what she says."""

from django.core.cache import cache

import pytest

from bots import commands, handlers, matrix


def test_not_invited_stays_silent_without_asking_about_encryption(monkeypatch):
    """Outside the room she can neither read its state nor speak."""
    asked = []
    monkeypatch.setattr(matrix, "ensure_in_room", lambda room_id: False)
    monkeypatch.setattr(matrix, "is_encrypted", asked.append)

    assert handlers.access_refusal("!room:localhost") is handlers.SILENT
    assert not asked


@pytest.mark.parametrize(
    ("encrypted", "refusal"), [(True, handlers.ENCRYPTED_MESSAGE), (False, None)]
)
def test_encryption_is_checked_once_in_the_room(monkeypatch, encrypted, refusal):
    """An encrypted room is said so; an ordinary one is answered."""
    joined = []

    def ensure_in_room(room_id):
        joined.append(room_id)
        return True

    def is_encrypted(room_id):
        assert joined == [room_id]
        return encrypted

    monkeypatch.setattr(matrix, "ensure_in_room", ensure_in_room)
    monkeypatch.setattr(matrix, "is_encrypted", is_encrypted)

    assert handlers.access_refusal("!room:localhost") == refusal


def ping(event_id):
    """Bob addressing Ariane in the room."""
    return {
        "type": "m.room.message",
        "event_id": event_id,
        "sender": "@bob:localhost",
        "content": {"msgtype": "m.text", "body": "@ariane résume"},
    }


@pytest.fixture(name="room")
def fixture_room(monkeypatch):
    """A room Ariane is in, where what she posts is kept."""
    sent = []

    def send_message(room_id, body, *, thread_root=None, aside=False):
        sent.append((room_id, body, thread_root, aside))
        return "$sent"

    monkeypatch.setattr(handlers, "access_refusal", lambda room_id: None)
    monkeypatch.setattr(matrix, "send_message", send_message)
    monkeypatch.setattr(matrix, "set_typing", lambda *args: None)
    return sent


@pytest.mark.parametrize(
    "failure", [matrix.MatrixError("homeserver down"), RuntimeError("bug")]
)
def test_a_failure_after_a_ping_is_said(monkeypatch, room, failure):
    """Whatever breaks while answering, the ping never meets silence."""
    event_id = f"$failing-{type(failure).__name__}"
    cache.delete(f"bots:seen:{event_id}")

    def build_context(_room_id, _event):
        raise failure

    monkeypatch.setattr(handlers, "build_context", build_context)

    handlers.handle_message("!room:localhost", ping(event_id))

    assert room == [("!room:localhost", commands.FAILURE_MESSAGE, event_id, True)]


def test_a_failure_to_say_the_failure_is_only_logged(monkeypatch, room):
    """When Matrix is what failed, saying so fails too: nothing more happens."""
    cache.delete("bots:seen:$unsayable")

    def refuse(*_args, **_kwargs):
        raise matrix.MatrixError("homeserver down")

    monkeypatch.setattr(handlers, "build_context", refuse)
    monkeypatch.setattr(matrix, "send_message", refuse)

    handlers.handle_message("!room:localhost", ping("$unsayable"))

    assert room == []


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
