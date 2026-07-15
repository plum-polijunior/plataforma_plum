import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Tipagem básica do payload que o frontend ou webhook enviará
interface EmailPayload {
  type: 'new_request' | 'account_approved' | 'organization_created';
  userEmail: string;
  userName?: string;
  organizationName?: string;
  adminEmail?: string;
}

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

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

    let to = '';
    let subject = '';
    let html = '';

    // Lógica de templates baseada no tipo de evento
    if (payload.type === 'new_request') {
      to = payload.adminEmail || 'admin@empresa.com'; // Admin recebe
      subject = 'Nova solicitação de acesso - Plataforma Plum';
      html = `
        <h2>Nova Solicitação de Acesso</h2>
        <p>Um novo usuário (<strong>${payload.userEmail}</strong>) solicitou acesso à organização <strong>${payload.organizationName}</strong>.</p>
        <p>Acesse o painel de controle para aprovar ou rejeitar o acesso.</p>
      `;
    } else if (payload.type === 'account_approved') {
      to = payload.userEmail; // Usuário recebe
      subject = 'Acesso Aprovado - Plataforma Plum';
      html = `
        <h2>Seu acesso foi aprovado!</h2>
        <p>O administrador da organização <strong>${payload.organizationName}</strong> aprovou seu acesso.</p>
        <p>Você já pode fazer login na plataforma e começar a usar o Plum.</p>
        <a href="https://app.seusite.com/auth">Fazer Login</a>
      `;
    } else if (payload.type === 'organization_created') {
      to = payload.userEmail; // Admin recém criado recebe
      subject = 'Bem-vindo ao Plum! Sua organização foi criada.';
      html = `
        <h2>Sua organização foi criada com sucesso!</h2>
        <p>Olá! Você acaba de criar a organização <strong>${payload.organizationName}</strong> no Plum.</p>
        <p>Como administrador, você já pode convidar sua equipe e configurar as permissões.</p>
        <a href="https://app.seusite.com/dashboard">Acessar Dashboard</a>
      `;
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
        from: 'Plum <onboarding@resend.dev>', // Importante: Troque pelo seu domínio verificado no Resend no futuro
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
