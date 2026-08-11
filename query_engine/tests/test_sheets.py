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

from query_engine import sheets as sheets_mod  # noqa: E402
from query_engine.sheets import (  # noqa: E402
    SERVICE_ACCOUNT_EMAIL,
    SheetError,
    _col_letter,
    _quoted_sheet,
    _ranges_for,
    _translate,
    mapa_de_abas,
    normalizar_coluna,
    resolver_aba,
)

# ─────────────────────────────────────────────────────────────────────────────
# ⚠️ Tabela REPLICADA de `src/lib/colunas.test.ts` (`CASOS_CONTRATO`).
#
# A mesma normalização vive em duas linguagens porque não há como compartilhar
# código entre o browser e o Lambda. Esta tabela é a defesa contra as duas
# divergirem em silêncio: mudou um caso de um lado, muda do outro, ou um dos
# testes fica vermelho.
#
# Os casos em maiúscula com acento são a planilha real que expôs o problema em
# 2026-08-11: o front gravava `estudo` no schema_metadata e o executor procurava
# essa string crua num cabeçalho que dizia `ESTUDO`.
# ─────────────────────────────────────────────────────────────────────────────

_CASOS_CONTRATO = [
    ("BACIA", "bacia"),
    ("ESTUDO", "estudo"),
    ("EMPRESA", "empresa"),
    ("NATUREZA DA AQUISIÇÃO", "natureza_da_aquisicao"),
    ("DATA CONCLUSÃO", "data_conclusao"),
    ("TITULARIDADE", "titularidade"),
    ("NOME DO ESTUDO", "nome_do_estudo"),
    ("Ação", "acao"),
    ("Preço Médio", "preco_medio"),
    ("Região", "regiao"),
    ("Município", "municipio"),
    ("Área (m²)", "area_m"),
    ("faturamento", "faturamento"),
    ("nome_do_estudo", "nome_do_estudo"),
    ("Faturamento / Receita", "faturamento_receita"),
    ("  espaço  duplo  ", "espaco_duplo"),
    ("A--B__C", "a_b_c"),
    ("Total (R$)", "total_r"),
    ("% de Margem", "de_margem"),
    ("", ""),
    ("   ", ""),
    ("---", ""),
    ("%", ""),
    ("2026", "2026"),
    ("Vendas 2026", "vendas_2026"),
    ("CNPJ/CPF", "cnpj_cpf"),
]


class TestNormalizarColuna:
    @pytest.mark.parametrize("entrada,esperado", _CASOS_CONTRATO)
    def test_contrato_com_o_typescript(self, entrada, esperado):
        assert normalizar_coluna(entrada) == esperado

    @pytest.mark.parametrize("entrada,_esperado", _CASOS_CONTRATO)
    def test_e_idempotente(self, entrada, _esperado):
        # O nome normalizado é gravado e renormalizado do outro lado; sem
        # idempotência a segunda passagem divergiria da primeira.
        uma = normalizar_coluna(entrada)
        assert normalizar_coluna(uma) == uma

    @pytest.mark.parametrize("entrada,_esperado", _CASOS_CONTRATO)
    def test_nunca_sai_com_sublinhado_nas_pontas_nem_repetido(self, entrada, _esperado):
        saida = normalizar_coluna(entrada)
        assert not saida.startswith("_")
        assert not saida.endswith("_")
        assert "__" not in saida

    def test_aceita_o_que_nao_e_string(self):
        # O cabeçalho vem de JSON do Google; célula numérica chega como número.
        assert normalizar_coluna(2026) == "2026"
        assert normalizar_coluna(None) == "none"


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


class TestRangesForCabecalhoNaoNormalizado:
    """
    O caso real de 2026-08-11: a planilha tem o cabeçalho original e o
    `schema_metadata` tem o nome normalizado. A comparação era de string crua.
    """

    # Cabeçalho exato da planilha `tabela-de-estudos`. A coluna A, com o nome do
    # estudo, está SEM cabeçalho — e é isso que a torna inendereçável.
    REAL = ["", "BACIA", "ESTUDO", "EMPRESA", "NATUREZA DA AQUISIÇÃO",
            "DATA CONCLUSÃO", "TITULARIDADE"]

    def test_acha_coluna_em_maiuscula(self):
        # Hífen não exige aspas na notação A1 — só espaço e apóstrofo exigem,
        # e é o que `_quoted_sheet` decide (TestQuotedSheet acima).
        ranges, nomes = _ranges_for(self.REAL, {"estudo"}, "tabela-de-estudos")
        assert ranges == ["tabela-de-estudos!C2:C"]
        # O nome tem que sair NORMALIZADO: ele vira a coluna do DataFrame, e o
        # Query Plan pede por `estudo`. Saindo `ESTUDO`, o dado é carregado e
        # fica inalcançável no pandas_executor.
        assert nomes == ["estudo"]

    def test_acha_coluna_com_acento_e_espaco(self):
        ranges, nomes = _ranges_for(self.REAL, {"natureza_da_aquisicao"}, "aba")
        assert ranges == ["aba!E2:E"]
        assert nomes == ["natureza_da_aquisicao"]

    def test_varias_colunas_saem_na_ordem_da_planilha(self):
        _, nomes = _ranges_for(self.REAL, {"titularidade", "bacia"}, "aba")
        assert nomes == ["bacia", "titularidade"]

    def test_coluna_sem_cabecalho_e_reportada_como_tal(self):
        # A coluna A tem os nomes dos estudos, mas nenhum título: não existe
        # nome pelo qual pedir. Inventar um ("coluna_a") seria adivinhar.
        with pytest.raises(SheetError) as exc:
            _ranges_for(self.REAL, {"nome_do_estudo"}, "tabela-de-estudos")
        msg = str(exc.value)
        assert "nome_do_estudo" in msg
        assert "SEM cabecalho" in msg

    def test_erro_lista_os_cabecalhos_encontrados(self):
        # Dizer só o que faltou obrigava a abrir a planilha para descobrir que a
        # coluna existia e só estava em maiúscula. Custou uma ida e volta.
        with pytest.raises(SheetError) as exc:
            _ranges_for(self.REAL, {"cpf"}, "aba")
        msg = str(exc.value)
        assert "cpf" in msg
        assert "BACIA" in msg and "bacia" in msg

    def test_cabecalho_ambiguo_e_erro_e_nao_a_primeira_ocorrencia(self):
        # `Receita (R$)` e `Receita R` normalizam para `receita_r`. Pegar a
        # primeira devolveria uma coluna com o rótulo da outra — número errado
        # com cara de certo.
        with pytest.raises(SheetError) as exc:
            _ranges_for(["Receita (R$)", "Receita R"], {"receita_r"}, "aba")
        msg = str(exc.value)
        assert "mesmo nome" in msg
        assert "Renomeie" in msg

    def test_ambiguidade_em_coluna_nao_pedida_nao_atrapalha(self):
        # Só importa a ambiguidade do que está sendo carregado.
        ranges, nomes = _ranges_for(["Receita (R$)", "Receita R", "BACIA"], {"bacia"}, "aba")
        assert nomes == ["bacia"]
        assert ranges == ["aba!C2:C"]


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


