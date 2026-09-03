# B06 · A1 + A2 + cache + a chave — diário

**Data:** 2026-08-20 · **Escopo:** `ai-plum-chat` (ação nova), `_shared/`, uma migration, e o front.

⭐ **É onde o caminho `ad_hoc` passa a existir.** Depois de três blocos entregando peça sem
consumidor, o B02 (teto de cardinalidade), o B03 (`metadados`) e o B05 (`llm.ts`) são exercidos por
uma pergunta de verdade pela primeira vez.

---

## O que o plano dizia e o código pediu diferente

### 1. ⭐ O V7 se contradiz sobre o A2, e a contradição decide o bloco

A §1 lista a entrada do Reconhecedor como *"pergunta + metadados"*. A nota logo abaixo, na mesma
seção, diz que *"A2 depende só de (dataset, versão do dicionário) e vale para qualquer pergunta"* — e
é essa nota que justifica A1 e A2 serem **agentes separados**.

As duas não podem ser verdade. Com a pergunta na entrada, o cache só acertaria em pergunta repetida,
e a separação perderia inteiramente o motivo de existir.

**Resolvido em favor da nota: o A2 não recebe a pergunta.** Ele produz uma *leitura reutilizável da
base* — o que cada coluna significa, qual é o grão, quais valem buscar vocabulário. Quem cruza a base
com a pergunta é o A3.

O ganho é o critério de pronto do V7 §8 item 4: a partir da 2ª pergunta em qualquer base já vista, o
A2 não é chamado.

### 2. A chave do cache é uma digital, não uma coluna de versão

O V7 fala em "versão do dicionário". Não existe essa coluna, e criar uma exigiria lembrar de
incrementá-la em todo lugar que edita o `schema_metadata` — esquecer serviria reconhecimento **velho
para uma base nova**, que é falha silenciosa.

**Feito:** SHA-256 do `schema_metadata` canonicalizado. Digital não pode ser esquecida: ela muda
porque o conteúdo mudou.

⚠️ **E a canonicalização tem de ordenar as chaves em toda profundidade.** O `schema_metadata` vem do
banco como JSONB, cuja ordem de chave **não é garantida**. Sem ordenar, a mesma base produziria
digitais diferentes entre duas leituras, o cache nunca acertaria, e o sintoma seria "o A2 é chamado
toda vez" — que parece custo alto e é bug. Há teste.

### 3. ⭐ O modo sombra — senão A1 e A2 ficariam mais duas semanas sem realidade

O `ad_hoc_planejar` vai até o reconhecimento e **para**: quem transforma reconhecimento em pedidos é
o A3, que nasce no B07. Entregue assim, seria o quarto bloco seguido de código sem consumidor.

**Feito:** o `PlumChat.tsx` chama a ação **em paralelo** com a cadeia que responde de verdade, e joga
o resultado fora. O que fica é a linha em `plum_logs` com `caminho = 'ad_hoc'`, ao lado das linhas
`legado` **da mesma pergunta**, com o mesmo `turno_id`.

É o mesmo formato do modo observação do B02, e dá o que nenhum teste dá: A1 e A2 rodando sobre
pergunta de verdade, em base de verdade, com o custo aparecendo ao lado do custo da cadeia atual.

Três coisas o tornam seguro, e nenhuma é opcional: `void` + `.catch()` (não é aguardado e não pode
rejeitar), retorno imediato quando `remake_habilitado` está desligado (o caso de toda organização
hoje — uma chamada barata, sem LLM), e o **mesmo `turno_id`**, que é o que permite comparar as duas
cadeias par a par em vez de em agregado.

### 4. O `handleExecutePlan` ganhou dois parâmetros opcionais em vez de ser extraído

O `ad_hoc_planejar` precisa do mesmo contexto que o `execute_plan` já resolve: perfil, cargo, base,
`allowed_columns`, assinatura, chamada ao Lambda. Extrair tudo isso seria o movimento limpo — e
mexeria na função que responde as perguntas hoje.

