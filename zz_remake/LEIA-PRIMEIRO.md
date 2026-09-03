# O que vale desta pasta

Autoritativos:

| Documento | Onde | O que é |
|---|---|---|
| **V6** | `zz_remake/` | as **decisões** do remake |
| **V7** | `zz_remake/` | a **spec** do `ad_hoc` |
| ⭐ **PLANO-implementacao-remake_V3.md** | `zz_remake_implementation/` (subpasta daqui) | o **plano de execução** |
| ⭐ **PROXIMO-PASSO.md** | `zz_remake_implementation/` | **estado**, não histórico — o primeiro a ler ao retomar |

O resto dos arquivos desta pasta são discussões e conversas, com propostas que se contradizem entre
si de propósito. Não são especificação.

---

## ⚠️ Correção de 2026-08-26 — era "PLANO_V2", e não é mais

Este arquivo dizia *"Autoritativos: PLANO_V2 (execução)"*. **A V2 foi substituída pela V3**, que
tirou o remake do ambiente paralelo e o pôs direto em produção — cai a Etapa 0 inteira da V2
(Supabase novo, Lambda de dev, service account nova) e, com ela, a premissa que organizava o
documento. A frase que separa as duas: **a V2 isolava por AMBIENTE, a V3 isola por ORGANIZAÇÃO**
(`organizations.remake_habilitado`).

A V2 fica, marcada como superada (D-041: superado é marcado, não apagado). Ela descreve o caminho do
ambiente paralelo passo a passo e continua sendo o **plano B**; a branch `newnew_plum` está parada
em `1a0b67e` esperando exatamente isso.

⛔ **Não confunda os dois "V3", e desde 2026-09-03 a pasta não desambigua mais** — o
`zz_remake_implementation/` passou a ser **subpasta desta**. Distinga pelo NOME do arquivo:

| arquivo | o que é |
|---|---|
| `REMAKE-PLUM-tese-e-arquitetura_V3.md` | conversa, aqui na raiz. Ignore |
| `zz_remake_implementation/PLANO-implementacao-remake_V3.md` | ⭐ o plano de execução |
