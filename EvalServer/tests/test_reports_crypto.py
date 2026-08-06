"""Unit tests for report-controller decryption helpers."""

from __future__ import annotations

import os

import pytest

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import padding as crypto_padding


os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")

from controllers.reports import _decrypt_api_key  # noqa: E402


@pytest.fixture
def key() -> bytes:
    return os.environ["ENCRYPTION_KEY"].encode("ascii").ljust(32, b"0")[:32]


def _legacy_encrypt(plaintext: str, key: bytes) -> str:
    """Encrypt with the legacy AES-256-CBC scheme used by the Node backend."""
    import os as _os

    iv = _os.urandom(16)
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    padder = crypto_padding.PKCS7(128).padder()
    padded = padder.update(plaintext.encode("utf-8")) + padder.finalize()
    ct = encryptor.update(padded) + encryptor.finalize()
    return f"{iv.hex()}:{ct.hex()}"


def _gcm_encrypt(plaintext: str, key: bytes) -> str:
    """Encrypt with the current AES-256-GCM scheme used by the Node backend."""
    import os as _os

    nonce = _os.urandom(12)
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    ct = ciphertext_with_tag[:-16]
    tag = ciphertext_with_tag[-16:]
    return f"{nonce.hex()}:{tag.hex()}:{ct.hex()}"


def test_decrypt_legacy_cbc(key: bytes):
    original = "legacy-api-key"
    encrypted = _legacy_encrypt(original, key)
    assert _decrypt_api_key(encrypted) == original


def test_decrypt_current_gcm(key: bytes):
    original = "current-api-key"
    encrypted = _gcm_encrypt(original, key)
    assert _decrypt_api_key(encrypted) == original


def test_decrypt_invalid_format():
    with pytest.raises(ValueError, match="Invalid encrypted format"):
        _decrypt_api_key("not-valid")
    with pytest.raises(ValueError, match="Invalid encrypted format"):
        _decrypt_api_key("iv:tag:ct:extra")


def test_decrypt_tampered_gcm_tag_fails(key: bytes):
    encrypted = _gcm_encrypt("tamper test", key)
    iv, tag, ct = encrypted.split(":")
    tampered_tag = f"{int(tag, 16) ^ 1:032x}"
    with pytest.raises(Exception):
        _decrypt_api_key(f"{iv}:{tampered_tag}:{ct}")
