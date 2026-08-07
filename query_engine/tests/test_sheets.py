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
    SheetError,
    _col_letter,
    _quoted_sheet,
    _ranges_for,
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
