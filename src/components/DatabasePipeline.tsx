import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Database, FileSpreadsheet, Bot, CheckCircle, ArrowRight, Loader2, Code } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ehLinkPublicado,
  extrairSheetRef,
  ERRO_LINK_INVALIDO,
  ERRO_LINK_PUBLICADO,
} from "@/lib/google-sheets";
import { normalizarNomeDeColuna } from "@/lib/colunas";
// ⭐ Saíram daqui no B22: o "Editar Esquema" passou a escrever dicionário
// também, e duas definições de "coluna sem formatação" divergiriam em silêncio.
import {
  REGRA_SEM_FORMATACAO,
  VERSAO_DO_DICIONARIO,
  type FormattingRule,
  type PapelAnalitico,
} from "@/lib/dicionario";

interface DatabasePipelineProps {
  organizationId: string;
  /**
   * ⭐ Sair do cadastro e abrir uma base que já existe (B21).
   *
   * Existe porque quem controla a troca entre "lista de bases" e "pipeline" é o
   * `Cfgdatabase`, e o pipeline não tem como se desmontar sozinho. Sem ela, o
   * diálogo de *"essa planilha já está cadastrada"* seria um beco: avisaria e
   * deixaria a pessoa no mesmo lugar, com o mesmo link colado.
   */
  onAbrirBase?: (datasetId: string) => void;
}

/** O rótulo de cada papel na tela, e o que ele significa para quem revisa. */
const PAPEIS: { valor: PapelAnalitico; rotulo: string; ajuda: string }[] = [
  { valor: "medida", rotulo: "Medida", ajuda: "serve para somar ou tirar média" },
  { valor: "dimensao", rotulo: "Dimensão", ajuda: "serve para agrupar ou filtrar" },
  { valor: "identificador", rotulo: "Identificador", ajuda: "aponta uma linha específica" },
  { valor: "temporal", rotulo: "Temporal", ajuda: "data, mês ou ano" },
];

/**
 * Valor de célula como texto, para a tabela antes-vs-depois do passo 2.
 *
 * ⚠️ Célula vazia e célula ausente viram o mesmo travessão de propósito: quem
 * revisa quer saber que ali não há valor, e distinguir `null` de `""` na tela
 * não muda decisão nenhuma. O que NÃO pode virar travessão é o zero — `0` e
 * `false` são valores, e um `if (!v)` os apagaria da revisão.
 */
const celulaEmTexto = (valor: unknown): string =>
  valor === null || valor === undefined || valor === "" ? "—" : String(valor);

