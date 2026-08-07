/**
 * ============================================================================
 *  Plataforma Plum — Material Didático (Google Slides)
 *  Gera a apresentação completa "Como a Plataforma Plum funciona"
 * ============================================================================
 *
 *  COMO USAR
 *  1. Acesse https://script.google.com  →  Novo projeto
 *  2. Cole este arquivo inteiro em Code.gs (substituindo o conteúdo)
 *  3. Salve, selecione a função  criarApresentacaoPlum  e clique em Executar
 *  4. Autorize o acesso quando o Google pedir (primeira execução)
 *  5. O link da apresentação aparece no Log (Ctrl+Enter) e o arquivo fica
 *     no seu Google Drive (raiz)
 *
 *  Conteúdo:
 *    Parte 1  — Login e Organizações
 *    Parte 2  — Agentes 0, 1, 2, 3, 3.1 e 4 → o JSON de contexto
 *    Parte 3  — Agente Z, A, C e o pandas_executor + analogia da biblioteca
 * ============================================================================
 */

// ─────────────────────────────────────────────────────────────────────────────
//  TEMA
// ─────────────────────────────────────────────────────────────────────────────
var T = {
  BG:        '#160F22',   // fundo padrão
  BG_DEEP:   '#0E0918',   // fundo dos divisores de parte
  CARD:      '#241938',   // card
  CARD_ALT:  '#2E2047',   // card destacado
  CODE_BG:   '#0B0714',   // fundo de bloco de código
  PURPLE:    '#A970FF',   // roxo Plum
  PURPLE_LT: '#CDAEFF',
  WHITE:     '#F6F2FB',
  MUTED:     '#A093B8',
  GREEN:     '#5BE7B4',
  AMBER:     '#FFC46B',
  RED:       '#FF8090',
  BLUE:      '#7FB8FF',
  FONT:      'Roboto',
  MONO:      'Roboto Mono'
};

var W = 720;   // largura do slide (pt)
var H = 405;   // altura do slide (pt)
var M = 46;    // margem lateral
var CW = W - (M * 2); // largura útil = 628

// ─────────────────────────────────────────────────────────────────────────────
//  ENTRY POINT
// ─────────────────────────────────────────────────────────────────────────────
function criarApresentacaoPlum() {
  var pres = SlidesApp.create('Plataforma Plum — Como Funciona (Material Didático)');

  // limpa o slide padrão
  var slides = pres.getSlides();
  for (var i = slides.length - 1; i >= 0; i--) slides[i].remove();

  // ---- Abertura ----
  s01_capa(pres);
  s02_mapa(pres);

  // ---- Parte 1: Login e Organizações ----
  s03_divisorParte1(pres);
  s04_duasPortas(pres);
  s05_tresCaminhos(pres);
  s06_quatroEstados(pres);
  s07_cracha(pres);
  s08_rls(pres);

  // ---- Parte 2: O JSON de contexto ----
  s09_divisorParte2(pres);
  s10_problema(pres);
  s11_pipeline(pres);
  s12_elencoAgentes(pres);
  s13_uploadInvisivel(pres);
  s14_agente3(pres);
  s15_agente1e2(pres);
  s16_schemaMetadata(pres);
  s17_separacao(pres);

  // ---- Parte 3: Como o Plum responde ----
  s18_divisorParte3(pres);
  s19_quatroEstacoes(pres);
  s20_agenteZ(pres);
  s21_agenteA(pres);
  s22_pandas(pres);
  s23_economia(pres);
  s24_agenteC(pres);

  // ---- Analogia da biblioteca ----
  s25_divisorBiblioteca(pres);
  s26_cenario1(pres);
  s27_cenario2(pres);
  s28_elencoBiblioteca(pres);
  s29_porQueMuda(pres);
  s30_recap(pres);

  pres.saveAndClose();

  var url = pres.getUrl();
  Logger.log('✅ Apresentação criada com ' + 30 + ' slides:');
  Logger.log(url);
  return url;
}


/* ==========================================================================
 *  HELPERS DE LAYOUT
 * ========================================================================== */

/** Cria um slide em branco com o fundo do tema. */
function newSlide(pres, bg) {
  var slide = pres.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  slide.getBackground().setSolidFill(bg || T.BG);
  return slide;
}

/**
 * Caixa de texto configurável.
 * o = { size, color, bold, font, align, valign, lineSpacing, spaceBelow }
 */
function txt(slide, text, x, y, w, h, o) {
  o = o || {};
  var box = slide.insertTextBox(text, x, y, w, h);
  var tr = box.getText();
  var st = tr.getTextStyle();
  st.setFontFamily(o.font || T.FONT);
  st.setFontSize(o.size || 14);
  st.setForegroundColor(o.color || T.WHITE);
  st.setBold(!!o.bold);

  var ps = tr.getParagraphStyle();
  ps.setLineSpacing(o.lineSpacing || 108);
  ps.setSpaceBelow(o.spaceBelow === undefined ? 6 : o.spaceBelow);
  ps.setSpaceAbove(0);
  if (o.align) ps.setParagraphAlignment(o.align);

  box.setContentAlignment(o.valign || SlidesApp.ContentAlignment.TOP);
  return box;
}

/** Retângulo arredondado (card). */
function card(slide, x, y, w, h, fill, borderColor) {
  var sh = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, x, y, w, h);
  sh.getFill().setSolidFill(fill || T.CARD);
  if (borderColor) {
    sh.getBorder().setWeight(1);
    sh.getBorder().getLineFill().setSolidFill(borderColor);
  } else {
    sh.getBorder().setTransparent();
  }
  return sh;
}

/** Barra fina vertical (acento). */
function accentBar(slide, x, y, h, color) {
  var sh = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, x, y, 4, h);
  sh.getFill().setSolidFill(color || T.PURPLE);
  sh.getBorder().setTransparent();
  return sh;
}

/** Cabeçalho padrão de slide de conteúdo: kicker + título. */
function header(slide, kicker, title, accent) {
  accentBar(slide, M, 30, 46, accent || T.PURPLE);
  txt(slide, kicker.toUpperCase(), M + 14, 28, CW, 16,
      { size: 10, color: accent || T.PURPLE, bold: true, spaceBelow: 0 });
  txt(slide, title, M + 14, 43, CW - 14, 36,
      { size: 25, color: T.WHITE, bold: true, spaceBelow: 0 });
}

/** Rodapé discreto com a frase-chave do slide. */
function keyline(slide, text, color) {
  var y = 356;
  accentBar(slide, M, y + 2, 20, color || T.PURPLE);
  txt(slide, text, M + 14, y, CW - 14, 26,
      { size: 12, color: color || T.PURPLE_LT, bold: true, spaceBelow: 0 });
}

/** Card com título colorido + corpo. Retorna a altura usada. */
function infoCard(slide, x, y, w, h, titulo, corpo, cor, fill) {
  card(slide, x, y, w, h, fill || T.CARD);
  txt(slide, titulo, x + 16, y + 10, w - 32, 30,
      { size: 12.5, color: cor || T.PURPLE_LT, bold: true, spaceBelow: 2 });
  if (corpo) {
    txt(slide, corpo, x + 16, y + 34, w - 32, h - 44,
        { size: 10, color: T.MUTED, lineSpacing: 110, spaceBelow: 4 });
  }
}

/** Bloco de código monoespaçado. */
function codeBlock(slide, code, x, y, w, h, size) {
  var sh = card(slide, x, y, w, h, T.CODE_BG, '#3A2A56');
  txt(slide, code, x + 14, y + 12, w - 28, h - 24,
      { size: size || 9.5, color: T.GREEN, font: T.MONO, lineSpacing: 118, spaceBelow: 0 });
  return sh;
}

