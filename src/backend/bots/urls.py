"""URL configuration for the bots app.

Mounted in `hub/urls.py`, deliberately outside `api/{version}/`: Synapse calls
these paths verbatim, and they must not appear in the client API schema.
"""

from django.urls import path, re_path

from bots import views

urlpatterns = [
    re_path(
        r"^_matrix/app/v1/transactions/(?P<txn_id>[^/]+)$",
        views.transactions,
        name="as-transactions",
    ),
    re_path(
        r"^_matrix/app/v1/users/(?P<user_id>[^/]+)$",
        views.unknown_user,
        name="as-users",
    ),
    re_path(
        r"^_matrix/app/v1/rooms/(?P<room_alias>[^/]+)$",
        views.unknown_room,
        name="as-rooms",
    ),
    path("bots/health/", views.health, name="bots-health"),
]
