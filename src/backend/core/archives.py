"""
The archive of a closed meeting: one ZIP file with everything the Hub kept.

    meeting.md        title, dates, organizer, participants, agenda, documents
    agenda.md         the agenda, when one was written
    files/…           the documents attached to the meeting
    whiteboard.excalidraw  what was drawn on the board, to open in Excalidraw
    transcript.md     what was said, from the live subtitles
    chat.md           what was written in the chat of the call

File names follow the language of the person downloading the archive.
"""

import io
import logging
import re
import zipfile

from django.utils import timezone
from django.utils.translation import gettext as _
from django.utils.translation import pgettext

from core.boards import scene_file
from core.transcripts import transcript_markdown

logger = logging.getLogger(__name__)

MAX_NAME_LENGTH = 100


def safe_file_name(name, taken):
    """A file name that stays inside its folder and is not already used."""
    # Path parts such as `..` are dropped, the others joined with `_`.
    parts = [part for part in re.split(r"[\\/]+", name) if part.strip(" .")]
    base = re.sub(r"[:*?\"<>|\x00-\x1f]+", "_", "_".join(parts)).strip(" .")
    base = (base or "file")[:MAX_NAME_LENGTH]
    candidate, counter = base, 1
    stem, dot, extension = base.rpartition(".")
    while candidate.lower() in taken:
        counter += 1
        candidate = f"{stem} ({counter}).{extension}" if dot else f"{base} ({counter})"
    taken.add(candidate.lower())
    return candidate


def _time(value):
    return f"{timezone.localtime(value):%d/%m/%Y %H:%M}" if value else "-"


def _escape(text):
    """Keep user text from turning into markdown links or headings."""
    return re.sub(r"([\\`*_\[\]<>#])", r"\\\1", text)


def _participants(meeting):
    names = []
    for participant in meeting.participants.all():
        name = participant.name or participant.identity
        if name not in names:
            names.append(name)
    return names


def meeting_markdown(  # pylint: disable=too-many-arguments
    meeting, documents, attachment_names, board_name=None, *, chat_name=""
):
    """The summary page of the archive."""
    organizer = meeting.organizer
    started_at = meeting.starts_at or meeting.created_at
    if meeting.auto_closed:
        closing = _("Closed automatically at the end of the meeting.")
    else:
        closing = _("Closed by its organizer.")

    lines = [
        f"# {_escape(meeting.title or _('Meeting'))}",
        "",
    ]
    if chat_name:
        lines.append("- " + _("Conversation: %(name)s") % {"name": _escape(chat_name)})
    lines += [
        "- " + _("Start: %(time)s") % {"time": _time(started_at)},
        "- " + _("End: %(time)s") % {"time": _time(meeting.closed_at)},
        "- "
        + _("Organizer: %(name)s")
        % {"name": _escape(organizer.full_name or organizer.email or str(organizer))},
        f"- {closing}",
        "",
        f"## {_('Participants')}",
        "",
    ]
    participants = _participants(meeting)
    lines += [f"- {_escape(name)}" for name in participants] or [
        _("Nobody was seen in the call.")
    ]

    lines += ["", f"## {_('Agenda')}", ""]
    lines.append(meeting.agenda.strip() if meeting.agenda.strip() else _("No agenda."))

    lines += ["", f"## {_('Documents')}", ""]
    entries = [
        f"- [{_escape(document['title'])}](<{document['url']}>)"
        for document in documents
    ] + [f"- {_('files')}/{_escape(name)}" for name in attachment_names]
    if board_name:
        entries.append(f"- {_escape(board_name)}")
    lines += entries or [_("No document.")]
    return "\n".join(lines) + "\n"


def chat_markdown(meeting):
    """The call chat, one message per line."""
    lines = [f"# {_('Chat of the call')}", ""]
    for message in meeting.chat_messages.all():
        sent_at = timezone.localtime(message.sent_at)
        sender = message.sender_name or message.sender_identity
        lines.append(f"**{_escape(sender)}** ({sent_at:%H:%M})")
        if message.from_assistant:
            lines[-1] += " " + _("(automatic assistant)")
        lines.append(message.text)
        lines.append("")
    return "\n".join(lines)


def _attachment_bytes(attachment):
    """What a document holds, or `None` when its file cannot be read."""
    try:
        with attachment.open_content() as stored:
            return stored.read()
    except OSError:
        logger.warning("attachment %s could not be read", attachment.pk)
        return None


def build_archive(meeting, documents, board_elements=(), chat_name=""):
    """
    The ZIP archive of a closed meeting, as bytes. `documents` are the links
    listed in the meeting state (`title`, `url`), `board_elements` what was
    drawn on its whiteboard, `chat_name` the name of its conversation.
    """
    buffer = io.BytesIO()
    taken = set()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        attachment_names = []
        folder = _("files")
        for attachment in meeting.attachments.all():
            content = _attachment_bytes(attachment)
            if content is None:
                continue
            name = safe_file_name(attachment.name, taken)
            attachment_names.append(name)
            archive.writestr(f"{folder}/{name}", content)

        board_name = None
        if board_elements:
            board_name = safe_file_name(_("whiteboard.excalidraw"), taken)
            archive.writestr(board_name, scene_file(list(board_elements)))

        archive.writestr(
            _("meeting.md"),
            meeting_markdown(
                meeting,
                documents,
                attachment_names,
                board_name,
                chat_name=chat_name,
            ),
        )
        if meeting.agenda.strip():
            archive.writestr(_("agenda.md"), meeting.agenda.strip() + "\n")

        segments = list(meeting.transcript_segments.all())
        if segments:
            archive.writestr(_("transcript.md"), transcript_markdown(meeting, segments))
        if meeting.chat_messages.exists():
            archive.writestr(_("chat.md"), chat_markdown(meeting))
    return buffer.getvalue()


def _name_part(text):
    return re.sub(r"[^\w-]+", "-", text or "", flags=re.UNICODE).strip("-")[:40]


def archive_file_name(meeting, chat_name=""):
    """
    `meeting-<title>-<conversation>-<date>-<time>.zip`, readable and safe: the
    meeting is recognized among the archives of every conversation.
    """
    started_at = timezone.localtime(meeting.starts_at or meeting.created_at)
    parts = [
        pgettext("archive file name", "meeting"),
        _name_part(meeting.title) or meeting.slug,
        _name_part(chat_name),
        f"{started_at:%Y-%m-%d}",
        f"{started_at:%Hh%M}",
    ]
    return "-".join(part for part in parts if part) + ".zip"
