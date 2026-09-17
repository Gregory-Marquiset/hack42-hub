"""
Test reading back the whiteboard of a meeting from the Excalidraw scene store.
"""

import base64
import json
import os
from datetime import datetime
from datetime import timezone as dt_timezone

from django.test import override_settings

import pytest
import responses
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from core import boards, factories, meeting_closing

pytestmark = pytest.mark.django_db

SCENES_URL = "https://scenes.test/documents/scenes"
SEED = "essai-tab-leau"
# Derived in a browser by `meetingBoard.ts` for the same seed.
ROOM_ID = "2a8282e4ed47e0f8967a"
ROOM_KEY = "vcEPiCp8wyZjAdKaecE4Ng"

RECTANGLE = {"id": "r1", "type": "rectangle", "isDeleted": False}
ERASED = {"id": "r2", "type": "ellipse", "isDeleted": True}


def _scene_document(elements, key=None):
    """A Firestore document as Excalidraw writes it."""
    iv = os.urandom(12)
    key = key or boards.board_room(SEED)[1]
    ciphertext = AESGCM(key).encrypt(iv, json.dumps(elements).encode(), None)
    return {
        "fields": {
            "sceneVersion": {"integerValue": "3"},
            "iv": {"bytesValue": base64.b64encode(iv).decode()},
            "ciphertext": {"bytesValue": base64.b64encode(ciphertext).decode()},
        }
    }


def test_boards_room_matches_the_frontend():
    """The server derives the same room and key as the meeting window."""
    room_id, key = boards.board_room(SEED)

    assert room_id == ROOM_ID
    assert base64.urlsafe_b64encode(key).decode().rstrip("=") == ROOM_KEY


@responses.activate
@override_settings(MEETING_BOARD_SCENES_URL=f"{SCENES_URL}/")
def test_boards_fetch_elements():
    """The scene is decrypted, erased elements left out."""
    responses.get(
        f"{SCENES_URL}/{ROOM_ID}", json=_scene_document([RECTANGLE, ERASED, "x"])
    )

    assert boards.fetch_elements(SEED) == [RECTANGLE]


@responses.activate
@override_settings(MEETING_BOARD_SCENES_URL=SCENES_URL)
def test_boards_fetch_elements_of_an_unopened_board():
    """A board nobody opened has no scene: nothing was drawn."""
    responses.get(f"{SCENES_URL}/{ROOM_ID}", status=404)

    assert boards.fetch_elements(SEED) == []


@responses.activate
@override_settings(MEETING_BOARD_SCENES_URL=SCENES_URL)
@pytest.mark.parametrize(
    "answer",
    [
        {"status": 500},
        {"json": {"no": "fields"}},
        {"json": {"fields": {"iv": {"bytesValue": "AAAA"}}}},
        {"json": _scene_document([RECTANGLE], key=os.urandom(16))},
        {"json": _scene_document({"not": "a list"})},
    ],
)
def test_boards_fetch_elements_errors(answer):
    """A store error or a scene that does not decrypt is reported."""
    responses.get(f"{SCENES_URL}/{ROOM_ID}", **answer)

    with pytest.raises(boards.BoardError):
        boards.fetch_elements(SEED)


def test_boards_scene_file():
    """The archive file is an Excalidraw document."""
    scene = json.loads(boards.scene_file([RECTANGLE]))

    assert scene["type"] == "excalidraw"
    assert scene["elements"] == [RECTANGLE]


@pytest.fixture(name="inline")
def fixture_inline(monkeypatch):
    """Background work runs at once."""
    monkeypatch.setattr(
        meeting_closing, "run_in_background", lambda function, *args: function(*args)
    )


@responses.activate
@override_settings(MEETING_BOARD_SCENES_URL=SCENES_URL)
@pytest.mark.usefixtures("inline")
def test_boards_saved_when_the_meeting_closes():
    """Closing a meeting keeps what was drawn on its board."""
    meeting = factories.MeetingFactory(slug=SEED)
    responses.get(f"{SCENES_URL}/{ROOM_ID}", json=_scene_document([RECTANGLE]))

    assert meeting_closing.close(meeting)

    meeting.refresh_from_db()
    assert meeting.board_elements == [RECTANGLE]
    # Closing again reads nothing more.
    assert not meeting_closing.close(meeting)
    assert len(responses.calls) == 1


@responses.activate
@override_settings(MEETING_BOARD_SCENES_URL=SCENES_URL)
@pytest.mark.usefixtures("inline")
def test_boards_not_saved_when_the_store_fails():
    """A store error leaves the board to be read when the archive is asked."""
    meeting = factories.MeetingFactory(slug=SEED)
    responses.get(f"{SCENES_URL}/{ROOM_ID}", status=503)

    meeting_closing.close(meeting)

    meeting.refresh_from_db()
    assert meeting.board_elements is None
    assert meeting_closing.board_elements(meeting) == []


@pytest.mark.usefixtures("inline")
def test_boards_not_configured():
    """Without a scene store, nothing is read."""
    meeting = factories.MeetingFactory(slug=SEED)

    meeting_closing.close(meeting)

    meeting.refresh_from_db()
    assert meeting.board_elements is None
    assert meeting_closing.board_elements(meeting) == []


@responses.activate
@override_settings(MEETING_BOARD_SCENES_URL=SCENES_URL)
def test_boards_saved_board_preferred():
    """The board saved at the closing is used without reading the store."""
    meeting = factories.MeetingFactory(
        slug=SEED,
        closed_at=datetime(2026, 9, 17, 9, tzinfo=dt_timezone.utc),
        board_elements=[RECTANGLE],
    )

    assert meeting_closing.board_elements(meeting) == [RECTANGLE]
    assert not responses.calls
