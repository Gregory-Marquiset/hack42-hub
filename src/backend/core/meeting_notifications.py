"""
Ariane tells the members of a conversation about its meetings.

A private message goes to each member when a meeting is scheduled, when it
starts, and when it is closed (by its organizer or automatically), with its
transcript when there is one. Ariane writes from her own private conversation
with each member, which she creates the first time: it works for events nobody
is online for, like the start of a scheduled meeting or an automatic closing.

Only members with a Hub account are told: the demonstration bots are not.
Someone who left Ariane's conversation is not invited again.
"""

import logging
import zoneinfo
from datetime import timedelta

from django.conf import settings
from django.utils import timezone

from bots import matrix
from core import models

logger = logging.getLogger(__name__)

# Field the Hub reads to offer a button joining the meeting (see the frontend
# `matrixEventMapping.ts`).
MEETING_INVITE_KEY = "io.lasuite.hub.meeting_invite"

# Past this delay, a meeting is "scheduled" rather than started right away.
SCHEDULED_AFTER = timedelta(minutes=1)
# Members whose Matrix account belongs to the assistant's own service.
SERVICE_PREFIX = "hub-as_"


def is_enabled():
    """Whether Ariane can find the members and write to them."""
    return (
        settings.MEETING_NOTIFICATIONS_ENABLED
        and matrix.can_write_rooms()
        and matrix.can_read_members()
    )


def _claim(meeting, field):
    """Mark a message as sent; answers whether it was still to send."""
    return bool(
        models.Meeting.objects.filter(
            pk=meeting.pk, **{f"{field}__isnull": True}
        ).update(**{field: timezone.now()})
    )


def _localpart(user_id):
    return user_id.partition(":")[0].lstrip("@").lower()


def recipients(meeting):
    """The members of the conversation who use the Hub, organizer included."""
    members = matrix.joined_members(meeting.chat_id)
    hub_logins = {
        email.partition("@")[0].lower()
        for email in models.User.objects.filter(is_active=True)
        .exclude(email__isnull=True)
        .exclude(email="")
        .values_list("email", flat=True)
    }
    return sorted(
        user_id
        for user_id in members
        if user_id != settings.MATRIX_BOT_USER_ID
        and not _localpart(user_id).startswith(SERVICE_PREFIX)
        and _localpart(user_id) in hub_logins
    )


def direct_room(user_id):
    """
    Ariane's private conversation with someone, created when missing. `None`
    when they left it: they are not invited again.
    """
    record = models.AssistantDirectRoom.objects.filter(user_id=user_id).first()
    if record:
        state = matrix.membership(record.room_id, user_id)
        if state in ("join", "invite"):
            return record.room_id
        if state in ("leave", "ban"):
            return None
    room_id = matrix.create_direct_room(user_id)
    models.AssistantDirectRoom.objects.update_or_create(
        user_id=user_id, defaults={"room_id": room_id}
    )
    return room_id


def meeting_invitation(meeting):
    """What the Hub needs to offer a button joining the call in its window."""
    if not (meeting.chat_id and meeting.url):
        return None
    return {
        MEETING_INVITE_KEY: {
            "chatId": meeting.chat_id,
            "meetingId": meeting.slug,
            "url": meeting.url,
            **({"title": meeting.title} if meeting.title else {}),
        }
    }


def _send_to_members(meeting, text, extra=None):
    try:
        members = recipients(meeting)
    except matrix.MatrixError as error:
        logger.warning("meeting %s: members unknown: %s", meeting.slug, error)
        return
    for user_id in members:
        try:
            room_id = direct_room(user_id)
            if room_id:
                matrix.send_message(room_id, text, extra=extra)
        except matrix.MatrixError as error:
            logger.warning("meeting %s: %s not told: %s", meeting.slug, user_id, error)


def chat_name(meeting):
    """The conversation's name as Matrix knows it, or "" when it cannot be read."""
    if not meeting.chat_id:
        return ""
    try:
        return matrix.room_name(meeting.chat_id) or ""
    except matrix.MatrixError:
        return ""


