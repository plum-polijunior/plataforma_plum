"""
Configuração e carregamento de segredos.

Regra que este módulo existe para garantir: **nenhum segredo do PLUM vive no
repositório, na imagem do container, nem em variável de ambiente com o valor
dentro.** As variáveis de ambiente guardam apenas o *nome* do parâmetro; o
valor é buscado em tempo de execução com a role de execução do Lambda.

Ordem de tentativa para ler um segredo:

  1. Extensão AWS Parameters and Secrets (localhost:2773). É o caminho normal
     em Lambda: ela mantém cache local, então só a primeira leitura de cada
     cold start toca o Parameter Store.
  2. SDK boto3 direto. Cobre execução fora do Lambda (teste de integração,
     máquina de quem desenvolve com credencial AWS).
  3. Variável de ambiente com sufixo _VALUE. **Só para teste local.** Existe
     para a suíte rodar sem AWS, e o código avisa em log quando cai aqui.
"""

from __future__ import annotations

import json
import logging
import os
from functools import lru_cache
from typing import Optional
from urllib import request as _urlrequest
from urllib.error import URLError

logger = logging.getLogger(__name__)

_EXT_PORT = os.environ.get("PARAMETERS_SECRETS_EXTENSION_HTTP_PORT", "2773")
_EXT_URL = f"http://localhost:{_EXT_PORT}/systemsmanager/parameters/get"


class SecretUnavailable(RuntimeError):
    """O segredo não pôde ser lido por nenhum dos caminhos."""


def _read_via_extension(name: str) -> Optional[str]:
    token = os.environ.get("AWS_SESSION_TOKEN")
    if not token:
        return None
    url = f"{_EXT_URL}?name={name}&withDecryption=true"
    req = _urlrequest.Request(url, headers={"X-Aws-Parameters-Secrets-Token": token})
    try:
        with _urlrequest.urlopen(req, timeout=2) as resp:
            body = json.loads(resp.read())
        return body["Parameter"]["Value"]
    except (URLError, KeyError, ValueError, TimeoutError) as exc:
        logger.warning("Extensao de parametros indisponivel para '%s': %s", name, exc)
        return None


def _read_via_sdk(name: str) -> Optional[str]:
    try:
        import boto3  # import tardio: fora da AWS o boto3 pode nem estar instalado
    except ImportError:
        return None
    try:
        ssm = boto3.client("ssm")
        return ssm.get_parameter(Name=name, WithDecryption=True)["Parameter"]["Value"]
    except Exception as exc:  # noqa: BLE001 - qualquer falha aqui cai no proximo caminho
        logger.warning("Leitura de '%s' pelo SDK falhou: %s", name, exc)
        return None


@lru_cache(maxsize=8)
def get_secret(env_var_with_param_name: str) -> str:
    """
    Lê um segredo. `env_var_with_param_name` é o nome da variável de ambiente
    que contém o **caminho do parâmetro**, não o valor.

    Exemplo: HMAC_SECRET_PARAM=/plum/prod/hmac-secret
    """
    param_name = os.environ.get(env_var_with_param_name)

    if param_name:
        for reader in (_read_via_extension, _read_via_sdk):
            value = reader(param_name)
            if value:
                return value

    local = os.environ.get(f"{env_var_with_param_name}_VALUE")
    if local:
        logger.warning(
            "Usando %s_VALUE do ambiente. Isto e caminho de teste local e nao "
            "deve existir em producao.", env_var_with_param_name
        )
        return local

    raise SecretUnavailable(
        f"Nao consegui ler o segredo apontado por {env_var_with_param_name}. "
        f"Confira o parametro no SSM e a role de execucao do Lambda."
    )


def hmac_secret() -> str:
    """Segredo que assina o payload vindo da Edge Function (decisão 2A)."""
    return get_secret("HMAC_SECRET_PARAM")


def google_service_account_info() -> dict:
    """
    JSON da service account `plum-polijunior@plataforma-plum.iam.gserviceaccount.com`.

    Ela tem leitura em TODA planilha de TODO tenant, então é o segredo de maior
    valor do sistema. Nunca é escrita em disco: sai do Parameter Store direto
    para a memória do processo e morre com o container.
    """
    raw = get_secret("GOOGLE_SA_PARAM")
    try:
        return json.loads(raw)
    except json.JSONDecodeError as exc:
        raise SecretUnavailable(
            "O parametro da service account do Google nao contem JSON valido."
        ) from exc


def default_max_rows() -> int:
    return int(os.environ.get("PLUM_MAX_ROWS", "200000"))


def signature_max_age_seconds() -> int:
    """Janela em que um payload assinado continua válido."""
    return int(os.environ.get("PLUM_SIGNATURE_MAX_AGE", "120"))
