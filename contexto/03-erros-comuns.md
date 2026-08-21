---
status: vigente
camada: ambos
atualizado_em: 2026-08-18
---

# Erros comuns — o que se acredita e é falso

> **O que este arquivo é:** a lista das crenças erradas que este repositório produz em quem chega.
> Cada linha aponta para onde está a explicação — **este arquivo não explica nada em profundidade,
> de propósito**.
>
> ⭐ **Leia antes de qualquer outra coisa técnica.** Ele existe porque o repo tem documentos
> superados que não avisam que estão superados, e um agente em one shot acredita no primeiro que
> abrir.

---

## Sobre o produto

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| A Plataforma Plum **é** o produto vendido | É uma **demo** plug-and-play. O vendido é a implementação vertical | `02-plataforma-vs-implementacao.md` |
| ⭐ Os 4 clientes usam **esta** plataforma, então mudar aqui os afeta | **Não usam.** A implementação deles é um deploy separado (Supabase, Lambda e service account próprios). Aqui só há devs e demo. ⚠️ Saber que "é uma demo" **não** imuniza contra este erro — ver o caso de 2026-08-18 | `02-plataforma-vs-implementacao.md` |
| O Plum é um produto de dashboard / BI | É consulta e interpretação em linguagem natural. Dashboard é uma superfície, não a tese | `01-o-que-e-o-plum.md` |
| O Plum é aquele agente de WhatsApp | Aquilo é o **legado single-tenant** da Poli Júnior, outro sistema. A plataforma foi construída depois, do zero | `01-o-que-e-o-plum.md` |
| O Plum cria planilhas para o cliente | Nunca. O cliente cola a URL da **própria** planilha e compartilha com a service account como Leitor | `30-decisoes.md` D-018 |
| "0 clientes pagantes" | Desatualizado. **4 vendas, ticket médio ~R$ 23k** — mas o que se comprou foi a organização da base | `10-visao-comercial.md` |
| O Plum vende facilidade de consulta | É o que ele **faz**; não é o que sustenta o preço. A tese do remake é interpretação e decisão | `10-visao-comercial.md` |

## Sobre dados e escrita

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| O Plum pode alterar dados do cliente | **Nunca.** R-01, só `GET`, escopo `readonly`, sem Drive API | `30-decisoes.md` D-018 |
| O PRD do Plum descreve o banco | Aquele PRD (apagado em 2026-08-14) descrevia `tenants`, `tenant_users`, `data_dictionary` — **nada disso existe**. A verdade é `supabase/migrations/` | `00-LEIA-PRIMEIRO.md` |
| Um dataset = uma planilha inteira | Um dataset é **uma aba**, escolhida por `google_sheet_gid` | `CLAUDE.md` §3 |
| `google_sheet_tab` (o nome da aba) manda | O **`gid`** manda; o nome é fallback só quando o `gid` é nulo | `30-decisoes.md` D-016 |
| `gid = 0` significa "sem aba definida" | `0` é a **primeira aba**, valor legítimo. `if (!gid)` quebra toda planilha | `31-incidentes-e-licoes.md` I-04 |
| Joins entre planilhas são suportados | **Bloqueados** (R-11). O remake propõe cruzar **depois** da agregação, sem join | `30-decisoes.md` D-035 |
| O pipeline de importação lê a planilha | **Não lê.** Lê o *arquivo* no navegador. O Sheets só é lido na primeira pergunta | `31-incidentes-e-licoes.md` I-08 |

## Sobre o executor

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| O executor roda em EC2 | **Lambda**, imagem de container, Function URL com `AuthType=AWS_IAM`. Houve um plano de EC2, abandonado | `infra/aws/PASSO-A-PASSO.md` |
| O executor consulta o Supabase | **Nunca.** Motorista cego: recebe payload assinado com colunas já resolvidas | `30-decisoes.md` D-008 |
| O executor decide autorização | Ele **reconfere** `allowed_columns` como segunda barreira. A decisão vive na Edge Function | `30-decisoes.md` D-008 |
| O cache do executor está desligado | **Ligado desde 2026-08-07**, TTL 15 min. Documentação antiga dizia o contrário | `30-decisoes.md` D-011 |
| k-anonimato protege as respostas | **Removido em 2026-08-08.** `suppressed_groups` continua no retorno, sempre `0`. `dashboard_k_min` é vestigial | `30-decisoes.md` D-012 |
| `limit` no plano protege contra base grande | Corta a **saída**. A entrada é protegida por checagem antes do parse (`RowLimitExceeded`) | `30-decisoes.md` D-015 |
| Coluna não carregada faz o filtro ser ignorado | É **erro** (`MissingColumnError`). Ignorar daria o total da base com o rótulo do recorte | `30-decisoes.md` D-014 |

