"""The Application Service endpoints Synapse calls.

These routes are public: they sit outside `api/v1.0/` and outside OIDC, because
Synapse has no session and no user. The **only** thing standing between the
internet and the ability to feed Ariane arbitrary events is the `hs_token`
comparison below. Get it wrong and anyone can make her read, and answer, a
conversation that never happened.

Three rules, each learned the expensive way:

  1. compare with `hmac.compare_digest`, never `==`. A plain comparison returns
     early on the first wrong byte and leaks the token one byte at a time;
  2. answer 200 even when handling fails. Synapse keeps one ordered queue per
     Application Service and retries the same transaction until it succeeds - a
     500 here stops every later event, for every room;
  3. do the slow work off this thread. Albert takes seconds; Synapse is waiting.
"""

from __future__ import annotations

import hmac
import json
import logging
import threading

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt

from bots import handlers

logger = logging.getLogger(__name__)


def _authorised(request) -> bool:
    """Is this really Synapse?"""
    header = request.headers.get("Authorization", "")
    scheme, _, token = header.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return False
    expected = settings.MATRIX_HS_TOKEN or ""
    if not expected:
        logger.error("MATRIX_HS_TOKEN is empty: refusing every transaction")
        return False
    return hmac.compare_digest(token, expected)


@csrf_exempt
def transactions(request, txn_id):
    """PUT /_matrix/app/v1/transactions/{txnId} — the events Synapse pushes."""
    if request.method != "PUT":
        return JsonResponse({"errcode": "M_UNRECOGNIZED"}, status=404)
    if not _authorised(request):
        return JsonResponse({"errcode": "M_FORBIDDEN"}, status=403)

    try:
        events = json.loads(request.body or b"{}").get("events", [])
    except ValueError:
        # Malformed body: nothing to do, but still 200 - retrying will not make
        # it parse, and a non-200 would wedge the queue.
        logger.warning("transaction %s: unreadable body", txn_id)
        return JsonResponse({})

    for event in events:
        if event.get("type") != "m.room.message":
            continue
        room_id = event.get("room_id")
        if not room_id or not event.get("event_id"):
            continue
        # A daemon thread: the answer is best-effort, and a pending reply must
        # never hold the process open at shutdown.
        threading.Thread(
            target=handlers.handle_message,
            args=(room_id, event),
            daemon=True,
        ).start()

    return JsonResponse({})


@csrf_exempt
def unknown_user(request, user_id):  # pylint: disable=unused-argument
    """GET /_matrix/app/v1/users/{userId} — Ariane is registered, not created lazily."""
    return JsonResponse({"errcode": "M_NOT_FOUND"}, status=404)


@csrf_exempt
def unknown_room(request, room_alias):  # pylint: disable=unused-argument
    """GET /_matrix/app/v1/rooms/{roomAlias} — the service claims no alias."""
    return JsonResponse({"errcode": "M_NOT_FOUND"}, status=404)


def health(request):
    """A plain check that the service is wired, without exposing any token."""
    return HttpResponse(
        f"bot={settings.MATRIX_BOT_USER_ID}\n"
        f"ping_names={','.join(settings.BOTS_PING_NAMES)}\n"
        f"albert_key={'set' if settings.ALBERT_API_KEY else 'MISSING'}\n",
        content_type="text/plain",
    )