/** Etapa numerada de fluxo horizontal. */
function flowStep(slide, x, y, w, h, num, titulo, sub, cor) {
  card(slide, x, y, w, h, T.CARD, cor);
  txt(slide, num, x + 12, y + 9, w - 24, 18,
      { size: 11, color: cor, bold: true, spaceBelow: 0 });
  txt(slide, titulo, x + 12, y + 26, w - 24, 34,
      { size: 12.5, color: T.WHITE, bold: true, spaceBelow: 0 });
  if (sub) {
    txt(slide, sub, x + 12, y + 57, w - 24, h - 64,
        { size: 9, color: T.MUTED, lineSpacing: 108, spaceBelow: 0 });
  }
}

/** Seta "→" entre elementos. */
function arrow(slide, x, y, cor) {
  txt(slide, '→', x, y, 22, 24,
      { size: 17, color: cor || T.PURPLE, bold: true,
        align: SlidesApp.ParagraphAlignment.CENTER, spaceBelow: 0 });
}

/** Notas do apresentador. */
function notes(slide, text) {
  slide.getNotesPage().getSpeakerNotesShape().getText().setText(text);
}

/** Slide divisor de parte. */
function divider(pres, numero, titulo, subtitulo, cor) {
  var s = newSlide(pres, T.BG_DEEP);
  // faixa lateral decorativa
  var bar = s.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, 8, H);
  bar.getFill().setSolidFill(cor || T.PURPLE);
  bar.getBorder().setTransparent();

  txt(s, numero.toUpperCase(), M + 20, 132, CW, 20,
      { size: 12, color: cor || T.PURPLE, bold: true, spaceBelow: 0 });
  txt(s, titulo, M + 20, 152, CW - 40, 70,
      { size: 38, color: T.WHITE, bold: true, spaceBelow: 0 });
  txt(s, subtitulo, M + 20, 226, CW - 80, 46,
      { size: 15, color: T.MUTED, spaceBelow: 0 });
  return s;
}


/* ==========================================================================
 *  ABERTURA
 * ========================================================================== */

function s01_capa(pres) {
  var s = newSlide(pres, T.BG_DEEP);

  // bloco roxo decorativo à direita
  var glow = s.insertShape(SlidesApp.ShapeType.RECTANGLE, 470, 0, 250, H);
  glow.getFill().setSolidFill(T.CARD_ALT);
  glow.getBorder().setTransparent();

  txt(s, 'MATERIAL DIDÁTICO · NÚCLEO DE INOVAÇÃO', M, 96, 400, 18,
      { size: 10, color: T.PURPLE, bold: true, spaceBelow: 0 });
  txt(s, 'Plataforma Plum', M, 116, 420, 60,
      { size: 44, color: T.WHITE, bold: true, spaceBelow: 0 });
  txt(s, 'Como a plataforma funciona —\na lógica por trás de cada peça', M, 184, 400, 56,
      { size: 16, color: T.PURPLE_LT, spaceBelow: 0 });

  accentBar(s, M, 258, 60, T.PURPLE);
  txt(s, '1 · Login e Organizações\n2 · Os agentes e o JSON de contexto\n3 · O motor de respostas do Plum',
      M + 14, 256, 400, 66,
      { size: 12, color: T.MUTED, lineSpacing: 130, spaceBelow: 0 });

  txt(s, 'Plum\n🧠', 520, 150, 160, 100,
      { size: 30, color: T.PURPLE_LT, bold: true,
        align: SlidesApp.ParagraphAlignment.CENTER, spaceBelow: 0 });
  txt(s, 'read-only\npor design', 520, 250, 160, 40,
      { size: 11, color: T.MUTED,
        align: SlidesApp.ParagraphAlignment.CENTER, spaceBelow: 0 });

  notes(s, 'Objetivo do material: sair daqui entendendo POR QUE cada peça existe, ' +
           'não apenas o que ela faz. O fio condutor de tudo é uma frase: a IA planeja, o código executa.');
}

function s02_mapa(pres) {
  var s = newSlide(pres);
  header(s, 'Visão geral', 'Três perguntas que a plataforma responde');

  var w = 196, gap = 20, y = 108, h = 200;
  var x1 = M, x2 = M + w + gap, x3 = M + (w + gap) * 2;

  infoCard(s, x1, y, w, h, '1. Quem é você?',
    'Login, organizações e permissões.\n\nAntes de qualquer dado, a plataforma precisa saber quem pergunta e o que essa pessoa pode ver.\n\nSupabase Auth + RLS.',
    T.BLUE);
  infoCard(s, x2, y, w, h, '2. Do que estamos falando?',
    'Agentes 0 → 4.\n\nEles transformam uma planilha crua num JSON de contexto: uma "bula" que explica cada coluna para a IA.\n\nAcontece uma vez, no cadastro da base.',
    T.AMBER);
  infoCard(s, x3, y, w, h, '3. Qual é a resposta?',
    'Agentes Z, A e C + pandas.\n\nRespondem perguntas em linguagem natural com precisão matemática — sem que nenhuma IA leia os seus dados.\n\nAcontece a cada pergunta do chat.',
    T.GREEN);

  keyline(s, 'Um fio condutor atravessa as três: a IA planeja, o código executa.');
  notes(s, 'Deixe claro que a Parte 2 acontece UMA vez (onboarding da base) e a Parte 3 acontece ' +
           'a CADA pergunta. Essa distinção evita muita confusão depois.');
}


/* ==========================================================================
 *  PARTE 1 — LOGIN E ORGANIZAÇÕES
 * ========================================================================== */

function s03_divisorParte1(pres) {
  var s = divider(pres, 'Parte 1', 'Login e Organizações',
    'Identidade não é permissão. São duas portas diferentes — e só uma delas é automática.',
    T.BLUE);
  notes(s, 'Esta parte responde: como alguém entra na plataforma, como cai na empresa certa, ' +
           'e como o banco garante que ninguém veja o dado de outra empresa.');
}

function s04_duasPortas(pres) {
  var s = newSlide(pres);
  header(s, 'A ideia central', 'Duas portas, não uma', T.BLUE);

  var w = 304, gap = 20, y = 104, h = 182;

  infoCard(s, M, y, w, h, '🔑  Porta 1 — Autenticação',
    'A pergunta: "você é você mesmo?"\n\nQuem responde: Google, Microsoft ou e-mail + senha, via Supabase Auth.\n\nÉ automático. Um provedor externo garante a identidade e nós confiamos nele.',
    T.BLUE);

  infoCard(s, M + w + gap, y, w, h, '🚪  Porta 2 — Autorização',
    'A pergunta: "você pode ver os dados desta empresa?"\n\nQuem responde: um humano — o Admin da organização.\n\nNão é automático. É um ato explícito, registrado, de alguém que responde por aquele acesso.',
    T.AMBER);

  card(s, M, 296, CW, 52, T.CARD_ALT);
  txt(s, 'Passar pela porta 1 não abre a porta 2.\nEntrar na organização não dá acesso aos dados.',
      M + 18, 304, CW - 36, 40, { size: 13, color: T.WHITE, bold: true, spaceBelow: 0 });

  notes(s, 'Este é o ponto mais importante da Parte 1. Muita gente assume que "logou = tem acesso". ' +
           'No Plum, o SSO só prova quem você é; o Admin é quem libera. Isso existe porque o produto ' +
           'vende segurança — um domínio verificado roteia todo mundo daquele e-mail, então a liberação ' +
           'tem que ser manual.');
}

