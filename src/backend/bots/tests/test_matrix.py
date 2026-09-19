"""The Matrix calls: what each asks the homeserver, and how it fails."""

from django.test import override_settings

import pytest
import responses

from bots import matrix

HOMESERVER = "http://synapse.test"
ROOM = "!room:localhost"
SETTINGS = {
    "MATRIX_HOMESERVER_URL": f"{HOMESERVER}/",
    "MATRIX_AS_TOKEN": "as-token",
    "MATRIX_ADMIN_TOKEN": "admin-token",
    "MATRIX_BOT_USER_ID": "@ariane:localhost",
}
ADMIN_MEMBERS_URL = f"{HOMESERVER}/_synapse/admin/v1/rooms/%21room%3Alocalhost/members"


@override_settings(**{**SETTINGS, "MATRIX_ADMIN_TOKEN": None})
def test_admin_without_token_is_a_matrix_error():
    """No admin token is a failure callers handle, not a TypeError."""
    assert not matrix.can_read_members()
    with pytest.raises(matrix.MatrixError):
        matrix.joined_members(ROOM)
    with pytest.raises(matrix.MatrixError):
        matrix.room_name(ROOM)


@override_settings(**SETTINGS)
@responses.activate
def test_admin_joined_members():
    """The members, read with the admin token from a trimmed base URL."""
    responses.get(
        ADMIN_MEMBERS_URL,
        json={"members": ["@bob:localhost"]},
        match=[
            responses.matchers.header_matcher({"Authorization": "Bearer admin-token"})
        ],
    )

    assert matrix.joined_members(ROOM) == {"@bob:localhost"}


@override_settings(**SETTINGS)
@responses.activate
def test_admin_unreadable_answer_is_a_matrix_error():
    """A proxy page instead of JSON is a Matrix failure too."""
    responses.get(ADMIN_MEMBERS_URL, body="<html>Bad gateway</html>")

    with pytest.raises(matrix.MatrixError):
        matrix.joined_members(ROOM)


def member_event(event_id, timestamp, membership="join", previous=None, **content):
    """A membership event of Bob's, replacing `previous` when there is one."""
    event = {
        "type": "m.room.member",
        "state_key": "@bob:localhost",
        "event_id": event_id,
        "origin_server_ts": timestamp,
        "content": {"membership": membership, **content},
    }
    if previous:
        event["unsigned"] = {
            "replaces_state": previous["event_id"],
            "prev_content": previous["content"],
        }
    return event


INVITE = member_event("$invite", 1_000, "invite")
JOIN = member_event("$join", 2_000, previous=INVITE)
RENAMED = member_event("$renamed", 5_000, previous=JOIN, displayname="Bobby")
AVATAR = member_event("$avatar", 8_000, previous=RENAMED, avatar_url="mxc://a")


def _state(monkeypatch, state, readable):
    """A room whose state is `state`, and whose `readable` events can be fetched."""
    events = {event["event_id"]: event for event in readable}

    def get_event(_room_id, event_id):
        if event_id not in events:
            raise matrix.MatrixError("not found", errcode="M_NOT_FOUND")
        return events[event_id]

    monkeypatch.setattr(matrix, "_as", lambda method, path, **kwargs: state)
    monkeypatch.setattr(matrix, "get_event", get_event)


def test_membership_since_follows_profile_changes_back_to_the_join(monkeypatch):
    """A new name or avatar does not move the horizon: the join does."""
    _state(monkeypatch, [AVATAR], [RENAMED, JOIN, INVITE])

    assert matrix.membership_since(ROOM, "@bob:localhost") == 2_000


def test_membership_since_without_profile_change(monkeypatch):
    """The join itself is the current membership event."""
    _state(monkeypatch, [JOIN], [])

    assert matrix.membership_since(ROOM, "@bob:localhost") == 2_000


@pytest.mark.parametrize(
    ("errcode", "encrypted"), [(None, True), ("M_NOT_FOUND", False)]
)
def test_is_encrypted(monkeypatch, errcode, encrypted):
    """The encryption state event, when there is one, makes the room encrypted."""

    def state(_method, _path, **_kwargs):
        if errcode:
            raise matrix.MatrixError("no", errcode=errcode)
        return {"algorithm": "m.megolm.v1.aes-sha2"}

    monkeypatch.setattr(matrix, "_as", state)

    assert matrix.is_encrypted(ROOM) is encrypted


def test_is_encrypted_forbidden_is_not_an_answer(monkeypatch):
    """A room she may not read yet is not "not encrypted"."""

    def forbidden(_method, _path, **_kwargs):
        raise matrix.MatrixError("not in room", errcode="M_FORBIDDEN")

    monkeypatch.setattr(matrix, "_as", forbidden)

    with pytest.raises(matrix.MatrixError):
        matrix.is_encrypted(ROOM)


@override_settings(BOTS_MAX_THREAD_EVENTS=150)
def test_thread_replies_keeps_the_latest_when_capped(monkeypatch):
    """A long thread loses its oldest replies, never the latest ones."""
    replies = [{"event_id": f"${n}"} for n in range(250)]
    newest_first = list(reversed(replies))
    calls = []

    def relations(_method, _path, *, params, **_kwargs):
        calls.append(dict(params))
        start = int(params.get("from", 0))
        end = start + params["limit"]
        return {
            "chunk": newest_first[start:end],
            **({"next_batch": str(end)} if end < len(replies) else {}),
        }

    monkeypatch.setattr(matrix, "_as", relations)

    events = matrix.thread_replies(ROOM, "$root")

    assert events == replies[100:]
    assert [call["dir"] for call in calls] == ["b", "b"]


def test_membership_since_unreadable_history_is_stricter(monkeypatch):
    """When the join cannot be reached, the latest known event is the horizon."""
    _state(monkeypatch, [AVATAR], [RENAMED])

    assert matrix.membership_since(ROOM, "@bob:localhost") == 5_000
