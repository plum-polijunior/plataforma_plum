não tem opção no front end para o usuário autorizar a entrada automática de um certo domínio -> FEITO (2026-08-12): aba "Entrada & Domínios" em Minha Organização. Ficou de fora, de propósito: adoção de membros órfãos (quem criou conta antes da verificação continua sem organização, e o admin não consegue nem contá-los — perfis com organization_id NULL não casam em nenhuma policy de SELECT de profiles; exigiria uma RPC SECURITY DEFINER que move contas em silêncio, decisão de produto) e edição de ms_tenant_id pela tela.

Migration 20260812120000_dominios_guard.sql APLICADA em 2026-08-12 (trava de servidor: recusa provedor público, normaliza para minúsculas, força verified_by = auth.uid()). Validado em produção pela tela: a Machado Lmtd saiu do modo domínio pela aba nova, e o select de join_mode passou a mostrar só 'codigo'.

{
assunto: implementar respostas agentless e automáticas e melhorar a categorização de mensagens
problema 1: atualmente o agente Z tenta prever o assunto das mensagens pela análise da pergunta e do schema metadata, mas recebe no prompt uma lista de assuntos genéricos para se inspirar. o resultado é incosistencia do assunto para o mesmo prompt, e um assunto genérico.
problema 2: o mesmo prompt "quanto eu faturei hoje", "quanto eu vendi hoje" pode ser enviado 15 vezes que passará pelo agente a 15 vezes, gerando 15 querys identicas. mas qualquer arquitetura que analise as palavras chaves de uma query antes de mandar pro agente a não seria 100% confiável
the fix: sinceramente, a previsão de assunto é praticamente não escalável para multi tenant sem adicionar complexidade do produto para o usuário. assim, a coluna "assunto" na table "plum_chat" é desnecessária. ao mesmo tempo, assim que uma pergunta é feita, a query_plan é perdida. por isso, sugiro trocar a coluna "assunto" por "plan_query". ao fazer uma pergunta ao plum, se ele encontrar em plum_chat exatamente a mesma pergunta k_min = 5 vezes, e nelas, k_min tiverem querys identicas, ele pula o agente a, e já joga a query pro pandas.
the addition: agora que temos k_min, podemos criar uma aba de "perguntas frequentes" ou deixá-las como sugestão abaixo da caixa de texto do chat

-> FEITO (2026-08-12), com quatro desvios do enunciado, todos deliberados:

  1. `assunto` NÃO foi dropada, só aposentada. CLAUDE.md §4.9 exige migration
     não destrutiva, e ha precedente (organizations.dashboard_k_min, vestigial
     desde a remocao do k-anonimato). A coluna fica, comentada como morta.
     Dropar e uma linha depois, se houver decisao para isso.

  2. Duas colunas, nao uma: `plan_query` E `dataset_id`. A mesma frase contra
     outra base e outra pergunta, com outro plano.

  3. O nome `k_min` nao foi reusado: ja existe em organizations.dashboard_k_min
     com outro significado (minimo de linhas por grupo, supressao de
     privacidade). A constante chama REPETICOES_PARA_REUSAR.

  4. Escopo por USUARIO, nao por organizacao. A RLS de plum_chat e
     auth.uid() = user_id, e o CLAUDE.md declara "Chat e 100% privado por
     usuario" — contar as repeticoes da empresa exigiria uma RPC
     SECURITY DEFINER devolvendo so {plano, contagem}. Consequencia aceita: o
     reuso dispara pouco, porque exige a MESMA pessoa repetindo. Ha
     console.log de hit e de miss no PlumChat para medir antes de ampliar.

⚠️ Plano com data absoluta nunca e guardado. "quanto faturei hoje" gera
where com ["2026-08-12", ...]; reusar amanha devolveria o dia errado, em
silencio. Estender a datas relativas foi planejado e RECUSADO — ver
PLANO-cache-de-perguntas-com-data.md na raiz.

⚠️ PENDENTE: colar supabase/migrations/20260812140000_plum_chat_plan_query.sql
no SQL Editor, e republicar a Edge Function ai-plum-chat (o Agente Z mudou:
saiu o `assunto` do SCHEMA_GUARD e do prompt). Sem a migration, o insert do
chat falha — dataset_id e plan_query nao existiriam.

A aba de "perguntas frequentes" (the addition) NAO foi feita: com escopo por
usuario e sem perguntas datadas, nao ha volume para sugerir nada ainda.
Reavaliar depois de medir os logs de reuso.
}


parte 2: 
o problema: o usuário que prefere o fundo preto tem que sempre recolocar o fundo preto ao limpar o cache do navegador
a correção: armazenar na table "profiles" em uma nova columm themes DARK/LIGHT

o problema: a landing page fica escura quando o usuário seleciona o modo escuro dentro da interface do plum e sai da conta. mas a landing page deveria ser branca, para chamar mais atenção
a solução: checar o return de auth.tsx e de index.tsx.

-> FEITO (2026-08-12). Investigado antes de mexer: o alternador de tema (`src/hooks/use-tema.ts`,
botão em `DashboardLayout`) é recente — entrou numa leva de commits de outro colega, depois do
que este arquivo já documentava, por isso não aparecia em nenhum doc ainda. É um TERCEIRO
mecanismo de tema, `tema-escuro`, diferente do `.dark` da landing (que continua sem consumidor).

  1. Persistência: coluna `profiles.tema` (`'claro'`/`'escuro'`, os mesmos literais que o
     código já usa — não os nomes em inglês do enunciado) +
     `supabase/migrations/20260812150000_tema_do_usuario.sql`. Escrita só por RPC
     `definir_tema()`, nunca `UPDATE` direto: a única policy de UPDATE em `profiles` exige
     `id <> auth.uid()` de propósito (CLAUDE.md §4 regra 5, contra autopromoção), então uma
     policy de self-UPDATE genérica reabriria a brecha que a migration de 22/07 fechou. A RPC
     é `SECURITY DEFINER`, só sabe escrever essa uma coluna. `use-tema.ts` lê o servidor uma
     vez (na montagem do `DashboardLayout`) e continua usando o `localStorage` só para não
     ter flash no primeiro paint — a fonte de verdade passou a ser o banco.

  2. O vazamento para a landing: a causa real não era o `.dark` que o enunciado supunha — era
     o `tema-escuro`, cujo `useEffect` aplicava a classe em `document.documentElement` (o
     `<html>`, único nó pra SPA inteira) sem nunca remover. Logout desmontava
     `DashboardLayout` mas não tocava o `<html>`; a classe ficava presa, e a landing (que hoje
     não tem opinião própria sobre tema) herdava a paleta escura por cascata. Corrigido na
     fonte — `return () => classList.remove(...)` no próprio efeito de `use-tema.ts`, que fecha
     o caso normal porque o hook só desmonta saindo do produto — **e** com o efeito defensivo
     que o enunciado já apontava, em `Index.tsx`/`Auth.tsx`, mais `NotFound.tsx` pelo mesmo
     motivo (é a "irmã" da landing, CLAUDE.md §2).

Detalhe registrado em CLAUDE.md §7, porque é a primeira vez que o mecanismo `tema-escuro`
aparece em algum `.md` do repo.