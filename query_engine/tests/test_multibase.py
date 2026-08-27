"""
Multi-base: o `from` do plano manda, e cada base tem as PERMISSÕES dela.

Blocos B18 e B19 da Etapa 3. Dois assuntos entram aqui juntos de propósito,
porque separá-los esconderia a coisa que importa: **a regra que decide qual base
um pedido usa é a mesma que decide contra qual `allowed_columns` ele é
autorizado.** Duas implementações divergiriam em silêncio, e a divergência seria
autorizar contra a base A e executar sobre a base B.

⚠️ O grupo de compatibilidade no fim não é formalidade. Todo card salvo em
produção — inclusive os dos quatro clientes pagantes — carrega
`"from": "producao"`, porque o `main.py` sobrescrevia o `from` antes de executar.
Respeitar o `from` sem a ponte apagaria o dashboard de todo mundo no minuto da
publicação.
"""

import json
import sys
import time
from pathlib import Path

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

try:
    from fastapi.testclient import TestClient
except Exception as exc:  # noqa: BLE001
    pytest.skip(
        f"TestClient indisponivel ({type(exc).__name__}). "
        "Instale: pip install -r query_engine/requirements-dev.txt",
        allow_module_level=True,
    )

from query_engine import config, main, sheets  # noqa: E402
from query_engine.pandas_executor import (  # noqa: E402
    TabelaNaoEncontradaError,
    execute_plan,
    resolver_nome_da_tabela,
)
from query_engine.security import sign  # noqa: E402

SEGREDO = "segredo-de-teste"

# Duas planilhas com uma coluna de nome IGUAL (`valor`) e uma de nome diferente.
# A coluna homônima é o ponto: é ela que um `allowed_columns` global do turno
# deixaria vazar de uma base para a outra sem que a comparação de conjuntos
# percebesse nada.
BASES = {
    "planilha-vendas": pd.DataFrame(
        {"regiao": ["Sul", "Norte"], "valor": [10.0, 20.0]}
    ),
    "planilha-rh": pd.DataFrame(
        {"setor": ["TI", "RH"], "valor": [900.0, 800.0], "salario": [5000.0, 4000.0]}
    ),
}


@pytest.fixture(autouse=True)
def ambiente(monkeypatch):
    monkeypatch.setenv("HMAC_SECRET_PARAM_VALUE", SEGREDO)
    config.get_secret.cache_clear()

    leituras = []

    def fake_load(
        service, sheet_id, tab, columns, max_rows=None, tab_gid=None,
        tolerar_ausentes=False,
    ):
        leituras.append({"sheet_id": sheet_id, "colunas": set(columns), "tab": tab})
        if sheet_id not in BASES:
            raise sheets.SheetError(f"planilha {sheet_id} nao compartilhada")
        base = BASES[sheet_id]
        achadas = [c for c in base.columns if c in columns]
        if not achadas:
            return pd.DataFrame()
        return base[achadas].copy()

    monkeypatch.setattr(sheets, "load_columns", fake_load)
    monkeypatch.setattr(main, "_google_service", lambda: object())
    yield leituras
    config.get_secret.cache_clear()


@pytest.fixture
def client():
    return TestClient(main.app)


def _soma(col, rotulo="total"):
    return {"select": [{"expr": {"agg": "sum", "col": col}, "as": rotulo}]}


def _plano(card_id, plan, resolved):
    return {"card_id": card_id, "plan": plan, "resolved_columns": resolved}


def _post(client, corpo_dict, assinar_com=SEGREDO):
    corpo_dict.setdefault("issued_at", int(time.time()))
    corpo = json.dumps(corpo_dict).encode()
    return client.post(
        "/execute",
        content=corpo,
        headers={
            "X-Plum-Signature": sign(corpo, assinar_com),
            "Content-Type": "application/json",
        },
    )


def _por_card(resposta):
    return {r["card_id"]: r for r in resposta.json()["results"]}


# ─────────────────────────────────────────────────────────────────────────────
# B18 · a resolução do `from`, na unidade
# ─────────────────────────────────────────────────────────────────────────────

