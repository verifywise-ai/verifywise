"""
Encryption utilities — shared AES-256-CBC encrypt/decrypt and key masking.

Compatible with the Node.js encryption in Servers/utils/encryption.utils.ts.
Format: hex(IV):hex(ciphertext)
"""

import os
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding as crypto_padding
from cryptography.hazmat.backends import default_backend

from config import settings


def _get_key() -> bytes:
    """Derive the 32-byte AES key from the configured encryption key."""
    raw = settings.encryption_key
    if not raw:
        raise ValueError("ENCRYPTION_KEY not configured")
    return raw.encode("ascii").ljust(32, b"0")[:32]


def encrypt(plaintext: str) -> str:
    """Encrypt plaintext using AES-256-CBC. Returns hex(IV):hex(ciphertext)."""
    if not plaintext:
        raise ValueError("Text to encrypt cannot be empty")

    key = _get_key()
    iv = os.urandom(16)

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    encryptor = cipher.encryptor()

    padder = crypto_padding.PKCS7(128).padder()
    padded = padder.update(plaintext.encode("utf-8")) + padder.finalize()

    ct = encryptor.update(padded) + encryptor.finalize()
    return f"{iv.hex()}:{ct.hex()}"


def decrypt(encrypted_text: str) -> str:
    """Decrypt an AES-256-CBC encrypted string (hex IV:data format)."""
    if not encrypted_text:
        raise ValueError("Text to decrypt cannot be empty")

    parts = encrypted_text.split(":")
    if len(parts) != 2:
        raise ValueError("Invalid encrypted format")

    iv_hex, data_hex = parts
    key = _get_key()
    iv = bytes.fromhex(iv_hex)
    ct = bytes.fromhex(data_hex)

    cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
    decryptor = cipher.decryptor()
    padded = decryptor.update(ct) + decryptor.finalize()

    unpadder = crypto_padding.PKCS7(128).unpadder()
    plaintext = unpadder.update(padded) + unpadder.finalize()
    return plaintext.decode("utf-8")


def mask_api_key(api_key: str) -> str:
    """Mask an API key for display: xxxx...xxxx."""
    if not api_key or len(api_key) <= 8:
        return "***"
    return f"{api_key[:4]}...{api_key[-4:]}"