function s05_tresCaminhos(pres) {
  var s = newSlide(pres);
  header(s, 'Fluxo de entrada', 'Três caminhos para entrar numa organização', T.BLUE);

  var w = 196, gap = 20, y = 100, h = 196;

  infoCard(s, M, y, w, h, '① Criar organização',
    'RPC criar_organizacao(nome).\n\nVocê nasce Admin e ativo.\n\nA org recebe um join_code de 12 caracteres.\n\nSeu domínio entra em organization_domains — não verificado.',
    T.GREEN);

  infoCard(s, M + w + gap, y, w, h, '② Código de convite',
    'RPC resolver_codigo_organizacao(codigo).\n\nDevolve apenas { org_id, org_name }.\n\nNunca a lista de organizações — isso impede descobrir a carteira de clientes do Plum.',
    T.PURPLE_LT);

  infoCard(s, M + (w + gap) * 2, y, w, h, '③ SSO por domínio',
    'Login com Google ou Microsoft.\n\nO servidor lê o domínio do e-mail já verificado pelo provedor e o busca em organization_domains com verified = true.\n\nProvedores públicos ficam numa denylist.',
    T.BLUE);

  keyline(s, 'Nos caminhos ② e ③ você entra sempre como "pendente". Sempre.', T.AMBER);

  notes(s, 'A trigger handle_new_user() é quem faz esse roteamento no momento em que o usuário nasce ' +
           'em auth.users. Toda tentativa de vínculo é gravada em domain_binding_audit, com o sinal ' +
           'usado (ms_tid, google_hd, email_domain, share_id) e o resultado.');
}

function s06_quatroEstados(pres) {
  var s = newSlide(pres);
  header(s, 'Estados do usuário', 'Onde você pode estar depois de logar', T.BLUE);

  var y = 104, h = 60, gap = 12;
  var rows = [
    ['sem-org',   'Domínio público, não mapeado ou não verificado', '"Nenhuma organização vinculada"', T.MUTED],
    ['pendente',  'Vinculado à organização, sem aprovação do Admin', '"Aguardando liberação"', T.AMBER],
    ['ativo',     'O Admin aprovou e atribuiu um cargo (role_id)',   'Dashboard da organização', T.GREEN],
    ['bloqueado', 'Status rejeitado ou desativado',                  '"Acesso indisponível"', T.RED]
  ];

  for (var i = 0; i < rows.length; i++) {
    var yy = y + i * (h + gap);
    card(s, M, yy, CW, h, T.CARD);
    accentBar(s, M, yy + 8, h - 16, rows[i][3]);
    txt(s, rows[i][0], M + 18, yy + 10, 110, 22,
        { size: 14, color: rows[i][3], bold: true, font: T.MONO, spaceBelow: 0 });
    txt(s, rows[i][1], M + 18, yy + 33, 300, 20,
        { size: 10, color: T.MUTED, spaceBelow: 0 });
    txt(s, '→  ' + rows[i][2], M + 340, yy + 20, CW - 360, 24,
        { size: 12, color: T.WHITE, spaceBelow: 0 });
  }

  notes(s, 'Implementado em use-org-access.ts e AccessPending.tsx; o guard de rota está em ' +
           'DashboardLayout.tsx. O ponto didático: são quatro telas diferentes, e três delas NÃO ' +
           'mostram dado nenhum.');
}

function s07_cracha(pres) {
  var s = newSlide(pres);
  header(s, 'JWT', 'O crachá: o que viaja em cada requisição', T.BLUE);

  txt(s, 'No login, um hook do Supabase (Custom Access Token Hook) injeta no token do usuário quatro informações. ' +
         'Elas viajam em toda requisição e são lidas pelo próprio banco.',
      M, 100, CW, 40, { size: 12, color: T.MUTED, spaceBelow: 0 });

  codeBlock(s,
    '{\n' +
    '  "organization_id": "uuid da org, ou null",\n' +
    '  "profile_status" : "pendente | ativo | rejeitado | desativado | sem_org",\n' +
    '  "role_id"        : "uuid do cargo, ou null",\n' +
    '  "role_name"      : "Admin, Analista, ..."\n' +
    '}', M, 144, 340, 112, 8.5);

  infoCard(s, M + 356, 144, 272, 112, 'Por que no token, e não numa consulta?',
    'Porque o banco precisa disso em toda checagem de RLS. Se estivesse só na tabela profiles, seria uma query extra por verificação.',
    T.PURPLE_LT);

  card(s, M, 266, CW, 76, T.CARD_ALT);
  txt(s, '⚠️  Fail-closed', M + 18, 278, 200, 20,
      { size: 12, color: T.RED, bold: true, spaceBelow: 0 });
  txt(s, 'Se a claim faltar ou vier com nome errado, o comportamento é NEGAR acesso — nunca liberar. ' +
         'Existe até um teste "anti-drift" que quebra o build se as chaves emitidas pelo hook divergirem ' +
         'das chaves lidas pelas policies, porque um rename silencioso faria o RLS parar de casar sem erro nenhum.',
      M + 18, 298, CW - 36, 42, { size: 10, color: T.MUTED, spaceBelow: 0 });

  notes(s, 'A regra de ouro: o banco confia no crachá assinado, nunca na palavra do frontend. ' +
           'O frontend pode ser modificado por qualquer pessoa com o DevTools aberto.');
}

function s08_rls(pres) {
  var s = newSlide(pres);
  header(s, 'Multitenancy', 'RLS: um porteiro dentro de cada gaveta', T.BLUE);

  var w = 304, gap = 20, y = 104, h = 108;

  infoCard(s, M, y, w, h, 'Sem RLS (o jeito comum)',
    'A regra "só traga o que é da minha empresa" vive na aplicação. Um WHERE esquecido em um endpoint = vazamento entre clientes.',
    T.RED);
  infoCard(s, M + w + gap, y, w, h, 'Com RLS (o jeito Plum)',
    'A regra vive no Postgres. Mesmo que o frontend peça "traga tudo", o banco devolve apenas as linhas da organização do crachá.',
    T.GREEN);

  card(s, M, y + h + 16, CW, 96, T.CARD);
  txt(s, 'Toda tabela com dado de cliente carrega organization_id + policy de RLS',
      M + 18, y + h + 28, CW - 36, 22, { size: 13, color: T.WHITE, bold: true, spaceBelow: 0 });
  txt(s, 'organizations · organization_domains · profiles · roles · datasets · domain_binding_audit\n' +
         'Consequência prática: um bug de frontend deixa de ser incidente de segurança entre empresas. ' +
         'O isolamento não depende de o código da aplicação estar correto.',
      M + 18, y + h + 50, CW - 36, 56, { size: 10, color: T.MUTED, lineSpacing: 118, spaceBelow: 0 });

  card(s, M, 326, CW, 46, T.CARD_ALT);
  txt(s, 'E as RPCs security definer?   Existem para o banco fazer, com privilégio de servidor, exatamente ' +
         'uma coisa e devolver exatamente um dado — sem abrir a tabela inteira para leitura.',
      M + 18, 334, CW - 36, 32, { size: 10, color: T.PURPLE_LT, spaceBelow: 0 });

  notes(s, 'Exemplo concreto: resolver_codigo_organizacao. Sem ela, para validar um código de convite ' +
           'o frontend precisaria de permissão de SELECT em organizations — e aí bastaria pedir todas as ' +
           'linhas para listar todos os clientes do Plum. Isso se chama tenant enumeration.');
}


/* ==========================================================================
 *  PARTE 2 — O JSON DE CONTEXTO
 * ========================================================================== */

function s09_divisorParte2(pres) {
  var s = divider(pres, 'Parte 2', 'Do arquivo cru ao JSON de contexto',
    'Agentes 0, 1, 2, 3, 3.1 e 4 — o que acontece quando alguém sobe uma planilha.',
    T.AMBER);
  notes(s, 'Lembre: isso roda UMA vez, no cadastro da base. É investimento inicial que barateia ' +
           'todas as perguntas futuras.');
}

