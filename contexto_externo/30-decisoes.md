---
status: vigente
camada: produto
atualizado_em: 2026-09-18
---

# Decisões — tese externa

> **Formato:** decisão · por quê · o que foi rejeitado · status.
> ⚠️ **A numeração nunca muda e nunca é reaproveitada.** Decisão revogada vira
> `status: revogada` com o porquê — não se apaga, porque o raciocínio continua valendo como
> aviso.
> **Prefixo `D-E-`** — o `D-xxx` sem `E` é da tese interna e não vale aqui.

---

### D-E-001 · O Plum tem duas teses, com contextos independentes
**Decisão:** tese interna (integrador, análise para decisores) e tese externa (porteiro, acesso
filtrado para quem não tem login) passam a ter documentação separada e autossuficiente.
**Por quê:** compradores diferentes, canais diferentes, modelos de identidade diferentes. Manter
num documento só obrigava todo leitor a filtrar mentalmente metade do material.
**Rejeitado:** um contexto único com seções por tese — perde-se a capacidade de dizer "não leia
isto agora", que é o principal ganho.
**Consequência:** `contexto_externo/` **nunca** referencia `contexto_interno/`. Fato sobre código
compartilhado tem dono no `CLAUDE.md` da raiz.
**Status:** vigente · 2026-09-18

### D-E-002 · ⭐ Conectores são implementação, não plataforma
**Decisão:** o código que fala com o sistema de origem do cliente (Cavok, Onfly, Paytrack, ERPs)
é 🔧 implementação. O que é 🏗️ plataforma é o **contrato** que todo conector obedece.
**Por quê:** é impossível prever qual sistema o cliente usa. Um catálogo de integrações nativas
nunca cobre o próximo caso e envelhece sozinho.
**Rejeitado:** biblioteca de conectores nativos como parte do produto.
**⚠️ Custo aceito:** cada venda exige trabalho vertical, e isso reintroduz o risco de margem que
travou a tese interna. **A mitigação é o contrato do conector** — se um conector novo é uma
semana, a implementação vira margem; se é um mês, vira prejuízo disfarçado de receita.
**Status:** vigente · 2026-09-18 · ver `13-contrato-do-conector.md`

### D-E-003 · Chave de contexto no `CLAUDE.md` da raiz
**Decisão:** um bloco `MODO ATIVO` no topo do `CLAUDE.md` decide qual contexto vale
(`interno` | `externo` | `ambos`).
**Por quê:** o único arquivo garantidamente lido é o `CLAUDE.md` da raiz. Qualquer indireção —
arquivo `MODO.md` separado, renomear pastas — adiciona chance de ser pulada.
**Rejeitado:** renomear pastas (polui histórico), arquivo de modo separado (pode não ser lido),
dois `CLAUDE.md` trocados por script (diff instável, fácil commitar o modo errado).
**⭐ O que a decisão realmente protege:** não é leitura, é **escrita**. Ler o contexto errado
gasta tokens; gravar no contexto errado apodrece a documentação em silêncio.
**Consequência:** modo ausente ou ambíguo ⇒ **fail-closed na escrita** (pergunta antes de gravar;
leitura pode seguir). A skill `contexto-plum` precisa ler a chave antes de rotear qualquer fato.
**Status:** vigente · 2026-09-18

### D-E-004 · O modo governa documentação, nunca código
**Decisão:** `src/`, `supabase/functions/` e `query_engine/` estão **sempre** no escopo,
independentemente do modo.
**Por quê:** as duas teses compartilham esse código. Um agente em modo externo que altera o
executor sem considerar a tese interna causa o dano mais caro possível — e silencioso.
**Rejeitado:** modo que também filtra diretórios de código.
**Status:** vigente · 2026-09-18

### D-E-005 · "Externo" significa fora dos sistemas, não fora da empresa
**Decisão:** o público-alvo declarado é **quem não tem login nos sistemas que guardam o dado
dele** — tipicamente funcionário de campo.
**Por quê:** é o caso implementado na Helisul (pilotos, motoristas, mecânicos são colaboradores),
e a precisão muda três coisas: a base legal de LGPD, a reação do TI na primeira reunião, e a
viabilidade técnica (funcionário já existe num cadastro, terceiro não).
**Rejeitado, por ora:** posicionar como B2B2C (cliente final da empresa). Continua sendo extensão
desejável, mas exige modelo de identidade que não existe — não há cadastro prévio daquele
telefone.
**Status:** vigente · 2026-09-18

