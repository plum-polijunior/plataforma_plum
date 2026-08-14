# DESIGN.md — Sistema de design do PLUM

Origem: `/plan-design-review` de 2026-08-06, durante o desenho do Dashboard.
Antes disso o projeto tinha um tema em `src/index.css` e nenhuma regra escrita.

A regra central deste documento cabe numa frase:

> **O PLUM tem duas superfícies, não uma.** A landing vende em 40 segundos. O app é
> usado por 3 minutos às 8h da manhã. Elas compartilham a marca e não compartilham
> o tratamento visual.

---

## 1. As duas superfícies

| | Landing (`/`, `/precos`, marketing) | App UI (`/dashboard`, `/plum`, `/dashboard/*`) |
|---|---|---|
| Objetivo | Impressionar, explicar, converter | Ler números e agir |
| Fundo | Gradiente, glow, vidro (como está hoje) | Plano, sem gradiente, sem glow, sem vidro |
| Roxo | Ambiente: pode ocupar a tela | **Acento apenas**: cromo interativo e série de ênfase |
| Sombra | Permitida | **Nenhuma.** Separação por hairline de 1px |
| Movimento | 2 a 3 movimentos intencionais | Só transição de estado (≤150ms), nada decorativo |
| Linguagem | Marca e benefício | Utilidade: orientação, status, ação |

O que está em `src/index.css` hoje foi desenhado para a coluna da esquerda. Não
apague nada: adicione os tokens de app abaixo e use-os nas rotas de app.

**Por que isso importa e não é preciosismo:** brilho e gradiente atrás de um número
disputam atenção com o número. Numa página de venda isso é bom, porque a atenção é o
produto. Num dashboard o produto é o número, e tudo que compete com ele é ruído.

---

## 2. Tokens de App UI

⚠️ **Os hex abaixo são do tema ESCURO e valem como registro histórico, não como referência.**
Desde 2026-08-12 o ambiente interno é claro: o plano é `#FFFFFF`, a superfície do card é
`#FAF7F8`, a tinta é `#191317` e a marca é `#7A2F56`. Os nomes `--app-*`, `--ink*` e `--brand`
nunca existiram no código — a verdade está em `src/index.css` (`:root` claro, `.dark` para a
landing). Ver `contexto/30-decisoes.md` D-029.

```css
/* Superfícies. Derivadas dos tokens existentes, convertidas para hex. */
--app-plane:      #08080C;   /* fundo da página (= --background 240 20% 4%)  */
--app-surface:    #120E1B;   /* superfície do card (= --card 260 30% 8%)      */
--app-hairline:   rgba(255,255,255,.10);
--app-radius:     12px;      /* = --radius 0.75rem */
/* sem box-shadow em nenhum componente de app */

/* Tinta */
--ink:            #FFFFFF;   /* valor, título de card                        */
--ink-2:          #C3C2B7;   /* texto de apoio, legenda, mensagem de erro    */
--ink-muted:      #898781;   /* eixo, rótulo, nota de rodapé, selo de idade  */

/* Cromo de gráfico */
--grid:           #2C2C2A;   /* gridline, hairline 1px sólida, recessiva     */
--axis:           #383835;   /* linha de base                                */

/* Marca. NUNCA como cor de série de dado. */
--brand:          #9952E0;   /* = --primary 270 70% 60%                      */
```

`--brand` aparece em: logo, item ativo da navegação, botão primário, anel de foco,
e na série destacada quando o card usa **ênfase** (uma série em roxo, o resto em
cinza). Em nenhum outro lugar.

---

## 3. Paleta de série (validada, não estimada)

Ordem fixa. Atribua por posição, **nunca cicle** e nunca gere uma cor nova.

> ⭐ **Desde 2026-08-12 são DUAS tabelas, uma por tema** (`MATIZES` e
> `MATIZES_ESCURO` em `src/components/dashboard/cores.ts`), e **a rampa inverte de
> sentido entre elas**: no claro o maior valor recebe o tom mais escuro; no escuro,
> o mais claro. É a mesma ideia — "maior valor, mais contraste contra o fundo" — em
> fundos opostos. Nenhum par de luminosidades serve aos dois, porque no claro o
> teto de cada matiz aperta e no escuro o piso.
>
> Os números e a derivação estão em `cores.ts`; a trava executável, em
> `src/lib/contraste-serie.test.ts`, que valida **as duas** superfícies com os
> mesmos três critérios (contraste ≥3:1, ΔE76 ≥8, amplitude de L ≥8).

