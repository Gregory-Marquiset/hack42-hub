"""
Ariane in the chat of a call.

Someone writes `@ariane …` in the chat of a Hub meeting's call: the scribe
relays the message, and Ariane answers from what was said and written in the
call. Her answer is stored as a chat message of the meeting, which the scribe
takes and posts in the call.

What she reads follows the rule she applies in conversations: nothing from
before the person asking arrived. A call is public to whoever has its link;
someone who joined late gets no summary of what they did not hear.
"""

import logging

from django.conf import settings
from django.utils import timezone

from bots import albert, commands
from core import models

logger = logging.getLogger(__name__)

# What Ariane reads of a call, newest first, at most.
MAX_CONTEXT_ENTRIES = 200


def is_available():
    """Whether Ariane can answer: her model is configured."""
    return bool(settings.ALBERT_API_KEY)


def assistant_name():
    """The name people ping and see in the chat."""
    return commands.assistant_name()


def help_message():
    """What each command does, and what Ariane reads of a call."""
    name = assistant_name()
    return "\n".join(
        [
            f"Je réponds quand on écrit @{name:s} dans la discussion de "
            "l'appel, et ma réponse s'y affiche.",
            "",
            "Une commande change ma façon de répondre. Elle se place après la "
            f"mention : « @{name:s} /juriste ma question ».",
            "",
            *commands.command_lines(),
            "",
            "Sans commande, je réponds sur un ton normal.",
            "",
            "Ce que je lis : ce qui a été dit (les sous-titres de l'appel) et "
            "écrit dans la discussion depuis votre arrivée dans l'appel, avec "
            "le titre et l'ordre du jour de la réunion. Jamais ce qui a précédé "
            "votre arrivée. Je n'ouvre pas les documents de la réunion.",
        ]
    )


def is_for_assistant(message):
    """Whether a person addressed Ariane in the chat."""
    return not message.from_assistant and commands.is_pinged(message.text)


def _entries(meeting, since, exclude_pk):
    """What was said and written since `since`, oldest first."""
    segments = meeting.transcript_segments.filter(spoken_at__gte=since).order_by(
        "-spoken_at"
    )[:MAX_CONTEXT_ENTRIES]
    messages = (
        meeting.chat_messages.filter(sent_at__gte=since)
        .exclude(pk=exclude_pk)
        .order_by("-sent_at")[:MAX_CONTEXT_ENTRIES]
    )
    entries = [(s.spoken_at, "said", s) for s in segments] + [
        (m.sent_at, "wrote", m) for m in messages
    ]
    entries.sort(key=lambda entry: entry[0])
    return entries[-MAX_CONTEXT_ENTRIES:]


def context(meeting, question):
    """The conversation handed to Albert for a question asked in the call."""
    participant = meeting.participants.filter(identity=question.sender_identity).first()
    # Unknown to the scribe: they have just arrived, nothing before counts.
    since = participant.first_seen_at if participant else question.sent_at

    intro = f"Réunion « {meeting.title or 'sans titre'} », en visioconférence."
    if meeting.agenda.strip():
        intro += f"\nOrdre du jour :\n{meeting.agenda.strip()}"
    intro += (
        "\nVoici ce qui a été dit (transcription automatique des sous-titres, "
        "qui peut contenir des erreurs) et écrit dans la discussion de l'appel, "
        "depuis l'arrivée de la personne qui t'interroge."
    )
    messages = [{"role": "user", "content": intro}]

    for _, kind, entry in _entries(meeting, since, question.pk):
        if kind == "wrote" and entry.from_assistant:
            # Help and failures are no answers: read back, they teach the
            # model to refuse (see `matrix.ASIDE_KEY`).
            if not entry.aside:
                messages.append({"role": "assistant", "content": entry.text})
            continue
        if kind == "said":
            name = entry.speaker_name or entry.speaker_identity
            content = f"{name} (à l'oral) : {entry.text}"
        else:
            name = entry.sender_name or entry.sender_identity
            content = f"{name} (dans la discussion) : {entry.text}"
        messages.append({"role": "user", "content": content})
    return messages


def answer_in_call(message_pk):
    """Answer one message that pinged Ariane, for the scribe to post."""
    question = models.MeetingChatMessage.objects.select_related("meeting").get(
        pk=message_pk
    )
    meeting = question.meeting
    command, unknown = commands.parse_command(question.text)

    reply = commands.canned_reply(command, unknown, help_message)
    aside = reply is not None
    if reply is None:
        messages = context(meeting, question)
        asker = question.sender_name or question.sender_identity
        messages.append(
            {
                "role": "user",
                "content": f"{asker} : {commands.clean_question(question.text)}",
            }
        )
        try:
            reply = albert.answer(messages, command)
        except albert.AlbertError as error:
            logger.warning("meeting %s: Albert failed: %s", meeting.slug, error)
            reply = commands.FAILURE_MESSAGE
            aside = True

    models.MeetingChatMessage.objects.get_or_create(
        meeting=meeting,
        message_id=f"assistant:{question.message_id}"[:128],
        defaults={
            "sender_identity": "assistant",
            "sender_name": assistant_name(),
            "text": reply,
            "sent_at": timezone.now(),
            "from_assistant": True,
            "aside": aside,
            "reply_to": question,
        },
    )