### D-E-006 · EvolutionAPI para piloto, com saída definida
**Decisão:** o canal WhatsApp começa em gateway não-oficial (EvolutionAPI), com servidor e número
já em operação.
**Por quê:** custo e velocidade — sem aprovação de template, sem verificação de negócio. É a
escolha certa para validar.
**⚠️ Custo aceito:** risco de banimento do número, sem SLA e sem recurso. Num produto cujo valor
é *"o piloto recebe a escala"*, canal indisponível é falha de produto.
**❓ Aberto, e é a parte que falta:** o **gatilho de migração** para a Cloud API oficial — número
de clientes, volume, ou a primeira suspensão. Decidir depois de acontecer é decidir sob pressão.
**Status:** vigente com pendência · 2026-09-18 · ver `20-pendencias.md` PE-7

### D-E-007 · Solicitação não vira escrita — vai para a fila humana
**Decisão:** o Plum lê e responde; pedidos que exigiriam escrever no sistema do cliente ("quero
passagem", "quero reembolso") são capturados e encaminhados à central, que executa manualmente.
**Por quê:** escrever em sistema de terceiro em produção é risco que não é nosso de correr, e é
a fronteira que mantém a implantação negociável com o TI do cliente.
**Rejeitado:** automação de emissão — registrada como escopo futuro no PRD da Helisul, e
**exigirá análise de risco própria** por romper o somente-leitura.
**Status:** vigente · 2026-09-18 · herda a ADR-001 do `PRD_Helisul_v1.md`

### D-E-008 · Sem avisos proativos nesta fase
**Decisão:** o Plum só responde mediante pergunta. Nenhum envio programado, nenhum alerta.
**Por quê:** reduz escopo, reduz risco de LGPD e evita o pior modo de falha de um canal como o
WhatsApp — virar spam e ser bloqueado pelo próprio usuário.
**Rejeitado:** notificação de mudança de escala, que é pedido óbvio e provavelmente valioso.
**Status:** vigente · 2026-09-18 · herda a ADR-005 do `PRD_Helisul_v1.md`

### D-E-009 · ⭐ O Plum Externo é construído **nesta plataforma**, e a Helisul é referência
**Decisão:** o porteiro genérico é construído **neste repositório**, sobre a Plataforma Plum. O
sistema da Helisul (`central-platform`, fora daqui) é **implementação de referência** — serve
para estudar o que funcionou e extrair o que generaliza. Não é a base, e não será absorvido.
**Por quê:** ⭐ é o mesmo movimento que a tese interna fez com as 4 vendas — a implementação 🔧
existe primeiro, e dela se extrai a plataforma 🏗️. A Helisul provou que a tese funciona e
mostrou quais problemas aparecem de verdade (identidade por telefone, fila humana,
fragmentação de fontes). Reescrever aquilo aqui seria copiar a implementação; o objetivo é
extrair o padrão.
**Rejeitado:** repositório novo (duplicaria a doutrina sem necessidade) e adotar o
`central-platform` como base (é FastAPI/Python, e absorvê-lo significaria manter dois produtos
para sempre).
**Consequência:** `contexto_externo/` fica **aqui**, e a chave de modo do `CLAUDE.md` faz
sentido — é o mecanismo de alternar entre as duas teses no mesmo repositório.
**Status:** vigente · 2026-09-18

### D-E-010 · ⏳ A tese externa está congelada até o remake interno terminar
**Decisão:** nenhuma implementação do Plum Externo começa antes de
`zz_remake/zz_remake_implementation/` estar completo. O `contexto_externo/` existe como
**preparação**, não como frente de trabalho paralela.
**Por quê:** duas frentes simultâneas no mesmo motor, com um time deste tamanho, é a receita
para as duas ficarem pela metade.
**Consequência:** o modo permanece `interno` até o remake fechar. O que está escrito em
`contexto_externo/` é proposta — **leia, não implemente**.
**⭐ E o remake está trabalhando a favor, não contra:** os tipos `registro`/`amostra` e o
orçamento de linhas (`_shared/orcamento.ts`) já entregues **são a fundação do porteiro**, feitos
para a tese interna. O que falta é somar o filtro de titular pelo servidor (PE-1) — uma peça, não
uma inversão. Ver `12-visao-tecnologica.md` §4.
**Status:** vigente · 2026-09-18

---

## ❓ Decisões que faltam, e travam trabalho

| Qual | Trava |
|---|---|
| ⛔ Linha bruta filtrada passa pelo executor ou é caminho separado? | a Etapa 1 inteira (PE-1) |
| ⛔ Dono e regras da tabela identidade→titular | o modelo de permissão (PE-2) |
| Titular é pessoa ou conjunto (hierarquia)? | o núcleo da autorização (PE-3) |
| Permissão de documento: documento ou trecho? | o onboarding de documentos (PE-8) |
| Modelo de preço | a proposta comercial (`10-visao-comercial.md`) |
