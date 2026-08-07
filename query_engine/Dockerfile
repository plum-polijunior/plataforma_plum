# Imagem base oficial da AWS para Lambda em Python. Já traz o Runtime
# Interface Client, então não precisamos empacotar o bootstrap à mão.
FROM public.ecr.aws/lambda/python:3.12

# Dependências primeiro, código depois: assim uma mudança de código não
# invalida a camada de dependências e o build no CI fica em segundos.
COPY requirements.txt ${LAMBDA_TASK_ROOT}/
RUN python -m pip install --no-cache-dir -r ${LAMBDA_TASK_ROOT}/requirements.txt

# O código vive em query_engine/ para o import ser o mesmo em Lambda e local.
COPY __init__.py           ${LAMBDA_TASK_ROOT}/query_engine/
COPY config.py             ${LAMBDA_TASK_ROOT}/query_engine/
COPY security.py           ${LAMBDA_TASK_ROOT}/query_engine/
COPY sheets.py             ${LAMBDA_TASK_ROOT}/query_engine/
COPY pandas_executor.py    ${LAMBDA_TASK_ROOT}/query_engine/
COPY main.py               ${LAMBDA_TASK_ROOT}/query_engine/
COPY lambda_handler.py     ${LAMBDA_TASK_ROOT}/query_engine/

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
