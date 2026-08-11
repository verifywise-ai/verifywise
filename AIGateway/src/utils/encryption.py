"""
Encryption utilities — shared AES-256-GCM encrypt/decrypt and key masking.

Compatible with the Node.js encryption in Servers/utils/encryption.utils.ts.
Format: hex(IV):hex(authTag):hex(ciphertext)

Legacy AES-256-CBC values in the old hex(IV):hex(ciphertext) format are still
accepted by decrypt() so existing secrets keep working.
"""

import os

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives import padding as crypto_padding

from config import settings


GCM_NONCE_SIZE = 12
GCM_AUTH_TAG_SIZE = 16


def _get_key() -> bytes:
    """Derive the 32-byte AES key from the configured encryption key."""
    raw = settings.encryption_key
    if not raw:
        raise ValueError("ENCRYPTION_KEY not configured")
    return raw.encode("ascii").ljust(32, b"0")[:32]


def _legacy_decrypt(iv: bytes, ciphertext: bytes) -> str:
    """Decrypt a legacy AES-256-CBC ciphertext."""
    key = _get_key()
    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    padded = decryptor.update(ciphertext) + decryptor.finalize()
    unpadder = crypto_padding.PKCS7(128).unpadder()
    plaintext = unpadder.update(padded) + unpadder.finalize()
    return plaintext.decode("utf-8")


def encrypt(plaintext: str) -> str:
    """Encrypt plaintext using AES-256-GCM. Returns iv:tag:ciphertext hex."""
    if not plaintext:
        raise ValueError("Text to encrypt cannot be empty")

    key = _get_key()
    nonce = os.urandom(GCM_NONCE_SIZE)
    aesgcm = AESGCM(key)
    ciphertext_with_tag = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)

    ciphertext = ciphertext_with_tag[:-GCM_AUTH_TAG_SIZE]
    tag = ciphertext_with_tag[-GCM_AUTH_TAG_SIZE:]
    return f"{nonce.hex()}:{tag.hex()}:{ciphertext.hex()}"


def decrypt(encrypted_text: str) -> str:
    """Decrypt an AES-256-GCM string (or legacy AES-256-CBC) in iv:tag:ct format."""
    if not encrypted_text:
        raise ValueError("Text to decrypt cannot be empty")

    parts = encrypted_text.split(":")
    if len(parts) == 2:
        # Legacy AES-256-CBC format: hex(IV):hex(ciphertext)
        iv_hex, data_hex = parts
        iv = bytes.fromhex(iv_hex)
        ct = bytes.fromhex(data_hex)
        return _legacy_decrypt(iv, ct)

    if len(parts) == 3:
        # Current AES-256-GCM format: hex(IV):hex(authTag):hex(ciphertext)
        iv_hex, tag_hex, data_hex = parts
        key = _get_key()
        nonce = bytes.fromhex(iv_hex)
        tag = bytes.fromhex(tag_hex)
        ct = bytes.fromhex(data_hex)
        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(nonce, ct + tag, None)
        return plaintext.decode("utf-8")

    raise ValueError("Invalid encrypted format")


def mask_api_key(api_key: str) -> str:
    """Mask an API key for display: xxxx...xxxx."""
    if not api_key or len(api_key) <= 8:
        return "***"
    return f"{api_key[:4]}...{api_key[-4:]}"
