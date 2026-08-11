/**
 * Dados de demonstração da Direção A.
 *
 * Vindos literalmente do protótipo `Plum Interno - Direcao A clara.dc.html`
 * (projeto de design "Frontend interno da plataforma Plum"). São fixos e
 * fictícios: a organização "Cali Ltda" não existe e nenhuma consulta ao
 * Supabase acontece nestas telas.
 *
 * Quando uma tela da Direção A for promovida para rota real, o contrato
 * destes tipos é o ponto de partida da query — os nomes de campo já estão
 * no formato em que a UI consome.
 */

export type Tela = "chat" | "bases" | "pipeline" | "org" | "membros";

export const TITULOS: Record<Tela, string> = {
  chat: "PLUM Chat",
  bases: "Minhas Bases de Dados",
  pipeline: "Nova base · Etapa 3 de 5",
  org: "Minha Organização",
  membros: "Membros",
};

export interface Barra {
  regiao: string;
  valor: string;
  altura: string;
  atraso: string;
}

const REGIOES = ["Norte", "Nordeste", "Centro-O.", "Sudeste", "Sul"];
const VALORES = ["R$ 890", "R$ 1.040", "R$ 1.180", "R$ 1.510", "R$ 1.320"];
const ALTURAS = ["44%", "58%", "68%", "92%", "78%"];

export const BARRAS: Barra[] = REGIOES.map((regiao, i) => ({
  regiao,
  valor: VALORES[i],
  altura: ALTURAS[i],
  atraso: `${0.15 + i * 0.07}s`,
}));

export const SUGESTOES = [
  "Comparar com o trimestre anterior",
  "Quais produtos puxaram a margem?",
  "Exportar para planilha",
];

export interface Kpi {
  rotulo: string;
  valor: string;
  delta: string;
  /** `ok` = variação desejável, `warn` = pede atenção. */
  tom: "ok" | "warn";
}

export const KPIS_BASES: Kpi[] = [
  { rotulo: "Perguntas este mês", valor: "1.284", delta: "↑ 18,4%", tom: "ok" },
  { rotulo: "Bases publicadas", valor: "3", delta: "↑ 1", tom: "ok" },
  { rotulo: "Linhas indexadas", valor: "412 mil", delta: "↑ 7,2%", tom: "ok" },
  { rotulo: "Tempo médio", valor: "0,9s", delta: "↓ 0,3s", tom: "ok" },
];

export const KPIS_ORG: Kpi[] = [
  { rotulo: "Usuários ativos", valor: "18", delta: "↑ 3", tom: "ok" },
  { rotulo: "Perguntas este mês", valor: "1.284", delta: "↑ 18,4%", tom: "ok" },
  { rotulo: "Bases conectadas", valor: "3", delta: "↑ 1", tom: "ok" },
  { rotulo: "Aprovações pendentes", valor: "2", delta: "↑ 2", tom: "warn" },
];

export interface Base {
  nome: string;
  desc: string;
  status: "Publicada" | "Rascunho";
  colunas: string;
  quando: string;
}

export const BASES: Base[] = [
  { nome: "vendas_2026", desc: "Pedidos, canal e região", status: "Publicada", colunas: "24", quando: "há 2 horas" },
  { nome: "margem_produto", desc: "Custo, preço e margem por SKU", status: "Publicada", colunas: "17", quando: "ontem" },
  { nome: "clientes_ativos", desc: "Cadastro e segmentação", status: "Publicada", colunas: "31", quando: "há 4 dias" },
  { nome: "logistica_q1", desc: "Rascunho parado na etapa 4", status: "Rascunho", colunas: "12", quando: "há 6 dias" },
];

export interface Etapa {
  num: string;
  nome: string;
  estado: "ok" | "atual" | "futuro";
}

export const ETAPAS: Etapa[] = [
  { num: "1", nome: "Upload", estado: "ok" },
  { num: "2", nome: "Colunas", estado: "ok" },
  { num: "3", nome: "Formatação", estado: "atual" },
  { num: "4", nome: "Semântica", estado: "futuro" },
  { num: "5", nome: "Publicar", estado: "futuro" },
];