## Sobre chat, agentes e deploy

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| O chat cacheia respostas | Cacheia o **plano**, nunca o resultado — senão pularia o RBAC por definição | `30-decisoes.md` D-024 |
| O cache de plano vale para a organização | Escopo é **por usuário** (RLS de `plum_chat` é `auth.uid() = user_id`) | `30-decisoes.md` D-025 |
| `plum_chat.assunto` é usada | **Vestigial** desde 2026-08-12: não é escrita nem lida | `30-decisoes.md` D-026 |
| O Z-dash bloqueia por segurança | É **fail-open de propósito** — é economia de custo. Quem protege dado é o RBAC | `30-decisoes.md` D-023 |
| ⚠️ Push publica a Edge Function | Publica com **cobertura desconhecida**. Publique à mão e confira `ezbr_sha256` | `31-incidentes-e-licoes.md` I-03 |
| `_shared/` é compartilhado em runtime | É empacotado **por função**. Publicar um consumidor só deixa cópias divergentes do RBAC | `supabase/functions/CLAUDE.md` |
| Divergência de `_shared/` avisa de algum jeito | ⚠️ **Não avisa.** É invisível até alguém emitir a forma nova — os dois lados ficam internamente coerentes e nenhum teste pega | `30-decisoes.md` D-028 |
| `version` provando que o deploy subiu | `version` sobe em mudança de secret, sem código novo. Só `ezbr_sha256` prova | `31-incidentes-e-licoes.md` I-03 |
| ⭐ Teste verde significando artefato certo | ⚠️ Os testes rodam contra o **repositório**, não contra a imagem nem contra o bundle. Um `COPY` faltando no Dockerfile passa por toda a suíte e derruba o Lambda | `31-incidentes-e-licoes.md` I-09 |

## Sobre front e segurança

| ❌ Crença errada | ✅ Verdade | Onde conferir |
|---|---|---|
| `/dashboard` é o dashboard | É **"Minha Organização"** — membros, cargos, permissões. O dashboard é `/inicio` | `20-pendencias.md` |
| O tema escuro é a classe `.dark` | O tema do produto é `.tema-escuro`, um **terceiro** mecanismo. `.dark` hoje não tem consumidor | `30-decisoes.md` D-029 |
| Mudar `status` no banco reflete no acesso | ⚠️ **Claims só são reemitidas no login.** O usuário precisa sair e entrar | `CLAUDE.md` §4 |
| A migration é aplicada pelo CI | **Manual**, colada no SQL Editor do painel, de propósito | `30-decisoes.md` D-005 |
| Segurança é problema da implementação | **Mecanismo** é da plataforma; **política de sensibilidade** é da implementação | `30-decisoes.md` D-039 |
| `join_mode = 'share_id'` no banco | O SQL versionado diz `'share_id'`, o dump de produção diz `'codigo'`. Importe as constantes de `src/lib/organizacao.ts`, **nunca** inline | `CLAUDE.md` §8 |

---

## Sobre este próprio conjunto de documentos

| ❌ Crença errada | ✅ Verdade |
|---|---|
| `zz_remake/V1`, `V2`, `V3` são especificação | São a **conversa** do remake, com propostas que se contradizem de propósito ao longo das versões. A conclusão está em `contexto/` |
| `contexto/12-visao-tecnologica.md` descreve o que está no ar | Descreve **para onde vamos**. O que está no ar é o `CLAUDE.md` |
| Existe uma pasta de arquivo histórico | Existia (`docs/`, `contexto/90-arquivo/`) e foi **apagada em 2026-08-14**. O porquê ficou em `30-decisoes.md`; a narrativa, só no `git log` |

---

⭐ **Encontrou uma crença errada que não está aqui?** Acrescente a linha. Este arquivo é o de maior
retorno por linha do repositório — cada entrada evita uma hora de alguém investigando algo que já
se sabe.