function s10_problema(pres) {
  var s = newSlide(pres);
  header(s, 'O problema', 'Uma planilha não se explica', T.AMBER);

  var w = 196, gap = 20, y = 102, h = 140;

  infoCard(s, M, y, w, h, 'Nomes que ninguém entende',
    'fat_liq · dt_ref · resp · qtd_un · st\n\nÓbvio para quem montou a planilha. Ilegível para qualquer outra pessoa — e para a IA.',
    T.RED);
  infoCard(s, M + w + gap, y, w, h, 'Tipos que mentem',
    '"R$ 1.250,00" parece número, mas é texto.\n\n"31/07/2025", "2025-07-31" e "jul/25" convivem na mesma coluna.',
    T.RED);
  infoCard(s, M + (w + gap) * 2, y, w, h, 'Regras invisíveis',
    'Status "OK" quer dizer o quê? Vendido? Entregue? Pago?\n\nEssa resposta só existe na cabeça do gestor.',
    T.RED);

  card(s, M, 256, CW, 86, T.CARD_ALT);
  txt(s, 'Uma IA que olhasse isso direto iria chutar. E chute em número é fatal num produto de decisão.',
      M + 18, 264, CW - 36, 24, { size: 13, color: T.WHITE, bold: true, spaceBelow: 0 });
  txt(s, 'Por isso, antes de qualquer pergunta, a planilha ganha uma bula: um documento curto que diz, coluna por ' +
         'coluna, o que aquilo significa e como limpar o valor. Essa bula é o schema_metadata — e a Parte 2 ' +
         'inteira existe para produzi-la, com um humano revisando.',
      M + 18, 288, CW - 36, 50, { size: 10.5, color: T.MUTED, lineSpacing: 118, spaceBelow: 0 });

  notes(s, 'Reforce: o objetivo dos agentes 1 a 4 não é adivinhar o negócio do cliente. É preparar um ' +
           'rascunho bom o suficiente para que o humano só precise corrigir, em vez de escrever do zero. ' +
           'Human-in-the-loop é obrigatório.');
}

function s11_pipeline(pres) {
  var s = newSlide(pres);
  header(s, 'DatabasePipeline.tsx', 'O pipeline em 5 etapas', T.AMBER);

  var w = 108, gap = 22, y = 118, h = 118;
  var steps = [
    ['ETAPA 1', 'Upload\ninvisível', 'Lido no navegador. Só cabeçalho + 5 linhas sobem.', T.PURPLE],
    ['ETAPA 2', 'Colunas',  'Normalização para snake_case. Agente 4 tira dúvidas.', T.PURPLE],
    ['ETAPA 3', 'Formatação', 'Agentes 3 e 3.1 geram formattingRules. Antes vs. depois.', T.AMBER],
    ['ETAPA 4', 'Semântica', 'Agentes 1 e 2 escrevem o significado de cada coluna.', T.AMBER],
    ['ETAPA 5', 'Publicação', 'schema_metadata salvo em datasets. Base fica ativa.', T.GREEN]
  ];

  for (var i = 0; i < steps.length; i++) {
    var x = M + i * (w + gap);
    flowStep(s, x, y, w, h, steps[i][0], steps[i][1], steps[i][2], steps[i][3]);
    if (i < steps.length - 1) arrow(s, x + w, y + 46, T.MUTED);
  }

  card(s, M, 258, CW, 82, T.CARD);
  txt(s, 'Duas decisões de engenharia que valem comentar', M + 18, 268, CW - 36, 22,
      { size: 12.5, color: T.PURPLE_LT, bold: true, spaceBelow: 0 });
  txt(s, '• Sketch salvo a cada etapa (datasets.sketch). Dá para fechar o navegador na etapa 3 e voltar depois no mesmo ponto.\n' +
         '• Nada é destrutivo: o pipeline não altera o arquivo do cliente — apenas descreve como ler.',
      M + 18, 290, CW - 36, 46, { size: 10, color: T.MUTED, lineSpacing: 118, spaceBelow: 3 });

  notes(s, 'Note a ordem: formatação vem ANTES da semântica. Faz sentido — é mais fácil descrever o que ' +
           'uma coluna significa depois de ver o valor limpo do que olhando "R$ 1.250,00" como texto.');
}

function s12_elencoAgentes(pres) {
  var s = newSlide(pres);
  header(s, 'Edge Function "ai-agents"', 'O elenco: seis papéis, uma única função', T.AMBER);

  var w = 200, gap = 14, hh = 84;
  var col = [M, M + w + gap, M + (w + gap) * 2];
  var row = [96, 96 + hh + 11, 96 + (hh + 11) * 2];

  var ags = [
    ['Agente 0 — Guardião', 'action: guard', 'O prompt é sobre montar base de dados? Devolve PERMITIDO ou BLOQUEADO. Nada roda antes dele.', T.PURPLE],
    ['Agente 1 — Semântica', 'action: predict_semantics', 'Olha cabeçalhos + amostras e escreve o significado de cada coluna. Devolve JSON coluna→descrição.', T.AMBER],
    ['Agente 2 — Refinamento', 'action: refine_semantics', 'Pega o texto que o humano editou e o reescreve para ser lido por outro LLM depois.', T.AMBER],
    ['Agente 3 — Formatação', 'action: format_data', 'De 5 linhas de amostra, gera formattingRules por coluna + formattedSamples (o "depois").', T.GREEN],
    ['Agente 3.1 — Ajuste', 'action: refine_format', 'Muda SÓ a regra que o usuário pediu e mantém todas as outras intactas. Reaplica nas amostras.', T.GREEN],
    ['Agente 4 — Suporte', 'action: column_support', 'Chat de tira-dúvidas durante o upload: "essa coluna é o quê?". Não altera o pipeline.', T.BLUE]
  ];

  for (var i = 0; i < ags.length; i++) {
    var x = col[i % 3], y = row[Math.floor(i / 3)];
    card(s, x, y, w, hh, T.CARD);
    txt(s, ags[i][0], x + 14, y + 9, w - 28, 18,
        { size: 11.5, color: ags[i][3], bold: true, spaceBelow: 0 });
    txt(s, ags[i][1], x + 14, y + 26, w - 28, 14,
        { size: 8.5, color: T.MUTED, font: T.MONO, spaceBelow: 0 });
    txt(s, ags[i][2], x + 14, y + 41, w - 28, hh - 47,
        { size: 9, color: T.WHITE, lineSpacing: 108, spaceBelow: 0 });
  }

  keyline(s, 'Uma Edge Function, um parâmetro "action". A API key do Gemini nunca chega ao navegador.', T.AMBER);

  notes(s, 'Por que um roteador só, e não seis funções? Porque o que muda entre os agentes é ' +
           'apenas o systemInstruction e o formato de resposta. Toda a mecânica — CORS, chave, parse de ' +
           'JSON, tratamento de erro — é a mesma. Seis deploys separados seriam seis lugares para ' +
           'esquecer de corrigir um bug.');
}

function s13_uploadInvisivel(pres) {
  var s = newSlide(pres);
  header(s, 'Etapa 1', 'Upload invisível: o arquivo nunca sobe', T.AMBER);

  var w = 304, gap = 20, y = 98, h = 136;

  infoCard(s, M, y, w, h, 'O que acontece',
    'O .csv/.xlsx é lido no navegador, via FileReader.\n\nSobem ao servidor apenas os nomes das colunas e 5 linhas de amostra.\n\nO resto nunca sai da máquina do usuário.',
    T.GREEN);

  infoCard(s, M + w + gap, y, w, h, 'Por que 5 linhas bastam',
    'Para inferir tipo e formato, 5 exemplos bastam — o sexto raramente ensina algo novo.\n\nJá mandar 100.000 linhas a um LLM é caro, lento e põe PII no prompt.',
    T.PURPLE_LT);

  card(s, M, 242, CW, 100, T.CARD_ALT);
  txt(s, 'Primeira aparição da regra de ouro do Plum', M + 18, 252, CW - 36, 22,
      { size: 12.5, color: T.PURPLE_LT, bold: true, spaceBelow: 0 });
  txt(s, '“Mande o mínimo de dado possível, o mais tarde possível, para o menor número de peças possível.”',
      M + 18, 274, CW - 36, 26, { size: 15, color: T.WHITE, bold: true, spaceBelow: 0 });
  txt(s, 'Ela reaparece na Parte 3 três vezes: no column-range GET (só as colunas do plano), no cache TTL ' +
         '(não pedir de novo) e no vetor de resultados (o Agente C recebe um número, não uma tabela).',
      M + 18, 302, CW - 36, 32, { size: 10.5, color: T.MUTED, lineSpacing: 116, spaceBelow: 0 });

  notes(s, 'Vale dizer em voz alta: isso não é só economia. É o argumento comercial. "Seus dados não ' +
           'sobem para a nossa nuvem nem para o Google Gemini" é uma frase que fecha reunião com TI.');
}