# ─────────────────────────────────────────────────────────────────────────────
# Resolução da aba pelo gid
#
# O banco guarda o gid (estável a rename) e a API do Sheets só aceita nome de
# aba em range, então a tradução acontece no executor. `google_sheet_tab` fica
# como caminho legado, para linhas sem gid.
# ─────────────────────────────────────────────────────────────────────────────


class _ServicoComGids:
    """`spreadsheets.get(fields=sheets.properties(sheetId,title))` fingido."""

    def __init__(self, abas):
        self._abas = abas          # {gid: titulo}
        self.chamadas = 0

    def spreadsheets(self):
        return self

    def get(self, **_kwargs):
        return self

    def execute(self):
        self.chamadas += 1
        return {
            "sheets": [
                {"properties": {"sheetId": g, "title": t}} for g, t in self._abas.items()
            ]
        }


class TestResolverAba:
    def setup_method(self):
        # Cache é global ao processo; sem limpar, um teste contamina o outro.
        sheets_mod._abas_cache.clear()

    ABAS = {991333939: "tabela-de-estudos", 0: "Sheet1", 42: "notas"}

    def test_gid_tem_precedencia_sobre_o_nome_gravado(self):
        # O caso real: banco com 'Sheet1' (o default que ninguém escreveu) e gid
        # apontando para a aba de verdade. Sem precedência do gid, o range sai
        # 'Sheet1'!... e o Google responde 400.
        servico = _ServicoComGids(self.ABAS)
        assert resolver_aba(servico, "1nx", "Sheet1", 991333939) == "tabela-de-estudos"

    def test_gid_zero_e_aba_valida_e_nao_cai_no_legado(self):
        # `if not tab_gid` aqui devolveria 'nome-errado' em vez de resolver.
        servico = _ServicoComGids(self.ABAS)
        assert resolver_aba(servico, "1nx", "nome-errado", 0) == "Sheet1"

    def test_sem_gid_usa_o_nome_gravado_e_nao_chama_o_google(self):
        # Linha legada (ID colado sozinho, ou base anterior à migration).
        servico = _ServicoComGids(self.ABAS)
        assert resolver_aba(servico, "1nx", "Vendas 2026", None) == "Vendas 2026"
        assert servico.chamadas == 0

    def test_gid_que_nao_existe_mais_e_erro_nomeando_as_abas(self):
        # Nunca cair no `tab`: leria uma aba que ninguém escolheu e devolveria
        # numero de outro recorte. R-08 — validação alerta, nunca corrige.
        servico = _ServicoComGids(self.ABAS)
        with pytest.raises(SheetError) as exc:
            resolver_aba(servico, "1nx", "Sheet1", 555)
        msg = str(exc.value)
        assert "555" in msg
        assert "tabela-de-estudos" in msg
        assert "Reconecte" in msg

    def test_gid_e_nome_concordando_resolve_igual(self):
        servico = _ServicoComGids(self.ABAS)
        assert resolver_aba(servico, "1nx", "notas", 42) == "notas"

    def test_mapa_de_abas_e_cacheado_por_planilha(self):
        # Uma requisição por planilha a cada 15 min, não uma por pergunta: sem o
        # cache, cada card do dashboard dobraria a conta de chamadas contra o
        # limite de 60/min do Google.
        servico = _ServicoComGids(self.ABAS)
        mapa_de_abas(servico, "1nx")
        mapa_de_abas(servico, "1nx")
        resolver_aba(servico, "1nx", "Sheet1", 42)
        assert servico.chamadas == 1

    def test_planilha_sem_aba_nenhuma_nao_explode(self):
        servico = _ServicoComGids({})
        with pytest.raises(SheetError) as exc:
            resolver_aba(servico, "1nx", "Sheet1", 7)
        assert "nenhuma" in str(exc.value)

    def test_aba_com_espaco_resolvida_por_gid_gera_faixa_valida(self):
        # Integra com _quoted_sheet: resolver por gid pode devolver nome com
        # espaço, e ali é onde a notação A1 exige aspas.
        servico = _ServicoComGids({9: "Vendas 2026"})
        titulo = resolver_aba(servico, "1nx", "Sheet1", 9)
        ranges, _ = _ranges_for(["regiao"], {"regiao"}, titulo)
        assert ranges == ["'Vendas 2026'!A2:A"]