export interface LinhaAmostra {
  coluna: string;
  antes: string;
  depois: string;
}

export const LINHAS_AMOSTRA: LinhaAmostra[] = [
  { coluna: "data_venda", antes: "03/02/26", depois: "2026-02-03" },
  { coluna: "valor_total", antes: "R$ 1.284,50", depois: "1284.50" },
  { coluna: "regiao", antes: "  sudeste ", depois: "Sudeste" },
  { coluna: "cliente_cnpj", antes: "12.345.678/0001-90", depois: "12345678000190" },
  { coluna: "canal", antes: "E-COMMERCE", depois: "E-commerce" },
];

export interface Membro {
  iniciais: string;
  email: string;
  /** Linha secundária no resumo da Organização. */
  cargo: string;
  pendente: boolean;
}

export const MEMBROS_RESUMO: Membro[] = [
  { iniciais: "MR", email: "marina.rocha@cali.com.br", cargo: "Solicitou acesso há 2 dias", pendente: true },
  { iniciais: "TL", email: "t.lima@cali.com.br", cargo: "Solicitou acesso há 5 horas", pendente: true },
  { iniciais: "BA", email: "bernardo@cali.com.br", cargo: "Administrador", pendente: false },
  { iniciais: "CS", email: "carla.souza@cali.com.br", cargo: "Analista", pendente: false },
];

/** Na listagem completa, `cargo` é o papel de verdade — não a linha de status
    que o resumo da Organização mostra no mesmo lugar. */
export interface MembroCompleto extends Membro {
  desde: string;
  via: "Código" | "Google SSO" | "Microsoft SSO";
}

export const MEMBROS_COMPLETOS: MembroCompleto[] = [
  { iniciais: "MR", email: "marina.rocha@cali.com.br", desde: "Solicitou há 2 dias", cargo: "—", via: "Código", pendente: true },
  { iniciais: "TL", email: "t.lima@cali.com.br", desde: "Solicitou há 5 horas", cargo: "—", via: "Código", pendente: true },
  { iniciais: "BA", email: "bernardo@cali.com.br", desde: "Desde jan. 2026", cargo: "Administrador", via: "Google SSO", pendente: false },
  { iniciais: "CS", email: "carla.souza@cali.com.br", desde: "Desde fev. 2026", cargo: "Analista", via: "Google SSO", pendente: false },
  { iniciais: "RP", email: "rafael.pinto@cali.com.br", desde: "Desde fev. 2026", cargo: "Analista", via: "Microsoft SSO", pendente: false },
  { iniciais: "JV", email: "joana.v@cali.com.br", desde: "Desde mar. 2026", cargo: "Leitor", via: "Código", pendente: false },
];

export interface ItemAtividade {
  texto: string;
  quando: string;
  /** Cor do marcador na linha do tempo. */
  tom: "ok" | "marca" | "neutro";
}

export const ATIVIDADE: ItemAtividade[] = [
  { texto: "carla.souza publicou a base margem_produto", quando: "há 3 horas", tom: "ok" },
  { texto: "t.lima solicitou acesso com o código de convite", quando: "há 5 horas", tom: "marca" },
  { texto: "Domínio cali.com.br foi verificado por SSO Google", quando: "ontem", tom: "ok" },
  { texto: "bernardo gerou um novo código de convite", quando: "há 3 dias", tom: "neutro" },
];

export interface Dominio {
  dominio: string;
  estado: "Verificado" | "Pendente";
}

export const DOMINIOS: Dominio[] = [
  { dominio: "cali.com.br", estado: "Verificado" },
  { dominio: "cali.io", estado: "Verificado" },
  { dominio: "grupocali.com", estado: "Pendente" },
];

export const ORGANIZACAO = "Cali Ltda";
export const USUARIO = { iniciais: "BA", email: "bernardo@cali.com.br", papel: "Administrador" };
export const CODIGO_CONVITE = "K7QM2XPL9WDA";