function s14_agente3(pres) {
  var s = newSlide(pres);
  header(s, 'Etapa 3 · Agentes 3 e 3.1', 'A regra é texto. Quem executa é Python.', T.AMBER);

  txt(s, 'O Agente 3 devolve dois objetos ao mesmo tempo:', M, 98, CW, 18,
      { size: 11.5, color: T.MUTED, spaceBelow: 0 });

  codeBlock(s,
    '"formattingRules": {\n' +
    '  "faturamento": "Retirar R$, trocar vírgula\n' +
    '                  por ponto, converter p/ float",\n' +
    '  "data_venda" : "Converter para data, dia/mês/ano"\n' +
    '}\n' +
    '\n' +
    '"formattedSamples": [ ...as 5 linhas já limpas... ]',
    M, 120, 320, 112, 8.5);

  infoCard(s, M + 336, 120, 292, 112, 'Por que a regra é uma frase, e não código?',
    'Porque ela precisa ser lida e corrigida por um humano na tela — e reaplicada depois pelo Python. ' +
    'apply_formatting_rules(), no pandas_executor.py, interpreta essas frases e faz a conversão de verdade.',
    T.GREEN);

  card(s, M, 242, CW, 100, T.CARD);
  txt(s, 'Agente 3.1 — o ajuste cirúrgico', M + 18, 250, CW - 36, 22,
      { size: 12.5, color: T.GREEN, bold: true, spaceBelow: 0 });
  txt(s, 'O usuário digita no chat: "na verdade quero a data como mês/ano".\n' +
         'O Agente 3.1 recebe as regras ATUAIS + o pedido, altera apenas aquela regra, mantém todas as outras ' +
         'byte a byte e reaplica o conjunto completo nas 5 amostras.',
      M + 18, 272, CW - 36, 62, { size: 10.5, color: T.MUTED, lineSpacing: 120, spaceBelow: 4 });

  keyline(s, 'Sem o 3.1, cada correção pediria uma nova geração — e a IA "consertaria" o que já estava certo.', T.AMBER);

  notes(s, 'Esse é um padrão que vale levar para outros projetos: quando um LLM produz um objeto que o ' +
           'humano vai revisar, sempre tenha um agente de edição incremental. Regenerar tudo a cada ' +
           'feedback destrói o trabalho de revisão já feito.');
}

function s15_agente1e2(pres) {
  var s = newSlide(pres);
  header(s, 'Etapa 4 · Agentes 1 e 2', 'A frase mais importante do sistema', T.AMBER);

  var w = 196, gap = 20, y = 98, h = 148;

  infoCard(s, M, y, w, h, 'Agente 1 propõe',
    'fat_liq\n↓\n"Faturamento líquido da venda, em reais, já sem impostos."\n\nEle olha o nome da coluna + as 5 amostras.',
    T.AMBER);
  infoCard(s, M + w + gap, y, w, h, 'O humano corrige',
    'Passo obrigatório.\n\nSó o gestor sabe que "OK" quer dizer "pago", e não "entregue".\n\nContexto de negócio não se infere de 5 linhas.',
    T.WHITE);
  infoCard(s, M + (w + gap) * 2, y, w, h, 'Agente 2 refina',
    'Pega o texto do humano — truncado, com gíria interna — e reescreve para ser inequívoco para o LLM que vai lê-lo depois.\n\nNão muda o sentido. Muda a clareza.',
    T.AMBER);

  card(s, M, 254, CW, 88, T.CARD_ALT);
  txt(s, 'Por que essa frase carrega tanto peso', M + 18, 262, CW - 36, 22,
      { size: 12.5, color: T.PURPLE_LT, bold: true, spaceBelow: 0 });
  txt(s, 'Na Parte 3, a única coisa que o Agente A vai ler sobre esta base é esse conjunto de frases — ele nunca verá uma linha de dado.\n' +
         'Uma definição ruim aqui vira, meses depois, uma resposta errada no chat. Daí a revisão humana não ser opcional.',
      M + 18, 284, CW - 36, 54, { size: 10.5, color: T.MUTED, lineSpacing: 118, spaceBelow: 4 });

  notes(s, 'Se alguém perguntar "por que não deixar a IA olhar os dados na hora da pergunta?", a resposta ' +
           'é a Parte 3 inteira. Mas o resumo é: porque aí ela veria os dados. E a gente não quer isso.');
}

function s16_schemaMetadata(pres) {
  var s = newSlide(pres);
  header(s, 'Etapa 5', 'O produto final: schema_metadata', T.GREEN);

  codeBlock(s,
    '{\n' +
    '  "columns": {\n' +
    '    "faturamento": {\n' +
    '      "semantic_definition": "Valor total da venda em reais (BRL),\n' +
    '                              líquido de impostos.",\n' +
    '      "cleaning_rule": "Remover R$, trocar vírgula por ponto,\n' +
    '                        converter para float."\n' +
    '    },\n' +
    '    "data_venda": {\n' +
    '      "semantic_definition": "Data em que a venda foi fechada.",\n' +
    '      "cleaning_rule": "Converter para date, formato dia/mês/ano."\n' +
    '    }\n' +
    '  }\n' +
    '}', M, 100, 380, 212, 8.5);

  infoCard(s, M + 396, 100, 232, 106, 'Onde isso mora',
    'datasets.schema_metadata (jsonb), no Postgres, sob RLS.\n\nAo lado: google_sheet_id.',
    T.GREEN);

  infoCard(s, M + 396, 214, 232, 98, 'Duas chaves, dois leitores',
    'semantic_definition → LLM (Z e A)\n\ncleaning_rule → Python (pandas)',
    T.PURPLE_LT);

  keyline(s, 'Os dados ficam no Google Sheets. Aqui mora apenas o entendimento sobre eles.', T.GREEN);

  notes(s, 'Ao publicar, o sketch é zerado e o dataset vira status "active". A partir desse momento a base ' +
           'está disponível no chat.');
}

function s17_separacao(pres) {
  var s = newSlide(pres);
  header(s, 'Arquitetura', 'A separação que sustenta tudo', T.GREEN);

  var w = 304, gap = 20, y = 102, h = 170;

  infoCard(s, M, y, w, h, '🧠  No Postgres — o significado',
    'O schema_metadata.\n\n• Pequeno (alguns KB)\n• Barato de trafegar\n• Versionável e auditável\n• Zero valor real do cliente\n\nÉ o que a IA lê.',
    T.PURPLE_LT);

  infoCard(s, M + w + gap, y, w, h, '📊  No Google Sheets — o dado',
    'A planilha do cliente.\n\n• Grande (dezenas de milhares de linhas)\n• Sensível, com PII\n• Atualizada na fonte\n• Fica onde já está\n\nÉ o que o Python lê.',
    T.GREEN);

  card(s, M, 280, CW, 62, T.CARD_ALT);
  txt(s, 'O contexto é barato e circula livremente entre os agentes.\nO dado é caro e privado — e nunca circula.',
      M + 18, 290, CW - 36, 44, { size: 13.5, color: T.WHITE, bold: true, lineSpacing: 122, spaceBelow: 0 });

  notes(s, 'Essa é a transição para a Parte 3. Toda a Parte 3 é consequência desta separação: se a IA só ' +
           'tem o catálogo, ela só pode planejar. Alguém sem IA tem que ir buscar o dado.');
}


