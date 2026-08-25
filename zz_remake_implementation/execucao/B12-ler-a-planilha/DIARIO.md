# B12 · Ler a planilha antes de existir permissão — diário

**Data:** 2026-08-21 · **Escopo:** executor (`main.py`, `linhas.py`) e `ai-plum-chat`. Sem migration,
sem front.

Servidor puro. É o bloco que torna a inversão do cadastro possível — e é conferível de fora, com
`curl`, antes de qualquer tela mudar.

---

## ⭐ A pergunta é circular, e é por isso que existe um desvio

*"Quais são as colunas desta planilha?"* não pode passar pela barreira 4, porque quem pergunta ainda
não tem lista de colunas permitidas — **a resposta é o insumo para criar essa lista**. No cadastro
invertido a chamada acontece antes de existir `role_permissions`.

`descrever_cabecalhos` é a **única porta deste executor que não passa pela barreira 4**. O que
substitui a barreira, e precisa ser dito em voz alta:

1. **Nenhuma célula de dado é lida.** `sheets.get_meta` busca só a linha 1
   (`ranges=['Aba'!1:1]`) — cabeçalho e contagem de grade, uma requisição. Nome de coluna não é dado
   do negócio; é o endereçamento dele. Há um teste garantindo que `load_columns` **não** é chamado.
2. **As outras barreiras valem inteiras.** Assinatura HMAC e frescor continuam obrigatórios; há teste
   para o 401.
3. ⚠️⚠️ **O lote inteiro tem de ser `cabecalhos`.** Num lote misto, deixar passar daria a um pedido
   **com plano** uma carona para fora da barreira 4 — e a barreira 4 é a única coisa entre um Query
   Plan e a coluna de salário. Lote misto é `400`, com teste.

É o mesmo formato do desvio que o `metadados` do B03 faz sobre a autorização **por plano**; aqui o
desvio é sobre o **conjunto de colunas**.

---

## ⭐ A C11 deixa de ser silenciosa

Dois cabeçalhos que normalizam para o mesmo nome (`Número de Peças` e `numero de pecas`) fazem uma
coluna sumir do `schema_metadata` e, por tabela, do `allowed_columns`. Até hoje isso acontecia
**calado, na importação**.

Agora `cabecalhos` devolve `colisoes` — e o cadastro pode dizer *"renomeie uma destas"* no primeiro
passo, com a pessoa olhando a tela, em vez de a base nascer com uma coluna a menos que ninguém
procurou.

Junto vai `colunas_sem_titulo`: coluna sem nome não é endereçável e inventar um seria adivinhar
(I-08). Conta-se quantas há para o cadastro poder avisar.

---

## ⚠️ O teto do cadastro, e por que ele NÃO é um parâmetro

O cadastro precisa de mais que 5 linhas — é dele que sai o `vocabulario_util`, e uma coluna de texto
com cinco amostras parece idêntica tendo 12 valores distintos ou 12.000. **São 20.**

Mas 20 > `TETO_POR_PEDIDO = 5`, e esse 5 é do B10, cujo argumento inteiro é *"limite que se negocia
não é limite"*. Então:

- `TETO_DE_CADASTRO = 20` mora **em `linhas.py`**, ao lado do outro, com o motivo escrito;
- ⛔ é alcançado por uma **função própria** (`amostra_de_cadastro`), não por
  `amostra(..., teto=20)`. O que o chamador escolhe é o **tipo do pedido**, nunca o número de linhas
  — mesma postura que separa `registro` de `amostra`;
- há um teste que percorre as três funções públicas por *introspecção* e falha se alguma ganhar um
  parâmetro chamado `teto`, `limite`, `max_linhas` ou `n`.

⚠️ **`amostra_cadastro` não entra em `tipos_que_consomem_orcamento`**, e isso é decisão: ele roda
fora do chat, onde não há cota de usuário para debitar. Se um dia o A3 alcançar esse tipo, ele entra
na lista no mesmo commit — está escrito na docstring.

⭐ E ele **passa pela barreira 4 normalmente**: quando ele roda, o cadastro já concedeu as colunas ao
Admin. Quem pula a barreira é só o `cabecalhos`.

---

## A autorização da Edge Function é explícita, não herdada

Todo o resto do `ai-plum-chat` confere `allowed_columns` e deixa a RLS recortar por organização.
`handleCabecalhos` não tem `allowed_columns` para conferir, então confere à mão:

1. sessão válida; 2. perfil **ativo** e com organização; 3. cargo **Admin**; 4. **a base pertence à
organização do perfil**.

⚠️ **O item 4 é o que importa.** Sem ele isto viraria um leitor de cabeçalho de planilha de qualquer
organização para quem soubesse um `datasetId` — a forma exata do I-01.

Admin é conferido **por nome do cargo**, como o `DatabasePipeline` já faz ao conceder as colunas. Não
há flag booleana de admin no schema; se um dia houver, os dois lugares mudam juntos.

---

## Uma extração que o bloco forçou

`postarNoExecutor` — assina, chama, devolve o corpo. Nada de regra.

O executor passou a ter **dois** chamadores, e duas cópias da assinatura HMAC + SigV4 seria a forma
mais cara possível de divergir: o sintoma de uma delas ficar para trás é `401 assinatura invalida`
vindo de um caminho só, e **ninguém procura duplicação quando o erro diz "assinatura"**.

Ele lança em vez de devolver erro, de propósito: quem chama sabe o que dizer. O chat degrada para uma
frase genérica; o cadastro precisa repassar *"a planilha não foi compartilhada com o Plum"*, que é
acionável.

---

## Arquivos

**Editados:** `query_engine/main.py` (`descrever_cabecalhos`, o desvio antes da barreira 4, o ramo
`amostra_cadastro`) · `query_engine/linhas.py` (`TETO_DE_CADASTRO`, `amostra_de_cadastro`,
`_amostrar`) · `ai-plum-chat/index.ts` (`handleCabecalhos`, `postarNoExecutor`, a ação) ·
`tests/test_endpoint.py` (+7) · `tests/test_privacidade.py` (+6)

**Verificado:** `npm run test:py` — **387 testes** (eram 374) · `npm test` — **313** ·
`npx tsc --noEmit` limpo · bundle do `ai-plum-chat` fecha.

⛔ **Não tocado:** front, `ai-agents`, `dashboard-agent`, nenhuma migration.

## 👤 Falta

**Dois deploys**, e desta vez o Lambda vai junto. Ver o `MANUAL.md`.