| Slot | Hue | Hex |
|---|---|---|
| 1 | azul | `#3987E5` |
| 2 | laranja | `#D95926` |
| 3 | aqua | `#199E70` |
| 4 | amarelo | `#C98500` |
| 5 | magenta | `#D55181` |
| 6 | verde | `#008300` |
| 7 | vermelho | `#E66767` |

**Resultado do validador contra a superfície real do card (`#120E1B`), modo escuro:**

- Os 7 slots, lista de pares adjacentes (linha, barra, empilhada): **PASSA tudo.**
  Pior par sob daltonismo ΔE 8,4 (alvo ≥8). Pior par em visão normal ΔE 19,3 (piso ≥15).
  Contraste de todos ≥3:1 contra a superfície.
- **Formas de todos-os-pares (empilhada, dispersão, mapa) têm teto de 3 slots.**
  Com 4, amarelo↔laranja cai para ΔE 10,6 em visão normal, abaixo do piso 15.
  Acima de 3 categorias: agrupe o resto em "Outros" ou facete em múltiplos pequenos.
- O violeta do conjunto de referência foi **removido de propósito**, para o roxo
  pertencer só ao cromo. Os 7 slots sem ele continuam passando.
- `#9952E0` como cor de **ênfase** isolada: passa (banda de luminosidade, croma e
  contraste).

⚠️ **Superfície CLARA (2026-08-12): passa em contraste, REPROVA em daltonismo.** A rampa em
produção hoje é a do tema claro, com faixa de luminosidade por matiz (ver
`src/components/dashboard/cores.ts`). Medido contra `#FAF7F8`:

| Visão | ΔE degraus vizinhos | ΔE entre slots | Contraste |
|---|---|---|---|
| normal | 9,2 | 21,8 | ≥3,00:1 (magenta no piso exato) |
| protanopia | 5,7 | 9,4 | — |
| **deuteranopia** | **4,4** | **6,0** | — |

O alvo de ≥8 sob daltonismo, que o tema escuro cumpria com 8,4, **não é cumprido**. O teste
`src/lib/contraste-serie.test.ts` trava contraste, ΔE em visão normal e o sentido da rampa —
**não** trava daltonismo, de propósito, para não fingir que o critério passou.

O que segura a leitura hoje é a §9: cada barra leva rótulo e valor ao lado, e existe o alternador
"Ver como → Tabela". Fechar o furo é decisão de produto, não ajuste de constante: menos degraus
por rampa, separação maior de matiz, ou aceitar e assumir a dependência da tabela.

Reproduza com:
```
node scripts/validate_palette.js "#3987E5,#D95926,#199E70,#C98500,#D55181,#008300,#E66767" \
     --mode dark --surface "#120E1B"
```

**Cor por trabalho, não por gosto:**

| O dado faz | Use |
|---|---|
| Comparar magnitude | sequencial: um hue só, mais escuro = maior |
| Tendência no tempo, série única | slot 1, ou sequencial |
| Distinguir séries que são o assunto | categórica, na ordem acima |
| Uma série é o ponto, o resto é contexto | **ênfase**: `--brand` na série, `--ink-muted` no resto |
| Acima/abaixo de uma meta | divergente: azul ↔ vermelho, cinza no meio |

Nunca arco-íris. Nunca hue no meio de uma escala divergente. Nunca dois eixos Y.

---

## 4. Especificação de marca

| Marca | Regra |
|---|---|
| Barra / coluna | ≤24px de espessura; canto de 4px na ponta do dado, reto na base |
| Linha | 2px, junção e ponta arredondadas |
| Marcador / ponto final | ≥8px de diâmetro, anel de 2px na cor da superfície |
| Preenchimento de área | o hue da série a ~10% de opacidade |
| Gridline / eixo | 1px sólida, recessiva, nunca tracejada |
| Separação entre segmentos | **gap de 2px na cor da superfície**, nunca borda desenhada |

**Texto nunca veste a cor do dado.** Valor, rótulo, legenda e eixo usam tokens de
tinta. A identidade vem do ponto colorido ao lado do texto, não do texto colorido.

**Legenda a partir de 2 séries, sempre.** Uma série não leva legenda: o título já diz
o que é. Rótulo direto é seletivo (só o último ponto, o extremo, ou a série que é o
assunto), nunca um número em cada ponto.

### 4.1 Onde o gráfico de linha se afasta desta tabela (2026-08-12)