export default function DatabasePipeline({
  organizationId,
  onAbrirBase,
}: DatabasePipelineProps) {
  const { toast } = useToast();
  // 0: Conectar planilha · 1: Colunas · 2: Formatação · 3: Semântica
  //
  // ⭐ Quatro passos desde o B13. O antigo passo 5 (Google Sheets) virou o
  // primeiro: a planilha passou a ser a FONTE, não o destino do cadastro.
  const [step, setStep] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [sheetUrl, setSheetUrl] = useState("");

  /**
   * ⭐ A base ATIVA que já usa esta planilha e esta aba (B21).
   *
   * Preenchida só quando o `handleConectarPlanilha` encontra uma, e é o que abre
   * o diálogo. `null` é o caminho normal do cadastro.
   */
  const [baseExistente, setBaseExistente] = useState<
    { id: string; name: string } | null
  >(null);

  // Data States
  const [originalColumns, setOriginalColumns] = useState<string[]>([]);
  const [normalizedColumns, setNormalizedColumns] = useState<Record<string, string>>({});
  const [dataSamples, setDataSamples] = useState<any[]>([]);

  // ⚠️ Cabeçalhos que normalizam para o mesmo nome. Enquanto houver algum aqui,
  // o cadastro NÃO avança — é a pendência C11, que até 2026-08-21 fazia uma
  // coluna sumir calada da base. Ver `handleConectarPlanilha`.
  const [colisoes, setColisoes] = useState<Record<string, string[]>>({});
  const [colunasSemTitulo, setColunasSemTitulo] = useState(0);
  const [linhasDaGrade, setLinhasDaGrade] = useState(0);

  // Saída dos agentes 3 / 3.1 (formatação) e 1 / 2 (semântica).
  //
  // ⚠️ **Estas cinco linhas foram restauradas em 2026-08-25** — o B13 as apagou
  // sem apagar nenhum dos 20 usos, e o passo 2 morria com `ReferenceError:
  // setFormattedDataSamples is not defined` na primeira resposta do Agente 3.
  // Elas ficavam encostadas no fim do handler do `FileReader`, então sumiram
  // junto com o upload; agora moram aqui, com os outros estados, onde não têm
  // como sair de carona na remoção de um handler.
  const [semanticDefinitions, setSemanticDefinitions] = useState<Record<string, string>>({});
  const [formattedDataSamples, setFormattedDataSamples] = useState<any[]>([]);
  const [formattingRules, setFormattingRules] = useState<Record<string, FormattingRule>>({});
  const [formatQuery, setFormatQuery] = useState("");
  const [isFormatRefining, setIsFormatRefining] = useState(false);

  // ⭐ **O dicionário v2, do B14 — os campos que o A2 do chat produzia e ninguém
  // conferia.** `grao` e `observacoes` descrevem a base; `papel_analitico` e
  // `vocabulario_util` descrevem cada coluna. Todos editáveis na etapa 4, porque
  // é a revisão humana que os torna melhores que a dedução do A2 (§B2).
  const [grao, setGrao] = useState("");
  const [observacoes, setObservacoes] = useState<string[]>([]);
  const [papeis, setPapeis] = useState<Record<string, PapelAnalitico>>({});
  const [querVocabulario, setQuerVocabulario] = useState<Record<string, boolean>>({});

  // Helpers
  // Movido para `@/lib/colunas` em 2026-08-11. Esta normalizacao nao e
  // detalhe de componente: e o vocabulario do sistema (schema_metadata,
  // allowed_columns, Query Plan), e o executor Python tem que espelha-la
  // para achar a coluna no cabecalho da planilha. Ver o comentario de la.
  const normalizeString = normalizarNomeDeColuna;

  const [datasetId, setDatasetId] = useState<string | null>(null);

  /**
   * Passo 1 — conecta a planilha e lê o cabeçalho dela.
   *
   * ⭐ **É a inversão do B13.** Antes o cadastro começava por um arquivo `.xlsx`
   * e só pedia o link do Google Sheets no fim; o resultado era um dicionário que
   * descrevia um arquivo e um chat que consultava outra coisa, sem nada
   * garantindo que fossem a mesma planilha. As pendências C11 e C12 eram as duas
   * faces disso, e com uma fonte só elas deixam de ser possíveis.
   *
   * A ordem aqui não é arbitrária, e cada passo depende do anterior:
   *
   *   1. extrai `id` e `gid` do link (`extrairSheetRef`, já testado);
   *   2. procura uma base que já use ESSA planilha nESSA aba — rascunho para
   *      retomar, ou base ativa para recusar (B21);
   *   3. cria a base com o link, ainda `processing`;
   *   4. lê o cabeçalho pela Edge Function (nenhuma célula de dado é lida);
   *   5. ⭐ **concede as colunas ao Admin** — sem isto, tudo daqui para a frente
   *      falha com "seu cargo não tem acesso a nenhuma coluna" no meio do
   *      próprio cadastro, que é o sintoma mais confuso possível.
   */
  const handleConectarPlanilha = async () => {
    const ref = extrairSheetRef(sheetUrl);
    if (!ref) {
      // ⚠️ A mensagem genérica manda "copie o endereço da barra", que é o que
      // quem colou um link de "Publicar na web" acredita ter feito.
      setUploadError(ehLinkPublicado(sheetUrl) ? ERRO_LINK_PUBLICADO : ERRO_LINK_INVALIDO);
      return;
    }

    setIsProcessing(true);
    setUploadError(null);
    try {
      // ⭐ **A busca é por PLANILHA + ABA, em qualquer status** (B21).
      //
      // Até 2026-09-03 ela filtrava `status = 'processing'`, e o efeito era a
      // C14: base **ativa** com a mesma planilha não era encontrada, o cadastro
      // caía no `insert` e a pessoa terminava com duas bases idênticas na tela
      // — sem nada dizendo qual delas o chat usa.
      //
      // ⛔ **Sem comparar o conjunto de colunas**, que é o que a C14 propunha.
      // Seria voltar ao casamento por assinatura que o B13 abandonou: duas
      // planilhas diferentes com as mesmas colunas se confundiam. O `id` do
      // documento já resolve — o mesmo Sheets dá o mesmo `id` em qualquer forma
      // de link (`/edit`, `?usp=sharing`, com ou sem `#gid`), e há teste disso.
      //
      // ⚠️ **A ABA entra na chave, e não é detalhe.** Uma base é uma aba (§B1):
      // duas abas do mesmo arquivo são duas bases legítimas, com cabeçalho, grão
      // e formatação próprios. Casar só pelo `google_sheet_id` recusaria a
      // segunda aba como se fosse repetição.
      let consulta = supabase
        .from('datasets')
        .select('id, name, sketch, status')
        .eq('organization_id', organizationId)
        .eq('google_sheet_id', ref.id);

      // ⚠️ `.eq(coluna, null)` não casa NULL no PostgREST — vira `?col=eq.null`
      // e não encontra nada. E o desvio é por `=== null`, nunca por veracidade:
      // `gid = 0` é a PRIMEIRA aba de toda planilha, um valor legítimo.
      consulta = ref.gid === null
        ? consulta.is('google_sheet_gid', null)
        : consulta.eq('google_sheet_gid', ref.gid);

      const { data: existentes } = await consulta;

      // ⭐ Ativa tem precedência sobre rascunho. Se as duas existirem para a
      // mesma aba (cadastro recomeçado e abandonado depois de uma base ficar
      // pronta), o que interessa dizer é que **já existe base**; retomar o
      // rascunho criaria a segunda.
      const ativa = existentes?.find((d) => d.status === 'active');
      if (ativa) {
        setBaseExistente({ id: ativa.id, name: ativa.name ?? "essa base" });
        return;
      }

      const rascunhos = existentes?.filter((d) => d.status !== 'active');
      let id = rascunhos?.[0]?.id ?? null;
      const sketch = rascunhos?.[0]?.sketch as any;

      if (!id) {
        const { data: nova, error: erroInsert } = await supabase
          .from('datasets')
          .insert({
            organization_id: organizationId,
            name: "Nova Planilha",
            status: 'processing',
            google_sheet_id: ref.id,
            google_sheet_gid: ref.gid,
          })
          .select('id')
          .single();
        if (erroInsert) throw erroInsert;
        id = nova!.id;
      }
      setDatasetId(id);

      const cab = await lerCabecalhos(id);
      if (!cab) return;

      // ⭐ A concessão ao Admin, e ela sobe para cá por necessidade: o passo 3
      // pede a amostra pela via normal, que confere `role_permissions`. Sem esta
      // linha o cadastro trava no meio, dizendo que o Admin não pode ver nada da
      // base que ele acabou de conectar.
      await liberarColunasParaAdmin(id, cab.nomes);

      // ⭐ **Rascunho recuperado E RETOMADO.** Até 2026-08-25 esta parte
      // restaurava três estados e depois caía em `setStep(1)` de qualquer jeito:
      // o toast dizia "recuperamos o seu progresso" e a pessoa refazia tudo,
      // pagando de novo os agentes 3 e 1. Um aviso que promete o que não cumpre
      // é pior que não avisar.
      //
      // ⚠️ **O cabeçalho vem SEMPRE da planilha, nunca do rascunho** — ela pode
      // ter mudado entre uma sessão e outra, e é justamente por isso que o
      // cadastro foi invertido no B13. Coluna que sumiu some da tela; coluna
      // nova aparece vazia para ser preenchida. O que o rascunho devolve é só o
      // que foi DECIDIDO: regras, definições, papéis, grão e observações.
      if (sketch) {
        if (sketch.formattingRules) setFormattingRules(sketch.formattingRules);
        if (sketch.semanticDefinitions) setSemanticDefinitions(sketch.semanticDefinitions);
        if (sketch.formattedDataSamples) setFormattedDataSamples(sketch.formattedDataSamples);
        // ⚠️ `dataSamples` era salvo e nunca lido. Sem ele o passo 2 mostra a
        // tabela sem a coluna "antes", e o passo 3 mandaria amostra vazia ao
        // Agente 1 — a pessoa retomava num estado pior que o que salvou.
        if (Array.isArray(sketch.dataSamples)) setDataSamples(sketch.dataSamples);
        if (typeof sketch.grao === "string") setGrao(sketch.grao);
        if (Array.isArray(sketch.observacoes)) setObservacoes(sketch.observacoes);
        if (sketch.papeis) setPapeis(sketch.papeis);
        if (sketch.querVocabulario) setQuerVocabulario(sketch.querVocabulario);

        const destino = passoParaRetomar(sketch, cab.colisoes);
        setStep(destino);
        toast({
          title: "Rascunho encontrado",
          description: destino > 1
            ? `Voltamos para o passo ${destino + 1}, onde você parou.`
            : "Recuperamos o que já estava decidido. Confira as colunas para seguir.",
        });
        return;
      }

      setStep(1);
    } catch (err: any) {
      toast({ title: "Erro ao conectar a planilha", description: err.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Lê o cabeçalho da planilha e guarda o que a tela precisa mostrar.
   *
   * Devolve `null` quando falhou — o chamador para, em vez de seguir com uma
   * lista de colunas vazia e descobrir isso três passos adiante.
   */
  const lerCabecalhos = async (
    id: string,
  ): Promise<{ nomes: string[]; colisoes: Record<string, string[]> } | null> => {
    const res = await supabase.functions.invoke('ai-plum-chat', {
      body: { action: 'cabecalhos_da_planilha', datasetId: id },
    });

    if (res.error || res.data?.status !== 'ok') {
      // ⚠️ A frase vem do executor e é acionável ("a planilha não foi
      // compartilhada com o Plum"). Trocá-la por uma genérica aqui apagaria a
      // única informação que resolve o problema.
      setUploadError(res.data?.mensagem || res.error?.message || "Não consegui ler a planilha.");
      return null;
    }

    const colunas = (res.data.colunas ?? []) as { original: string; nome: string }[];
    const normMap: Record<string, string> = {};
    for (const c of colunas) normMap[c.original] = c.nome;

    setOriginalColumns(colunas.map((c) => c.original));
    setNormalizedColumns(normMap);
    setColisoes(res.data.colisoes ?? {});
    setColunasSemTitulo(res.data.colunas_sem_titulo ?? 0);
    setLinhasDaGrade(res.data.row_count ?? 0);
    if (res.data.aba) setFileName(String(res.data.aba));

    // ⚠️ As colisões voltam JUNTO, e não só pelo estado: `setColisoes` não é
    // visível no mesmo tick, e quem retoma um rascunho precisa saber agora se
    // pode pular o passo 1. Ler o estado ali daria o valor da renderização
    // anterior — vazio na primeira conexão.
    const colisoesLidas = (res.data.colisoes ?? {}) as Record<string, string[]>;
    return { nomes: colunas.map((c) => c.nome), colisoes: colisoesLidas };
  };

  /**
   * Até que passo dá para retomar um rascunho — decidido pelo CONTEÚDO dele,
   * não pelo `step` que ele diz ter.
   *
   * ⭐ **Confiar no `sketch.step` sozinho devolveria a pessoa a uma tela vazia.**
   * Ele é gravado no começo de cada etapa, então um rascunho pode dizer `step:3`
   * tendo morrido antes de o Agente 1 responder. O que manda é o que existe: sem
   * regras de formatação não há passo 2, sem definições não há passo 3.
   *
   * ⛔ **Colisão de nome trava no passo 1, sempre.** É lá que ela aparece na
   * tela, com os cabeçalhos que colidem, e o cadastro não pode seguir sem que
   * alguém renomeie uma coluna na planilha (C11). Pular direto para o passo 3
   * esconderia o aviso e deixaria a base nascer com uma coluna a menos.
   */
  const passoParaRetomar = (
    rascunho: any,
    colisoesDaPlanilha: Record<string, string[]>,
  ): number => {
    if (Object.keys(colisoesDaPlanilha ?? {}).length) return 1;

    const temRegras = Object.keys(rascunho?.formattingRules ?? {}).length > 0;
    const temDefinicoes = Object.keys(rascunho?.semanticDefinitions ?? {}).length > 0;

    // Nunca à frente de onde a pessoa realmente estava, mesmo que o conteúdo
    // permitisse: retomar num passo que ela nunca viu é tão desorientador
    // quanto voltar ao começo.
    const ondeParou = typeof rascunho?.step === "number" ? rascunho.step : 1;

    let possivel = 1;
    if (temRegras) possivel = 2;
    if (temRegras && temDefinicoes) possivel = 3;

    return Math.min(possivel, Math.max(ondeParou, 1));
  };

  /**
   * Concede ao cargo Admin todas as colunas da base.
   *
   * Estava no fim do cadastro até o B13 e subiu para o começo — ver o item 5 de
   * `handleConectarPlanilha`. O motivo original continua valendo: permissão é
   * sempre explícita (CLAUDE.md §3), e o Admin nunca aparece no formulário de
   * permissões porque `Dashboard.tsx` assume acesso irrestrito para ele.
   */
  const liberarColunasParaAdmin = async (id: string, colunas: string[]) => {
    const { data: adminRole } = await supabase
      .from('roles')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('name', 'admin')
      .maybeSingle();

    if (!adminRole) return;

    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from('role_permissions')
      .upsert({
        organization_id: organizationId,
        role_id: adminRole.id,
        dataset_id: id,
        allowed_columns: colunas,
        created_by: user?.id ?? null,
      }, { onConflict: 'role_id,dataset_id' });

    if (error) console.error("Falha ao liberar colunas para o Admin:", error);
  };

  /** Relê o cabeçalho — usado depois de a pessoa corrigir a planilha. */
  const handleRelerPlanilha = async () => {
    if (!datasetId) return;
    setIsProcessing(true);
    setUploadError(null);
    try {
      const cab = await lerCabecalhos(datasetId);
      if (cab) await liberarColunasParaAdmin(datasetId, cab.nomes);
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Busca as 20 linhas de amostra da planilha, para os passos 2 e 3.
   *
   * ⚠️ Vinte, não cinco: é do cadastro que sai o `vocabulario_util`, e cinco
   * linhas de uma coluna de texto parecem iguais tendo ela 12 valores distintos
   * ou 12.000. O teto vive em `query_engine/linhas.py::TETO_DE_CADASTRO` e a
   * porta fecha quando a base deixa de ser `processing`.
   */
  const buscarAmostra = async (id: string): Promise<any[]> => {
    const res = await supabase.functions.invoke('ai-plum-chat', {
      body: { action: 'amostra_do_cadastro', datasetId: id },
    });
    if (res.error || res.data?.status !== 'ok') {
      throw new Error(res.data?.mensagem || "Não consegui ler as linhas da planilha.");
    }
    return (res.data.linhas ?? []) as any[];
  };

  /**
   * Grava o rascunho do cadastro em `datasets.sketch`.
   *
   * ⚠️⚠️ **TUDO que acabou de ser calculado tem de vir por `extraData`, nunca do
   * estado.** Esta função lê o estado pelo *closure*, e `setX(...)` não é
   * síncrono: chamada logo depois de um `setDataSamples(linhas)`, ela grava o
   * valor **anterior** — vazio, na primeira vez.
   *
   * ⭐ Era esse o furo real da retomada de rascunho: `dataSamples` aparecia no
   * objeto salvo e ia para o banco como `[]`, então nem restaurá-lo adiantava.
   * O sintoma ("recuperamos o seu progresso" e nada volta) parecia bug de
   * leitura e era de escrita.
   */
  const saveSketch = async (currentStep: number, extraData: any = {}) => {
    if (!datasetId) return;
    try {
      await supabase
        .from('datasets')
        .update({
          sketch: {
            step: currentStep,
            originalColumns,
            normalizedColumns,
            dataSamples: extraData.dataSamples ?? dataSamples,
            formattingRules: extraData.formattingRules || formattingRules,
            semanticDefinitions: extraData.semanticDefinitions || semanticDefinitions,
            formattedDataSamples: extraData.formattedDataSamples || formattedDataSamples,
            // ⚠️ Os quatro do dicionário v2 (B14) faltavam aqui, e eram o que
            // fazia a etapa 4 recomeçar do zero mesmo com rascunho recuperado.
            grao: extraData.grao ?? grao,
            observacoes: extraData.observacoes ?? observacoes,
            papeis: extraData.papeis ?? papeis,
            querVocabulario: extraData.querVocabulario ?? querVocabulario,
          }
        })
        .eq('id', datasetId);
    } catch (err) {
      console.error("Falha ao salvar rascunho", err);
    }
  };

  const handleRefineFormat = async () => {
    if (!formatQuery.trim()) return;
    setIsFormatRefining(true);
    try {
      toast({ title: "Refinando Formatação...", description: "O Agente 3.1 está ajustando as regras conforme o seu pedido." });
      
      const formatRes = await supabase.functions.invoke('ai-agents', {
        body: { 
          action: 'refine_format', 
          prompt: formatQuery,
          columns: formattingRules,
          dataSamples: dataSamples
        }
      });

      if (formatRes.error) throw new Error(formatRes.error.message || "Erro na IA de Refinamento");

      let formatResult = formatRes.data?.result;
      if (typeof formatResult === "string") {
        try {
          const cleaned = formatResult.replace(/```json\n?|\n?```/g, "").trim();
          formatResult = JSON.parse(cleaned);
        } catch (e) {
          console.error("Falha ao analisar JSON retornado:", e);
        }
      }

      if (formatResult && (formatResult.formattedSamples || formatResult.formattingRules)) {
        const newFormattedSamples = formatResult.formattedSamples || formattedDataSamples;
        const newFormattingRules = formatResult.formattingRules || formattingRules;

        setFormattedDataSamples(newFormattedSamples);
        setFormattingRules(newFormattingRules);
        setFormatQuery(""); // Limpa o chat após sucesso
        
        // Salva rascunho
        saveSketch(2, {
          formattedDataSamples: newFormattedSamples,
          formattingRules: newFormattingRules
        });

        toast({ title: "Formatação atualizada!", description: "A IA aplicou as suas correções.", variant: "default" });
      } else {
        throw new Error("A IA não retornou um formato válido.");
      }
    } catch (error: any) {
      toast({ title: "Erro no Refinamento", description: error.message, variant: "destructive" });
    } finally {
      setIsFormatRefining(false);
    }
  };

  const handleUpdateSemantic = (col: string, desc: string) => {
    setSemanticDefinitions(prev => ({
      ...prev,
      [col]: desc
    }));
  };

  const handleFormatData = async () => {
    if (!datasetId) return;

    // ⛔ Colisão de normalização barra o cadastro aqui, e é deliberado. Seguir
    // criaria a base com uma coluna a menos — que é exatamente o que acontecia
    // calado antes do B13 (C11). Melhor parar e mandar renomear.
    if (Object.keys(colisoes).length) {
      toast({
        title: "Renomeie as colunas repetidas",
        description: "Duas colunas da planilha viram o mesmo nome interno. Corrija na planilha e clique em Reler.",
        variant: "destructive",
      });
      return;
    }

    setIsProcessing(true);
    try {
      // ⭐ A amostra vem da PLANILHA agora, não de um arquivo local. É o que
      // garante que a formatação seja decidida sobre o mesmo dado que o chat vai
      // consultar depois.
      toast({ title: "Lendo a planilha...", description: "Buscando algumas linhas para a IA analisar." });
      const linhas = await buscarAmostra(datasetId);
      setDataSamples(linhas);

      toast({ title: "Agente 3 operando...", description: "A IA está analisando a formatação dos dados. Isso pode levar alguns segundos." });

      const formatRes = await supabase.functions.invoke('ai-agents', {
        body: { 
          action: 'format_data', 
          dataSamples: linhas
        }
      });

      if (formatRes.error) throw new Error(formatRes.error.message || "Erro na IA de Formatação");

      let formatResult = formatRes.data?.result;
      if (typeof formatResult === "string") {
        try {
          const cleaned = formatResult.replace(/```json\n?|\n?```/g, "").trim();
          formatResult = JSON.parse(cleaned);
        } catch (e) {
          console.error("Falha ao analisar JSON retornado:", e);
        }
      }

      if (formatResult && formatResult.formattedSamples) {
        setFormattedDataSamples(formatResult.formattedSamples);
        setFormattingRules(formatResult.formattingRules || {});
        
        saveSketch(2, {
          // `linhas` e não `dataSamples`: o `setDataSamples` acima ainda não
          // refletiu no closure. Ver o cabeçalho do `saveSketch`.
          dataSamples: linhas,
          formattedDataSamples: formatResult.formattedSamples,
          formattingRules: formatResult.formattingRules || {}
        });

        setStep(2); // Vai para Formatação
      } else {
        setFormattedDataSamples(linhas);
        setStep(2);
      }
    } catch (error: any) {
      toast({ title: "Erro na Formatação", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRefineSemantics = async () => {
    setIsProcessing(true);
    try {
      toast({ title: "Agente 2 operando...", description: "Refinando descrições para o padrão Otimizado." });
      const refineRes = await supabase.functions.invoke('ai-agents', {
        body: {
          action: 'refine_semantics',
          columns: semanticDefinitions
        }
      });
      if (refineRes.error) throw new Error(refineRes.error.message || "Erro no Agente de Refinamento");
      setSemanticDefinitions(refineRes.data.result);
      saveSketch(3, { semanticDefinitions: refineRes.data.result });
      toast({ title: "Refinamento concluído!" });
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdateNormalizedColumn = (original: string, newValue: string) => {
    setNormalizedColumns(prev => ({
      ...prev,
      [original]: newValue
    }));
  };

  /**
   * ⭐ O trabalho da próxima etapa já existe para ESTAS colunas?
   *
   * Quando existe, o botão de avançar deixa de chamar agente: quem já rodou o
   * Agente 3 e voltou para revisar as colunas não deve pagar a análise de novo
   * — nem em cota do Gemini, nem em espera, nem no risco de a segunda resposta
   * vir diferente da que a pessoa já tinha aprovado.
   *
   * ⚠️ **A checagem é por COLUNA, não por "tem alguma coisa salva".** Se a
   * pessoa clicou em "Reler planilha" e a aba ganhou uma coluna, a análise
   * antiga não a cobre — e um "Avançar" ali levaria essa coluna para o fim do
   * cadastro sem regra de formatação e sem definição, em silêncio. Faltando
   * uma, o botão volta a ser o de análise.
   */
  const colunasAtuais = Object.values(normalizedColumns);
  const formatacaoPronta =
    colunasAtuais.length > 0 && colunasAtuais.every((col) => col in formattingRules);
  const semanticaPronta =
    colunasAtuais.length > 0 && colunasAtuais.every((col) => col in semanticDefinitions);

  const [supportQuery, setSupportQuery] = useState("");
  const [supportResponse, setSupportResponse] = useState("");
  const [isSupportLoading, setIsSupportLoading] = useState(false);

  const handleSupportChat = async () => {
    if (!supportQuery.trim()) return;
    setIsSupportLoading(true);
    setSupportResponse("");
    try {
      const res = await supabase.functions.invoke('ai-agents', {
        body: {
          action: 'column_support',
          // ⚠️ Só a pergunta, de propósito. O agente é **explicativo**: ele
          // conta como o Plum lê a planilha e o que a planilha precisa ter, sem
          // olhar esta base. Cheguei a mandar `colisoes`/`colunasSemTitulo` para
          // ele diagnosticar a coluna específica, e é errado duas vezes: o passo
          // 1 já mostra as duas coisas na tela, logo acima desta caixa, e
          // diagnosticar não é o papel dele.
          prompt: supportQuery
        }
      });
      if (res.error) throw new Error(res.error.message || "Erro no Suporte");
      setSupportResponse(res.data.result);
    } catch (error: any) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
    } finally {
      setIsSupportLoading(false);
    }
  };

  const handleAnalyzeSemantics = async () => {
    setIsProcessing(true);
    try {
      const finalColumns = Object.values(normalizedColumns);
      const promptText = `Quero criar uma base de dados para o chatbot com as seguintes colunas: ${finalColumns.join(', ')}`;

      // 1. Chama o Agente 0 (Guardião)
      toast({ title: "Agente 0 analisando...", description: "Verificando escopo da requisição." });
      const guardRes = await supabase.functions.invoke('ai-agents', {
        body: { action: 'guard', prompt: promptText }
      });

      if (guardRes.error) throw new Error(guardRes.error.message || "Erro no Agente Guardião");

      const guardResult = guardRes.data.result.trim();
      if (guardResult !== 'PERMITIDO') {
        throw new Error(`Operação Bloqueada pelo Guardião: O conteúdo parece fora do escopo do Plum. (${guardResult})`);
      }

      // 2. ⭐ O PERFIL DA BASE — o insumo que o B14 acrescenta, e o que torna
      // este agente melhor que o A2 que ele substituiu. Ele conta a base
      // inteira (cardinalidade, vazios, min/max) e lista o vocabulário das
      // colunas de texto, sem trafegar linha nenhuma além das 20 já lidas.
      //
      // ⚠️ **Falha aqui NÃO derruba o cadastro.** Perfil é evidência a mais; sem
      // ele o Agente 1 escreve definições piores, e o prompt diz a ele que está
      // com menos. Perder o cadastro inteiro porque o executor piscou seria
      // trocar um dicionário mais fraco por nenhum dicionário.
      toast({ title: "Lendo o perfil da base...", description: "Contando valores e vazios por coluna." });
      const perfilRes = await supabase.functions.invoke('ai-plum-chat', {
        body: { action: 'perfil_do_cadastro', datasetId },
      });
      if (perfilRes.error || perfilRes.data?.status !== 'ok') {
        console.error("Perfil do cadastro nao veio:", perfilRes.error ?? perfilRes.data);
      }

      // 3. Chama o Agente 1 (Semântica — e o A2 do chat, absorvido)
      toast({ title: "Agente 1 operando...", description: "A IA está descrevendo as colunas e o grão da base." });

      const predictRes = await supabase.functions.invoke('ai-agents', {
        body: {
          action: 'predict_semantics',
          columns: finalColumns,
          dataSamples,
          perfil: perfilRes.data?.perfil ?? null,
          vocabularios: perfilRes.data?.vocabularios ?? {},
          // ⛔ As sugestões determinísticas de papel/vocabulário NÃO são enviadas
          // daqui: o `ai-agents` as calcula do perfil, com a regra que vive em
          // `_shared/perfil.ts`. Mandá-las do front deixaria uma versão antiga
          // da tela decidindo papel de coluna.
        }
      });

      if (predictRes.error) throw new Error(predictRes.error.message || "Erro na IA de Semântica");

      const dicionario = predictRes.data?.result;
      if (!dicionario || typeof dicionario !== "object" || !dicionario.columns) {
        throw new Error("A IA não retornou o dicionário da base em um formato válido.");
      }

      // A saída já vem normalizada pelo `ai-agents` (toda coluna presente, papel
      // dentro do enum), então aqui é só espalhar pelos estados que a tela edita.
      const definicoes: Record<string, string> = {};
      const novosPapeis: Record<string, PapelAnalitico> = {};
      const novoVocabulario: Record<string, boolean> = {};
      for (const col of finalColumns) {
        const c = dicionario.columns[col] ?? {};
        definicoes[col] = c.semantic_definition ?? "";
        novosPapeis[col] = c.papel_analitico ?? "dimensao";
        novoVocabulario[col] = Boolean(c.vocabulario_util);
      }

      // ⚠️ **Guarda contra front e Edge Function em versões diferentes.**
      //
      // Se NENHUMA definição veio preenchida, as chaves de `columns` não
      // casaram com as colunas desta base — o caso real é front antigo com
      // `ai-agents` novo, que devolve `{columns, grao, observacoes}` onde o
      // front velho esperava `{coluna: "definição"}` e guarda o objeto inteiro
      // como se fosse o mapa.
      //
      // ⭐ O perigo não é a tela vazia, é o SALVAR: sem este aviso a pessoa
      // preenche na mão, finaliza, e a base nasce com um dicionário que não
      // descreve nada — silenciosamente, porque campo vazio é um estado
      // legítimo. Avisa e deixa seguir: travar aqui deixaria alguém preso no
      // meio de um cadastro por causa de um deploy pela metade.
      if (finalColumns.length && !finalColumns.some((col) => definicoes[col])) {
        console.error("Dicionario veio sem definicao para nenhuma coluna:", dicionario);
        toast({
          title: "As definições vieram vazias",
          description:
            "Nenhuma coluna foi descrita. Isso costuma ser front e Edge Function " +
            "em versões diferentes — recarregue a página antes de continuar.",
          variant: "destructive",
        });
      }

      setSemanticDefinitions(definicoes);
      setPapeis(novosPapeis);
      setQuerVocabulario(novoVocabulario);
      setGrao(dicionario.grao ?? "");
      setObservacoes(Array.isArray(dicionario.observacoes) ? dicionario.observacoes : []);
      // ⚠️ Os cinco por `extraData`, pelo mesmo motivo: os `setGrao`/`setPapeis`
      // logo acima não estão visíveis aqui ainda.
      saveSketch(3, {
        semanticDefinitions: definicoes,
        grao: dicionario.grao ?? "",
        observacoes: Array.isArray(dicionario.observacoes) ? dicionario.observacoes : [],
        papeis: novosPapeis,
        querVocabulario: novoVocabulario,
      });
      setStep(3);

    } catch (error: any) {
      toast({ title: "Erro na Análise", description: error.message, variant: "destructive" });
    } finally {
      setIsProcessing(false);
    }
  };

  /**
   * Fecha o cadastro: grava o dicionário e ativa a base.
   *
   * ⭐ Encolheu no B13. O link da planilha, o `gid` e a concessão ao Admin já
   * aconteceram no passo 1 — aqui sobra o que só existe no fim: o dicionário que
   * a pessoa acabou de revisar, e a virada de `processing` para `active`.
   *
   * ⚠️ **`active` é o que fecha a porta das 20 linhas.** A `amostra_do_cadastro`
   * exige `status = 'processing'`; a partir daqui a base só é lida pelo chat,
   * com o teto de 5 e o orçamento do B10 valendo.
   */
  const handleFinalizeAndSave = async () => {
    if (!organizationId || !datasetId) {
      toast({ title: "Erro", description: "Sessão inválida", variant: "destructive" });
      return;
    }

    setIsProcessing(true);
    try {
      // ⭐ **O dicionário v2** (B14). `versao`, `grao` e `observacoes` são novos,
      // e por coluna entram `papel_analitico` e `vocabulario_util`. Tudo o que
      // está aqui passou pela tela da etapa 4 — é o que diferencia este
      // dicionário do reconhecimento que o A2 deduzia sozinho (§B2).
      const schemaMetadata = {
        versao: VERSAO_DO_DICIONARIO,
        grao: grao.trim(),
        observacoes: observacoes.map((o) => o.trim()).filter(Boolean),
        columns: Object.values(normalizedColumns).reduce((acc: any, col) => {
          const papel = papeis[col] || "dimensao";
          acc[col] = {
            semantic_definition: semanticDefinitions[col] || "",
            formatting_rule: formattingRules[col] || REGRA_SEM_FORMATACAO,
            papel_analitico: papel,
            // ⚠️ **Só dimensão pode ter vocabulário, e a checagem é aqui porque a
            // tela não a faz.** O interruptor só é renderizado em dimensão —
            // então `querVocabulario[col]` pode ter sobrado `true` de quando a
            // coluna era dimensão, e o controle que o desligaria não está mais
            // visível para a pessoa desligar.
            //
            // ⭐ O estrago era no chat, e silencioso: `lerDicionario` respeita o
            // booleano como declarado, então `colunasComVocabulario` mandaria
            // pedir a lista de valores de uma coluna numérica em TODA pergunta
            // daquela base — desperdiçando um dos 4 pedidos de vocabulário, ou
            // (abaixo de 200 distintos) entregando ao planejador uma lista de
            // números apresentada como vocabulário de categoria.
            //
            // ⛔ Não limpar no `onChange` do papel: quem trocasse para medida por
            // engano e voltasse para dimensão perderia a escolha, com o
            // interruptor reaparecendo desligado. O salvamento é o único ponto
            // onde a combinação precisa ser coerente.
            vocabulario_util: papel === "dimensao" && Boolean(querVocabulario[col]),
          };
          return acc;
        }, {})
      };

      const { error } = await supabase
        .from('datasets')
        .update({
          name: fileName || "Nova Planilha",
          status: "active",
          schema_metadata: schemaMetadata as any,
          // Só para exibir na tela de bases. O `google_sheet_id` e o `gid`, que
          // são o que a API do Google exige, foram gravados no passo 1.
          google_sheet_url: sheetUrl,
          sketch: null
        })
        .eq('id', datasetId);

      if (error) throw error;

      toast({
        title: "Planilha e Dicionário Salvos com Sucesso!",
        description: `A base "${fileName || "Nova Planilha"}" foi registrada e conectada com sucesso.`
      });
      setStep(0);
      setFileName("");
      setOriginalColumns([]);
      setNormalizedColumns({});
      setDataSamples([]);
      setSemanticDefinitions({});
      setFormattingRules({});
      setGrao("");
      setObservacoes([]);
      setPapeis({});
      setQuerVocabulario({});
      setSheetUrl("");
      setColisoes({});
      setColunasSemTitulo(0);
      setLinhasDaGrade(0);
      setDatasetId(null);
    } catch (err: any) {
      toast({
        title: "Erro ao salvar no Supabase",
        description: err.message,
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">

      {/*
        ⭐ **O diálogo do B21 — a planilha já é uma base ativa.**

        ⚠️ Ele é a razão de `handleConectarPlanilha` ter deixado de decidir e
        inserir no mesmo `await`: antes não havia ponto de espera nenhum no
        fluxo, e o único aviso da tela era um toast, que não pergunta nada.

        ⛔ Nenhuma das saídas cria base. Era o que acontecia até 2026-09-03, em
        silêncio, e é a C14 inteira.
      */}
      <AlertDialog
        open={baseExistente !== null}
        onOpenChange={(aberto) => { if (!aberto) setBaseExistente(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Essa planilha já está cadastrada</AlertDialogTitle>
            <AlertDialogDescription>
              Esta aba já é a base <strong>{baseExistente?.name}</strong>. Cadastrar
              de novo criaria uma segunda base idêntica, e nada indicaria qual
              delas o chat usa.
              <br />
              <br />
              Se a planilha mudou — coluna nova, coluna que saiu — abra a base e
              use <strong>Reler a planilha</strong> em "Editar Esquema". Assim os
              cards do dashboard e a matriz de permissões continuam valendo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Colar outro link</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = baseExistente?.id;
                setBaseExistente(null);
                if (id) onAbrirBase?.(id);
              }}
            >
              Abrir a base
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Stepper Header */}
      <div className="flex items-center justify-between mb-8 rounded-xl border border-border bg-card/30">
        {[
          { label: "Etapa 1: Planilha", icon: FileSpreadsheet },
          { label: "Etapa 2: Colunas", icon: Database },
          { label: "Etapa 3: Formatação", icon: Code },
          { label: "Etapa 4: Semântica", icon: Bot },
        ].map((s, i, arr) => {
          const isActive = step >= i;
          return (
            <div key={i} className={`flex-1 flex flex-col items-center justify-center p-4 border-r border-border last:border-0 relative ${isActive ? 'bg-primary/5 text-primary' : 'opacity-50 grayscale'}`}>
              <s.icon className={`h-6 w-6 mb-2 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-center">{s.label}</span>
              {i < arr.length - 1 && (
                <div className="absolute -right-3 top-1/2 -translate-y-1/2 z-10 bg-background rounded-full border border-border p-0.5">
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="glass p-6 rounded-2xl border border-border">
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-primary" /> Conecte sua planilha
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                O Plum lê sua planilha do Google Sheets para contar e resumir. <strong>Nunca guarda
                os seus dados</strong>, e só algumas linhas chegam à inteligência artificial.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-primary/5 border border-primary/20 rounded-xl p-5 space-y-4">
                <h4 className="font-bold text-primary flex items-center gap-2">
                  <span className="bg-primary text-primary-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">1</span>
                  No seu Google Sheets
                </h4>
                <div className="space-y-3 text-sm text-foreground/80 pl-8">
                  <p>Abra a planilha oficial que contém esses dados no seu Google Drive.</p>
                  <p>Clique no botão azul <strong>"Compartilhar"</strong> no canto superior direito.</p>
                  <p>Cole o e-mail abaixo e mantenha a permissão restrita a <strong>Leitor</strong>:</p>
                  <div className="bg-background border border-border rounded p-2 font-mono text-xs text-primary font-bold break-all select-all">
                    plum-polijunior@plataforma-plum.iam.gserviceaccount.com
                  </div>
                  <p>Clique em <strong>Concluído</strong>. O Plum nunca irá alterar ou apagar seus dados.</p>
                </div>
              </div>

              <div className="bg-background border border-border rounded-xl p-5 space-y-4">
                <h4 className="font-bold text-foreground flex items-center gap-2">
                  <span className="bg-muted text-muted-foreground w-6 h-6 rounded-full flex items-center justify-center text-xs">2</span>
                  Link da Planilha
                </h4>
                <div className="space-y-3 pl-8">
                  <p className="text-sm text-muted-foreground">
                    Cole abaixo o link da <strong>aba</strong> que tem os dados, depois de compartilhar:
                  </p>
                  <Input
                    placeholder="https://docs.google.com/spreadsheets/d/[ID_DA_SUA_PLANILHA]"
                    value={sheetUrl}
                    onChange={(e) => { setSheetUrl(e.target.value); setUploadError(null); }}
                    onKeyDown={(e) => e.key === 'Enter' && !isProcessing && handleConectarPlanilha()}
                  />
                </div>
              </div>
            </div>

            {uploadError && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4">
                <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{uploadError}</p>
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-border">
              <Button onClick={handleConectarPlanilha} disabled={isProcessing || !sheetUrl.trim()}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Ler a planilha <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" /> Revisão de Colunas
              </h3>
              <p className="text-sm text-muted-foreground mt-1">
                Estas são as colunas que o Plum encontrou{fileName ? <> na aba <strong>{fileName}</strong></> : null}
                {linhasDaGrade ? <> — cerca de {linhasDaGrade.toLocaleString('pt-BR')} linhas</> : null}.
                Confira se está tudo aqui.
              </p>
            </div>

            {/* ⭐ A C11 deixando de ser silenciosa. Até o B13 a segunda coluna
                sumia na importação, e por tabela sumia do allowed_columns —
                ninguém procurava porque nada avisava. */}
            {Object.keys(colisoes).length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-3">
                <h4 className="font-bold text-foreground text-sm">
                  Duas colunas viram o mesmo nome interno
                </h4>
                <p className="text-sm text-foreground/80">
                  O Plum transforma cada cabeçalho num nome técnico. Estas colunas colidem, e só uma
                  delas sobreviveria — <strong>renomeie uma na planilha</strong> e clique em Reler.
                </p>
                <ul className="space-y-1 text-sm">
                  {Object.entries(colisoes).map(([nome, originais]) => (
                    <li key={nome} className="text-foreground/90">
                      <code className="font-mono text-xs text-destructive">{nome}</code>
                      {" ← "}
                      {originais.map((o) => `"${o}"`).join(" e ")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {colunasSemTitulo > 0 && (
              <div className="bg-muted/40 border border-border rounded-xl p-4 text-sm text-foreground/80">
                {colunasSemTitulo === 1
                  ? "Uma coluna da planilha está sem título e foi ignorada."
                  : `${colunasSemTitulo} colunas da planilha estão sem título e foram ignoradas.`}
                {" "}Coluna sem nome não pode ser consultada — dê um título a ela na planilha se ela importa.
              </div>
            )}

            <div className="bg-background/50 border border-border rounded-xl p-4">
              <h4 className="text-sm font-semibold mb-3">Colunas Identificadas ({originalColumns.length})</h4>
              <div className="flex flex-wrap gap-2">
                {originalColumns.map((original, idx) => (
                  <div
                    key={idx}
                    className="bg-primary/10 text-primary border border-primary/20 px-3 py-1.5 rounded-md font-mono text-xs font-semibold"
                    title={`na planilha: ${original}`}
                  >
                    {normalizedColumns[original]}
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> Faltou alguma coluna?
              </h4>
              <div className="flex gap-2">
                <Input
                  value={supportQuery}
                  onChange={(e) => setSupportQuery(e.target.value)}
                  placeholder="Ex: Por que a coluna 'Lucro' não apareceu?"
                  className="bg-background"
                  onKeyDown={(e) => e.key === 'Enter' && handleSupportChat()}
                />
                <Button onClick={handleSupportChat} disabled={isSupportLoading || !supportQuery.trim()}>
                  {isSupportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Perguntar"}
                </Button>
              </div>
              {supportResponse && (
                <div className="mt-3 p-3 bg-primary/5 border border-primary/20 rounded-lg text-sm text-foreground/90 whitespace-pre-line">
                  {supportResponse}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setStep(0)} disabled={isProcessing}>Voltar</Button>
              <Button variant="outline" onClick={handleRelerPlanilha} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Reler planilha
              </Button>
              {/* ⚠️ O `disabled` por colisão vale nos DOIS caminhos: seguir com
                  dois cabeçalhos que viram o mesmo nome interno faz uma coluna
                  sumir calada da base (C11), e ter análise pronta não muda isso. */}
              <Button
                onClick={formatacaoPronta ? () => setStep(2) : handleFormatData}
                disabled={isProcessing || Object.keys(colisoes).length > 0}
              >
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {formatacaoPronta ? (
                  <>Avançar <ArrowRight className="ml-2 h-4 w-4" /></>
                ) : (
                  <>Tudo certo! Podemos analisar a Formatação com IA <Bot className="ml-2 h-4 w-4" /></>
                )}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2"><Code className="h-5 w-5 text-primary" /> Formatação de Dados (Agente 3)</h3>
              <p className="text-sm text-muted-foreground mt-1">
                <strong>A formatação é o que impede o motor de cálculo de errar conta.</strong>{" "}
                Para ele, <code className="font-mono text-xs">R$ 1.234,56</code> é texto até uma
                regra virá-lo em número — e coluna que não vira número simplesmente não entra na
                soma, sem erro nenhum na tela. Confira as regras e o resultado nas linhas de
                exemplo abaixo.
              </p>
              
              {Object.keys(formattingRules).length > 0 && (
                <div className="mt-6 space-y-3">
                  <h4 className="font-semibold text-sm">Regras Aplicadas por Coluna:</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {Object.entries(formattingRules).map(([colName, rule], idx) => (
                      <div key={idx} className="bg-primary/5 border border-primary/20 rounded-lg p-3 text-sm">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-bold text-primary font-mono">{colName}</span>
                          <span className="text-[10px] font-mono uppercase text-primary/70 bg-primary/10 rounded px-1.5 py-0.5">{rule?.type || "nenhuma"}</span>
                        </div>
                        <span className="text-muted-foreground leading-relaxed">{rule?.explicacao || "Sem regra"}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/*
              ⭐ A revisão humana do R-06 acontece AQUI, e até 2026-08-25 não
              acontecia: o Agente 3 devolvia `formattedSamples` desde o primeiro
              commit, o front guardava em estado e no `sketch`, e **nenhuma versão
              do componente jamais renderizou** — conferido no histórico inteiro.
              A tela mostrava só a frase de `explicacao`, então aprovar a
              formatação era acreditar na descrição que a IA fez do próprio
              trabalho, sem ver o dado. Regra que estraga a coluna (o caso do
              `ano` virando 1905, no prompt do Agente 3) passa ilesa por uma
              frase bem escrita.

              ⚠️ Uma célula mostra DUAS linhas só quando o valor mudou. Repetir
              antes e depois em toda célula dobra a largura da tabela e esconde a
              mudança no meio do que ficou igual — o que se procura aqui é
              justamente a diferença.
            */}
            {formattedDataSamples.length > 0 && (
              <div>
                <h4 className="font-semibold text-sm mb-3">
                  Antes e depois, nas {formattedDataSamples.length} primeiras linhas:
                </h4>
                <div className="border border-border rounded-xl overflow-auto bg-background max-h-[420px]">
                  <table className="w-full text-sm text-left">
                    <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border sticky top-0 z-10">
                      <tr>
                        {Object.values(normalizedColumns).map((col, idx) => (
                          <th key={idx} className="px-4 py-3 font-medium font-mono whitespace-nowrap">{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/50">
                      {formattedDataSamples.map((depois, idxLinha) => (
                        <tr key={idxLinha} className="hover:bg-muted/20 transition-colors align-top">
                          {Object.values(normalizedColumns).map((col, idxCol) => {
                            const textoAntes = celulaEmTexto(dataSamples[idxLinha]?.[col]);
                            const textoDepois = celulaEmTexto(depois?.[col]);
                            const mudou = textoAntes !== textoDepois;
                            return (
                              <td key={idxCol} className="px-4 py-3 whitespace-nowrap">
                                {mudou ? (
                                  <div className="flex flex-col gap-0.5">
                                    <span className="text-xs text-muted-foreground line-through">{textoAntes}</span>
                                    <span className="font-mono text-primary text-xs font-semibold">{textoDepois}</span>
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">{textoDepois}</span>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-muted/30 border border-border rounded-xl p-4 space-y-3 mt-4">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" /> A formatação não ficou legal? Peça ajustes para o Agente 3.1
              </h4>
              <div className="flex gap-2">
                <Input 
                  value={formatQuery}
                  onChange={(e) => setFormatQuery(e.target.value)}
                  placeholder="Ex: Não tire o R$ do faturamento, deixe como texto."
                  className="bg-background"
                  onKeyDown={(e) => e.key === 'Enter' && handleRefineFormat()}
                />
                <Button onClick={handleRefineFormat} disabled={isFormatRefining || !formatQuery.trim()}>
                  {isFormatRefining ? <Loader2 className="h-4 w-4 animate-spin" /> : "Corrigir Formatação"}
                </Button>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setStep(1)} disabled={isProcessing}>Voltar</Button>
              {/* ⚠️ Quando a semântica já existe, "Refazer" fica ao lado do
                  "Avançar" — e aqui ele importa mais que no passo anterior: se a
                  pessoa mudou uma regra de formatação pelo Agente 3.1, o perfil
                  que sustentou os papéis analíticos mudou junto, e as definições
                  na mão dela são de antes. Sem esta saída, a única forma de
                  refazer seria recomeçar o cadastro. */}
              {semanticaPronta && (
                <Button variant="secondary" onClick={handleAnalyzeSemantics} disabled={isProcessing}>
                  {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                  Refazer a semântica
                </Button>
              )}
              <Button
                onClick={semanticaPronta ? () => setStep(3) : handleAnalyzeSemantics}
                disabled={isProcessing}
              >
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {semanticaPronta ? "Avançar" : "Prever Semântica com IA"}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h3 className="text-xl font-bold flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> Definições Semânticas (Agente 1)</h3>
              <p className="text-sm text-muted-foreground mt-1">
                A IA leu o perfil da base — quantos valores cada coluna tem, o que está vazio — e
                descreveu cada uma. <strong>Corrija o que ela não podia saber</strong>: só você
                conhece regras como "lucro não inclui impostos".
              </p>
            </div>

            {/*
              ⭐ **O GRÃO E AS OBSERVAÇÕES — os campos que o A2 do chat produzia
              e ninguém nunca conferiu.** Até o B14 eles eram deduzidos a cada
              pergunta, por um modelo que não via nenhuma linha, e iam direto
              para o planejador. Agora nascem aqui, com o perfil e 20 linhas na
              mesa, e passam por gente antes de valer.

              ⚠️ O grão é o campo que mais muda resposta e o que a IA mais erra:
              "uma venda" e "um dia por loja" fazem a mesma soma significar
              coisas diferentes, e o modelo só consegue inferir isso da razão
              entre linhas e valores distintos.
            */}
            <div className="border border-border rounded-xl bg-background p-4 space-y-4">
              <div>
                <Label htmlFor="grao-da-base" className="text-sm font-semibold">
                  O que UMA LINHA da planilha representa?
                </Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  É o grão da base. Ex.: "uma venda", "um dia por loja", "um atendimento".
                </p>
                <Input
                  id="grao-da-base"
                  value={grao}
                  onChange={(e) => setGrao(e.target.value)}
                  placeholder="Ex: uma venda"
                />
              </div>

              <div>
                <Label className="text-sm font-semibold">Observações sobre a base</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-2">
                  O que muda a leitura de um número — coluna muito vazia, duas colunas parecidas.
                  Apague o que não fizer sentido.
                </p>
                {observacoes.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">
                    A IA não apontou nenhuma observação.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {observacoes.map((obs, idx) => (
                      <div key={idx} className="flex gap-2">
                        <Input
                          value={obs}
                          onChange={(e) =>
                            setObservacoes((antes) =>
                              antes.map((o, i) => (i === idx ? e.target.value : o))
                            )}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setObservacoes((antes) => antes.filter((_, i) => i !== idx))}
                        >
                          Remover
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="border border-border rounded-xl overflow-hidden bg-background max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground uppercase bg-muted/50 border-b border-border sticky top-0 z-10">
                  <tr>
                    <th className="px-6 py-3 font-medium w-1/5">Coluna</th>
                    <th className="px-6 py-3 font-medium">Definição para a Inteligência Artificial</th>
                    <th className="px-6 py-3 font-medium w-44">Papel</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {Object.values(normalizedColumns).map((col, idx) => (
                    <tr key={idx} className="hover:bg-muted/20 transition-colors">
                      <td className="px-6 py-4 font-mono text-primary text-xs font-semibold align-top pt-5">{col}</td>
                      <td className="px-6 py-4">
                        <textarea
                          value={semanticDefinitions[col] || ''}
                          onChange={(e) => handleUpdateSemantic(col, e.target.value)}
                          className="w-full bg-transparent border border-border rounded-md p-2 text-sm min-h-[60px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 resize-y"
                          placeholder="Ex: Representa o lucro líquido..."
                        />
                      </td>
                      {/*
                        ⭐ `papel_analitico` decide o que o planejador PODE fazer
                        com a coluna: medida entra em soma, dimensão entra em
                        agrupamento, identificador não entra em nenhum dos dois.
                        Marcar um identificador como dimensão faz o chat tentar
                        agrupar por CPF e devolver uma linha por pessoa.

                        ⚠️ A caixa de vocabulário só aparece em dimensão, porque é
                        a única em que faz sentido: é a lista de valores que
                        permite casar "joão silva" com o literal da base. Em
                        medida ou data não há lista a consultar.
                      */}
                      <td className="px-6 py-4 align-top">
                        <select
                          value={papeis[col] || 'dimensao'}
                          onChange={(e) =>
                            setPapeis((antes) => ({
                              ...antes,
                              [col]: e.target.value as PapelAnalitico,
                            }))}
                          className="w-full bg-background border border-border rounded-md p-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                        >
                          {PAPEIS.map((papel) => (
                            <option key={papel.valor} value={papel.valor}>{papel.rotulo}</option>
                          ))}
                        </select>
                        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
                          {PAPEIS.find((papel) => papel.valor === (papeis[col] || 'dimensao'))?.ajuda}
                        </p>
                        {(papeis[col] || 'dimensao') === 'dimensao' && (
                          <div className="flex items-start gap-2 mt-3">
                            <Switch
                              id={`vocabulario-${col}`}
                              checked={Boolean(querVocabulario[col])}
                              onCheckedChange={(ligado) =>
                                setQuerVocabulario((antes) => ({ ...antes, [col]: ligado }))}
                              className="mt-0.5 shrink-0"
                            />
                            <Label
                              htmlFor={`vocabulario-${col}`}
                              className="text-[11px] font-normal text-muted-foreground leading-snug cursor-pointer"
                            >
                              O chat pode consultar a lista de valores desta coluna
                            </Label>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Os três à direita, na mesma ordem dos outros passos: Voltar ·
                ação secundária · ação primária. Antes o "Voltar" ficava sozinho
                à esquerda, e este era o único passo com o rodapé assim. */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setStep(2)} disabled={isProcessing}>Voltar</Button>
              <Button variant="secondary" onClick={handleRefineSemantics} disabled={isProcessing}>
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
                Refinar Descrições (Agente 2)
              </Button>
              <Button
                onClick={handleFinalizeAndSave}
                disabled={isProcessing}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-semibold"
              >
                {isProcessing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Finalizar e Salvar Base <CheckCircle className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