class TestResolucaoDoFrom:
    def test_nome_exato_ganha(self):
        assert resolver_nome_da_tabela({"from": "vendas"}, ["vendas", "rh"]) == "vendas"

    def test_uma_tabela_so_aceita_from_ausente(self):
        # O caso do card antigo que nunca teve `from`.
        assert resolver_nome_da_tabela({}, ["qualquer_nome"]) == "qualquer_nome"

    def test_uma_tabela_so_aceita_o_apelido_producao(self):
        # ⭐ A ponte do legado: o card salvo diz "producao", a base real tem
        # outro nome, e há uma só. Cai nela.
        assert resolver_nome_da_tabela({"from": "producao"}, ["vendas"]) == "vendas"

    def test_com_duas_tabelas_o_apelido_NAO_vale(self):
        # ⛔ Aqui "producao" não é apelido de nada, e adivinhar devolveria o
        # número de uma base com o rótulo de outra.
        with pytest.raises(TabelaNaoEncontradaError) as erro:
            resolver_nome_da_tabela({"from": "producao"}, ["vendas", "rh"])
        # A mensagem lista o que existe: é o que torna o erro acionável.
        assert "vendas" in str(erro.value) and "rh" in str(erro.value)

    def test_nome_errado_LEVANTA_em_vez_de_devolver_error(self):
        # ⚠️ Era `{"error": ...}` de retorno até 2026-08-27, e um dict com `error`
        # dentro chega ao card como card VAZIO, em silêncio. Ver T8.
        with pytest.raises(TabelaNaoEncontradaError):
            resolver_nome_da_tabela({"from": "inexistente"}, ["vendas", "rh"])

    def test_execute_plan_respeita_o_from_entre_duas_tabelas(self):
        tabelas = {"vendas": BASES["planilha-vendas"], "rh": BASES["planilha-rh"]}
        de_vendas = execute_plan({**_soma("valor"), "from": "vendas"}, tabelas)
        de_rh = execute_plan({**_soma("valor"), "from": "rh"}, tabelas)
        # Mesmo nome de coluna, bases diferentes, números diferentes. Se o `from`
        # fosse ignorado os dois seriam iguais.
        assert de_vendas["rows"][0]["total"] == 30.0
        assert de_rh["rows"][0]["total"] == 1700.0


# ─────────────────────────────────────────────────────────────────────────────
# B19 · o payload com N bases, e a autorização por base
# ─────────────────────────────────────────────────────────────────────────────

def _payload_duas_bases(plans):
    return {
        # ⚠️ Os campos do topo continuam presentes e são IGNORADOS quando `bases`
        # vem preenchido. Ficam aqui de propósito: é o payload que a Edge
        # Function real manda durante a transição, e um teste que os omitisse não
        # provaria que eles não interferem.
        "sheet_id": "planilha-vendas",
        "allowed_columns": ["salario", "valor", "regiao", "setor"],
        "bases": [
            {
                "nome": "vendas",
                "sheet_id": "planilha-vendas",
                "allowed_columns": ["regiao", "valor"],
            },
            {
                "nome": "rh",
                "sheet_id": "planilha-rh",
                # ⛔ `salario` NÃO está aqui. Está no `allowed_columns` do topo.
                "allowed_columns": ["setor", "valor"],
            },
        ],
        "plans": plans,
    }