/* ==========================================================================
 *  PARTE 3 — COMO O PLUM RESPONDE
 * ========================================================================== */

function s18_divisorParte3(pres) {
  var s = divider(pres, 'Parte 3', 'Como o Plum responde',
    'Agente Z, Agente A, pandas_executor.py e Agente C — quatro peças, nenhuma delas fazendo duas coisas.',
    T.GREEN);
  notes(s, 'Nomenclatura: no código (supabase_edge_functions_ai_plum_chat.ts) o terceiro agente se chama ' +
           'Agente C, de Comunicador. Se alguém disser "Agente B", é o mesmo.');
}

function s19_quatroEstacoes(pres) {
  var s = newSlide(pres);
  header(s, 'Fluxo E2E', 'Uma pergunta atravessa quatro estações', T.GREEN);

  var w = 128, gap = 24, y = 116, h = 122;
  var st = [
    ['AGENTE Z', 'Vale a pena?', 'Escopo + viabilidade. Bloqueia antes de gastar qualquer recurso.', T.RED],
    ['AGENTE A', 'O que buscar?', 'Lê só o schema_metadata. Escreve um Query Plan JSON.', T.AMBER],
    ['PANDAS', 'Busca e calcula', 'GET das colunas do plano. Aplica as regras. Faz a matemática.', T.GREEN],
    ['AGENTE C', 'Como contar?', 'Recebe o vetor de resultados. Escreve a frase final.', T.BLUE]
  ];

  for (var i = 0; i < st.length; i++) {
    var x = M + i * (w + gap);
    flowStep(s, x, y, w, h, st[i][0], st[i][1], st[i][2], st[i][3]);
    if (i < st.length - 1) arrow(s, x + w + 1, y + 48, T.MUTED);
  }

  txt(s, 'Pergunta do usuário', M, 96, 200, 16, { size: 9.5, color: T.MUTED, spaceBelow: 0 });
  txt(s, 'Resposta em PT-BR', M + (w + gap) * 3, 96, 200, 16, { size: 9.5, color: T.MUTED, spaceBelow: 0 });

  card(s, M, 256, CW, 84, T.CARD_ALT);
  txt(s, 'A regra que organiza tudo', M + 18, 266, CW - 36, 22,
      { size: 12.5, color: T.PURPLE_LT, bold: true, spaceBelow: 0 });
  txt(s, 'Só o pandas toca no dado. Só o Agente C fala com o usuário.\n' +
         'Quem tem acesso ao dado não tem voz. Quem tem voz não tem acesso ao dado.',
      M + 18, 288, CW - 36, 48, { size: 11.5, color: T.WHITE, lineSpacing: 122, spaceBelow: 4 });

  notes(s, 'Antes de tudo isso, ainda há um passo silencioso: validação do JWT e checagem de que o ' +
           'dataset_id pedido pertence ao organization_id do usuário. Se não pertencer, 403 e nada mais acontece.');
}

function s20_agenteZ(pres) {
  var s = newSlide(pres);
  header(s, 'Agente Z', 'O Guardião: duas perguntas, nessa ordem', T.RED);

  var w = 304, gap = 20, y = 98, h = 130;

  infoCard(s, M, y, w, h, '1. Escopo — "isso é sobre dados?"',
    'Revolução Francesa, receita de bolo, piada, "escreve um código em C++" → BLOQUEADO.\n\n' +
    'Resposta institucional pronta: "Sou o assistente da Plataforma Plum, especialista nas suas bases..."',
    T.RED);

  infoCard(s, M + w + gap, y, w, h, '2. Viabilidade — "os dados existem?"',
    'A pergunta é sobre dados, mas pede colunas que não estão no schema_metadata.\n\n' +
    'Clássico: pedir "lucro" quando só existe "faturamento", sem custo → INVIAVEL, com explicação do que falta.',
    T.AMBER);

  codeBlock(s,
    '{ "status": "PERMITIDO" | "BLOQUEADO" | "INVIAVEL",\n' +
    '  "message": "mensagem amigável, ou null se PERMITIDO",\n' +
    '  "assunto": "Faturamento / Receita" }',
    M, 242, 320, 72, 8.5);

  infoCard(s, M + 336, 242, 292, 96, 'Por que ele vem primeiro',
    'Bloquear custa 1 chamada de LLM. Deixar passar custa mais 2 chamadas + requisição no Sheets + processamento.',
    T.PURPLE_LT);

  keyline(s, 'O filtro mais barato é sempre o primeiro. E o campo "assunto" já sai pronto para analytics.', T.RED);

  notes(s, 'Detalhe de implementação: temperature 0.2 e response_mime_type application/json, porque a ' +
           'saída dele é consumida por código, não lida por humano.');
}

function s21_agenteA(pres) {
  var s = newSlide(pres);
  header(s, 'Agente A', 'O Planejador: linguagem natural → Query Plan', T.AMBER);

  txt(s, 'Entrada: a pergunta validada + o schema_metadata.        Nunca uma única linha de dado.',
      M, 96, CW, 18, { size: 11, color: T.MUTED, spaceBelow: 0 });

  codeBlock(s,
    '{\n' +
    '  "from": "producao",\n' +
    '  "target_columns": ["faturamento", "data_venda"],\n' +
    '  "select": [\n' +
    '    { "expr": { "agg": "sum", "col": "faturamento" },\n' +
    '      "as": "faturamento_total" }\n' +
    '  ],\n' +
    '  "where": { "left": "data_venda", "op": "between",\n' +
    '             "right": ["2025-07-01", "2025-07-31"] },\n' +
    '  "group_by": [], "order_by": [], "limit": 200\n' +
    '}', M, 120, 358, 168, 9);

  infoCard(s, M + 374, 116, 254, 96, 'target_columns é a chave',
    'É ele que autoriza o executor a ler DUAS colunas, e não a planilha inteira. O Agente A define o tamanho da leitura sem ver dado nenhum.',
    T.AMBER);

  infoCard(s, M + 374, 220, 254, 126, 'temperature = 0.0',
    'Zero criatividade: a mesma pergunta gera o mesmo plano.\n\nCriatividade é bem-vinda no Agente C. Aqui, é bug.',
    T.PURPLE_LT);

  keyline(s, 'O Agente A não responde a pergunta. Ele escreve o pedido de quem vai buscar a resposta.', T.AMBER);

  notes(s, 'O plano é um contrato: um JSON fechado, com operadores conhecidos (=, between, >, <, contains, ' +
           'in) e agregações conhecidas (sum, avg, min, max, count). Qualquer coisa fora do contrato é ' +
           'rejeitada pelo executor — não interpretada.');
}

