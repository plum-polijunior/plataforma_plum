hoje o plum tem tese interna: os decisores de uma empresa usam o plum para analisar seus própios dados (com perguntas e dashboards).

mas, para aproveitar os diferenciais do plum em relação à um claude, que é o rbac e a conexão com o whatsapp, o plum passará a ter uma tese externa: os clientes das empresas chegam ao plum (estratégia B2B2C).

exemplo de aplicação de um cliente nosso em que houve implementação do plum está em zz_remake_2\prd\PRD_Helisul_v1.md

resumo:
ela fretava caminhões, carros, aviões, helicópteros, navios em muitos estados brasileiros. com isso, os pilotos e motoristas sempre ligavam pra central "qual a minha escala?", "qual a reserva do meu hotel?" e a central era sobrecarregada. ainda, os clientes perguntavam "o motorista ta vindo?", "qual o meu onibus?". e ia tudo para a central. assim, conectamos nosso produto na empresa. ele se conectou à crm e a base de dados dessa empresa de fretamento, e, ao receber a pergunta, ele lia, avaliava se podia resolver, e só assim passava para a central. o resultado foi uma eficiencia operacional inimaginável

perceba que a arquitetura do plum já está 90% pronta para essa mudança de tese interna para externa

o que devemos implementar:

1) onboarding de documentos
o cliente coloca um link de um google docs em sheets, usaremos as apis do google cloud e um código em python rodando a lambda para mandar os tópicos do documento, tópico a tópico, para uma ia, que resumirá o contexto e armazenará o texto. depois, uma ia irá pegar todo esse contexto formado por várias ia's e organizará em um só. daí, o usuário pode editar o contexto e usar um agente de refinamento
1.1)eu não tenho certeza que essa é a melhor arquitetura pra isso, nem se essa arquitetura é boa (o que o python conseguiria horizontalmente olhar para entender até onde enviar o texto para llm?)
1.2)perceba que é praticamente a mesma estrutura do ai-agents atual, mas agora o ai-plum-chat, usando o agente encaminhador, deve decidir se vai mandar a requisição pro agentes+pandas ou pros novos agentes que olham o contexto do documento
1.3)exemplo de aplicação: um cliente de varejo recebe 100 mensagens por dia perguntando a política de reembolso. ele tem no diretório da empresa um documento explicando exatamente as regras. ele coloca no onboarding de documentos, isso vira contexto, e agora, quando o cliente pergunta, a llm responde
1.4) para o caso da nova arquitetura de agentes, recomendo que as perguntas e respostas que aconteceram no chat nos últimos 5 min de conversa sejam enviadas junto aos novos prompts

2) integração ao google calendar
2.1) já tenho o código pronto para isso, irei te mandar

3) mudanças nas frases da landing page com a nova tese
3.1) "somos mais que o chatbot", "Plum.
Do dado à decisão.
Em segundos.", "Plum centraliza, consulta e entrega as respostas da sua operação — no momento em que você precisa decidir." "Mais do que um chatbot.", "funcionalidades", "perguntas frequentes"

4) integração com o whatsapp
4.1) já tenho um servidor em evolution api com número rodando, é só implementar

5) mudar o nome de "minha base de dados para "meu contexto""

6) permitir que usuário edite o dashboard depois que ele foi gerado (Ex: João Silva e João Silva Jr. são a mesma pessoa)