def _names(meeting):
    """The meeting's and the conversation's names, for the messages."""
    title = meeting.title or "sans titre"
    room = chat_name(meeting) or "votre conversation"
    return title, _room_and_space(meeting, room)


def _room_and_space(meeting, room):
    """« Salon » (espace « Espace »), when the conversation is in one."""
    if not meeting.space_name:
        return f"« {room:s} »"
    return f"« {room:s} » (espace « {meeting.space_name:s} »)"


def _local(value, meeting):
    try:
        zone = zoneinfo.ZoneInfo(meeting.time_zone)
    except (zoneinfo.ZoneInfoNotFoundError, ValueError):
        zone = zoneinfo.ZoneInfo("UTC")
    return value.astimezone(zone)


def _duration(meeting):
    if not (meeting.planned_end_at and meeting.starts_at):
        return ""
    minutes = int((meeting.planned_end_at - meeting.starts_at).total_seconds() // 60)
    hours, rest = divmod(minutes, 60)
    if hours == 0:
        return f" ({rest} min)"
    return f" ({hours} h{f' {rest:02d}' if rest else ''})"


def scheduled_message(meeting):
    """The message sent when a meeting is scheduled."""
    title, room = _names(meeting)
    start = _local(meeting.starts_at or meeting.created_at, meeting)
    return (
        f"📅 Réunion programmée dans {room} : « {title} », "
        f"le {start:%d/%m} à {start:%H:%M}{_duration(meeting)}.\n"
        "Je vous préviendrai quand elle commencera."
    )


def started_message(meeting):
    """The message sent when a meeting starts."""
    title, room = _names(meeting)
    # The meeting travels with the message: the Hub turns it into a button
    # that joins the call in its window, so no address clutters the text.
    return f"🎥 La réunion « {title} » commence dans {room}."


def closed_message(meeting, document=None):
    """The message sent when a meeting is closed."""
    title, room = _names(meeting)
    how = " (clôturée automatiquement)" if meeting.auto_closed else ""
    lines = [f"✅ La réunion « {title} » de {room} est terminée{how}."]
    if document:
        lines.append(f"Transcription : {document['url']}")
    lines.append(
        "L'archive (ordre du jour, participants, documents, transcription, "
        "discussion) se télécharge depuis l'historique des réunions de la "
        "conversation."
    )
    return "\n".join(lines)


def _to_tell(meeting_pk, field):
    """
    The meeting, when its members are to be told about it and were not yet;
    `None` when there is nobody to tell or Ariane cannot write.
    """
    if not is_enabled():
        return None
    meeting = models.Meeting.objects.get(pk=meeting_pk)
    if meeting.chat_id and _claim(meeting, field):
        return meeting
    return None


def notify_scheduled(meeting_pk):
    """Tell the members a meeting was scheduled, once."""
    if meeting := _to_tell(meeting_pk, "scheduled_notified_at"):
        _send_to_members(meeting, scheduled_message(meeting))


def notify_started(meeting_pk):
    """Tell the members a meeting starts, once."""
    if meeting := _to_tell(meeting_pk, "started_notified_at"):
        _send_to_members(meeting, started_message(meeting), meeting_invitation(meeting))


def notify_closed(meeting_pk, document=None):
    """Tell the members a meeting is over, once, with its transcript."""
    if meeting := _to_tell(meeting_pk, "closed_notified_at"):
        _send_to_members(meeting, closed_message(meeting, document))


def on_created(meeting):
    """What to send when a meeting is created: scheduled, or started now."""
    if not (meeting.chat_id and is_enabled()):
        return None
    if meeting.starts_at and meeting.starts_at > timezone.now() + SCHEDULED_AFTER:
        return notify_scheduled
    return notify_started


def is_starting(meeting, now):
    """Whether a scheduled meeting has just begun and nobody was told yet."""
    begins_at = meeting.starts_at or meeting.created_at
    return bool(
        meeting.chat_id
        and meeting.started_notified_at is None
        and meeting.closed_at is None
        and begins_at <= now
        and is_enabled()
    )