⚠️ **Leia antes de reprovar o `VizLinha.tsx` pela tabela acima ou pela §10.** Os
quatro desvios abaixo foram medidos e decididos com o dono do produto, em revisão
visual. Sem este registro, aplicar a tabela ao pé da letra desfaz as decisões — e é
o que a §10 instrui a fazer, por ser lista de reprovação automática.

| Regra acima | O que a linha faz | Por quê |
|---|---|---|
| Linha 2px | **3px** | 2px desapareceu na revisão visual; a linha é a única marca do card |
| Área a ~10% | **42% → 2%** em degradê | ~10% é invisível nos dois temas. O número vinha da época dark-only, quando 10% sobre fundo quase preto rendia contraste; o `:root` hoje é claro |
| Marcador ≥8px | **8px nos rotulados, 5px nos demais** | 8px em doze pontos pesa e apaga a hierarquia; nenhum marcador foi reprovado. Os dois pesos não existiam na tabela |
| §10 item 8 — nunca número em cada ponto | **valor** segue esparso (extremos + poucos no meio); **variação %** aparece em todo ponto na visão ampliada | A proibição vale para o número do dado, que continua restrito. A variação é leitura derivada, mede metade da largura, e densificá-la foi pedido explícito |

**A suavização é o quinto ponto, e tem regra própria:** a linha usa `monotone`, não
`linear`. `natural`, `basis` e `cardinal` continuam **proibidas** — elas fazem
*overshoot*, passando acima do maior e abaixo do menor dos dois pontos que ligam, o
que desenha picos que não existem no dado. `monotone` não faz overshoot: arredonda o
canto sem sair do intervalo entre os pontos.

---

## 5. Anatomia do card

```
┌─ card ─────────────────────────────────────────────────────────┐
│ Título do card              [selo de idade]  [⟳]               │  ← título 14px/600
│ subtítulo / período                                            │  ← 12px --ink-muted
│                                                                │
│              área de plotagem ou valor                         │
│                                                                │
│ ● série A   ● série B   ● série C                              │  ← legenda ≥2 séries
│ ─────────────────────────────────────────────────────────────  │
│ ● nota de supressão, quando houver                             │  ← 11px --ink-muted
└────────────────────────────────────────────────────────────────┘
```

**Contrato do stat tile:** rótulo (frase, sem dois-pontos) · valor (semibold, compacto
automático: 1.284 / 12,9 mil / R$ 4,2 mi) · delta (opcional, com sinal e período
nomeado) · tendência (opcional, sparkline de 12 pontos).

**Figura herói:** exatamente uma por tela, ≥48px, na mesma fonte de tudo. É o primeiro
card fixado. Os demais stat tiles ficam em 30px.

**Figuras proporcionais em número grande.** `tabular-nums` só em coluna que precisa
alinhar verticalmente (linha de tabela, tick de eixo).

---

## 6. Os cinco estados do card

Referência visual renderizada:
`~/.gstack/projects/plum-polijunior-plataforma_plum/designs/dashboard-card-states-20260806/wireframe.png`

| Estado | O que a pessoa vê | Regra que não pode ser quebrada |
|---|---|---|
| **Saudável** | Valor ou gráfico, tinta normal | — |
| **Carregando** | Título visível, área de plotagem com blocos de esqueleto em branco a 5,5% | **Alturas uniformes.** Esqueleto de altura variada é confundido com dado real a 3 metros. Sem spinner. |
| **Degradado** | Valor em **peso e tamanho totais**, mais pílula neutra `● calculado há 3 h` e botão ⟳ | Nunca vermelho, nunca âmbar, nunca ícone de alerta. Isso não é erro. O número está certo, só é antigo. Rebaixar o número faria a pessoa desconfiar de um dado válido. |
| **Erro** | Sem número nenhum. Frase humana em `--ink-2` e link discreto "Tentar de novo" | Nunca mostrar um número junto com um erro. Nunca caixa vermelha: o card já está vazio, o alarme é redundante. Dizer a causa e a ação, não o código. |
| **Suprimido** | Gráfico normal do que passou, mais rodapé: "2 categorias ocultadas: menos de 5 registros cada. O total acima já desconta essas linhas." | Precisa dizer **de propósito**, **quantos** e **se o total inclui**. Sem isso a pessoa acha que o produto perdeu dado. |

Quando **todos** os grupos são suprimidos, o card não fica vazio: mostra "Nenhum grupo
tem 5 registros ou mais. Este recorte é específico demais para exibir com segurança."
Vazio sem explicação lê como bug.

