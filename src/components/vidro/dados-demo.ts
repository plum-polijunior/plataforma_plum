/**
 * Dados de demonstração da Direção Vidro.
 *
 * Transcritos do protótipo `Plum Interno - Vidro v2.dc.html`. São fixos e
 * fictícios: a organização "Cali Ltda" não existe, nenhum e-mail `@cali.com.br`
 * é real e nenhuma consulta ao Supabase acontece nestas telas.
 *
 * ⚠️ NÃO são os mesmos números da Direção A, e a diferença é proposital — o
 * protótipo Vidro reescreveu a cópia para mostrar dado que incomoda: o tempo de
 * resposta PIOROU, uma base está parada com um responsável nomeado, e 212
 * pedidos ficaram de fora da conta. Um protótipo em que tudo sobe não testa se
 * a interface aguenta número ruim.
 */

export type Tela = "chat" | "bases" | "pipeline" | "org" | "membros";

/** Título e subtítulo do cabeçalho, por tela. */
export const TITULOS: Record<Tela, [string, string]> = {
  chat: ["PLUM Chat", "3 bases conectadas"],
  bases: ["Minhas Bases de Dados", ""],
  pipeline: ["Nova base", "Etapa 3 de 5"],
  org: ["Minha Organização", ""],
  membros: ["Membros", "18 pessoas"],
};

export interface Barra {
  regiao: string;
  valor: string;
  altura: string;
  /** A série que é o assunto da resposta; o resto é contexto. */
  destaque: boolean;
}

export const BARRAS: Barra[] = [
  { regiao: "Norte", valor: "R$ 890", altura: "42%", destaque: false },
  { regiao: "Nordeste", valor: "R$ 1.040", altura: "56%", destaque: false },
  { regiao: "Centro-O.", valor: "R$ 1.180", altura: "66%", destaque: false },
  { regiao: "Sudeste", valor: "R$ 1.510", altura: "92%", destaque: true },
  { regiao: "Sul", valor: "R$ 1.320", altura: "76%", destaque: false },
];

export const SUGESTOES = ["E os 212 pedidos sem região?", "Abrir o Sudeste por estado"];

export interface Kpi {
  rotulo: string;
  valor: string;
  /** Vazio quando não houve variação — a nota carrega o sentido sozinha. */
  delta: string;
  tom: "ok" | "alerta" | "neutro";
  nota: string;
}

export const KPIS_BASES: Kpi[] = [
  { rotulo: "Perguntas este mês", valor: "1.317", delta: "+18,4%", tom: "ok", nota: "vs. julho" },
  { rotulo: "Bases publicadas", valor: "3", delta: "", tom: "neutro", nota: "sem mudança desde junho" },
  { rotulo: "Linhas indexadas", valor: "412.480", delta: "+29.106", tom: "ok", nota: "vs. julho" },
  { rotulo: "Tempo médio de resposta", valor: "1,2s", delta: "+0,3s", tom: "alerta", nota: "piorou com a base nova" },
];

export const KPIS_ORG: Kpi[] = [
  { rotulo: "Pessoas com acesso", valor: "18", delta: "+3", tom: "ok", nota: "vs. julho" },
  { rotulo: "Perguntas este mês", valor: "1.317", delta: "+18,4%", tom: "ok", nota: "vs. julho" },
  { rotulo: "Usaram na última semana", valor: "9", delta: "", tom: "neutro", nota: "metade do time" },
  { rotulo: "Aguardando aprovação", valor: "2", delta: "", tom: "alerta", nota: "a mais antiga há 2 dias" },
];

export interface Base {
  nome: string;
  desc: string;
  status: "Publicada" | "Rascunho";
  colunas: string;
  quando: string;
}

export const BASES: Base[] = [
  { nome: "vendas_2026", desc: "Pedidos, canal e região", status: "Publicada", colunas: "24", quando: "hoje, 09:14" },
  { nome: "margem_produto", desc: "Custo e margem por SKU", status: "Publicada", colunas: "17", quando: "ontem, 18:02" },
  { nome: "clientes_ativos", desc: "Cadastro, segmento e cidade", status: "Publicada", colunas: "31", quando: "4 de agosto" },
  { nome: "logistica_q1", desc: "Parou na etapa 4, com Rafael", status: "Rascunho", colunas: "12", quando: "2 de agosto" },
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
  /** No resumo da Organização é linha de status; na listagem é o papel. */
  cargo: string;
  pendente: boolean;
}

export const MEMBROS_RESUMO: Membro[] = [
  { iniciais: "MR", email: "marina.rocha@cali.com.br", cargo: "Solicitou acesso há 2 dias", pendente: true },
  { iniciais: "TL", email: "t.lima@cali.com.br", cargo: "Solicitou acesso há 5 horas", pendente: true },
  { iniciais: "BA", email: "bernardo@cali.com.br", cargo: "Administrador", pendente: false },
  { iniciais: "CS", email: "carla.souza@cali.com.br", cargo: "Analista", pendente: false },
];

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
  tom: "ok" | "marca" | "neutro";
}

export const ATIVIDADE: ItemAtividade[] = [
  { texto: "Carla publicou margem_produto", quando: "hoje, 11:40", tom: "ok" },
  { texto: "Thiago pediu acesso pelo código de convite", quando: "hoje, 09:22", tom: "marca" },
  { texto: "cali.com.br verificado no SSO do Google", quando: "ontem, 16:05", tom: "ok" },
  { texto: "Você gerou um código novo e invalidou o anterior", quando: "7 de agosto", tom: "neutro" },
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
