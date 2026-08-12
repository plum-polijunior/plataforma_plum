não tem opção no front end para o usuário autorizar a entrada automática de um certo domínio -> FEITO (2026-08-12): aba "Entrada & Domínios" em Minha Organização. Ficou de fora, de propósito: adoção de membros órfãos (quem criou conta antes da verificação continua sem organização, e o admin não consegue nem contá-los — perfis com organization_id NULL não casam em nenhuma policy de SELECT de profiles; exigiria uma RPC SECURITY DEFINER que move contas em silêncio, decisão de produto) e edição de ms_tenant_id pela tela.

Migration 20260812120000_dominios_guard.sql APLICADA em 2026-08-12 (trava de servidor: recusa provedor público, normaliza para minúsculas, força verified_by = auth.uid()). Validado em produção pela tela: a Machado Lmtd saiu do modo domínio pela aba nova, e o select de join_mode passou a mostrar só 'codigo'.

{
assunto: implementar respostas agentless e automáticas e melhorar a categorização de mensagens
problema 1: atualmente o agente Z tenta prever o assunto das mensagens pela análise da pergunta e do schema metadata, mas recebe no prompt uma lista de assuntos genéricos para se inspirar. o resultado é incosistencia do assunto para o mesmo prompt, e um assunto genérico.
problema 2: o mesmo prompt "quanto eu faturei hoje", "quanto eu vendi hoje" pode ser enviado 15 vezes que passará pelo agente a 15 vezes, gerando 15 querys identicas. mas qualquer arquitetura que analise as palavras chaves de uma query antes de mandar pro agente a não seria 100% confiável
the fix: sinceramente, a previsão de assunto é praticamente não escalável para multi tenant sem adicionar complexidade do produto para o usuário. assim, a coluna "assunto" na table "plum_chat" é desnecessária. ao mesmo tempo, assim que uma pergunta é feita, a query_plan é perdida. por isso, sugiro trocar a coluna "assunto" por "plan_query". ao fazer uma pergunta ao plum, se ele encontrar em plum_chat exatamente a mesma pergunta k_min = 5 vezes, e nelas, k_min tiverem querys identicas, ele pula o agente a, e já joga a query pro pandas.
the addition: agora que temos k_min, podemos criar uma aba de "perguntas frequentes" ou deixá-las como sugestão abaixo da caixa de texto do chat
}


parte 2: 
o problema: o usuário que prefere o fundo preto tem que sempre recolocar o fundo preto ao limpar o cache do navegador
a correção: armazenar na table "profiles" em uma nova columm themes DARK/LIGHT

o problema: o /auth não respeita o tema preto, e a landing page fica com a maioria das empresas parceiras escuras
a solução: corrigir o return de auth.tsx, e colocar um filtro claro nas imagens de empresas parceiras