class TestAutorizacaoPorBase:
    def test_duas_bases_num_lote_devolvem_numeros_de_cada_uma(self, client):
        r = _post(client, _payload_duas_bases([
            _plano("c-vendas", {**_soma("valor"), "from": "vendas"}, ["valor"]),
            _plano("c-rh", {**_soma("valor"), "from": "rh"}, ["valor"]),
        ]))
        assert r.status_code == 200
        cards = _por_card(r)
        assert cards["c-vendas"]["status"] == "ok"
        assert cards["c-rh"]["status"] == "ok"
        assert cards["c-vendas"]["rows"][0]["total"] == 30.0
        assert cards["c-rh"]["rows"][0]["total"] == 1700.0

    def test_uma_leitura_do_google_POR_BASE(self, client, ambiente):
        _post(client, _payload_duas_bases([
            _plano("a", {**_soma("valor"), "from": "vendas"}, ["valor"]),
            _plano("b", {**_soma("valor", "t2"), "from": "vendas"}, ["valor"]),
            _plano("c", {**_soma("valor"), "from": "rh"}, ["valor"]),
        ]))
        # Três cards, duas bases => duas leituras. Uma por card seria cota jogada
        # fora; uma no total não daria para servir as duas planilhas.
        assert len(ambiente) == 2
        assert {l["sheet_id"] for l in ambiente} == {"planilha-vendas", "planilha-rh"}

    def test_permissao_de_UMA_base_nao_vale_na_outra(self, client):
        # ⭐⭐ O teste central do B19. `salario` está no `allowed_columns` do TOPO
        # e não no da base `rh`. Com uma lista global do turno isto passaria.
        r = _post(client, _payload_duas_bases([
            _plano("c-vazamento", {**_soma("salario"), "from": "rh"}, ["salario"]),
        ]))
        cards = _por_card(r)
        assert cards["c-vazamento"]["status"] == "forbidden"

    def test_lote_misto_aprova_um_e_nega_outro(self, client):
        r = _post(client, _payload_duas_bases([
            _plano("bom", {**_soma("valor"), "from": "vendas"}, ["valor"]),
            _plano("ruim", {**_soma("salario"), "from": "rh"}, ["salario"]),
        ]))
        cards = _por_card(r)
        # ⚠️ Negar um não pode derrubar o outro: é a promessa da negação parcial.
        assert cards["bom"]["status"] == "ok"
        assert cards["ruim"]["status"] == "forbidden"

    def test_coluna_permitida_em_A_e_proibida_em_B(self, client):
        # `regiao` é permitida em `vendas` e não está no allowed de `rh`.
        r = _post(client, _payload_duas_bases([
            _plano("em-vendas", {**_soma("valor"), "group_by": ["regiao"],
                                 "from": "vendas"}, ["valor", "regiao"]),
            _plano("em-rh", {**_soma("valor"), "group_by": ["regiao"],
                             "from": "rh"}, ["valor", "regiao"]),
        ]))
        cards = _por_card(r)
        assert cards["em-vendas"]["status"] == "ok"
        assert cards["em-rh"]["status"] == "forbidden"

    def test_from_inexistente_vira_error_do_card_nao_500(self, client):
        r = _post(client, _payload_duas_bases([
            _plano("fantasma", {**_soma("valor"), "from": "estoque"}, ["valor"]),
        ]))
        assert r.status_code == 200
        card = _por_card(r)["fantasma"]
        # ⚠️ `error`, não `forbidden`: nada foi negado por cargo. É plano
        # malformado — o planejador nomeou uma planilha que não veio.
        assert card["status"] == "error"
        assert "estoque" in card["error"]

    def test_planilha_ilegivel_derruba_SO_os_cards_dela(self, client):
        corpo = _payload_duas_bases([
            _plano("sobrevive", {**_soma("valor"), "from": "vendas"}, ["valor"]),
            _plano("morre", {**_soma("valor"), "from": "quebrada"}, ["valor"]),
        ])
        corpo["bases"].append({
            "nome": "quebrada",
            "sheet_id": "planilha-que-nao-existe",
            "allowed_columns": ["valor"],
        })
        cards = _por_card(_post(client, corpo))
        # ⭐ Antes do B19 havia uma base e um `return` global era o certo. Com N,
        # derrubar o lote porque uma planilha perdeu o compartilhamento
        # esconderia as respostas que ainda dão.
        assert cards["sobrevive"]["status"] == "ok"
        assert cards["morre"]["status"] == "error"

    def test_card_id_REPETIDO_nao_faz_um_pedido_herdar_a_base_do_outro(self, client):
        """
        ⛔⛔ Regressão de bypass de RBAC, achada em revisão antes de publicar.

        O `card_id` vem do PLANEJADOR — é um id emitido por um LLM — e nada
        garante que seja único no lote. Uma implementação que guardasse
        `{card_id: base}` num dict colapsaria os dois pedidos abaixo na base do
        último, e o de `vendas` executaria sobre `rh`, contra cujo
        `allowed_columns` ele nunca foi autorizado.

        Aqui os dois pedidos têm o MESMO id e bases DIFERENTES. Cada um tem de
        ficar na sua.
        """
        r = _post(client, _payload_duas_bases([
            _plano("id-repetido", {**_soma("valor"), "from": "vendas"}, ["valor"]),
            _plano("id-repetido", {**_soma("valor"), "from": "rh"}, ["valor"]),
        ]))
        somas = sorted(
            res["rows"][0]["total"]
            for res in r.json()["results"] if res["status"] == "ok"
        )
        # 30 de vendas e 1700 de rh. Dois números iguais significaria que os
        # dois pedidos rodaram sobre a mesma base.
        assert somas == [30.0, 1700.0]

    def test_duas_bases_com_o_mesmo_nome_e_recusado(self, client):
        corpo = _payload_duas_bases([
            _plano("x", {**_soma("valor"), "from": "vendas"}, ["valor"]),
        ])
        corpo["bases"][1]["nome"] = "vendas"
        # Qual ganha dependeria da ordem do dict — e seria a permissão da outra.
        assert _post(client, corpo).status_code == 400


# ─────────────────────────────────────────────────────────────────────────────
# Compatibilidade · o payload de UMA base, que é o que está no ar
# ─────────────────────────────────────────────────────────────────────────────

class TestCompatibilidadeLegado:
    def _payload_legado(self, plan, resolved):
        # Sem `bases`: exatamente o que a Edge Function publicada manda hoje.
        return {
            "sheet_id": "planilha-vendas",
            "tab": "Sheet1",
            "plans": [_plano("card-legado", plan, resolved)],
            "allowed_columns": ["regiao", "valor"],
            "formatting_rules": {},
        }

    def test_card_salvo_com_from_producao_continua_funcionando(self, client):
        # ⚠️ Este é o caso de TODO card em produção hoje.
        r = _post(client, self._payload_legado(
            {**_soma("valor"), "from": "producao"}, ["valor"]))
        card = _por_card(r)["card-legado"]
        assert card["status"] == "ok"
        assert card["rows"][0]["total"] == 30.0

    def test_plano_sem_from_nenhum_continua_funcionando(self, client):
        r = _post(client, self._payload_legado(_soma("valor"), ["valor"]))
        assert _por_card(r)["card-legado"]["status"] == "ok"

    def test_allowed_columns_do_topo_ainda_barra_no_payload_legado(self, client):
        # A barreira 4 não pode ter ficado frouxa para quem não manda `bases`.
        corpo = self._payload_legado({**_soma("salario")}, ["salario"])
        assert _por_card(_post(client, corpo))["card-legado"]["status"] == "forbidden"
