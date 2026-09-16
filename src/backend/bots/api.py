"""The client-facing part of the bots app.

Deliberately separate from `views.py`: that module answers Synapse on public,
token-authenticated routes, this one answers the browser on the ordinary
authenticated API. Mixing them in one file is how a Synapse route ends up
mounted under `api/{version}/` by accident.
"""

from __future__ import annotations

from django.conf import settings

from rest_framework import views
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.serializers import Serializer

from bots import albert, serializers


class AssistantView(views.APIView):
    """Who the assistant is and what she understands.

    Served from the same dictionary the bot reads at answer time, so the
    composer's suggestion list cannot drift from what actually works. A command
    removed from the catalogue disappears from the UI on the next load.

    The names are here for the composer's benefit: it only offers a command once
    the draft already addresses her, because a command without a ping does
    nothing at all.
    """

    permission_classes = [IsAuthenticated]
    serializer_class: type[Serializer] = serializers.AssistantSerializer

    def get(self, request):
        """
        GET /api/v1.0/bots/assistant/
            The assistant's id, the names she answers to, and her commands.
        """
        payload = {
            "user_id": settings.MATRIX_BOT_USER_ID,
            "names": list(settings.BOTS_PING_NAMES),
            "commands": albert.catalogue(),
        }
        return Response(serializers.AssistantSerializer(payload).data)
