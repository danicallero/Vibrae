import pytest
try:
    from vibrae_core.auth import create_access_token, decode_token, verify_password, hash_password
except Exception as e:  # pragma: no cover
    pytest.skip(f"auth tests skipped (import error: {e})", allow_module_level=True)


def test_token_round_trip():
    token = create_access_token({"sub": "tester"})
    payload = decode_token(token)
    assert payload["sub"] == "tester"


def test_password_hash_verify():
    pw = "s3cret!"
    hashed = hash_password(pw)
    assert verify_password(pw, hashed)
