import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// Tipagem básica do payload que o frontend ou webhook enviará
interface EmailPayload {
  type: 'new_request' | 'account_approved' | 'account_rejected' | 'user_invited' | 'organization_created' | 'lead_received';
  userEmail: string;
  userName?: string;
  organizationName?: string;
  adminEmail?: string;
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const SITE_URL = 'https://plum-polijunior.com.br';

// Escapa conteúdo vindo do payload antes de interpolar no HTML
const esc = (valor?: string) =>
  (valor ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );

// userName é opcional: sem ele, os textos precisam continuar fazendo sentido
const primeiroNome = (nome?: string) => (nome ?? '').trim().split(/\s+/)[0] || '';

const layout = (conteudo: string) => `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.6;color:#1a1a1a;max-width: 560px;">
    ${conteudo}
  </div>
`;

const botao = (href: string, texto: string) => `
  <p style="margin:28px 0;">
    <a href="${href}" style="background:#6d28d9;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;display:inline-block;font-weight:600;">${texto}</a>
  </p>
`;

const assinatura = `
  <p style="margin-top:28px;">Abraço,</p>
  <p style="margin-top:16px;color:#444444;font-size:14px;line-height:1.5;">
    <strong>João Pedro de Pinho Araujo</strong><br/>
    Poli Júnior – Escola Politécnica da USP<br/>
    (47) 99903-0812<br/>
    <a href="https://www.polijunior.com.br" style="color:#6d28d9;">www.polijunior.com.br</a><br/>
    Av. Prof. Mello Moraes, 2231 – Sala A0<br/>
    Edifício de Engenharia Mecânica, Poli-USP
  </p>
`;

serve(async (req: Request) => {
  // CORS Headers para permitir que o frontend chame a função diretamente
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload: EmailPayload = await req.json();

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured');
    }

    const nome = primeiroNome(payload.userName);
    const empresa = esc(payload.organizationName);

    let to = '';
    let subject = '';
    let html = '';

    // Lógica de templates baseada no tipo de evento
    if (payload.type === 'new_request') {
      if (!payload.adminEmail) {
        throw new Error('adminEmail is required for new_request');
      }
      to = payload.adminEmail; // Admin recebe
      subject = `Nova solicitação de acesso à ${payload.organizationName ?? 'sua organização'}`;
      html = layout(`
        <p>Olá.</p>
        <p>
          <strong>${esc(payload.userName) || esc(payload.userEmail)}</strong>
          solicitou acesso à organização <strong>${empresa}</strong>.
        </p>
        <p>Email de cadastro: ${esc(payload.userEmail)}</p>
        <p>É só aprovar ou recusar no painel. Enquanto isso, essa pessoa não consegue entrar.</p>
        ${botao(`${SITE_URL}/dashboard`, 'Ver solicitação')}
      `);
    } else if (payload.type === 'account_approved') {
      to = payload.userEmail; // Usuário recebe
      subject = `Seu acesso à ${payload.organizationName ?? 'organização'} foi aprovado`;
      html = layout(`
        <p>${nome ? `Olá, ${esc(nome)}.` : 'Olá.'}</p>
        <p>
          Sua solicitação para entrar na organização <strong>${empresa}</strong> foi aprovada
          e seu acesso já está ativo.
        </p>
        ${botao(`${SITE_URL}/auth`, 'Acessar o Plum')}
        <p>Se surgir qualquer dúvida pelo caminho, é só responder este email ou me chamar.</p>
        ${assinatura}
      `);
    } else if (payload.type === 'account_rejected') {
      to = payload.userEmail; // Usuário recebe
      subject = `Atualização sobre seu acesso à ${payload.organizationName ?? 'organização'}`;
      html = layout(`
        <p>${nome ? `Olá, ${esc(nome)}.` : 'Olá.'}</p>
        <p>
          A sua solicitação para entrar na organização <strong>${empresa}</strong> não pôde ser aprovada no momento.
        </p>
        <p>Se você acha que isso é um engano, por favor, entre em contato com o administrador da sua empresa.</p>
        ${assinatura}
      `);
    } else if (payload.type === 'user_invited') {
      to = payload.userEmail; // Usuário convidado recebe
      subject = `Você foi convidado para participar da organização ${payload.organizationName ?? ''} no Plum`.replace('  ', ' ');
      html = layout(`
        <p>${nome ? `Olá, ${esc(nome)}.` : 'Olá.'}</p>
        <p>
          Você recebeu um convite para acessar a plataforma Plum pela organização <strong>${empresa}</strong>.
        </p>
        <p>O seu acesso já está liberado. Basta clicar no botão abaixo para criar sua conta ou fazer login.</p>
        ${botao(`${SITE_URL}/auth`, 'Aceitar Convite')}
        ${assinatura}
      `);
    } else if (payload.type === 'organization_created') {
      to = payload.userEmail; // Admin recém criado recebe
      subject = `A organização ${payload.organizationName ?? ''} foi criada no Plum`.replace('  ', ' ');
      html = layout(`
        <p>${nome ? `Olá, ${esc(nome)}.` : 'Olá.'}</p>
        <p>
          A organização <strong>${empresa}</strong> foi criada e seu acesso já está ativo.
        </p>
        ${botao(`${SITE_URL}/dashboard`, 'Acessar o Plum')}
        <p>Se surgir qualquer dúvida pelo caminho, é só responder este email ou me chamar.</p>
        ${assinatura}
      `);
    } else if (payload.type === 'lead_received') {
      to = payload.userEmail; // Lead recebe
      subject = nome
        ? `Recebemos seu contato, ${nome}. Vamos falar sobre seus dados?`
        : 'Recebemos seu contato. Vamos falar sobre seus dados?';
      html = layout(`
        <p>${nome ? `Olá, ${esc(nome)}. Tudo bem?` : 'Olá. Tudo bem?'}</p>
        <p>
          Aqui é o João Araujo, do time do Plum. Vi que você deixou seu contato no nosso site.
        </p>
        <p>
          Antes de marcar qualquer coisa, queria entender o seu caso. Na maioria das empresas com
          quem conversamos, a cena é parecida: os dados existem, mas pedir um número simples vira
          uma corrente de mensagens até alguém ter tempo de rodar um relatório. Enquanto isso,
          decisões estratégicas, que deveriam ser tomadas com agilidade, ficam esperando. Dessa
          forma, te pergunto, quanto tempo passa entre você precisar de um número e finalmente ter
          ele na mão?
        </p>
        <p>
          A resposta, quase sempre, é "mais do que deveria" e, nesse tempo, a decisão
          espera. O Plum resolve isso levando a resposta até onde sua
          equipe já trabalha: a pessoa pergunta algo e recebe o dado na hora, direto da base da
          empresa. Sem instalar nada, sem aprender ferramenta nova, sem depender de alguém para
          gerar o relatório.
        </p>
        <p>
          Para eu chegar na nossa conversa com algo mais elaborado, me responde essa pergunta:
          qual dado você frequentemente precisa, mas demora para conseguir?
        </p>
        <p>Com isso eu te mostro na prática como ficaria no seu contexto, numa conversa rápida.</p>
        ${assinatura}
      `);
    } else {
      throw new Error('Invalid email type');
    }

    // Chamada para a API do Resend
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'Plum <contato@plum-polijunior.com.br>', // E-mail com o domínio oficial
        to: [to],
        subject: subject,
        html: html,
      }),
    });

    const data = await res.json();

    if (res.ok) {
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    } else {
      return new Response(JSON.stringify({ error: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
