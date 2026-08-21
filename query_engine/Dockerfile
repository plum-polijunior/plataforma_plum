# Imagem base oficial da AWS para Lambda em Python. Já traz o Runtime
# Interface Client, então não precisamos empacotar o bootstrap à mão.
FROM public.ecr.aws/lambda/python:3.12

# Dependências primeiro, código depois: assim uma mudança de código não
# invalida a camada de dependências e o build no CI fica em segundos.
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN python -m pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# O código vive em query_engine/ para o import ser o mesmo em Lambda e local.
#
# ⚠️ ISTO ERA UMA LISTA, ARQUIVO POR ARQUIVO, ATÉ 2026-08-21. Um módulo novo
# (`metadados.py`, do B03) entrou no repositório, passou em todos os testes
# locais e no CI — e a imagem subiu sem ele. O `update-function-code` roda ANTES
# do smoke test no `query-engine.yml`, então a imagem quebrada substituiu a boa e
# só depois o teste avisou. O executor ficou fora do ar com
# `Runtime.ImportModuleError`.
#
# ⭐ A lista dava a ilusão de controle e custava um incidente: nada em lugar
# nenhum avisava que faltava uma linha aqui, e o teste que existia rodava contra
# o repositório, não contra a imagem.
#
# O glob resolve a classe inteira. `tests/` não entra (é subdiretório, e `COPY`
# com glob não é recursivo), e não há `.py` de rascunho no topo desta pasta —
# se um dia houver, ele viaja junto, e esse é um problema muito menor.
COPY *.py ${LAMBDA_TASK_ROOT}/query_engine/

# NENHUM SEGREDO ENTRA AQUI.
# A service account do Google e o segredo do HMAC são lidos em tempo de
# execução, do SSM Parameter Store, com a role de execução do Lambda. As
# variáveis abaixo guardam o CAMINHO do parâmetro, nunca o valor, e são
# definidas na configuração da função (não no Dockerfile):
#   GOOGLE_SA_PARAM=/plum/prod/google-sa-json
#   HMAC_SECRET_PARAM=/plum/prod/hmac-secret
# A extensão AWS Parameters and Secrets é anexada como layer na função e
# atende em localhost:2773 com cache local.

CMD ["query_engine.lambda_handler.handler"]
