"""Verificación del contexto de tenant firmado (HMAC-SHA256 + TTL).

Espejo EXACTO del firmante TS (`apps/api/src/core/security/agent-context.ts`):
token = `<base64url(payload JSON)>.<base64url(hmac)>`, sin padding. Sin firma
válida y vigente no hay tenant (fail-closed) → el servicio no abre nada.

ROTACIÓN (dual-secret): el gateway firma con el primary, pero acá se aceptan VARIOS
secretos activos (primary + secondary) para no romper tokens en vuelo durante una
rotación. El token es válido si su firma matchea CUALQUIERA; cada intento usa
`compare_digest` (tiempo constante). Ver ADR 0013.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time
from collections.abc import Sequence
from dataclasses import dataclass


@dataclass(frozen=True)
class AgentContext:
    tenant_id: str
    region: str
    user_id: str
    role: str
    exp: int  # epoch ms


def _b64url_decode(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _hmac_b64url(body: str, secret: str) -> str:
    digest = hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def verify_agent_context(
    token: str,
    secrets: str | Sequence[str],
    now_ms: int | None = None,
) -> AgentContext | None:
    # `secrets`: un secreto o la lista de activos (primary + secondary). Token válido
    # si matchea cualquiera; `compare_digest` (tiempo constante) en cada intento.
    secret_list = [secrets] if isinstance(secrets, str) else list(secrets)
    now_ms = now_ms if now_ms is not None else int(time.time() * 1000)
    dot = token.find(".")
    if dot <= 0:
        return None
    body, sig = token[:dot], token[dot + 1 :]
    if not any(hmac.compare_digest(sig, _hmac_b64url(body, s)) for s in secret_list):
        return None
    try:
        data = json.loads(_b64url_decode(body))
    except Exception:
        return None
    exp = data.get("exp")
    if not isinstance(exp, int) or exp < now_ms:
        return None
    return AgentContext(
        tenant_id=data["tenant_id"] if "tenant_id" in data else data["tenantId"],
        region=data.get("region", ""),
        user_id=data.get("userId", data.get("user_id", "")),
        role=data.get("role", ""),
        exp=exp,
    )
