"""
Adaptador entre o Function URL do Lambda e o app FastAPI.

Mangum traduz o evento do API Gateway / Function URL para ASGI. O app em
main.py continua rodando localmente com uvicorn sem saber que existe Lambda,
o que mantém o teste local honesto.
"""

from mangum import Mangum

from query_engine.main import app

# lifespan="off": Function URL nao tem ciclo de startup/shutdown de servidor
# de longa duracao; deixar ligado gera timeout no cold start.
handler = Mangum(app, lifespan="off")
