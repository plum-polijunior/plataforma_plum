import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import DatabasePipeline from "@/components/DatabasePipeline";
import { ShieldAlert, Lock, Plus, FileSpreadsheet, Clock, ArrowRight, Activity, Calendar, Trash2, RefreshCw, Loader2, Sparkles, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  colunaNova,
  PAPEIS,
  vocabularioEfetivo,
  type ColunaDoSchema,
  type FormattingRule,
  type PapelAnalitico,
  type SchemaMetadata,
} from "@/lib/dicionario";
import {
  ehLinkPublicado,
  extrairSheetRef,
  ERRO_LINK_INVALIDO,
  ERRO_LINK_PUBLICADO,
} from "@/lib/google-sheets";

/**
 * ⭐ Quanto tempo sem digitar antes de gravar.
 *
 * Curto o bastante para que fechar a aba logo depois de escrever raramente
 * perca algo, e longo o bastante para não mandar um `update` por tecla. Quem
 * troca de base ou fecha o painel não espera por ele: esses caminhos descarregam
 * o pendente na hora (`descarregarPendente`).
 */
const ATRASO_DO_AUTOSAVE = 900;

/** O que o indicador no topo do painel de edição mostra. */
type EstadoDoSalvamento = "salvo" | "salvando" | "erro";