function s22_pandas(pres) {
  var s = newSlide(pres);
  header(s, 'query_engine/pandas_executor.py', 'O Motorista Cego', T.GREEN);

  var w = 196, gap = 20, y = 94, h = 120;

  infoCard(s, M, y, w, h, '✅ O que ele recebe',
    'O Query Plan JSON.\nAs formattingRules.\nO google_sheet_id já validado contra a organização.',
    T.GREEN);
  infoCard(s, M + w + gap, y, w, h, '🚫 O que ele NÃO recebe',
    'A pergunta do usuário.\nQuem perguntou.\nPor quê.\nQualquer linguagem natural.',
    T.RED);
  infoCard(s, M + (w + gap) * 2, y, w, h, '⚙️ O que ele faz',
    'Valida o tenant → checa o cache → GET das colunas → apply_formatting_rules() → execute_plan() → vetor enxuto.',
    T.BLUE);

  card(s, M, 224, CW, 118, T.CARD_ALT);
  txt(s, 'Por que "cego" é uma feature, e não uma limitação', M + 18, 232, CW - 36, 22,
      { size: 12.5, color: T.PURPLE_LT, bold: true, spaceBelow: 0 });
  txt(s, '• Sem intenção, não há como interpretar errado. Ele não decide nada — executa um contrato.\n' +
         '• Sem contexto, não há PII para vazar. Nenhum log ou trace dele revela o que o usuário quis saber.\n' +
         '• Sem LLM, não há alucinação. sum() é sum() — a matemática não é "provavelmente certa", é certa.',
      M + 18, 256, CW - 36, 82, { size: 10.5, color: T.WHITE, lineSpacing: 126, spaceBelow: 6 });

  notes(s, 'É este slide que responde a objeção "mas IA erra número". No Plum, nenhum número passa por um ' +
           'LLM. Alucinação numérica não é mitigada — ela é estruturalmente impossível.');
}

function s23_economia(pres) {
  var s = newSlide(pres);
  header(s, 'Performance', 'Column-range GET, cache e read-only', T.GREEN);

  var w = 196, gap = 20, y = 94, h = 152;

  infoCard(s, M, y, w, h, '① Só as colunas do plano',
    'Em vez de Sheet1!A1:Z100000, pede Sheet1!B:B,E:E.\n\n~15 MB → ~50 KB\n\nQuem definiu? O target_columns do Agente A.',
    T.GREEN);

  infoCard(s, M + w + gap, y, w, h, '② Cache TTL de 15 min',
    'As colunas lidas ficam em cache por 15 minutos.\n\nO Google Sheets permite ~60 requisições/min. Sem cache, dez pessoas conversando juntas derrubariam o chat.',
    T.BLUE);

  infoCard(s, M + (w + gap) * 2, y, w, h, '③ Sempre GET, nunca PUT',
    'O Plum é read-only por projeto.\n\nNunca altera, cria ou apaga nada na planilha.\n\nGET é o único verbo HTTP que o código usa.',
    T.AMBER);

  card(s, M, 252, CW, 90, T.CARD);
  txt(s, 'O caminho completo de uma leitura', M + 18, 259, CW - 36, 22,
      { size: 12.5, color: T.PURPLE_LT, bold: true, spaceBelow: 0 });
  txt(s, 'JWT válido? → este dataset_id é desta organization_id? → as colunas estão no cache? → se não, GET column-range → formattingRules → execute_plan()\n' +
         'Se o dataset for de outro tenant: 403, e nenhuma chamada ao Google Sheets acontece.',
      M + 18, 281, CW - 36, 54, { size: 10.5, color: T.MUTED, lineSpacing: 120, spaceBelow: 4 });

  notes(s, 'A validação de tenant vem ANTES do cache e antes de qualquer rede. Isso é intencional: o custo ' +
           'de um vazamento entre clientes é maior que o custo de uma checagem por requisição.');
}

function s24_agenteC(pres) {
  var s = newSlide(pres);
  header(s, 'Agente C', 'O Comunicador: um tradutor, não uma calculadora', T.BLUE);

  var w = 304, gap = 20, y = 98, h = 118;

  infoCard(s, M, y, w, h, 'O que ele recebe',
    'A pergunta original do usuário + o vetor de resultados do executor.\n\n' +
    'Tipicamente: uma linha e dois valores.',
    T.BLUE);

  infoCard(s, M + w + gap, y, w, h, 'O que ele NÃO recebe',
    'As 100.000 linhas da planilha.\n\nEle não tem como somar nada, porque não tem nada para somar. ' +
    'Só existe o resultado já calculado.',
    T.RED);

  codeBlock(s,
    'entrada  →  { "rows": [ { "faturamento_total": 150000.0 } ],\n' +
    '              "row_count": 1, "periodo": "Julho de 2025" }\n' +
    '\n' +
    'saída    →  "O faturamento total em Julho de 2025 foi de\n' +
    '              R$ 150.000,00."',
    M, 228, 380, 88, 9);

  infoCard(s, M + 396, 226, 232, 116, 'A regra dura no prompt',
    '"Não invente nem adicione números que não estejam no resultado do executor."\n\n' +
    'temperature = 0.2 — só para a frase soar natural.',
    T.PURPLE_LT);

  keyline(s, 'Ele escolhe as palavras. Nunca os números.', T.BLUE);

  notes(s, 'Se o Agente C alucinar, ele alucina adjetivo, não valor — porque valor ele não tem de onde tirar. ' +
           'É por isso que o vetor de resultados é enxuto de propósito.');
}


/* ==========================================================================
 *  ANALOGIA DA BIBLIOTECA
 * ========================================================================== */

function s25_divisorBiblioteca(pres) {
  var s = divider(pres, 'Plum vs. IA comum', 'Uma história de biblioteca',
    'Você precisa de um dado secreto que está dentro de um livro, numa biblioteca trancada. Há duas formas de conseguir.',
    T.PURPLE);
  notes(s, 'Esta é a parte que fica na cabeça. Se a pessoa esquecer todo o resto, ela precisa lembrar da ' +
           'tagarela que arranca a página sem ler.');
}

function s26_cenario1(pres) {
  var s = newSlide(pres);
  header(s, 'Cenário 1', 'A IA comum: você manda a Tagarela', T.RED);

  card(s, M, 94, CW, 72, T.CARD);
  txt(s, 'Você pede: "vai na biblioteca e me traz esse dado."\n' +
         'Ela entra, lê o livro inteiro, decora o que precisa e volta.\n' +
         'Você sabe o dado. Mas ela também sabe.',
      M + 18, 102, CW - 36, 60, { size: 12, color: T.WHITE, lineSpacing: 124, spaceBelow: 2 });

  var w = 196, gap = 20, y = 174, h = 136;

  infoCard(s, M, y, w, h, '🗣️  Ela sabe tudo do livro',
    'E tagarelas falam.\n\nNa prática: o dado sensível entrou no prompt de um LLM de terceiros. Ele vive em log, cache e trace — fora do seu controle.',
    T.RED);

  infoCard(s, M + w + gap, y, w, h, '🧠  Ela decorou de cabeça',
    'Pode trocar um 7 por um 1.\n\nNa prática: alucinação numérica. O LLM "somou" no texto. Acerta quase sempre — e o "quase" é o problema.',
    T.RED);

  infoCard(s, M + (w + gap) * 2, y, w, h, '🐢  Ela carregou o livro todo',
    'Lento e caro.\n\nNa prática: 100.000 linhas no contexto. Custo por token, latência de segundos e um limite que a planilha real estoura.',
    T.RED);

  keyline(s, 'Três problemas diferentes, uma única causa: ela leu o livro.', T.RED);

  notes(s, 'Note que os três problemas parecem independentes (segurança, precisão, custo) mas têm a mesma ' +
           'raiz. É por isso que uma única mudança arquitetural resolve os três de uma vez.');
}