**Feito:** `handleExecutePlan(req, datasetId, plan, opcoes?)`. Sem `opcoes`, o comportamento é
idêntico ao de antes do bloco. Com `{tipo: "metadados", caminho: "ad_hoc"}`, ele pula o
`authorizePlan` (não há plano) e usa `allowed_columns` como colunas pedidas.

⚠️ **O desvio do `authorizePlan` não é atalho.** Chamá-lo com `{}` devolveria "nenhuma coluna", o
executor descreveria uma base vazia, e o A2 receberia nada — sem erro em lugar nenhum.

### 5. O porteiro é fail-**open**, e é decisão

Falha do provedor ou JSON inválido **não bloqueiam**. O porteiro é filtro de escopo, não trava de
segurança: quem protege dado é o RBAC de coluna, que roda depois e não depende de LLM. Fechar aqui
por erro de rede transformaria uma indisponibilidade do Gemini em *"sua pergunta é inválida"* —
mentira, e a pessoa reformularia uma pergunta que estava certa.

Mesma postura do Z-dash (D-023), pelo mesmo motivo.

### 6. Prompts em `.ts`, não em `.md`

O plano pedia um arquivo por prompt, em `prompts/`. Ficaram `.ts` exportando template literal: import
de `.md` como texto depende de suporte do bundler (eszip), e prompt que não carrega derruba a função
no boot — o modo de falha que a §0.4 do V3 descreve como o pior possível. O objetivo do plano era
diff legível, e um `.ts` com uma constante entrega isso igual.

---

## Decisões

**Reconhecimento vazio não é cacheado.** Uma falha de parse gravada viraria cache **permanente do
erro**: toda pergunta seguinte naquela base acertaria o cache e receberia nada, sem nunca tentar de
novo. É o modo de falha mais caro que um cache pode ter — silencioso e definitivo.

**Confiança ausente vira `baixa`, nunca `alta`.** Confiança desconhecida é desconhecida, e o lado
seguro do desconhecido é perguntar. O default oposto faria o A3 presumir.

**Coluna inventada pelo A2 é descartada, com aviso.** Um nome alucinado chegando ao A3 viraria um
Query Plan que morre em `MissingColumnError` longe da causa.

**A tabela do cache tem policy de UPDATE**, ao contrário de `plum_logs`. Não é edição de histórico: é
o `upsert` na mesma chave quando duas perguntas concorrem numa base nova. Está escrito na migration.

**Chave desligada não gera linha de log.** A ausência de linha `ad_hoc` **é** o sinal de que a
organização não está no caminho novo; gravar poluiria a comparação com turnos nunca tentados.

---

## O que ficou de fora

**O A2 ainda não pede vocabulário.** A ação devolve `vocabularios: [...]` — a lista de colunas que o
A2 marcou como valendo — mas ninguém busca. Quem consome é o A3 (B07), e buscar antes seria gastar
executor para jogar fora.

**`ad_hoc_executar` não existe.** É a segunda metade da §B1 do plano, e depende do A3.

---

## Arquivos

**Novos:** `supabase/migrations/20260820130000_plum_reconhecimento.sql` ·
`_shared/reconhecimento.ts` (forma, digital, normalização — puro) ·
`_shared/reconhecimento.test.ts` (13) · `adhoc/porteiro.ts` · `adhoc/reconhecedor.ts` ·
`adhoc/prompts/a1_porteiro.ts` · `adhoc/prompts/a2_reconhecedor.ts`

**Editados:** `ai-plum-chat/index.ts` (a ação `ad_hoc_planejar` + os dois parâmetros opcionais do
`handleExecutePlan`) · `src/pages/PlumChat.tsx` (a chamada em modo sombra) ·
`_shared/log_core.ts` (o cabeçalho: a lista de ações cresceu, §B1 do plano)

**Verificado:** `npm test` — **256 testes** · `npx tsc --noEmit` limpo · `npm run build` passa · os
cinco arquivos Deno novos passam pelo parser do esbuild.

⛔ **Não tocado:** `pandas_executor.py`, `query_plan.ts`, `dashboard-agent`, `ai-agents`.
