"""
Paridade entre `_strip_accents` (aqui) e `normalizar` (TypeScript).

⚠️ Tabela REPLICADA de `supabase/functions/_shared/entidade.test.ts`
(`CASOS_DE_NORMALIZACAO`). É a **segunda** dívida de duas normalizações no
projeto, e é de natureza pior que a primeira.

A primeira é o nome de COLUNA (`src/lib/colunas.ts` × `query_engine/sheets.py`,
D-017): divergir lá vira "coluna não encontrada" — falha fechada e barulhenta.

Esta é o VALOR de texto, e o caminho é outro: o resolvedor de entidade (B04,
TypeScript) escolhe um literal do vocabulário; o executor (aqui) depois filtra
por ele no `where`. Se as duas normalizações divergirem, o resolvedor acerta o
literal, o `where` não casa, e a pergunta volta **com zero linhas**. Nenhum
erro, nenhum log, nenhum sintoma — só uma resposta vazia que parece um dado
ausente.

⭐ Não há como compartilhar código entre Deno e o Lambda. Esta tabela é a única
coisa que segura as duas implementações juntas. **Mudou um lado, mude o outro e
os dois testes.**
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from query_engine.pandas_executor import _strip_accents  # noqa: E402


# ⚠️ REPLICADA de `_shared/entidade.test.ts`.
_CASOS_CONTRATO = [
    ("João Silva", "JOAO SILVA"),
    ("  joao silva  ", "JOAO SILVA"),
    ("JOÃO DA SILVA", "JOAO DA SILVA"),
    ("ação", "ACAO"),
    ("Ünïcôdé", "UNICODE"),
    ("ACME LTDA", "ACME LTDA"),
    ("", ""),
    ("   ", ""),
    # ⚠️ Espaço interno NÃO é colapsado, e pontuação fica. Os dois lados têm de
    # ser IGUAIS, não espertos — quem cobre grafia diferente é a distância de
    # edição do resolvedor, que roda em cima disto.
    ("JOAO  SILVA", "JOAO  SILVA"),
    ("ACME, LTDA.", "ACME, LTDA."),
    ("12.345.678/0001-90", "12.345.678/0001-90"),
]


@pytest.mark.parametrize("entrada,esperado", _CASOS_CONTRATO)
def test_normalizacao_bate_com_o_typescript(entrada, esperado):
    assert _strip_accents(entrada) == esperado


@pytest.mark.parametrize("entrada,_esperado", _CASOS_CONTRATO)
def test_normalizar_duas_vezes_da_no_mesmo(entrada, _esperado):
    """
    Idempotência. O valor passa pela normalização mais de uma vez no caminho —
    o resolvedor normaliza para comparar, o executor normaliza para filtrar — e
    uma função que muda o resultado na segunda passada quebraria o casamento
    sem que nenhum caso acima falhasse.
    """
    uma = _strip_accents(entrada)
    assert _strip_accents(uma) == uma


def test_nao_estoura_com_nao_string():
    """A célula do Sheets pode vir número, data ou vazia."""
    assert _strip_accents(42) == "42"
    assert _strip_accents(None) == "NONE"