export default function DatabasePage() {
  const { toast } = useToast();
  const [organization, setOrganization] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [showPipeline, setShowPipeline] = useState(false);
  const [isEditingSchema, setIsEditingSchema] = useState(false);
  const [editSheetUrl, setEditSheetUrl] = useState("");
  const [refinePrompt, setRefinePrompt] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  // ⭐ Tipado desde o B23. Era `any`, e com a tela passando a escrever grão,
  // observações, papel e vocabulário isso deixaria de pegar exatamente os erros
  // que importam — um `papel_analitico` fora do enum, uma coluna sem `columns`.
  const [editedSchema, setEditedSchema] = useState<SchemaMetadata | null>(null);

  const [estadoDoSalvamento, setEstadoDoSalvamento] = useState<EstadoDoSalvamento>("salvo");
  /** Qual coluna está no Agente 2 agora. `null` = nenhuma. */
  const [refinandoColuna, setRefinandoColuna] = useState<string | null>(null);

  /**
   * ⭐ **O retrato do dicionário como ele veio do banco** — é contra isto que a
   * gravação automática decide se há algo a gravar.
   *
   * ⛔ Guardar aqui a CARGA gravada (e não o estado que a gerou) poria o autosave
   * em laço: a carga é trimada e tem os papéis materializados, então ela nunca
   * bate com o `editedSchema` cru.
   */
  const salvoNoBanco = useRef<string | null>(null);
  /** Uma gravação por vez — ver `salvarAgora`. */
  const salvandoAgora = useRef(false);

  /**
   * ⭐ A base que o cadastro mandou abrir (B21), esperando o refetch.
   *
   * ⚠️ Não dá para selecioná-la direto de `datasets`: a lista em memória pode
   * ser anterior à base que se quer abrir. Guardar o id e resolver **depois** do
   * `fetchData` — que o próprio `setShowPipeline(false)` dispara — é o que faz
   * isso funcionar também logo após finalizar um cadastro.
   *
   * ⚠️ **`useRef`, não `useState`, e é de propósito.** Como estado ele teria de
   * entrar nas dependências do efeito de busca, e limpá-lo no fim do próprio
   * efeito dispararia uma segunda busca — recarregar a lista inteira só para
   * anunciar que o pedido foi atendido. Ele é um recado de mão única, não algo
   * que a tela renderiza.
   */
  const idParaAbrir = useRef<string | null>(null);

  /**
   * ⭐ **O diff entre a planilha de hoje e o dicionário gravado** (B22, C13/C15).
   *
   * `null` enquanto ninguém releu. Depois de reler, é o que a tela mostra e o
   * que o "Aplicar" consome — o mesmo objeto, para não haver chance de a tela
   * exibir um diff e o botão aplicar outro.
   */
  const [diff, setDiff] = useState<{
    novas: string[];
    sumiram: string[];
    iguais: string[];
    colisoes: Record<string, string[]>;
    semTitulo: number;
    aba: string;
  } | null>(null);
  const [relendo, setRelendo] = useState(false);
  const [aplicando, setAplicando] = useState(false);

  // Hook do React que executa um efeito colateral após a renderização do componente
  useEffect(() => {
    // Define uma função assíncrona para buscar os dados no Supabase
    const fetchData = async () => {
      // Inicia um bloco try para capturar eventuais erros durante as requisições
      try {
        // Busca a sessão atual de autenticação do usuário no Supabase
        const { data: { session } } = await supabase.auth.getSession();
        // Se não houver uma sessão ativa (usuário não logado), interrompe a execução da função
        if (!session) return;

        // Consulta a tabela 'profiles' no banco de dados do Supabase
        const { data: profileData } = await supabase
          // Especifica a tabela 'profiles'
          .from('profiles')
          // Seleciona todas as colunas
          .select('*')
          // Filtra onde a coluna 'id' seja igual ao ID do usuário autenticado
          .eq('id', session.user.id)
          // Espera retornar um único registro
          .single();

        // Verifica se o perfil foi encontrado e se o usuário possui uma organização associada
        if (profileData && profileData.organization_id) {
          // Consulta a tabela 'organizations' para obter os dados da empresa do usuário
          const { data: orgData } = await supabase
            // Especifica a tabela 'organizations'
            .from('organizations')
            // Seleciona todas as colunas
            .select('*')
            // Filtra pelo ID da organização encontrado no perfil do usuário
            .eq('id', profileData.organization_id)
            // Espera retornar um único registro
            .single();
          // Salva os dados da organização no estado local 'organization'
          setOrganization(orgData);

          // Verifica se o perfil possui um ID de cargo (role_id) atribuído
          if (profileData.role_id) {
            // Consulta a tabela 'roles' para obter o nome do cargo do usuário
            const { data: roleData } = await supabase
              // Especifica a tabela 'roles'
              .from('roles')
              // Seleciona apenas a coluna 'name'
              .select('name')
              // Filtra pelo ID do cargo (role_id) do perfil
              .eq('id', profileData.role_id)
              // Retorna o registro se existir, ou null se não encontrar (sem lançar erro)
              .maybeSingle();

            // Verifica se encontrou o cargo e se o nome dele é 'admin' (convertendo para minúsculas)
            if (roleData && roleData.name.toLowerCase() === 'admin') {
              // Atualiza o estado 'isAdmin' para true se for um administrador
              setIsAdmin(true);
            }
          }

          // Comentário original: Busca as bases de dados (datasets)
          // Consulta a tabela 'datasets' no Supabase
          const { data: dsets } = await supabase
            // Especifica a tabela 'datasets'
            .from('datasets')
            // Seleciona todas as colunas
            .select('*')
            // Filtra os conjuntos de dados pertencentes à organização do usuário
            .eq('organization_id', profileData.organization_id)
            // Ordena os registros pela data de criação em ordem decrescente (mais recentes primeiro)
            .order('created_at', { ascending: false });

          // Se encontrar datasets no banco, atualiza o estado local 'datasets' com a lista recebida
          if (dsets) setDatasets(dsets);

          // ⭐ B21: o cadastro recusou uma planilha já cadastrada e pediu para
          // abrir a base existente. Só agora ela existe na lista.
          if (idParaAbrir.current && dsets) {
            const alvo = dsets.find((d) => d.id === idParaAbrir.current);
            if (alvo) {
              setSelectedDataset(alvo);
              setEditSheetUrl(alvo.google_sheet_url || alvo.google_sheet_id || "");
              // ⚠️ Por `abrirDicionario`, nunca por `setEditedSchema` direto: é
              // ele que guarda o retrato de referência. Sem o retrato, a
              // gravação automática enxerga diferença já no primeiro render e
              // grava a base só por ela ter sido aberta.
              abrirDicionario(alvo);
              setIsEditingSchema(true);
            }
            idParaAbrir.current = null;
          }
        }
      // Bloco que captura qualquer erro que ocorra dentro do bloco try
      } catch (error) {
        // Exibe o erro no console do navegador para depuração
        console.error(error);
      // Bloco que sempre será executado ao final, ocorrendo erro ou não
      } finally {
        // Define o estado de carregamento como falso para liberar a exibição da interface
        setIsLoading(false);
      }
    };
    // Executa a função assíncrona criada acima
    fetchData();
  // Array de dependências: recarrega os dados quando o estado 'showPipeline' mudar
  }, [showPipeline]);

  /** O cargo Admin da organização — comparado por nome, case-insensitive. */
  const idDoCargoAdmin = async (): Promise<string | null> => {
    const { data } = await supabase
      .from('roles')
      .select('id')
      .eq('organization_id', organization.id)
      .ilike('name', 'admin')
      .maybeSingle();
    return data?.id ?? null;
  };

  /**
   * ⭐⭐ **Reler a planilha e comparar com o dicionário gravado** (B22).
   *
   * Fecha a **C15** — *"mudar ou acrescentar uma coluna no Sheets obriga a
   * refazer o cadastro inteiro"* — e, por tabela, a **C13**: recadastrar era a
   * única saída, e recadastrar cria uuid novo, o que leva junto os cards do
   * dashboard e a matriz de permissões por CASCADE. Aqui o `id` do dataset é
   * preservado, porque isto é um `update`. É o ponto do bloco inteiro.
   *
   * ⛔ **NÃO é a edição manual de nome de coluna que o V3 propôs.** O nome
   * normalizado é contrato com três lados — as chaves do `schema_metadata`, os
   * valores de `role_permissions.allowed_columns` e o cabeçalho real, que o
   * executor normaliza na leitura. Digitá-lo à mão quebra os três de uma vez, e
   * a falha é muda: "coluna não encontrada". O que se quer é **reconciliar com
   * a planilha**, e é a planilha que tem a resposta.
   *
   * Nenhuma célula de dado é lida: a Edge Function busca só a linha 1.
   */
  const handleReler = async () => {
    if (!selectedDataset) return;
    setRelendo(true);
    try {
      const res = await supabase.functions.invoke('ai-plum-chat', {
        body: { action: 'cabecalhos_da_planilha', datasetId: selectedDataset.id },
      });

      if (res.error || res.data?.status !== 'ok') {
        // ⚠️ A frase vem do executor e é acionável ("a planilha não foi
        // compartilhada com o Plum"). Trocá-la por uma genérica aqui apagaria a
        // única informação que resolve o problema.
        toast({
          title: "Não consegui ler a planilha",
          description: res.data?.mensagem || res.error?.message || "Tente novamente em instantes.",
          variant: "destructive",
        });
        return;
      }

      const colunas = (res.data.colunas ?? []) as { original: string; nome: string }[];
      const naPlanilha = colunas.map((c) => c.nome);
      // Mesma fonte que o "Aplicar" vai usar — ver `handleAplicarReconciliacao`.
      const noDicionario = Object.keys(
        editedSchema?.columns ?? selectedDataset.schema_metadata?.columns ?? {},
      );

      setDiff({
        novas: naPlanilha.filter((n) => !noDicionario.includes(n)),
        sumiram: noDicionario.filter((n) => !naPlanilha.includes(n)),
        iguais: noDicionario.filter((n) => naPlanilha.includes(n)),
        colisoes: (res.data.colisoes ?? {}) as Record<string, string[]>,
        semTitulo: Number(res.data.colunas_sem_titulo ?? 0),
        aba: String(res.data.aba ?? ""),
      });
    } finally {
      setRelendo(false);
    }
  };

  /**
   * Aplica a reconciliação. ⚠️ **A ORDEM DOS DOIS UPDATES É A DEFESA.**
   *
   * O cliente Supabase não tem transação, e são duas tabelas: o
   * `schema_metadata` e o `allowed_columns` de todos os cargos. Como não dá para
   * torná-los atômicos, escolhe-se o lado seguro de falhar:
   *
   *   1. tira a coluna do `allowed_columns` — falhar aqui não muda nada;
   *   2. grava o `schema_metadata` novo.
   *
   * ⛔ **Na ordem inversa, uma falha no meio produz a C12** — a matriz de
   * permissões citando coluna que o dicionário não tem mais, que é silenciosa e
   * envelhece até alguém pedir aquela coluna. Nesta ordem, a falha no meio deixa
   * a coluna no dicionário e fora da permissão: aparece na matriz, e refazer
   * resolve.
   */
  const handleAplicarReconciliacao = async () => {
    if (!selectedDataset || !diff || !organization) return;
    setAplicando(true);
    try {
      // ⚠️ **A base é o que está NA TELA, não o que está salvo** — e desde o
      // B23 isso importa. O painel passou a editar grão, observações, papel e
      // vocabulário; partir do schema salvo faria a reconciliação descartar tudo
      // o que a pessoa digitou e ainda não gravou, sem avisar. Ela só cai no
      // salvo se o painel de edição nem estiver aberto.
      const atual = (editedSchema ?? selectedDataset.schema_metadata ?? {}) as SchemaMetadata;
      const colunasAtuais = (atual.columns ?? {}) as Record<string, ColunaDoSchema>;

      const columns: Record<string, ColunaDoSchema> = {};
      // ⭐ As iguais passam INTOCADAS — definição semântica, papel analítico e
      // vocabulário sobrevivem. É o que separa isto de recadastrar.
      for (const nome of diff.iguais) columns[nome] = colunasAtuais[nome];
      for (const nome of diff.novas) columns[nome] = colunaNova();

      const novoSchema = {
        ...atual,
        // ⛔ **A `versao` é preservada, nunca promovida.** `conferido = versao >= 2`
        // afirma que uma pessoa conferiu papel e grão de CADA coluna, e a
        // reconciliação não pergunta nada disso. Promover faria o A3 parar de
        // declarar presunção sobre conceitos que ninguém leu.
        versao: atual.versao ?? 1,
        columns,
      };

      // ── 1 · o `allowed_columns` primeiro ──────────────────────────────────
      const { data: permissoes, error: erroLendo } = await supabase
        .from('role_permissions')
        .select('id, role_id, allowed_columns')
        .eq('dataset_id', selectedDataset.id);
      if (erroLendo) throw erroLendo;

      const adminId = await idDoCargoAdmin();

      for (const p of permissoes ?? []) {
        const antes: string[] = p.allowed_columns ?? [];
        // ⭐ Coluna nova vai SÓ para o Admin. Permissão é sempre explícita
        // (CLAUDE.md §3) — liberar para todo cargo daria acesso que ninguém
        // concedeu. E o Admin precisa porque ele nunca aparece no formulário de
        // permissões do `Dashboard.tsx`, que assume acesso irrestrito para ele.
        const ganha = p.role_id === adminId ? diff.novas : [];
        const depois = [...antes.filter((c) => !diff.sumiram.includes(c)), ...ganha]
          .filter((c, i, todas) => todas.indexOf(c) === i);

        const igual = depois.length === antes.length && depois.every((c, i) => c === antes[i]);
        if (igual) continue;

        const { error } = await supabase
          .from('role_permissions')
          .update({ allowed_columns: depois })
          .eq('id', p.id);
        if (error) throw error;
      }

      // ── 2 · e só então o dicionário ───────────────────────────────────────
      //
      // ⭐ Pelo caminho único de gravação, e AGORA em vez de esperar o debounce:
      // a permissão já foi mexida acima, e uma aba fechada nesse intervalo
      // deixaria a coluna fora do cargo mas ainda no dicionário. É a direção
      // segura de falhar (D-056), mas não há motivo para provocá-la.
      setEditedSchema(JSON.parse(JSON.stringify(novoSchema)));
      await salvarAgora(novoSchema);
      setDiff(null);

      toast({
        title: "Esquema reconciliado",
        description:
          `${diff.novas.length} coluna(s) acrescentada(s), ${diff.sumiram.length} removida(s). ` +
          "Os cards e as permissões desta base continuam valendo.",
      });
    } catch (e) {
      toast({
        title: "Não consegui aplicar",
        description: e instanceof Error ? e.message : String(e),
        variant: "destructive",
      });
    } finally {
      setAplicando(false);
    }
  };

  /**
   * ⭐⭐ **O dicionário v2 de uma base ATIVA** (B23, fecha a C17).
   *
   * Até agora `grao`, `observacoes`, `papel_analitico` e `vocabulario_util` só
   * existiam durante o cadastro: quem quisesse acrescentar uma observação ou
   * corrigir o papel de uma coluna numa base pronta não tinha por onde — e
   * recadastrar custa os cards do dashboard (C13).
   *
   * ⚠️ **Base v1 não tem esses campos**, e não é erro: o leitor inventa defaults
   * (papel deduzido do tipo de formatação, vocabulário ligado em toda dimensão).
   * A tela mostra esses defaults para a pessoa confirmar ou corrigir — mas
   * mostrá-los NÃO é o mesmo que alguém tê-los conferido. É por isso que salvar
   * não promove a versão; ver `handleMarcarConferida`.
   */
  const grao: string = typeof editedSchema?.grao === "string" ? editedSchema.grao : "";
  const observacoes: string[] = Array.isArray(editedSchema?.observacoes)
    ? editedSchema.observacoes
    : [];
  const colunasDoSchema: Record<string, ColunaDoSchema> = editedSchema?.columns ?? {};
  const baseConferida = Number(editedSchema?.versao ?? 1) >= 2;

  /**
   * Escreve no clone sem mutar o objeto anterior.
   *
   * ⛔ **O código daqui fazia `{ ...editedSchema }` e mexia em
   * `updated.columns[col].x`** — spread raso, então `updated.columns` era o
   * MESMO objeto e a edição mutava o estado anterior. Funcionava por acidente,
   * porque `editedSchema` já nasce de um clone profundo do `selectedDataset`.
   *
   * ⚠️ Deixou de funcionar por acidente no B24: o refino precisa comparar o que
   * está na tela com o que está SALVO, e uma referência para dentro de um objeto
   * que se automuta não é linha de base nenhuma.
   */
  const mexerNaColuna = (col: string, campos: Partial<ColunaDoSchema>) => {
    setEditedSchema((antes) => antes && ({
      ...antes,
      columns: {
        ...antes.columns,
        [col]: { ...antes.columns[col], ...campos },
      },
    }));
  };

  const papelDaColuna = (col: string): PapelAnalitico => {
    const declarado = colunasDoSchema[col]?.papel_analitico;
    return PAPEIS.some((p) => p.valor === declarado)
      ? (declarado as PapelAnalitico)
      : "dimensao";
  };

  /**
   * O dicionário como vai para o banco.
   *
   * ⚠️ **Ele materializa defaults**, e com a gravação automática isso passou a
   * acontecer mais cedo: `papel_analitico` é gravado para TODA coluna, usando o
   * papel deduzido da regra de formatação quando não há um declarado. Antes
   * chegava ao banco quando alguém clicava em Salvar; agora chega ~1 s depois da
   * primeira edição.
   *
   * ⭐ Não muda comportamento — o leitor já derivava o mesmo valor quando o campo
   * faltava — mas congela o default, e a base deixa de distinguir "papel
   * deduzido" de "papel declarado". A proteção que importa segue de pé:
   * `conferido` depende só da `versao`, e a `versao` só muda no botão de marcar
   * como conferida.
   */
  const montarSchema = (): SchemaMetadata => {
    const columns: Record<string, ColunaDoSchema> = {};
    for (const [col, dados] of Object.entries(colunasDoSchema)) {
      const papel = papelDaColuna(col);
      columns[col] = {
        ...dados,
        papel_analitico: papel,
        // ⚠️ Mesma regra do cadastro, e o porquê mora em `vocabularioEfetivo`:
        // o interruptor some fora de dimensão, então um `true` pode ter sobrado
        // de quando a coluna era dimensão e ninguém tem como desligá-lo.
        //
        // ⭐ Continua sendo aplicado só na GRAVAÇÃO, e não no `onChange` do
        // papel — mesmo agora que os dois momentos distam ~1 s. O estado guarda
        // o `vocabulario_util` cru, então trocar para medida e voltar para
        // dimensão devolve a escolha; é o banco que recebe o valor saneado.
        vocabulario_util: vocabularioEfetivo(papel, dados?.vocabulario_util),
      };
    }
    return {
      ...(editedSchema as SchemaMetadata),
      versao: Number(editedSchema?.versao ?? 1),
      grao: grao.trim(),
      // Vazias somem: uma linha em branco criada por engano não vira observação.
      observacoes: observacoes.map((o) => String(o).trim()).filter(Boolean),
      columns,
    };
  };

  /**
   * ⭐⭐ **Grava o dicionário. É o ÚNICO caminho de escrita do `schema_metadata`
   * nesta tela**, e ser único é metade do conserto.
   *
   * ⛔ **O que existia antes era duas coisas ao mesmo tempo**, e elas se
   * destruíam: o refino semântico só mexia no estado e esperava um botão
   * "Salvar dicionário"; o refino de formatação gravava direto no banco,
   * partindo do schema **salvo** e ignorando o que estava em edição — e ainda
   * fazia `setEditedSchema` com o resultado. Refinar a semântica e em seguida
   * pedir uma ordem de formatação apagava o refino no banco **e** na tela, sem
   * F5 nenhum. Ver `contexto/31-incidentes-e-licoes.md` I-15.
   *
   * ⚠️ **Não devolve o resultado para o estado**, e isso não é economia: o
   * `montarSchema` faz `grao.trim()` e descarta observação vazia. Reescrever o
   * estado com o que foi gravado comeria o espaço que a pessoa acabou de digitar
   * e faria a observação em branco recém-criada sumir antes de receber texto.
   * O que se atualiza depois de gravar é o `selectedDataset`, a lista e o
   * retrato — nunca os campos.
   *
   * `schemaExplicito` existe para quem já montou o objeto (a reconciliação do
   * B22) e precisa gravar **agora**, sem esperar o debounce.
   */
  const salvarAgora = async (schemaExplicito?: SchemaMetadata) => {
    if (!editedSchema || !selectedDataset) return;
    // ⚠️ Uma gravação por vez. Duas respostas fora de ordem gravariam a mais
    // velha por último. Quem for barrado aqui volta pelo efeito: terminada esta,
    // o estado muda e o retrato ainda difere, então ela é reagendada.
    if (salvandoAgora.current) return;

    const alvo = selectedDataset;
    const retrato = JSON.stringify(schemaExplicito ?? editedSchema);
    const carga = schemaExplicito ?? montarSchema();

    salvandoAgora.current = true;
    setEstadoDoSalvamento("salvando");
    try {
      const { error } = await supabase
        .from('datasets')
        // ⚠️ O cast fica AQUI, na fronteira com o banco. A coluna é `jsonb` e o
        // tipo gerado é `Json`, que exige assinatura de índice — acrescentá-la
        // ao `SchemaMetadata` afrouxaria justamente o tipo que faz esta tela
        // pegar um papel analítico fora do enum.
        .update({ schema_metadata: carga as unknown as Json })
        .eq('id', alvo.id);
      if (error) throw error;

      // ⭐ O retrato é do ESTADO que gerou a gravação, não da carga. Guardar a
      // carga faria o próximo teste acusar diferença para sempre (ela é trimada
      // e tem os defaults materializados) — e o autosave entraria em laço.
      salvoNoBanco.current = retrato;

      const atualizado = { ...alvo, schema_metadata: carga };
      // ⚠️ Guardado por id: a pessoa pode ter trocado de base durante a espera.
      setSelectedDataset((s: any) => (s?.id === alvo.id ? atualizado : s));
      setDatasets((antes) => antes.map((d) => (d.id === alvo.id ? atualizado : d)));
      setEstadoDoSalvamento("salvo");
    } catch (e) {
      console.error("[cfgdatabase] falha ao gravar o dicionario:", e);
      setEstadoDoSalvamento("erro");
    } finally {
      salvandoAgora.current = false;
    }
  };

  /**
   * ⭐ **A gravação automática.** Substituiu o botão "Salvar dicionário", que era
   * fácil demais de ignorar — e ignorá-lo custava o trabalho inteiro num F5.
   *
   * ⛔ **Abrir o painel não pode gravar.** Por isso o teste é entre o `editedSchema`
   * e o retrato de como ele veio do banco, e não entre a carga e o que está lá:
   * a carga materializa papéis deduzidos, então numa base v1 ela difere do
   * armazenado já no primeiro render, e a tela gravaria só por ter sido aberta.
   *
   * `useEffect` cru com `setTimeout`, e não `useMutation`: o repositório tem o
   * `QueryClientProvider` montado e **zero** uso de react-query. Estrear a lib
   * aqui seria inventar um padrão, não seguir um — o vizinho mais próximo é o
   * `use-tema.ts`, que persiste sem botão com um efeito simples.
   */
  useEffect(() => {
    if (!editedSchema || !selectedDataset) return;
    if (JSON.stringify(editedSchema) === salvoNoBanco.current) return;

    const timer = setTimeout(() => { void salvarAgora(); }, ATRASO_DO_AUTOSAVE);
    return () => clearTimeout(timer);
    // ⚠️ `salvarAgora` fica FORA das dependências de propósito: ela é recriada a
    // cada render, e incluí-la reiniciaria o timer em todo render — bastando uma
    // re-renderização a cada 900 ms para a gravação nunca acontecer. O que
    // precisa disparar o efeito é a mudança do dicionário, e o `setTimeout`
    // sempre captura a versão mais recente da função.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editedSchema, selectedDataset]);

  /**
   * ⚠️ **Grava o que está pendente ANTES de trocar de base ou fechar o painel.**
   *
   * Os dois caminhos substituem o `editedSchema`, o que dispara a limpeza do
   * efeito acima e cancela o timer — perdendo o que foi digitado nos últimos
   * instantes. Chamada de dentro do handler, ela ainda enxerga pelo closure o
   * `selectedDataset` **antigo**, que é exatamente o dono daquele texto.
   */
  const descarregarPendente = () => {
    if (!editedSchema || !selectedDataset) return;
    if (JSON.stringify(editedSchema) === salvoNoBanco.current) return;
    void salvarAgora();
  };

  /** Guarda o retrato de referência ao carregar um dicionário na tela. */
  const abrirDicionario = (dataset: any) => {
    const bruto = dataset?.schema_metadata ?? null;
    const clone = bruto ? JSON.parse(JSON.stringify(bruto)) : null;
    salvoNoBanco.current = JSON.stringify(clone);
    setEstadoDoSalvamento("salvo");
    setEditedSchema(clone);
  };

  /**
   * Agente 2 — melhora a redação de UMA coluna.
   *
   * ⭐ **Um botão por coluna, e não mais um em lote.** O lote comparava a tela
   * com o que estava salvo para saber o que mandar; com a gravação automática os
   * dois estão sempre iguais, e o contador viveria em zero. Escolher a coluna é
   * mais explícito que qualquer diff — e some a pergunta "editei desde quando?".
   *
   * ⚠️ **Não grava aqui.** A alteração entra no estado e a gravação automática a
   * leva ao banco, pelo mesmo caminho de qualquer edição manual. É isso que
   * impede um agente de escrever por cima do outro.
   */
  const handleRefinarColuna = async (col: string) => {
    const definicao = colunasDoSchema[col]?.semantic_definition ?? "";
    if (!definicao.trim()) {
      toast({
        title: "Escreva a definição primeiro",
        description: "O Agente 2 melhora a redação do que você escreveu — sem texto, não há o que melhorar.",
      });
      return;
    }

    setRefinandoColuna(col);
    try {
      const res = await supabase.functions.invoke('ai-agents', {
        body: { action: 'refine_semantics', columns: { [col]: definicao }, dataSamples: [] }
      });
      if (res.error) throw res.error;

      const refinadas = (res.data?.result ?? {}) as Record<string, string>;
      const nova = refinadas[col];
      // ⚠️ Só a chave que foi mandada é aceita de volta. O Agente 2 não tem por
      // que inventar coluna, mas aceitar chave desconhecida criaria definição
      // para coluna que não existe nesta base.
      if (typeof nova !== "string" || !nova.trim()) {
        throw new Error("A IA não devolveu uma descrição para esta coluna.");
      }

      mexerNaColuna(col, { semantic_definition: nova });
    } catch (err) {
      console.error(err);
      toast({
        title: "Erro ao refinar a descrição",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setRefinandoColuna(null);
    }
  };

  /**
   * ⭐⭐ **Marcar a base como conferida — e é um ATO, não uma inferência.**
   *
   * `conferido = versao >= 2` é lido por `paraPrompt` e muda uma coisa só: com
   * `false`, o A3 recebe *"Este dicionário NÃO foi conferido por uma pessoa…
   * declare presunção"*. Promover cala esse aviso.
   *
   * ⛔ **Por que não é automático.** A tentação é promover quando "toda coluna
   * tem papel". Numa base v1 as colunas **não têm papel nenhum** — a tela mostra
   * o default deduzido pela máquina, e um salvamento qualquer gravaria esses
   * defaults e promoveria a base sem ninguém ter lido nada. Silenciaria
   * exatamente o aviso que existe para dizer que ninguém leu. E com a gravação
   * automática isso deixou de ser hipótese: **todo** salvamento é automático
   * agora, então a `versao` precisava sair do caminho comum.
   *
   * ⚠️ **Continua sendo ato explícito mesmo gravando sozinho:** o que muda a
   * versão é o clique. A persistência é que virou automática, não a decisão.
   *
   * O grão é pré-requisito porque é o campo que mais muda resposta e o que a IA
   * mais erra: "uma venda" e "um dia por loja" fazem a mesma soma significar
   * coisas diferentes. Base conferida sem grão declarado seria a pior
   * combinação — o A3 confiando num dicionário que não diz o que é uma linha.
   */
  const marcarRevisao = (versao: number) =>
    setEditedSchema((antes) => antes && ({ ...antes, versao }));

  const handleDeleteDataset = async (id: string) => {
    if (!window.confirm("Atenção: Tem certeza que deseja excluir permanentemente esta base de dados? Esta ação não pode ser desfeita.")) {
      return;
    }
    
    setIsLoading(true);
    try {
      const { error } = await supabase.from('datasets').delete().eq('id', id);
      if (error) throw error;
      
      setDatasets(datasets.filter(d => d.id !== id));
      setSelectedDataset(null);
      alert("Base de dados excluída com sucesso!");
    } catch (error: any) {
      console.error(error);
      alert("Erro ao excluir base de dados: " + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) return <div>Carregando...</div>;

  if (!isAdmin) {
    return (
      <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-500 flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 mt-0.5" />
        <div>
          <h4 className="font-semibold">Acesso Restrito</h4>
          <p className="text-sm">Você precisa ser um Admin para acessar as Bases de Dados.</p>
        </div>
      </div>
    );
  }



  if (showPipeline) {
    return (
      <div className="max-w-[70.4rem] mx-auto space-y-6">
        <Button variant="ghost" onClick={() => setShowPipeline(false)} className="mb-4">
          ← Voltar para Minhas Bases de Dados
        </Button>
        {organization && (
          <DatabasePipeline
            organizationId={organization.id}
            // ⭐ B21. Sair do cadastro e cair já dentro de "Editar Esquema" da
            // base que existe — é lá que fica o "Reler a planilha", que é o que
            // a pessoa queria fazer quando recolou o link.
            onAbrirBase={(id) => { idParaAbrir.current = id; setShowPipeline(false); }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-[70.4rem] mx-auto space-y-8 pb-20">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Bases de Dados</h1>
          <p className="text-muted-foreground mt-1">Gerencie suas planilhas conectadas e os schemas extraídos pela IA.</p>
        </div>
        <Button onClick={() => { setSelectedDataset(null); setShowPipeline(true); }} className="gap-2">
          <Plus className="h-4 w-4" /> Conectar Nova Planilha
        </Button>
      </div>

      {datasets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 border border-dashed border-border rounded-xl bg-background/50">
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground">Nenhuma base conectada</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-6">Conecte sua primeira planilha para o Chatbot aprender sobre seus dados.</p>
          <Button onClick={() => setShowPipeline(true)} variant="outline">
            Começar agora
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {datasets.map((dataset) => (
            <div
              key={dataset.id}
              className={`p-5 rounded-xl border cursor-pointer transition-all hover:border-primary/50 hover:bg-muted/20 ${selectedDataset?.id === dataset.id ? 'border-primary ring-1 ring-primary/20 bg-primary/5' : 'border-border bg-background'}`}
              onClick={() => {
                // ⚠️ Antes de trocar: o que foi digitado nos últimos instantes
                // ainda não passou pelo debounce, e trocar cancelaria o timer.
                // Chamada aqui, ela ainda enxerga a base ANTIGA pelo closure.
                descarregarPendente();
                setSelectedDataset(selectedDataset?.id === dataset.id ? null : dataset);
                // ⛔ O diff pertence a UMA base. Sem esta linha, reler a base A,
                // clicar na base B e apertar "Aplicar" gravaria as colunas de A
                // no dicionário de B — e nada na tela denunciaria.
                setDiff(null);
                setIsEditingSchema(false);
                setEditSheetUrl(dataset.google_sheet_url || dataset.google_sheet_id || "");
                abrirDicionario(dataset);
              }}
            >
              <div className="flex justify-between items-start mb-4">
                <div className="h-10 w-10 bg-primary/10 rounded-lg flex items-center justify-center">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                </div>
                <div className={`text-xs px-2 py-1 rounded-full font-medium ${dataset.status === 'active' ? 'bg-green-500/10 text-green-500' : 'bg-amber-500/10 text-amber-500'}`}>
                  {dataset.status === 'active' ? 'Concluído' : 'Rascunho'}
                </div>
              </div>
              <h3 className="font-semibold text-lg text-foreground truncate" title={dataset.name}>{dataset.name}</h3>
              <div className="flex items-center gap-4 mt-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> {new Date(dataset.created_at).toLocaleDateString()}</span>
                {dataset.schema_metadata && (
                  <span className="flex items-center gap-1"><Activity className="h-3 w-3" /> {Object.keys(dataset.schema_metadata.columns || {}).length} Colunas</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedDataset && (
        <div className="mt-8 border border-border rounded-xl bg-background overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="p-6 border-b border-border bg-muted/20 flex justify-between items-center">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" /> {selectedDataset.name}
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                {selectedDataset.status === 'active' ? 'Esquema ativo e pronto para consultas do Chatbot.' : 'O processamento desta planilha ainda não foi finalizado.'}
              </p>
            </div>
            <Button 
              onClick={() => {
                if (selectedDataset.status === 'active') {
                  descarregarPendente();
                  setIsEditingSchema(!isEditingSchema);
                  setDiff(null);
                  setEditSheetUrl(selectedDataset.google_sheet_url || selectedDataset.google_sheet_id || "");
                  abrirDicionario(selectedDataset);
                } else {
                  setShowPipeline(true);
                }
              }} 
              variant={selectedDataset.status === 'active' ? (isEditingSchema ? 'secondary' : 'outline') : 'default'}
            >
              {/*
                ⚠️ "Concluir", não "Cancelar Edição": ele reclonava o dicionário
                do `selectedDataset`, ou seja, DESCARTAVA o não salvo. Com a
                gravação automática não há o que descartar, e manter o rótulo
                antigo prometeria um desfazer que não existe.
              */}
              {selectedDataset.status === 'active' ? (isEditingSchema ? 'Concluir' : 'Editar Esquema') : 'Continuar Rascunho'} 
              {!isEditingSchema && <ArrowRight className="ml-2 h-4 w-4" />}
            </Button>
            <Button
              variant="destructive"
              className="ml-2"
              onClick={() => handleDeleteDataset(selectedDataset.id)}
              title="Excluir base de dados permanentemente"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>

          <div className="p-6">
            {selectedDataset.status === 'active' && isEditingSchema && editedSchema ? (
              <div className="space-y-8">

                {/*
                  ⭐⭐ **O indicador ocupou o lugar do botão "Salvar dicionário".**

                  O botão saía fácil demais do campo de visão — e ignorá-lo custava
                  o trabalho inteiro no primeiro F5 (I-15). Agora tudo grava
                  sozinho, e o que a tela precisa dizer é só se já gravou.

                  ⚠️ Fica no TOPO, não no rodapé: o painel é longo, e um estado
                  que você não vê não informa nada.

                  ⭐ **O botão volta APENAS no erro** — sem nenhuma forma de
                  reagir, uma falha de rede seria a mesma perda silenciosa que
                  estamos consertando.
                */}
                <div className="flex items-center gap-2 text-xs">
                  {estadoDoSalvamento === "salvando" && (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                      <span className="text-muted-foreground">Salvando…</span>
                    </>
                  )}
                  {estadoDoSalvamento === "salvo" && (
                    <>
                      <Check className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-muted-foreground">
                        Tudo salvo — esta tela grava sozinha a cada alteração.
                      </span>
                    </>
                  )}
                  {estadoDoSalvamento === "erro" && (
                    <>
                      <span className="text-destructive font-medium">
                        Não consegui salvar. Suas alterações estão só neste navegador.
                      </span>
                      <Button variant="outline" size="sm" className="h-6 px-2" onClick={() => void salvarAgora()}>
                        Tentar de novo
                      </Button>
                    </>
                  )}
                </div>

                
                {/* 1. Conexão */}
                <div className="space-y-3">
                  <h4 className="font-semibold text-foreground">Conexão do Google Sheets</h4>
                  <p className="text-xs text-muted-foreground">Atualize o link da planilha. Não esqueça de compartilhar com o email oficial <strong>plum-polijunior@plataforma-plum.iam.gserviceaccount.com</strong> como Leitor.</p>
                  <div className="flex gap-2">
                    <Input 
                      value={editSheetUrl} 
                      onChange={(e) => setEditSheetUrl(e.target.value)} 
                      placeholder="https://docs.google.com/spreadsheets/d/[ID_DA_SUA_PLANILHA]"
                    />
                    <Button onClick={async () => {
                      // Mesma regra do onboarding: o ID é a verdade, a URL é
                      // só para exibir. Recusar aqui evita gravar uma base que
                      // vai falhar depois, na hora que alguém abrir o card.
                      //
                      // O `gid` (qual aba) vem no mesmo passo. Esta tela é
                      // também o conserto de bases antigas: recolar a URL com a
                      // aba certa aberta passa a corrigir a aba, coisa que
                      // antes era impossível pela interface.
                      const ref = extrairSheetRef(editSheetUrl);
                      if (!ref) {
                        alert(ehLinkPublicado(editSheetUrl) ? ERRO_LINK_PUBLICADO : ERRO_LINK_INVALIDO);
                        return;
                      }

                      // ⭐ **A segunda porta da base duplicada** (B21).
                      //
                      // O cadastro passou a recusar planilha já cadastrada, mas
                      // esta tela apontava uma base ativa para o sheet+aba de
                      // OUTRA base sem conferir nada — e o resultado é pior que
                      // duplicar: duas bases com dicionários diferentes lendo a
                      // mesma aba, e cada card respondendo pelo dicionário que
                      // por acaso for consultado.
                      let jaExiste = supabase
                        .from('datasets')
                        .select('id, name')
                        .eq('organization_id', organization.id)
                        .eq('google_sheet_id', ref.id)
                        .neq('id', selectedDataset.id);
                      // ⚠️ `.eq(col, null)` não casa NULL no PostgREST, e
                      // `gid = 0` é a primeira aba — desvio por `=== null`.
                      jaExiste = ref.gid === null
                        ? jaExiste.is('google_sheet_gid', null)
                        : jaExiste.eq('google_sheet_gid', ref.gid);

                      const { data: conflito } = await jaExiste;
                      if (conflito?.length) {
                        alert(
                          `Essa aba já é a base "${conflito[0].name}". ` +
                          "Duas bases lendo a mesma aba se contradizem, porque cada " +
                          "uma tem o seu próprio dicionário. Abra aquela base, ou " +
                          "aponte esta para outra aba.",
                        );
                        return;
                      }

                      const { error } = await supabase
                        .from('datasets')
                        .update({
                          google_sheet_id: ref.id,
                          google_sheet_url: editSheetUrl,
                          google_sheet_gid: ref.gid,
                        })
                        .eq('id', selectedDataset.id);
                      if (!error) {
                        alert("Planilha atualizada com sucesso!");
                        setSelectedDataset({
                          ...selectedDataset,
                          google_sheet_id: ref.id,
                          google_sheet_url: editSheetUrl,
                          google_sheet_gid: ref.gid,
                        });
                      } else {
                        alert("Não consegui salvar: " + error.message);
                      }
                    }}>Salvar URL</Button>
                  </div>
                </div>

                {/*
                  ⭐⭐ 1-bis. RELER A PLANILHA (B22) — a C13 e a C15.

                  Fica logo abaixo da conexão de propósito: é a mesma pergunta
                  ("esta base ainda corresponde à planilha?"), e quem acabou de
                  corrigir a aba costuma querer reler em seguida.
                */}
                <div className="space-y-3 border-t border-border pt-6">
                  <h4 className="font-semibold text-foreground">Reler a planilha</h4>
                  <p className="text-xs text-muted-foreground">
                    Compara o cabeçalho de hoje com o dicionário desta base. Serve para quando
                    você acrescentou ou tirou uma coluna no Google Sheets — sem recadastrar,
                    então os cards do dashboard e as permissões dos cargos continuam valendo.
                    Nenhum dado é lido, só a primeira linha.
                  </p>

                  <Button variant="outline" onClick={handleReler} disabled={relendo} className="gap-2">
                    {relendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    Reler a planilha
                  </Button>

                  {diff && (
                    <div className="space-y-3 rounded-xl border border-border p-4 bg-background/50">
                      <p className="text-xs text-muted-foreground">
                        Aba lida: <strong>{diff.aba}</strong>
                      </p>

                      {/*
                        ⛔ Colisão TRAVA, igual ao passo 1 do cadastro (C11).
                        Aplicar com dois cabeçalhos que normalizam para o mesmo
                        nome faria a base perder uma coluna em silêncio — o furo
                        que o B13 fechou, reaberto por outra porta.
                      */}
                      {Object.keys(diff.colisoes).length > 0 ? (
                        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                          <p className="text-sm font-semibold text-destructive">
                            Duas colunas com o mesmo nome interno
                          </p>
                          <p className="text-xs text-muted-foreground">
                            Renomeie uma delas na planilha e releia. Seguir assim faria esta base
                            perder uma coluna sem avisar.
                          </p>
                          <ul className="text-xs font-mono space-y-1">
                            {Object.entries(diff.colisoes).map(([nome, originais]) => (
                              <li key={nome}>
                                <span className="text-destructive">{nome}</span>
                                {" ← "}
                                {originais.map((o) => `"${o}"`).join(" e ")}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ) : (
                        <>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div>
                              <p className="font-semibold text-foreground mb-1">
                                Novas ({diff.novas.length})
                              </p>
                              {diff.novas.length === 0 ? (
                                <p className="text-muted-foreground">nenhuma</p>
                              ) : (
                                <ul className="font-mono space-y-0.5 text-primary">
                                  {diff.novas.map((n) => <li key={n}>+ {n}</li>)}
                                </ul>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground mb-1">
                                Sumiram ({diff.sumiram.length})
                              </p>
                              {diff.sumiram.length === 0 ? (
                                <p className="text-muted-foreground">nenhuma</p>
                              ) : (
                                <ul className="font-mono space-y-0.5 text-destructive line-through">
                                  {diff.sumiram.map((n) => <li key={n}>{n}</li>)}
                                </ul>
                              )}
                            </div>
                            <div>
                              <p className="font-semibold text-foreground mb-1">
                                Iguais ({diff.iguais.length})
                              </p>
                              <p className="text-muted-foreground">
                                Intocadas: a descrição, o papel e o vocabulário delas ficam
                                exatamente como estão.
                              </p>
                            </div>
                          </div>

                          {diff.semTitulo > 0 && (
                            <p className="text-xs text-muted-foreground">
                              {diff.semTitulo} coluna(s) sem título na planilha foram ignoradas —
                              sem cabeçalho não há nome pelo qual pedir a coluna.
                            </p>
                          )}

                          {diff.sumiram.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              ⚠️ As colunas que sumiram saem também da permissão de todos os
                              cargos. Card que dependa de uma delas para de responder.
                            </p>
                          )}

                          {diff.novas.length > 0 && (
                            <p className="text-xs text-muted-foreground">
                              As colunas novas entram <strong>sem descrição</strong>. Escreva o que
                              cada uma significa no bloco abaixo — sem isso o chat sabe que a
                              coluna existe, mas não o que ela quer dizer.
                            </p>
                          )}

                          <div className="flex gap-2 pt-1">
                            <Button
                              onClick={handleAplicarReconciliacao}
                              disabled={aplicando || (diff.novas.length === 0 && diff.sumiram.length === 0)}
                              className="gap-2"
                            >
                              {aplicando && <Loader2 className="h-4 w-4 animate-spin" />}
                              {diff.novas.length === 0 && diff.sumiram.length === 0
                                ? "Nada a reconciliar"
                                : "Aplicar ao dicionário"}
                            </Button>
                            <Button variant="ghost" onClick={() => setDiff(null)}>
                              Descartar
                            </Button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/*
                  ⭐⭐ 1-ter. A BASE (B23) — grão, observações e o estado da revisão.

                  Antes da lista de colunas, na mesma ordem da etapa 4 do
                  cadastro: quem conhece uma tela reconhece a outra. Os textos
                  são os mesmos de lá de propósito — são os mesmos conceitos, e
                  redigi-los diferente faria parecer que são coisas diferentes.
                */}
                <div className="space-y-4 border-t border-border pt-6">
                  <h4 className="font-semibold text-foreground">A base</h4>

                  <div>
                    <Label htmlFor="grao-da-base-ativa" className="text-sm font-semibold">
                      O que UMA LINHA da planilha representa?
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      É o grão da base. Ex.: "uma venda", "um dia por loja", "um atendimento".
                      É o campo que mais muda resposta: "uma venda" e "um dia por loja" fazem a
                      mesma soma significar coisas diferentes.
                    </p>
                    <Input
                      id="grao-da-base-ativa"
                      value={grao}
                      onChange={(e) => setEditedSchema((antes) => antes && ({ ...antes, grao: e.target.value }))}
                      placeholder="Ex: uma venda"
                    />
                  </div>

                  <div>
                    <Label className="text-sm font-semibold">Observações sobre a base</Label>
                    <p className="text-xs text-muted-foreground mt-1 mb-2">
                      Contexto que muda a leitura de um número, em prosa. É onde entra a regra que
                      só você sabe — <em>"considere apenas vendas faturadas para a receita"</em> —
                      e o chat a declara como presunção ao usá-la.
                    </p>
                    {observacoes.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        Nenhuma observação nesta base. Você pode escrever a primeira.
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {observacoes.map((obs, idx) => (
                          <div key={idx} className="flex gap-2">
                            <Input
                              value={obs}
                              onChange={(e) => setEditedSchema((antes) => antes && ({
                                ...antes,
                                observacoes: observacoes.map((o, i) => (i === idx ? e.target.value : o)),
                              }))}
                            />
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditedSchema((antes) => antes && ({
                                ...antes,
                                observacoes: observacoes.filter((_, i) => i !== idx),
                              }))}
                            >
                              Remover
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => setEditedSchema((antes) => antes && ({
                        ...antes,
                        observacoes: [...observacoes, ""],
                      }))}
                    >
                      <Plus className="mr-1 h-3 w-3" /> Acrescentar observação
                    </Button>
                  </div>

                  {/*
                    ⭐⭐ O ESTADO DA REVISÃO — e o botão é um ato separado do salvar.

                    Ver `handleMarcarConferida`: promover a versão é a pessoa
                    afirmando que leu, não algo que a tela deduz de o objeto
                    "parecer completo".
                  */}
                  <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-2">
                    <p className="text-sm font-semibold text-foreground">
                      {baseConferida ? "Esta base está conferida" : "Esta base ainda não foi conferida"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {baseConferida
                        ? "O chat confia neste dicionário e só declara presunção quando a pergunta realmente exige interpretar alguma coluna."
                        : "O chat avisa o planejador de que os conceitos abaixo foram deduzidos por máquina, e pede que ele declare presunção sempre que usar uma coluna que precisou interpretar."}
                    </p>
                    {baseConferida ? (
                      <Button variant="outline" size="sm" onClick={() => marcarRevisao(1)}>
                        Marcar como não conferida
                      </Button>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!grao.trim()}
                          onClick={() => marcarRevisao(2)}
                        >
                          Marcar como conferida
                        </Button>
                        <p className="text-[11px] text-muted-foreground">
                          {grao.trim()
                            ? "Ao marcar, você afirma que leu o papel de cada coluna e o grão desta base."
                            : "Preencha o grão acima para poder marcar: base conferida sem dizer o que é uma linha é a pior combinação."}
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* 2. As colunas — definição, papel e vocabulário */}
                <div className="space-y-4 border-t border-border pt-6">
                  <h4 className="font-semibold text-foreground">Colunas</h4>
                  <p className="text-xs text-muted-foreground">
                    Corrija o que a IA não podia saber — só você conhece regras como "lucro não
                    inclui impostos". O papel decide o que o planejador PODE fazer com a coluna.
                  </p>

                  <div className="flex flex-col gap-3 max-h-[32rem] overflow-y-auto pr-2 border border-border p-3 rounded-xl bg-background/50">
                    {Object.entries(colunasDoSchema).map(([colName, colData]) => {
                      const papel = papelDaColuna(colName);
                      return (
                        <div key={colName} className="flex flex-col md:flex-row gap-3 pb-3 border-b border-border/50 last:border-0 last:pb-0">
                          <div className="md:flex-1 flex flex-col gap-1">
                            <div className="flex items-center justify-between gap-2">
                              <label className="text-xs font-bold font-mono text-primary">{colName}</label>
                              {/*
                                ⭐ **Um Agente 2 por coluna** — você escolhe qual
                                descrição melhorar, em vez de um botão em lote
                                decidir por um diff. Ele não grava: a alteração
                                entra no estado e a gravação automática a leva ao
                                banco, pelo mesmo caminho de uma edição à mão.
                              */}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                                disabled={refinandoColuna !== null}
                                title="Agente 2: melhora a redação desta descrição, sem mudar o conteúdo"
                                onClick={() => handleRefinarColuna(colName)}
                              >
                                {refinandoColuna === colName
                                  ? <Loader2 className="h-3 w-3 animate-spin" />
                                  : <Sparkles className="h-3 w-3" />}
                                <span className="ml-1">Melhorar</span>
                              </Button>
                            </div>
                            <textarea
                              className="w-full text-sm p-2 rounded-md border border-border bg-background resize-y min-h-[60px]"
                              value={colData.semantic_definition || ''}
                              onChange={(e) => mexerNaColuna(colName, { semantic_definition: e.target.value })}
                              placeholder="Ex: Representa o lucro líquido..."
                            />
                          </div>

                          {/*
                            ⭐ `papel_analitico` decide o que o planejador PODE
                            fazer: medida entra em soma, dimensão entra em
                            agrupamento, identificador não entra em nenhum dos
                            dois. Marcar um identificador como dimensão faz o
                            chat tentar agrupar por CPF e devolver uma linha por
                            pessoa.

                            ⚠️ O vocabulário só aparece em dimensão, porque é a
                            única em que faz sentido: é a lista de valores que
                            permite casar "joão silva" com o literal da base. Em
                            medida ou data não há lista a consultar.
                          */}
                          <div className="md:w-52 shrink-0">
                            <select
                              value={papel}
                              onChange={(e) => mexerNaColuna(colName, {
                                papel_analitico: e.target.value as PapelAnalitico,
                              })}
                              className="w-full bg-background border border-border rounded-md p-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                            >
                              {PAPEIS.map((opcao) => (
                                <option key={opcao.valor} value={opcao.valor}>{opcao.rotulo}</option>
                              ))}
                            </select>
                            <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                              {PAPEIS.find((opcao) => opcao.valor === papel)?.ajuda}
                            </p>
                            {papel === 'dimensao' && (
                              <div className="flex items-start gap-2 mt-3">
                                <Switch
                                  id={`vocabulario-ativa-${colName}`}
                                  checked={Boolean(colData.vocabulario_util)}
                                  onCheckedChange={(ligado) => mexerNaColuna(colName, { vocabulario_util: ligado })}
                                  className="mt-0.5 shrink-0"
                                />
                                <Label
                                  htmlFor={`vocabulario-ativa-${colName}`}
                                  className="text-[11px] font-normal text-muted-foreground leading-snug cursor-pointer"
                                >
                                  O chat pode consultar a lista de valores desta coluna
                                </Label>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>

                {/* 3. Refinar Formatação */}
                <div className="space-y-4 border-t border-border pt-6">
                  <h4 className="font-semibold text-foreground">Refinar Formatação (Agente 3.1)</h4>
                  <p className="text-xs text-muted-foreground">Visualize as regras de formatação atuais. Dê uma ordem em linguagem natural para que o Agente ajuste as regras em massa.</p>
                  
                  <div className="flex flex-col gap-3 max-h-60 overflow-y-auto pr-2 border border-border p-3 rounded-xl bg-background/50">
                    {Object.entries(editedSchema.columns).map(([colName, colData]: [string, any]) => (
                      <div key={colName} className="flex gap-4 p-2 bg-muted/10 rounded-md border border-border">
                        <span className="text-xs font-bold font-mono text-primary w-1/4 truncate">{colName}</span>
                        <span className="text-xs text-muted-foreground flex-1 break-words">{colData.formatting_rule?.explicacao || 'Sem regra'}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Input
                      value={refinePrompt}
                      onChange={(e) => setRefinePrompt(e.target.value)}
                      placeholder="Ex: Formate a coluna data_venda para o padrão PT-BR"
                    />
                    <Button disabled={isRefining || !refinePrompt.trim()} onClick={async () => {
                      setIsRefining(true);
                      try {
                        // ⚠️ Parte do que está NA TELA, não do que está salvo.
                        // Até 2026-09-03 ele lia `selectedDataset.schema_metadata`,
                        // montava o novo schema a partir dele e gravava direto —
                        // então uma descrição refinada e ainda não gravada era
                        // apagada no banco E na tela. Ver I-15.
                        const currentRules = Object.entries(colunasDoSchema).reduce(
                          (acc: Record<string, unknown>, [k, v]) => {
                            acc[k] = v.formatting_rule;
                            return acc;
                          }, {});

                        const res = await supabase.functions.invoke('ai-agents', {
                          body: { action: 'refine_format', prompt: refinePrompt, columns: currentRules, dataSamples: [] }
                        });

                        if (res.error) throw res.error;

                        let resultado = res.data?.result;
                        if (typeof resultado === "string") {
                          const limpo = resultado.replace(/```json\n?|\n?```/g, "").trim();
                          resultado = JSON.parse(limpo);
                        }

                        const newRules = resultado?.formattingRules as Record<string, FormattingRule> | undefined;
                        if (!newRules) throw new Error("A IA não retornou um formato válido.");

                        // ⛔ Sem spread raso e sem gravar aqui: só mexe no estado,
                        // e a gravação automática leva ao banco. O spread de antes
                        // era de um nível só, então `newSchema.columns` era o mesmo
                        // objeto e a atribuição mutava o `selectedDataset` no lugar.
                        setEditedSchema((antes) => {
                          if (!antes) return antes;
                          const columns = { ...antes.columns };
                          for (const [col, regra] of Object.entries(newRules)) {
                            if (columns[col]) columns[col] = { ...columns[col], formatting_rule: regra };
                          }
                          return { ...antes, columns };
                        });
                        setRefinePrompt("");
                        toast({ title: "Regras de formatação atualizadas" });
                      } catch (err) {
                        console.error(err);
                        toast({
                          title: "Erro ao refinar a formatação",
                          description: err instanceof Error ? err.message : String(err),
                          variant: "destructive",
                        });
                      } finally {
                        setIsRefining(false);
                      }
                    }}>
                      {isRefining ? "Refinando..." : "Agente: Aplicar Ordem"}
                    </Button>
                  </div>
                </div>
              </div>
            ) : selectedDataset.schema_metadata && selectedDataset.schema_metadata.columns ? (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-muted-foreground uppercase">Dicionário Semântico Extraído</h4>

                {/*
                  ⭐ **A leitura mostra o que a edição edita** (B23). Até agora
                  exibia só definição e formatação — então grão, observações,
                  papel e vocabulário eram campos que sumiam ao fechar a edição,
                  e não havia como conferir uma base sem entrar no modo de
                  editá-la.
                */}
                <div className="rounded-lg border border-border bg-background p-4 space-y-3 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold uppercase block mb-1">Uma linha representa</span>
                    <span className="text-foreground/90">
                      {selectedDataset.schema_metadata.grao || 'Não declarado'}
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold uppercase block mb-1">Observações</span>
                    {Array.isArray(selectedDataset.schema_metadata.observacoes)
                      && selectedDataset.schema_metadata.observacoes.length > 0 ? (
                      <ul className="list-disc pl-5 text-foreground/90 space-y-0.5">
                        {selectedDataset.schema_metadata.observacoes.map((obs: string, i: number) => (
                          <li key={i}>{obs}</li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-foreground/70">Nenhuma</span>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground font-semibold uppercase block mb-1">Revisão</span>
                    <span className="text-foreground/70">
                      {Number(selectedDataset.schema_metadata.versao ?? 1) >= 2
                        ? 'Conferida por uma pessoa — o chat confia neste dicionário.'
                        : 'Não conferida — o chat pede ao planejador que declare presunção.'}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {Object.entries(selectedDataset.schema_metadata.columns).map(([colName, colData]: [string, any]) => (
                    <div key={colName} className="p-4 rounded-lg border border-border bg-background flex flex-col md:flex-row gap-4">
                      <div className="md:w-1/4">
                        <span className="font-mono text-sm font-bold text-primary">{colName}</span>
                        <span className="block text-xs text-muted-foreground mt-1">
                          {PAPEIS.find((opcao) => opcao.valor === colData.papel_analitico)?.rotulo ?? 'Dimensão'}
                          {colData.vocabulario_util ? ' · vocabulário ligado' : ''}
                        </span>
                      </div>
                      <div className="md:w-3/4 space-y-2 text-sm">
                        <div>
                          <span className="text-xs text-muted-foreground font-semibold uppercase block mb-1">Contexto (Agente 2)</span>
                          <span className="text-foreground/90">{colData.semantic_definition || 'Não definido'}</span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground font-semibold uppercase block mb-1">Regra de Formatação (Agente 3)</span>
                          <span className="text-foreground/70">{colData.formatting_rule?.explicacao || 'Não definida'}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <p>O Dicionário final ainda não foi gerado.</p>
                <p className="text-sm">Clique em "Continuar Rascunho" para finalizar o pipeline.</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