function s27_cenario2(pres) {
  var s = newSlide(pres);
  header(s, 'Cenário 2', 'O Plum: a Tagarela nunca entra', T.GREEN);

  card(s, M, 94, CW, 106, T.CARD_ALT);
  txt(s, 'Você pede o mesmo dado para a mesma Tagarela. Mas ela não entra na biblioteca.',
      M + 18, 106, CW - 36, 20, { size: 12.5, color: T.WHITE, bold: true, spaceBelow: 0 });
  txt(s, 'Ela escreve um bilhete: "página 12, terceira linha — some com a da página 40."\n' +
         'Alguém pega o bilhete, entra, arranca essa página e entrega. Sem ler.\n' +
         'A conta é feita com calculadora, na sua frente.\n' +
         'A Tagarela só lê o resultado final em voz alta.',
      M + 18, 126, CW - 36, 70, { size: 11, color: T.PURPLE_LT, lineSpacing: 128, spaceBelow: 1 });

  var w = 196, gap = 20, y = 208, h = 100;

  infoCard(s, M, y, w, h, '🔒  Ela nunca soube o conteúdo',
    'Não tem o que vazar. Nenhum dado do cliente entrou em nenhum prompt de LLM.',
    T.GREEN);
  infoCard(s, M + w + gap, y, w, h, '🎯  A conta é da calculadora',
    'Ninguém decorou nada. sum() é sum(). Errar deixa de ser possível.',
    T.GREEN);
  infoCard(s, M + (w + gap) * 2, y, w, h, '⚡  Só uma página saiu da estante',
    'Duas colunas, não a planilha. Um número de volta, não uma tabela.',
    T.GREEN);

  card(s, M, 318, CW, 46, T.CARD);
  txt(s, 'Nota de honestidade: na vida real o Plum tira uma xerox, não arranca a página. Ele é read-only por ' +
         'projeto — usa apenas GET e nunca altera a planilha do cliente.',
      M + 18, 327, CW - 36, 30, { size: 10, color: T.MUTED, spaceBelow: 0 });

  notes(s, 'A frase de efeito: "quem tem acesso ao dado não tem voz; quem tem voz não tem acesso ao dado."');
}

function s28_elencoBiblioteca(pres) {
  var s = newSlide(pres);
  header(s, 'A analogia completa', 'Quem é quem na biblioteca', T.PURPLE);

  var y = 94, h = 50, gap = 8;
  var cast = [
    ['🚪 O Porteiro', 'Agente Z',
     '"História da França? Aqui só tem os livros da sua empresa." E também: "esse livro que você pede não existe nesta estante." Ninguém entra à toa.', T.RED],
    ['📇 O Catalogador', 'Agente A',
     'Nunca leu um livro na vida — só conhece as fichas do catálogo (schema_metadata). É ele quem escreve o bilhete: estante, página, linha e o que fazer com o número.', T.AMBER],
    ['🙈 O Estagiário Cego', 'pandas_executor.py',
     'Recebe o bilhete e não pergunta nada: não sabe quem pediu nem por quê. Traz a página, faz a conta com calculadora e devolve um papelzinho. Não lê — logo, não tem o que contar.', T.GREEN],
    ['🛒 O Carrinho', 'cache TTL 15 min',
     'As páginas já buscadas ficam num carrinho ao lado da porta. Se alguém pedir a mesma página nos próximos 15 minutos, ninguém precisa voltar lá dentro.', T.BLUE],
    ['🗣️ O Porta-voz', 'Agente C',
     'Nunca entrou na biblioteca. Recebe só o papelzinho e fala bonito: "O faturamento de julho foi R$ 150.000,00."', T.PURPLE_LT]
  ];

  for (var i = 0; i < cast.length; i++) {
    var yy = y + i * (h + gap);
    card(s, M, yy, CW, h, T.CARD);
    accentBar(s, M, yy + 8, h - 16, cast[i][3]);
    txt(s, cast[i][0], M + 18, yy + 7, 148, 20,
        { size: 12, color: cast[i][3], bold: true, spaceBelow: 0 });
    txt(s, cast[i][1], M + 18, yy + 26, 148, 16,
        { size: 8.5, color: T.MUTED, font: T.MONO, spaceBelow: 0 });
    txt(s, cast[i][2], M + 176, yy + 9, CW - 194, h - 18,
        { size: 9.8, color: T.WHITE, lineSpacing: 112, spaceBelow: 0 });
  }

  notes(s, 'Se quiser esticar a analogia: a Parte 1 (login) é o crachá que o Porteiro confere na recepção do ' +
           'prédio, antes da biblioteca. E a Parte 2 (agentes 0-4) é o trabalho de catalogação que alguém ' +
           'fez uma vez, para que o Catalogador tivesse fichas para ler.');
}

function s29_porQueMuda(pres) {
  var s = newSlide(pres);
  header(s, 'Consequências', 'Por que essa divisão muda tudo', T.PURPLE);

  var w = 196, gap = 20, y = 100, h = 178;

  infoCard(s, M, y, w, h, '🎯  Precisão',
    'Nenhum número passa por um LLM. Quem soma é o pandas.\n\nAlucinação numérica não é mitigada — é estruturalmente impossível.\n\nNão dependemos de o modelo estar "bom hoje".',
    T.GREEN);

  infoCard(s, M + w + gap, y, w, h, '🔒  Privacidade',
    'Nenhum agente de IA vê uma linha de dado do cliente.\n\nO que sobe para o Gemini: o catálogo de colunas e um número de resultado.\n\nRead-only, isolado por organization_id, com RLS no banco.',
    T.BLUE);

  infoCard(s, M + (w + gap) * 2, y, w, h, '⚡  Custo e velocidade',
    'Duas colunas em vez da planilha (~15 MB → ~50 KB).\n\nUm vetor de resultados em vez de 100.000 linhas no contexto.\n\nCache de 15 min para quem repete a pergunta.',
    T.AMBER);

  card(s, M, 286, CW, 56, T.CARD_ALT);
  txt(s, 'A IA planeja. O código executa. A IA comunica.\nNenhuma delas faz duas coisas ao mesmo tempo.',
      M + 18, 294, CW - 36, 44,
      { size: 13, color: T.WHITE, bold: true, lineSpacing: 124, spaceBelow: 0 });

  notes(s, 'Fechamento comercial, se for o caso: essas três colunas são exatamente as três objeções que ' +
           'aparecem em reunião — "IA erra", "não vou deixar meu dado subir" e "quanto custa".');
}

function s30_recap(pres) {
  var s = newSlide(pres, T.BG_DEEP);
  header(s, 'Recapitulando', 'O material em três frases', T.PURPLE);

  var y = 100, h = 72, gap = 12;
  var recap = [
    ['Parte 1 — Login e Organizações',
     'SSO prova quem você é; o Admin decide o que você vê. O crachá (JWT) viaja em cada requisição e o RLS aplica a regra dentro do próprio banco — não na aplicação.', T.BLUE],
    ['Parte 2 — O JSON de contexto',
     'Uma vez, no cadastro da base: os agentes 0 a 4 e um humano produzem o schema_metadata — a bula que explica cada coluna. Só o cabeçalho e 5 linhas saem do navegador.', T.AMBER],
    ['Parte 3 — O motor de respostas',
     'A cada pergunta: Z filtra, A planeja, o pandas busca e calcula, C comunica. Quem toca no dado não fala; quem fala não toca no dado.', T.GREEN]
  ];

  for (var i = 0; i < recap.length; i++) {
    var yy = y + i * (h + gap);
    card(s, M, yy, CW, h, T.CARD);
    accentBar(s, M, yy + 10, h - 20, recap[i][2]);
    txt(s, recap[i][0], M + 18, yy + 10, CW - 40, 20,
        { size: 12.5, color: recap[i][2], bold: true, spaceBelow: 0 });
    txt(s, recap[i][1], M + 18, yy + 30, CW - 40, h - 38,
        { size: 10, color: T.MUTED, lineSpacing: 114, spaceBelow: 0 });
  }

  txt(s, 'E se você esquecer tudo, lembre da Tagarela que arranca a página sem ler.',
      M, 344, CW, 28, { size: 13, color: T.PURPLE_LT, bold: true,
                        align: SlidesApp.ParagraphAlignment.CENTER, spaceBelow: 0 });

  notes(s, 'Fontes no repositório: README.md, query_engine/prd.md, docs/PRD-PLUM2.0.md, docs/SSO-DOMINIO.md, ' +
           'supabase/edge-functions/*.ts, query_engine/pandas_executor.py e src/components/DatabasePipeline.tsx.');
}
