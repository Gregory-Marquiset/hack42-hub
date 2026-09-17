"""Serializers for the bots API."""

from rest_framework import serializers

# Nothing here is ever saved; these only shape the output.
# pylint: disable=abstract-method


class BotCommandSerializer(serializers.Serializer):
    """One command the assistant understands, as the composer displays it."""

    command = serializers.CharField(read_only=True)
    label = serializers.CharField(read_only=True)
    description = serializers.CharField(read_only=True)


class AssistantSerializer(serializers.Serializer):
    """Who the assistant is, and what she answers to.

    The composer needs the names to know when a draft already addresses her:
    a command only means something once she has been pinged.
    """

    user_id = serializers.CharField(read_only=True)
    names = serializers.ListField(child=serializers.CharField(), read_only=True)
    commands = BotCommandSerializer(many=True, read_only=True)
