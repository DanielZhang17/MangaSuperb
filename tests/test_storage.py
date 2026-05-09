from __future__ import annotations

from types import SimpleNamespace

import pytest

from storage import R2Storage


class FakeS3Client:
    def __init__(self) -> None:
        self.objects: list[dict] = []

    def put_object(self, **kwargs):
        self.objects.append(kwargs)


@pytest.fixture
def fake_storage(monkeypatch: pytest.MonkeyPatch):
    client = FakeS3Client()
    monkeypatch.setattr("storage.boto3.client", lambda *args, **kwargs: client)
    config = SimpleNamespace(
        R2_BUCKET_NAME="manga-test",
        R2_PUBLIC_URL="https://cdn.example.com",
        R2_ENDPOINT_URL="https://r2.example.com",
        R2_ACCESS_KEY_ID="key",
        R2_SECRET_ACCESS_KEY="secret",
    )

    return R2Storage(config), client


def test_upload_image_uses_jpeg_extension_and_content_type_for_jpeg_bytes(fake_storage):
    storage, client = fake_storage
    jpeg_bytes = b"\xff\xd8\xff\xe0" + b"jpeg-payload"

    url = storage.upload_image(
        image_data=jpeg_bytes,
        filename="character_1_20260509_071056.png",
        content_type="image/png",
    )

    assert url.endswith("/character_1_20260509_071056.jpg")
    uploaded = client.objects[0]
    assert uploaded["Key"].endswith("character_1_20260509_071056.jpg")
    assert uploaded["ContentType"] == "image/jpeg"
    assert uploaded["Body"] == jpeg_bytes


def test_upload_image_keeps_png_extension_and_content_type_for_png_bytes(fake_storage):
    storage, client = fake_storage
    png_bytes = b"\x89PNG\r\n\x1a\n" + b"png-payload"

    url = storage.upload_image(
        image_data=png_bytes,
        filename="manga_page_1_1_20260509_071056.png",
        content_type="image/png",
    )

    assert url.endswith("/manga_page_1_1_20260509_071056.png")
    uploaded = client.objects[0]
    assert uploaded["Key"].endswith("manga_page_1_1_20260509_071056.png")
    assert uploaded["ContentType"] == "image/png"


def test_missing_r2_credentials_creates_disabled_storage(monkeypatch: pytest.MonkeyPatch):
    def fail_if_client_is_created(*args, **kwargs):
        pytest.fail("R2 client should not be created without complete credentials")

    monkeypatch.setattr("storage.boto3.client", fail_if_client_is_created)
    config = SimpleNamespace(
        R2_BUCKET_NAME="manga-test",
        R2_PUBLIC_URL="",
        R2_ENDPOINT_URL="",
        R2_ACCESS_KEY_ID="",
        R2_SECRET_ACCESS_KEY="",
    )

    storage = R2Storage(config)

    assert storage.check_bucket_exists() is False
    assert storage.upload_file(b"payload", "page.png") is None
    assert storage.delete_image("manga/page.png") is False
    assert storage.download_file("manga/page.png") is None
