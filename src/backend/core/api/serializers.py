"""Client serializers for the hub core app."""

from django.utils.text import slugify

from rest_framework import serializers

from core import models


class UserSerializer(serializers.ModelSerializer):
    """Serialize users."""

    full_name = serializers.SerializerMethodField(read_only=True)
    short_name = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = models.User
        fields = ["id", "email", "full_name", "short_name", "language"]
        read_only_fields = ["id", "email", "full_name", "short_name"]

    def get_full_name(self, instance):
        """Return the full name of the user."""
        if not instance.full_name:
            email = instance.email.split("@")[0]
            return slugify(email)

        return instance.full_name

    def get_short_name(self, instance):
        """Return the short name of the user."""
        if not instance.short_name:
            email = instance.email.split("@")[0]
            return slugify(email)

        return instance.short_name


class UserLightSerializer(UserSerializer):
    """Serialize users with limited fields."""

    class Meta:
        model = models.User
        fields = ["full_name", "short_name"]
        read_only_fields = ["full_name", "short_name"]


class DocsDocumentCreateSerializer(serializers.Serializer):
    """Validate the minimal document creation payload sent to Docs."""

    title = serializers.CharField(max_length=255, trim_whitespace=True)
    member_ids = serializers.ListField(
        child=serializers.CharField(max_length=255, trim_whitespace=True),
        default=list,
        max_length=100,
        required=False,
    )


class DocsDocumentSharingSerializer(serializers.Serializer):
    """Serialize the non-sensitive outcome of sharing a Docs document."""

    shared = serializers.ListField(child=serializers.CharField(), read_only=True)
    unresolved = serializers.ListField(child=serializers.CharField(), read_only=True)
    failed = serializers.ListField(child=serializers.CharField(), read_only=True)


class DocsDocumentSerializer(serializers.Serializer):
    """Serialize a Docs document reference returned to the frontend."""

    id = serializers.CharField(read_only=True)
    provider = serializers.CharField(read_only=True)
    title = serializers.CharField(read_only=True)
    address = serializers.URLField(read_only=True)
    sharing = DocsDocumentSharingSerializer(read_only=True)
