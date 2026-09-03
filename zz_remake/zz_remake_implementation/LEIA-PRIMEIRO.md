O que vale é o plano de implementação **v3** (`PLANO-implementacao-remake_V3.md`).

⚠️ O v2 está no repositório e **não vale mais**: ele supunha ambiente paralelo (Supabase novo,
Lambda de dev), e o time decidiu em 2026-08-18 fazer o remake direto em produção. Ele fica como
plano B — se o remake em produção se mostrar insustentável, é o caminho de volta.

⭐ A diferença que muda o dia a dia: o isolamento agora é por **organização**
(`organizations.remake_habilitado`), não por ambiente. E ela cobre a camada de agentes, **não** o
`query_plan.ts` nem o `query_engine/` — o que mexer ali chega aos 4 clientes ao publicar.

A regra para execução: encontrou algo que parece errado e o plano não pediu? Vai para PENDENTE-DECISAO.md, não para o código.

Quando escrever no PENDENTE-DECISAO: sempre que a resposta certa depender do cliente, do negócio ou de uma preferência que não se deriva do repositório. Se dá para decidir lendo o código, decide e registra no DIARIO. Se depende de saber o que um gestor de varejo quis dizer, para o PENDENTE.

E o mais importante: o contexto/ é a autoridade sobre o que o produto é, mas ele foi escrito por mim em dois dias, a partir de documentos que eu mesmo tinha escrito. ⚠️ Ele não foi validado contra o código linha a linha. Se o Claude Code encontrar o contexto/ afirmando algo que o código contradiz, o código ganha — e isso vira uma linha em 03-erros-comuns.md. Vale dizer isso explicitamente, porque a tendência natural é confiar no documento