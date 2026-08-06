"""Unit tests for AIGateway encryption utilities."""

import os
import sys
from pathlib import Path

# Ensure src/ is on the path and ENCRYPTION_KEY is set before importing config.
os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key-32-chars-long!!")
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding as crypto_padding

from utils.encryption import decrypt, encrypt, mask_api_key


def _legacy_encrypt(plaintext: str, key: bytes) -> str:
    """Encrypt with the old AES-256-CBC scheme for compatibility testing."""
    import os as _os

    iv = _os.urandom(16)
    # nosemgrep: python.cryptography.security.mode-without-authentication.crypto-mode-without-authentication
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()
    padder = crypto_padding.PKCS7(128).padder()
    padded = padder.update(plaintext.encode("utf-8")) + padder.finalize()
    ct = encryptor.update(padded) + encryptor.finalize()
    return f"{iv.hex()}:{ct.hex()}"


def test_encrypt_returns_gcm_format():
    encrypted = encrypt("hello world")
    parts = encrypted.split(":")
    assert len(parts) == 3
    iv, tag, ct = parts
    assert len(bytes.fromhex(iv)) == 12
    assert len(bytes.fromhex(tag)) == 16
    assert bytes.fromhex(ct)


def test_decrypt_round_trip():
    original = "my secret api key"
    encrypted = encrypt(original)
    assert decrypt(encrypted) == original


def test_decrypt_legacy_cbc():
    key = os.environ["ENCRYPTION_KEY"].encode("ascii").ljust(32, b"0")[:32]
    original = "legacy secret"
    legacy = _legacy_encrypt(original, key)
    assert decrypt(legacy) == original


def test_decrypt_tampered_tag_fails():
    encrypted = encrypt("tamper test")
    iv, tag, ct = encrypted.split(":")
    tampered_tag = f"{int(tag, 16) ^ 1:032x}"
    with pytest.raises(Exception):
        decrypt(f"{iv}:{tampered_tag}:{ct}")


def test_decrypt_invalid_format():
    with pytest.raises(ValueError, match="Invalid encrypted format"):
        decrypt("not-valid")
    with pytest.raises(ValueError, match="Invalid encrypted format"):
        decrypt("iv:tag:ct:extra")


def test_encrypt_empty_raises():
    with pytest.raises(ValueError, match="Text to encrypt cannot be empty"):
        encrypt("")


def test_mask_api_key():
    assert mask_api_key("sk-abcdef1234567890") == "sk-a...7890"
    assert mask_api_key("short") == "***"
    assert mask_api_key("") == "***"


import pytest  # noqa: E402
