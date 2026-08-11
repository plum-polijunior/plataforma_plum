# Direção A — ambiente interno claro

Proposta visual do ambiente interno da plataforma, portada do protótipo
`Plum Interno - Direcao A clara.dc.html` (projeto de design "Frontend interno da
plataforma Plum") para React.

**Rota:** `/direcao-a` — fora do `DashboardLayout`, sem guard de organização.

## O que isto é, e o que não é

É uma **proposta navegável**. Roda no app real, com Tailwind e os componentes do
repo, para que a direção possa ser avaliada com `npm run dev` em vez de captura
de tela.

**Não é** a plataforma. Não há Supabase, não há sessão, não há RBAC. Todos os
dados vêm de `src/components/direcao-a/dados-demo.ts` e são fictícios — a
organização "Cali Ltda" e todos os emails `@cali.com.br` são inventados. O botão
"Entrar" só troca estado local.

Nenhuma rota, página ou componente existente foi alterado. As telas atuais
continuam exatamente como estavam.

## Duas diferenças de fundo em relação ao app de hoje

1. **Tema claro.** O app atual é escuro (`--background: 240 20% 4%` em
   `src/index.css`, com `<html class="dark">`). A Direção A é clara. Os tokens
   dela vivem em `theme.extend.colors.plum` no `tailwind.config.ts` como valores
   literais, e não nas CSS vars de `:root` — misturar os dois ligaria os dois
   temas ao mesmo tempo. Quando a direção for aprovada, esses pares viram CSS
   vars e o `:root` muda de uma vez.

2. **Cor de marca nova:** `#7A2F56`, no lugar do roxo `270 70% 60%`.

## Mapa de telas

Cada tela da proposta e a página real que ela substituiria:

| Tela da Direção A | Arquivo aqui | Página real correspondente |
| --- | --- | --- |
| Login | `components/direcao-a/TelaLogin.tsx` | `pages/Auth.tsx` |
| Shell / sidebar | `components/direcao-a/Shell.tsx` | `layouts/DashboardLayout.tsx` |
| PLUM Chat | `components/direcao-a/TelaChat.tsx` | `pages/PlumChat.tsx` |
| Minhas Bases de Dados | `components/direcao-a/TelaBases.tsx` | `pages/Cfgdatabase.tsx` |
| Pipeline (etapa 3 de 5) | `components/direcao-a/TelaPipeline.tsx` | `components/DatabasePipeline.tsx` |
| Minha Organização | `components/direcao-a/TelaOrganizacao.tsx` | `pages/Dashboard.tsx` |
| Membros | `components/direcao-a/TelaMembros.tsx` | `pages/AccessPending.tsx` + `hooks/use-org-access.ts` |

## Arquivos tocados fora da pasta da Direção A

Tudo aditivo:

- `index.html` — três famílias novas no link do Google Fonts (Bricolage
  Grotesque, Geist, JetBrains Mono). O `body` continua em Inter.
- `src/index.css` — bloco de barra de rolagem e cor de link, escopado em
  `.direcao-a`. O protótipo fazia isso em seletor global, o que apagaria o tema
  escuro da landing.
- `tailwind.config.ts` — paleta `plum.*`, `fontFamily` (`display`, `geist`,
  `mono`) e as animações `pl-*`.
- `src/App.tsx` — a rota.
- `src/assets/plum-lockup.png`, `src/assets/plum-mark.png` — assets novos.
  `plum-logo.png` continua onde estava e segue em uso.

## Desvios conscientes do protótipo

O protótipo foi desenhado em viewport fixa de 1440×900 e só usa estilo inline.
Três mudanças na conversão:

- **Responsividade mínima.** As grades de KPI caem para 2 colunas abaixo de
  `lg`, as de duas colunas viram uma, e o painel decorativo do login some no
  mobile. Em 1440px o resultado é idêntico ao protótipo.
- **Ícones via `lucide-react`** em vez de SVG inline — os do protótipo já eram
  do mesmo conjunto. Exceção: os logos de Google e Microsoft na tela de login,
  que continuam inline porque `lucide` não traz marcas de terceiros.
- **Rótulos acessíveis** (`aria-label`) nos botões que só têm ícone.
