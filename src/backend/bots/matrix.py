"""How Ariane touches Matrix.

One token: the Application Service token. It lets her act as any account in her
namespace through `?user_id=`, and that is all the authority she has. It cannot
get her into a room nobody invited her to - the client API answers
`M_FORBIDDEN` there, by design, and that refusal is now the feature rather than
an obstacle to route around.

Never hand the token to the frontend.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any
from urllib.parse import quote

from django.conf import settings

import requests

logger = logging.getLogger(__name__)

# `_call` mirrors an HTTP call: method, path, token and the three optional
# request parts. Splitting it would only move the arguments elsewhere.
# pylint: disable=too-many-arguments

CLIENT_API = "/_matrix/client/v3"
CLIENT_API_V1 = "/_matrix/client/v1"


class MatrixError(Exception):
    """A Matrix call failed. Carries `errcode` so callers can branch on it."""

    def __init__(
        self,
        message: str,
        *,
        status_code: int | None = None,
        errcode: str | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.errcode = errcode


def _as(
    method: str,
    path: str,
    *,
    json: dict[str, Any] | None = None,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Call the Matrix client-server API as Ariane.

    One entry point, so the masquerading is applied in exactly one place and
    there is a single spot to audit who this service can act as.
    """
    query = dict(params or {})
    query["user_id"] = settings.MATRIX_BOT_USER_ID

    url = f"{settings.MATRIX_HOMESERVER_URL.rstrip('/'):s}{path:s}"
    try:
        response = requests.request(
            method,
            url,
            headers={"Authorization": f"Bearer {settings.MATRIX_AS_TOKEN:s}"},
            json=json,
            params=query,
            timeout=settings.MATRIX_REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise MatrixError(f"Matrix {method:s} {path:s} failed: {exc!s}") from exc

    try:
        payload = response.json()
    except ValueError:
        payload = {}

    if response.status_code >= 400:
        raise MatrixError(
            payload.get("error") or f"Matrix returned {response.status_code:d}",
            status_code=response.status_code,
            errcode=payload.get("errcode"),
        )
    return payload


def is_member(room_id: str) -> bool:
    """Is Ariane already in this room?"""
    try:
        joined = _as("GET", f"{CLIENT_API:s}/joined_rooms")
    except MatrixError:
        return False
    return room_id in joined.get("joined_rooms", [])


def ensure_in_room(room_id: str) -> bool:
    """Accept an invitation to this room, and say whether Ariane is now in it.

    She is never let in by force. The previous version fell back to the Synapse
    admin API when the ordinary join was refused, which meant one member could
    put an assistant into a room without asking anyone - including the people
    already talking in it. An invitation is the whole consent mechanism Matrix
    offers, and using it is the difference between a colleague and a wiretap.

    Returns False when she has not been invited. The caller answers that in the
    room, so a ping never produces silence.
    """
    if is_member(room_id):
        return True

    try:
        _as("POST", f"{CLIENT_API:s}/join/{quote(room_id, safe=''):s}", json={})
        return True
    except MatrixError as exc:
        if exc.errcode != "M_FORBIDDEN":
            raise
        logger.info("Ariane is not invited to %s", room_id)
        return False


def joined_at(room_id: str) -> int | None:
    """When Ariane's own membership of this room began, in milliseconds.

    Her horizon, and it is hers alone. A room with `history_visibility: shared`
    would happily hand her everything said before she arrived; reading it back
    would make an invitation retroactive, which is not what inviting someone
    into a conversation means.
    """
    return membership_since(room_id, settings.MATRIX_BOT_USER_ID)


def history_visibility(room_id: str) -> str:
    """How far back a member of this room may read.

    Matrix defines four values, and only two of them let a newcomer read what
    was said before they arrived:

      `world_readable`  anyone, member or not;
      `shared`          any member, including history predating their join;
      `invited`         from their invitation onwards;
      `joined`          from their join onwards.

    Synapse defaults to `shared` when the state event is absent, so that is the
    fallback - but the fallback is only used when the room genuinely has no such
    event, never to paper over a failed lookup.
    """
    try:
        state = _as(
            "GET",
            f"{CLIENT_API:s}/rooms/{quote(room_id, safe=''):s}/state/m.room.history_visibility",
        )
    except MatrixError as exc:
        if exc.errcode == "M_NOT_FOUND":
            return "shared"
        raise
    return state.get("history_visibility", "shared")


def membership_since(room_id: str, user_id: str) -> int | None:
    """When this person's current membership began, in milliseconds.

    Read from the room's state rather than from the timeline: the state event is
    authoritative and always present, whereas a join that happened before the
    window we fetched would simply be missing from `/messages`, and a missing
    horizon reads as "no restriction" - the wrong way to fail.

    Returns None when the membership event cannot be found, which callers must
    treat as "cut everything", not as "allow everything".
    """
    try:
        events = _as("GET", f"{CLIENT_API:s}/rooms/{quote(room_id, safe=''):s}/state")
    except MatrixError as exc:
        logger.warning("could not read the state of %s: %s", room_id, exc)
        return None

    for event in events:
        if event.get("type") == "m.room.member" and event.get("state_key") == user_id:
            return event.get("origin_server_ts")
    return None


def is_encrypted(room_id: str) -> bool:
    """A room Ariane cannot read. Better to say so than to post into the void."""
    try:
        _as(
            "GET",
            f"{CLIENT_API:s}/rooms/{quote(room_id, safe=''):s}/state/m.room.encryption",
        )
    except MatrixError as exc:
        if exc.errcode in ("M_NOT_FOUND", "M_FORBIDDEN"):
            return False
        raise
    return True


def set_typing(room_id: str, typing: bool, timeout: int = 30000) -> None:
    """Typing is the only feedback during the seconds Albert takes to answer."""
    body: dict[str, Any] = {"typing": typing}
    if typing:
        body["timeout"] = timeout
    try:
        _as(
            "PUT",
            f"{CLIENT_API:s}/rooms/{quote(room_id, safe=''):s}"
            f"/typing/{quote(settings.MATRIX_BOT_USER_ID, safe=''):s}",
            json=body,
        )
    except MatrixError as exc:
        logger.debug("typing indicator refused: %s", exc)


def get_event(room_id: str, event_id: str) -> dict[str, Any]:
    """Fetch one event. Needed because `/relations` never returns the root."""
    return _as(
        "GET",
        f"{CLIENT_API:s}/rooms/{quote(room_id, safe=''):s}/event/{quote(event_id, safe=''):s}",
    )


def thread_replies(room_id: str, root_id: str) -> list[dict[str, Any]]:
    """Every reply in a thread, oldest first.

    `limit` is not optional. Synapse silently defaults to 5 events and returns
    them newest-first, so an omitted limit quietly truncates the context to the
    tail of the conversation.
    """
    events: list[dict[str, Any]] = []
    token: str | None = None

    while True:
        params: dict[str, Any] = {"dir": "f", "limit": 100}
        if token:
            params["from"] = token
        page = _as(
            "GET",
            f"{CLIENT_API_V1:s}/rooms/{quote(room_id, safe=''):s}"
            f"/relations/{quote(root_id, safe=''):s}/m.thread",
            params=params,
        )
        events.extend(page.get("chunk", []))
        token = page.get("next_batch")
        if not token or len(events) >= settings.BOTS_MAX_THREAD_EVENTS:
            break

    return events


def recent_messages(room_id: str, limit: int = 20) -> list[dict[str, Any]]:
    """The tail of the main timeline, oldest first.

    Used when the ping is not inside a thread: without it Ariane would answer a
    one-line question with no idea what the room was talking about.
    """
    page = _as(
        "GET",
        f"{CLIENT_API:s}/rooms/{quote(room_id, safe=''):s}/messages",
        params={"dir": "b", "limit": limit},
    )
    return list(reversed(page.get("chunk", [])))


# Marks a message as plumbing rather than conversation: help, refusals,
# failures. Read back as context they are poison - three refusals in a row and
# the model concludes that refusing is what it does here.
ASIDE_KEY = "fr.hack42.bot.aside"


def send_message(
    room_id: str, body: str, *, thread_root: str | None = None, aside: bool = False
) -> str:
    """Post as Ariane, in a thread when there is one."""
    content: dict[str, Any] = {"msgtype": "m.text", "body": body}
    if aside:
        content[ASIDE_KEY] = True
    if thread_root:
        content["m.relates_to"] = {
            "rel_type": "m.thread",
            "event_id": thread_root,
            # Clients that know nothing about threads still render the reply.
            "is_falling_back": True,
            "m.in_reply_to": {"event_id": thread_root},
        }

    sent = _as(
        "PUT",
        f"{CLIENT_API:s}/rooms/{quote(room_id, safe=''):s}"
        f"/send/m.room.message/{uuid.uuid4().hex:s}",
        json=content,
    )
    return sent["event_id"]


# --- Hub meetings -----------------------------------------------------------
# The meeting of a conversation is room state. Ariane writes it when the
# server closes a meeting on its own; the archive asks the homeserver who is
# in the room and who is asking.


def can_write_rooms() -> bool:
    """Whether Ariane has what she needs to write in a room she was invited to."""
    return bool(settings.MATRIX_AS_TOKEN and settings.MATRIX_BOT_USER_ID)


def _admin(method: str, path: str) -> dict[str, Any]:
    """Call the Synapse admin API. Read-only by convention - see `joined_members`."""
    response = requests.request(
        method,
        f"{settings.MATRIX_HOMESERVER_URL:s}{path:s}",
        headers={"Authorization": f"Bearer {settings.MATRIX_ADMIN_TOKEN:s}"},
        timeout=settings.MATRIX_REQUEST_TIMEOUT,
    )
    if response.status_code >= 400:
        raise MatrixError(f"{method:s} {path:s} -> {response.status_code:d}")
    return response.json() or {}


def _state_path(room_id: str, event_type: str, state_key: str) -> str:
    return (
        f"{CLIENT_API:s}/rooms/{quote(room_id, safe=''):s}"
        f"/state/{quote(event_type, safe=''):s}/{quote(state_key, safe=''):s}"
    )


def get_room_state(room_id: str, event_type: str, state_key: str) -> dict[str, Any]:
    """One state event's content, read as Ariane (she must be in the room)."""
    return _as("GET", _state_path(room_id, event_type, state_key))


def set_room_state(
    room_id: str, event_type: str, state_key: str, content: dict[str, Any]
) -> None:
    """Write one state event as Ariane (she must be in the room)."""
    _as("PUT", _state_path(room_id, event_type, state_key), json=content)


def joined_members(room_id: str) -> set[str]:
    """Who is in a room now, so the backend can answer "may this person read it".

    This is the one call that does not go through `_as`, and the only remaining
    use of the Synapse admin token: it answers for rooms Ariane was never
    invited to, which is the point - the question is about the person asking,
    not about her. It reads; it never joins anything.
    """
    members = _admin(
        "GET", f"/_synapse/admin/v1/rooms/{quote(room_id, safe=''):s}/members"
    )
    return set(members.get("members", []))


def openid_user_id(openid_token: str) -> str | None:
    """
    The Matrix account behind an OpenID token its client requested, or `None`.

    This is how a browser proves which Matrix user it is without handing over
    its access token: the homeserver vouches for the short-lived OpenID token.
    """
    try:
        response = requests.get(
            f"{settings.MATRIX_HOMESERVER_URL.rstrip('/'):s}"
            "/_matrix/federation/v1/openid/userinfo",
            params={"access_token": openid_token},
            timeout=settings.MATRIX_REQUEST_TIMEOUT,
        )
    except requests.RequestException as exc:
        raise MatrixError(f"OpenID userinfo failed: {exc!s}") from exc
    if response.status_code in (401, 403, 404):
        return None
    if response.status_code >= 400:
        raise MatrixError(
            f"OpenID userinfo returned {response.status_code:d}",
            status_code=response.status_code,
        )
    try:
        user_id = response.json().get("sub")
    except ValueError:
        return None
    return user_id if isinstance(user_id, str) and user_id else None
