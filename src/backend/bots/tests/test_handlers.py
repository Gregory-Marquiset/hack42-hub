"""How Ariane reacts to a ping: whether she enters, and what she says."""

import pytest

from bots import handlers, matrix


def test_not_invited_stays_silent_without_asking_about_encryption(monkeypatch):
    """Outside the room she can neither read its state nor speak."""
    asked = []
    monkeypatch.setattr(matrix, "ensure_in_room", lambda room_id: False)
    monkeypatch.setattr(matrix, "is_encrypted", asked.append)

    assert handlers.access_refusal("!room:localhost") is handlers.SILENT
    assert asked == []


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
