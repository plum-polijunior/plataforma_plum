# B00 · Etapa 0 — diário

**Data:** 2026-08-18 · **Escopo:** a bancada. Nenhuma linha de remake.

O V3 estimava 2 dias e listava seis itens. Cinco saíram; um foi adiado com motivo (abaixo).

---

## O que o plano não previa, e apareceu ao conferir contra o código

O schema do `plum_logs` vinha herdado do V7 e **nunca tinha sido lido contra o repositório**. Três
coisas não fechavam.

### 1. `sessao_id` e `turno_id` eram `NOT NULL` sem fonte

Procurei por "sessao", "turno", "session_id" em `PlumChat.tsx` e em `ai-plum-chat/index.ts`. O único
casamento era a string de erro `"sessao invalida"`. O chat não tem conceito de sessão — `plum_chat`
é uma lista plana de mensagens.

**Decidido:** `sessao_id` é uuid do cliente, renovado por carga de página e por troca de dataset.
`turno_id` é uuid por mensagem do usuário.

⚠️ **E isso colide de nome com o orçamento do bloco 10.** O V3 define o orçamento como
`usuário × dataset × janela de tempo`, resolvido no servidor. Se alguém amarrar o orçamento a este
`sessao_id`, a cota reseta a cada F5. Escrevi o aviso em três lugares (migration, `log.ts`,
`PlumChat.tsx`) porque é o tipo de unificação que parece limpeza.

### 2. O enum de `etapa` só tinha os nomes do remake

O V7 listou `porteiro|reconhecedor|planejador|resolvedor|autorizador|executor|interprete`. Mas a
Etapa 0 instrumenta o caminho **atual**, cujas etapas são `guard|plan_query|execute_plan|
synthesize_answer`. Um `CHECK` só com os nomes novos rejeitaria a primeira linha da linha de base —
que é o motivo de a etapa existir.

**Decidido:** o `CHECK` aceita os dois vocabulários, e `caminho` (`legado`|`ad_hoc`) diz qual cadeia
respondeu.

### 3. ⭐ `usageMetadata` era descartado

O Gemini devolve a contagem de tokens em toda resposta. Zero ocorrências de `usageMetadata` no
repositório inteiro — o código lia `data.candidates[0]...text` e jogava o resto fora.

Sem isso, `tokens_entrada`/`tokens_saida` sairiam nulos e **"custo por pergunta" não existiria** —
que é a métrica principal do log e um dos critérios de pronto da Etapa 1. Acrescentado
`extrairUsoDeTokens()` em `_shared/log.ts`.

---

## Decisões tomadas

**A identidade do log vem do banco, não do chamador.** `organization_id` e `user_id` têm
`DEFAULT current_org_id()` e `DEFAULT auth.uid()`. A Edge Function não os envia.

Duas razões: é a regra 1 do §4 ("identificador vindo do cliente é candidato, nunca verdade") aplicada
onde ela custa zero; e economiza a consulta que a função teria de fazer só para descobrir a própria
organização — `handleAgente` não resolve perfil hoje, e resolver só para logar seria caro.

**Escrita com o JWT do usuário, não com `service_role`.** O `ai-plum-chat` monta o client com o
token de quem perguntou, e o código diz por quê: *"service role aqui transformaria um bug de filtro
em vazamento entre organizações"*. Abrir `service_role` só para gravar log contrariaria isso numa
função que já foi palco do I-01. O que se aceita: um usuário pode sujar o **próprio** log. Não é dado
de autorização e não atravessa organização.

**`created_at`, não `criado_em`.** O V7 escreveu em português, mas todas as tabelas do banco usam
`created_at`. Consistência de coluna vale mais que consistência de idioma para quem escreve query.

**`execute_plan` foi envolvido, não instrumentado por dentro.** Ele tem treze saídas; espalhar log
por todas encheria a função de ruído e ainda assim alguém esqueceria uma. O invólucro no roteador
deriva o status do código HTTP — que é o que cada uma daquelas saídas já decide.

---

## O que ficou de fora, e por quê

**O item 5 do plano — "resolver a flag no servidor" — não foi feito.** A coluna existe; o leitor não.

Não há o que gatear: a ação `ad_hoc` não existe ainda. Um resolvedor sem consumidor é código
especulativo, e ele será escrito certo quando houver algo do outro lado.

⚠️ **Consequência: o critério de pronto §0.5 do V3 não é atingível como está escrito.** Ele pede que
"uma pergunta rode com a chave ligada e desligada, e o log registre as duas" — mas com um caminho só,
toda pergunta é `legado`, ligada ou não. O critério vira exigível no primeiro bloco que tenha
`ad_hoc`. Marcado no V3.

---

## Arquivos

**Novos:** `supabase/migrations/20260818100000_remake_habilitado.sql` ·
`supabase/migrations/20260818110000_plum_logs.sql` · `supabase/functions/_shared/log.ts`

**Editados:** `supabase/functions/ai-plum-chat/index.ts` (instrumentação das 4 saídas de
`handleAgente` + invólucro do `execute_plan`) · `src/pages/PlumChat.tsx` (`sessaoId`/`turnoId` nas 4
chamadas) · `src/integrations/supabase/types.ts` (`plum_logs` + `remake_habilitado`)

**Verificado:** `npx tsc --noEmit` limpo · `npm run build` passa · 189 testes · lint na baseline
(65 erros, nenhum novo).

⚠️ **Nada disso está em produção ainda** — as duas migrations e o deploy da função são 👤. Ver
`MANUAL.md`.