**Paridade de altura:** todo card renderiza a linha de subtítulo mesmo quando ela está
vazia, senão os títulos da mesma fileira desalinham.

---

## 7. Direção do delta

`dashboard_cards.higher_is_better` com três valores:

| Valor | Delta positivo | Delta negativo |
|---|---|---|
| `true` | verde `#0CA30C` | vermelho `#E66767` |
| `false` | vermelho `#E66767` | verde `#0CA30C` |
| `null` (padrão) | `--ink-2`, sem cor | `--ink-2`, sem cor |

Card novo nasce `null`. **Cor errada é pior que ausência de cor:** um card de custo
subindo 30% em verde é lido antes do número e faz a pessoa seguir o dia tranquila.
A seta e o texto "vs. maio" carregam o sentido mesmo sem cor, então nada se perde em
preto e branco nem sob daltonismo severo.

---

## 8. Responsivo

| Faixa | Grade | Ajustes |
|---|---|---|
| < 640px | 1 coluna | Figura herói cai para 36px. Gráfico de linha reduz o eixo X para primeiro/meio/último. Barra empilhada mantém altura e cresce em largura. |
| 640 a 1024px | 2 colunas | Card de barra empilhada ocupa a largura toda |
| > 1024px | 3 colunas | Layout de referência do wireframe |

"Empilhar tudo numa coluna" não é design responsivo. Cada faixa é uma decisão: no
celular o que importa é o valor, não a série completa.

---

## 9. Acessibilidade

- **Visão de tabela em todo card com gráfico.** Um alternador gráfico/tabela. Resolve
  leitor de tela, daltonismo severo, exportação e tela estreita de uma vez. É a peça
  que mais paga de todo este documento.
- **Teclado:** Tab percorre os cards na ordem visual. Anel de foco visível em
  `--brand`, 2px, com deslocamento de 2px. Nada acessível só por hover.
- **Toque:** alvo mínimo de 44px nos botões de recalcular e alternar visão. O ícone
  de 26px do wireframe leva área de toque invisível ao redor.
- **Cor nunca sozinha:** delta leva seta e texto; supressão leva frase; estado
  degradado leva a pílula escrita. Um print em preto e branco continua legível.
- **Contraste:** texto de corpo ≥16px. Nunca rótulo dentro de campo como única
  etiqueta.
- **Movimento:** respeitar `prefers-reduced-motion`. As transições de estado são as
  únicas animações do app e desligam por completo.

---

## 10. Lista de reprovação automática

Se algum destes aparecer numa tela de app do PLUM, está errado:

1. Gradiente ou glow atrás de número.
2. Ícone dentro de círculo colorido como decoração de seção.
3. Grade de três colunas com ícone, título em negrito e duas linhas de descrição.
4. Rosca ou pizza. Parte-do-todo é barra empilhada horizontal (ver seção 3).
5. Dois eixos Y no mesmo gráfico.
6. Borda desenhada para separar segmentos. O gap de 2px é o mecanismo.
7. Texto na cor da série.
8. Número em cada ponto do gráfico.
9. Emoji como elemento de design.
10. Esqueleto de carregamento com alturas variadas.
11. `system-ui` como decisão tipográfica em vez de escolha. Se ficar, que seja
    declarado aqui como escolha consciente, não como omissão.

---

## 11. O que este documento NÃO decide

- **Tipografia com nome próprio.** Hoje tudo roda na sans do sistema. Isso é uma
  omissão herdada, não uma escolha. Vale uma decisão dedicada depois, e ela muda o
  caráter da marca inteira, então não cabia nesta revisão.
- ~~**Modo claro.** `:root` e `.dark` têm os mesmos valores hoje: o produto é dark-only.~~
  **ACONTECEU em 2026-08-12 (Direção A).** O ambiente interno é **claro**, marca `#7A2F56`, e
  `.dark` virou opt-in da landing. O aviso desta linha estava certo e foi cumprido: a paleta de
  série foi re-degrau e revalidada, não invertida — cinco medições, faixa de luminosidade **por
  matiz** (os tetos no claro vão de 32% a 65%), e o sinal do desvio de matiz **invertido**, porque
  no claro ele cancelava a rampa em vez de proteger o contraste. Ver
  `contexto/30-decisoes.md` D-029 e o teste `src/lib/contraste-serie.test.ts`.
  ⚠️ **Uma parte do alvo NÃO foi cumprida:** o ΔE sob daltonismo. Ver a nota na §3.
- **Movimento além de transição de estado.** Fora de escopo por escolha: App UI.
