"""
Montagem de faixas A1 para a API do Google Sheets.

O teste de aba com espaço existe por causa de um bug real: a primeira versão
deste módulo montava `Vendas 2026!A2:A`, que o Google recusa. O
`sheets_client.py` do bmchad tratava esse caso e este não; a correção veio de
lá.
"""

import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from query_engine.sheets import (  # noqa: E402
    SERVICE_ACCOUNT_EMAIL,
    SheetError,
    _col_letter,
    _quoted_sheet,
    _ranges_for,
    _translate,
)


class TestColLetter:
    def test_primeiras_colunas(self):
        assert _col_letter(0) == "A"
        assert _col_letter(25) == "Z"

    def test_vira_duas_letras_depois_de_z(self):
        assert _col_letter(26) == "AA"
        assert _col_letter(27) == "AB"
        assert _col_letter(51) == "AZ"
        assert _col_letter(52) == "BA"

    def test_tres_letras(self):
        assert _col_letter(701) == "ZZ"
        assert _col_letter(702) == "AAA"


class TestQuotedSheet:
    def test_nome_simples_nao_leva_aspas(self):
        assert _quoted_sheet("Sheet1") == "Sheet1"
        assert _quoted_sheet("producao") == "producao"

    def test_nome_com_espaco_leva_aspas(self):
        # Sem isto: `Vendas 2026!A2:A`, que a API recusa.
        assert _quoted_sheet("Vendas 2026") == "'Vendas 2026'"

    def test_apostrofo_no_nome_e_duplicado(self):
        # Na notação A1 do Sheets, apóstrofo dentro de nome citado vira dois.
        assert _quoted_sheet("Vendas d'Água") == "'Vendas d''Água'"

    def test_acento_sozinho_nao_exige_aspas(self):
        assert _quoted_sheet("Produção") == "Produção"


class TestRangesFor:
    HEADERS = ["regiao", "vendedor", "faturamento", "margem_lucro"]

    def test_monta_faixa_das_colunas_pedidas(self):
        ranges, nomes = _ranges_for(self.HEADERS, {"regiao", "faturamento"}, "Sheet1")
        assert ranges == ["Sheet1!A2:A", "Sheet1!C2:C"]
        assert nomes == ["regiao", "faturamento"]

    def test_respeita_a_ordem_do_cabecalho_nao_a_do_conjunto(self):
        # `columns` é um set, então a ordem tem que vir do cabeçalho, senão
        # `nomes` e `ranges` sairiam desalinhados e cada coluna receberia os
        # valores de outra.
        _, nomes = _ranges_for(self.HEADERS, {"faturamento", "regiao"}, "Sheet1")
        assert nomes == ["regiao", "faturamento"]

    def test_aba_com_espaco_gera_faixa_valida(self):
        ranges, _ = _ranges_for(self.HEADERS, {"regiao"}, "Vendas 2026")
        assert ranges == ["'Vendas 2026'!A2:A"]

    def test_coluna_inexistente_falha_nomeando_qual(self):
        with pytest.raises(SheetError) as exc:
            _ranges_for(self.HEADERS, {"regiao", "cpf"}, "Sheet1")
        assert "cpf" in str(exc.value)
        # A mensagem precisa sugerir a causa provável, senão vira suporte.
        assert "mudado" in str(exc.value)

    def test_nunca_carrega_coluna_alem_das_pedidas(self):
        # margem_lucro está no cabeçalho mas não foi pedida: não pode aparecer.
        ranges, nomes = _ranges_for(self.HEADERS, {"regiao"}, "Sheet1")
        assert nomes == ["regiao"]
        assert len(ranges) == 1


# ─────────────────────────────────────────────────────────────────────────────
# Tradução de erro do Google
#
# Aba errada é 400 ("Unable to parse range"), não 404. Sem tratar esse status a
# frase que chegava ao usuário era "Nao consegui ler a planilha agora." — a
# genérica de erro inesperado. Em 2026-08-10 isso escondeu a causa real (o campo
# `datasets.google_sheet_tab` no default 'Sheet1' numa planilha cuja aba tem
# outro nome) atrás de uma mensagem que não dava nenhuma pista.
# ─────────────────────────────────────────────────────────────────────────────


class _Resp:
    def __init__(self, status):
        self.status = status


class _ErroGoogle(Exception):
    """Imita o `HttpError` do googleapiclient no que importa: `.resp.status`."""

    def __init__(self, status, msg="Unable to parse range: Sheet1!1:1"):
        super().__init__(msg)
        self.resp = _Resp(status)


class _ServicoComAbas:
    """Devolve os títulos das abas, como o `spreadsheets.get` real devolveria."""

    def __init__(self, titulos, falha=False):
        self._titulos = titulos
        self._falha = falha

    def spreadsheets(self):
        return self

    def get(self, **_kwargs):
        return self

    def execute(self):
        if self._falha:
            raise RuntimeError("sem acesso nem para listar")
        return {"sheets": [{"properties": {"title": t}} for t in self._titulos]}


class TestTranslate:
    def test_400_nomeia_a_aba_e_lista_as_que_existem(self):
        servico = _ServicoComAbas(["tabela-de-estudos", "notas"])
        erro = _translate(_ErroGoogle(400), "1nxcqq", service=servico, tab="Sheet1")
        msg = str(erro)
        assert "Sheet1" in msg
        assert "tabela-de-estudos" in msg
        assert "notas" in msg
        # A genérica não pode sobreviver aqui: era ela que escondia a causa.
        assert "Nao consegui ler a planilha agora" not in msg

    def test_400_ainda_e_util_quando_nem_listar_as_abas_funciona(self):
        # O fallback não pode virar a mensagem genérica de novo: mesmo sem a
        # lista, dizer QUAL aba falhou já resolve o caso na configuração.
        servico = _ServicoComAbas([], falha=True)
        erro = _translate(_ErroGoogle(400), "1nxcqq", service=servico, tab="Sheet1")
        msg = str(erro)
        assert "Sheet1" in msg
        assert "Nao consegui ler a planilha agora" not in msg

    def test_400_sem_service_nao_explode(self):
        # `_translate` é chamado de dois lugares; nenhum pode virar 500 por
        # causa da própria tradução do erro.
        erro = _translate(_ErroGoogle(400), "1nxcqq", tab="Sheet1")
        assert "Sheet1" in str(erro)

    def test_403_continua_dizendo_o_email_da_conta_de_servico(self):
        erro = _translate(_ErroGoogle(403), "1nxcqq", tab="Sheet1")
        assert SERVICE_ACCOUNT_EMAIL in str(erro)

    def test_404_e_429_nao_mudaram(self):
        assert "apagada" in str(_translate(_ErroGoogle(404), "x", tab="Sheet1"))
        assert "excesso" in str(_translate(_ErroGoogle(429), "x", tab="Sheet1"))

    def test_status_desconhecido_continua_na_generica(self):
        # 500 do Google não é problema de configuração: a frase genérica está
        # certa ali, e trocá-la mandaria o usuário conferir a aba sem motivo.
        assert "Nao consegui ler a planilha agora" in str(
            _translate(_ErroGoogle(500), "x", tab="Sheet1")
        )
