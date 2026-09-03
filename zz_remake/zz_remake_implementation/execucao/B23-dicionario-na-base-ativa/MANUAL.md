# B23 · O dicionário v2 inteiro editável na base ativa — manual do 👤

⭐⭐ **Saiu maior que o plano.** O bloco pedia só `grao` e `observacoes` fora do cadastro; você
acrescentou `papel_analitico` e `vocabulario_util`. ⇒ O que ficou editável numa base **ativa** é o
**dicionário v2 inteiro** — tudo o que antes só existia durante os quatro passos do cadastro.

Fecha a **C17**.

**Front puro.** Sem migration, sem Edge Function, sem Lambda.

## Antes

O **B22** — é o painel dele ("Editar Esquema" → *Reler a planilha*) que esta tela estende.

## Publicar

```sh
git push
```

A Vercel publica no push. Nenhum deploy de Edge Function: nada novo é pedido ao servidor.

## Onde fica

**Bases de Dados** → clique na base → **Editar Esquema**. O painel agora tem, nesta ordem:

1. Conexão do Google Sheets
2. Reler a planilha (B22)
3. ⭐ **A base** — grão, observações e o estado da revisão *(novo)*
4. ⭐ **Colunas** — definição, papel analítico e vocabulário *(as duas últimas são novas)*
5. Refinar Formatação (Agente 3.1)

⭐ A ordem é a mesma da etapa 4 do cadastro de propósito: quem conhece uma tela reconhece a outra.

## ⭐⭐ O que confirmar

### 1. Papel analítico, e o vocabulário sumindo junto

Numa coluna que hoje é **Dimensão**, o interruptor *"O chat pode consultar a lista de valores desta
coluna"* aparece. Troque o papel para **Medida** ⇒ o interruptor **some**.

Salve e confira no banco:

```sql
select jsonb_pretty(schema_metadata -> 'columns' -> 'NOME_DA_COLUNA')
  from public.datasets where id = 'UUID';
```

⭐ **O que tem de estar lá:** `papel_analitico: "medida"` e `vocabulario_util: false` — mesmo que
estivesse `true` antes de você trocar o papel.

⚠️ **Por que isso importa e não é detalhe de tela:** o leitor do dicionário filtra vocabulário **só**
por `vocabulario_util`, sem olhar o papel. Um `true` sobrando numa coluna numérica faz o chat pedir a
lista de valores dela em **toda** pergunta daquela base — gastando um dos 4 pedidos de vocabulário, ou
entregando ao planejador uma lista de números apresentada como se fosse vocabulário de categoria.

⛔ E o `true` sobra fácil, porque o interruptor **some** fora de dimensão: quem ligou o vocabulário e
depois trocou o papel não tem mais o controle que o desligaria. Por isso a limpeza é no salvamento, e
não na hora de trocar o papel — limpar ali faria quem trocasse por engano e voltasse perder a
escolha.

### 2. Grão e observações — inclusive **acrescentar**

Escreva o grão (*"uma venda"*) e clique em **Acrescentar observação**. Escreva:

> considere apenas vendas faturadas para a receita

Salve. Agora vá ao chat e pergunte algo sobre receita.

⭐ **O que deve acontecer:** a resposta **declara essa presunção**, citando a observação. É
literalmente o comportamento que o chat já teve em 2026-08-25 — filtrar `status = FATURADO` e dizer
que filtrou.

⚠️ **O botão de acrescentar não existia em lugar nenhum antes**, nem no cadastro. Só dava para editar
ou apagar o que o Agente 1 tivesse escrito. Se ele não apontasse nada, a base nunca ganhava a
primeira observação — e é justamente a que mais vale, porque é a regra que só você sabe.

Observação em branco some no salvamento, então uma linha criada por engano não vira observação.

### 3. ⭐⭐ Marcar a base como conferida — o teste que exige entender o que se afirma

No bloco **A base**, embaixo, há o estado da revisão. Numa base v1 ele diz *"Esta base ainda não foi
conferida"*.

**O que isso significa, concretamente:** o dicionário tem um campo `versao`, e o chat lê
`conferido = versao >= 2`. Quando é falso, o planejador recebe junto com o dicionário um aviso:

> ⚠️ Este dicionário NÃO foi conferido por uma pessoa: os conceitos acima foram deduzidos
> automaticamente e podem estar errados. Declare presunção sempre que usar uma coluna cuja descrição
> você teve de interpretar.

Marcar como conferida **cala esse aviso** e faz o chat confiar no dicionário.

- O botão **só habilita com o grão preenchido**.
- Ele **salva o dicionário junto** — não é preciso salvar antes.
- É **reversível**: *"Marcar como não conferida"* volta.
- ⛔ **Salvar dicionário nunca promove.** São ações separadas de propósito.

Confira: `select schema_metadata -> 'versao' from public.datasets where id = 'UUID';`

⚠️ **Por que não é automático**, e vale saber para não pedir isso depois: numa base v1 as colunas
**não têm papel nenhum** gravado. A tela mostra o default que a máquina deduziu do tipo de
formatação. Se a promoção fosse automática "quando toda coluna tem papel", abrir a tela e salvar
gravaria esses defaults e promoveria a base **sem ninguém ter lido nada** — calando exatamente o
aviso que existe para dizer que ninguém leu. Ver **D-057**.

### 4. O modo leitura mostra o que o modo edição edita

Feche a edição (**Cancelar Edição**). A visão do dicionário agora traz grão, observações, o estado da
revisão, e por coluna o papel e se o vocabulário está ligado.

⚠️ Antes ela mostrava só definição e formatação — os campos novos sumiam quando você fechava a
edição, e não havia como conferir uma base sem entrar no modo de alterá-la.

### 5. ⚠️ Reler a planilha não descarta o que você digitou

Edite o grão **sem salvar**, depois use **Reler a planilha** e **Aplicar ao dicionário**.

⭐ O grão que você digitou tem de sobreviver. A reconciliação do B22 passou a partir do que está na
tela, não do que está salvo — antes ela descartaria a edição em silêncio, e com o painel editando
muitos mais campos isso passou a ser caro.

## O que este bloco NÃO faz

⛔ **Não deixa renomear coluna nem acrescentar coluna à mão** — continua sendo o **Reler** do B22 que
reconcilia com a planilha. O nome normalizado é contrato com três lados; digitá-lo à mão quebra os
três com falha muda.

⛔ **Não chama IA para nada aqui**, além do Agente 2 (que só melhora a redação do que você escreveu) e
do Agente 3.1 (formatação, que já existia).

⛔ **Não promove a versão ao reconciliar** — só o botão promove.

## Se algo der errado

| sintoma | causa provável |
|---|---|
| O interruptor de vocabulário não aparece em nenhuma coluna | todas estão fora de `dimensao`. É o esperado — troque o papel para ver |
| Marquei como conferida e o chat continua declarando presunção | presunção também nasce de outras causas (data ambígua, coluna que precisou interpretar). O `conferido` remove **o aviso genérico**, não toda presunção |
| O botão "Marcar como conferida" está desabilitado | falta o grão. É pré-requisito: base conferida sem dizer o que é uma linha é a pior combinação |
| Salvei e o card da base mostra a contagem de colunas antiga | a lista só recarrega ao entrar/sair do cadastro; o salvamento atualiza à mão. Recarregue e confira o banco |
| Editei e o "Aplicar" do Reler apagou minha edição | ⛔ regressão do item 5 — a reconciliação voltou a partir do schema salvo |
