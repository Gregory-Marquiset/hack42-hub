"""
The whiteboard of a meeting, read back for its archive.

The meeting window opens an Excalidraw board next to the call. Its room and
the key its scene is encrypted with are derived from the meeting slug (see
`meetingBoard.ts` in the frontend), so the Hub can derive them too. Excalidraw
keeps the scene of each collaboration room in its scene store, a Firestore
collection (`MEETING_BOARD_SCENES_URL`), encrypted with that key: the store
never sees a drawing in clear, and the Hub decrypts it here.
"""

import base64
import hashlib
import json
import logging

from django.conf import settings

import requests
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)

# Must match `meetingBoard.ts`.
SEED_PREFIX = "hub-meeting-board:"
ROOM_ID_BYTES = 10
ROOM_KEY_BYTES = 16


class BoardError(Exception):
    """The scene store could not be read, or its scene not decrypted."""


def is_board_configured():
    """Whether the Hub knows where Excalidraw keeps its scenes."""
    return bool(settings.MEETING_BOARD_SCENES_URL)


def board_room(seed):
    """The Excalidraw room id and key of a meeting, as the frontend derives them."""
    digest = hashlib.sha256(f"{SEED_PREFIX}{seed}".encode()).digest()
    return (
        digest[:ROOM_ID_BYTES].hex(),
        digest[ROOM_ID_BYTES : ROOM_ID_BYTES + ROOM_KEY_BYTES],
    )


def _bytes_field(fields, name):
    try:
        return base64.b64decode(fields[name]["bytesValue"])
    except (KeyError, TypeError, ValueError) as error:
        raise BoardError(f"scene field {name} is missing") from error


def fetch_elements(seed):
    """
    The elements drawn on the meeting's board, deleted ones left out, or an
    empty list when nobody opened it.
    """
    room_id, key = board_room(seed)
    url = f"{settings.MEETING_BOARD_SCENES_URL.rstrip('/'):s}/{room_id:s}"
    try:
        response = requests.get(url, timeout=settings.MEETING_BOARD_TIMEOUT)
    except requests.RequestException as error:
        raise BoardError(f"scene store unreachable: {error!s}") from error
    if response.status_code == 404:
        return []
    if response.status_code >= 400:
        raise BoardError(f"scene store answered {response.status_code:d}")

    try:
        fields = response.json()["fields"]
    except (ValueError, KeyError, TypeError) as error:
        raise BoardError("unexpected scene document") from error
    try:
        plaintext = AESGCM(key).decrypt(
            _bytes_field(fields, "iv"), _bytes_field(fields, "ciphertext"), None
        )
        elements = json.loads(plaintext)
    except (InvalidTag, ValueError) as error:
        raise BoardError("the scene could not be decrypted") from error
    if not isinstance(elements, list):
        raise BoardError("unexpected scene content")
    return [
        element
        for element in elements
        if isinstance(element, dict) and not element.get("isDeleted")
    ]


def scene_file(elements):
    """An `.excalidraw` file, which Excalidraw opens as it is."""
    return json.dumps(
        {
            "type": "excalidraw",
            "version": 2,
            "source": "hub",
            "elements": elements,
            "appState": {"viewBackgroundColor": "#ffffff"},
            "files": {},
        },
        ensure_ascii=False,
        indent=2,
    )
