import json
import os

import firebase_admin
from firebase_admin import auth
from firebase_admin import credentials
from firebase_admin import firestore


def _get_service_account():
    raw = os.getenv(
        "FIREBASE_SERVICE_ACCOUNT_JSON",
        "",
    ).strip()

    if not raw:
        return None

    try:
        service_account = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            "FIREBASE_SERVICE_ACCOUNT_JSON is not valid JSON."
        ) from exc

    private_key = service_account.get(
        "private_key"
    )

    if isinstance(
        private_key,
        str,
    ):
        service_account[
            "private_key"
        ] = private_key.replace(
            "\\n",
            "\n",
        )

    return service_account


def _initialize_firebase():
    try:
        return firebase_admin.get_app()
    except ValueError:
        service_account = (
            _get_service_account()
        )

        if service_account:
            credential = (
                credentials.Certificate(
                    service_account
                )
            )

            return (
                firebase_admin.initialize_app(
                    credential
                )
            )

        return (
            firebase_admin.initialize_app()
        )


firebase_app = (
    _initialize_firebase()
)

db = firestore.client(
    app=firebase_app
)


def verify_firebase_token(
    token: str,
):
    return auth.verify_id_token(
        token,
        app=firebase_app,
        check_revoked=True,
    )