(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DemoInconsistencias=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const TIPOS_INCONSISTENCIA = [
  "numero_pulado",
  "ano_suspeito",
  "numero_invalido",
  "sem_materiais",
  "materiais_sem_itens",
  "duplicada",
  "sem_precificacao",
  "dados_essenciais",
];

const STATUS_COM_MATERIAIS_ESPERADOS = new Set(["autorizado", "em_execucao", "na_rua", "executado", "concluido", "concluida"]);
const STATUS_ESTOQUE_FORA_GALPAO = new Set(["em_execucao", "na_rua"]);
const STATUS_PRECIFICACAO_ESPERADA = new Set(["executado", "concluido", "concluida"]);

function normalizarTexto(valor) {
  if (valor === undefined || valor === null) return "";
  return String(valor).trim();
}

function numeroOSInteiro(valor) {
  const texto = normalizarTexto(valor);
  return /^\d+$/.test(texto) ? Number(texto) : null;
}

function anoEventoSuspeito(ano, anoAtual = new Date().getFullYear()) {
  const numero = Number(ano);
  return !Number.isInteger(numero) || numero < 2020 || numero > anoAtual + 1;
}

function statusNormalizadoOS(valor) {
  return normalizarTexto(valor).toLowerCase();
}

function osDeveTerMateriais(os) {
  return STATUS_COM_MATERIAIS_ESPERADOS.has(statusNormalizadoOS(os?.status));
}

function osDeveTerPrecificacao(os) {
  return STATUS_PRECIFICACAO_ESPERADA.has(statusNormalizadoOS(os?.status));
}

function montarLinhaInconsistencia(tipo, os, problema, motivo, sugestao, extras = {}) {
  return {
    id: extras.id || `${tipo}-${normalizarTexto(os?.id) || extras.ano || "sem-os"}-${normalizarTexto(extras.numeroOS ?? os?.numeroOS) || "sem-numero"}`,
    tipo,
    problema,
    numeroOS: normalizarTexto(extras.numeroOS ?? os?.numeroOS),
    ano: normalizarTexto(extras.ano ?? os?.anoEvento),
    osId: normalizarTexto(os?.id),
    evento: normalizarTexto(os?.nomeEvento),
    solicitante: normalizarTexto(os?.solicitante),
    status: normalizarTexto(os?.status),
    motivo,
    sugestao,
    campos: Array.isArray(extras.campos) ? extras.campos : [],
    quantidade: Number(extras.quantidade || 1),
  };
}

function montarResumoInconsistencias(itens) {
  const resumo = {
    total: itens.reduce((total, item) => total + Number(item.quantidade || 1), 0),
    numerosPulados: 0,
    anoSuspeito: 0,
    numeroInvalido: 0,
    semMateriais: 0,
    materiaisSemItens: 0,
    duplicadas: 0,
    semPrecificacao: 0,
    dadosEssenciais: 0,
  };

  itens.forEach((item) => {
    const quantidade = Number(item.quantidade || 1);
    if (item.tipo === "numero_pulado") resumo.numerosPulados += quantidade;
    if (item.tipo === "ano_suspeito") resumo.anoSuspeito += quantidade;
    if (item.tipo === "numero_invalido") resumo.numeroInvalido += quantidade;
    if (item.tipo === "sem_materiais") resumo.semMateriais += quantidade;
    if (item.tipo === "materiais_sem_itens") resumo.materiaisSemItens += quantidade;
    if (item.tipo === "duplicada") resumo.duplicadas += quantidade;
    if (item.tipo === "sem_precificacao") resumo.semPrecificacao += quantidade;
    if (item.tipo === "dados_essenciais") resumo.dadosEssenciais += quantidade;
  });

  return resumo;
}

function obterAnoEvento(item = {}) {
  const anoInformado = normalizarAnoEvento(item.anoEvento ?? item.ano_evento);
  if (anoInformado) return anoInformado;

  const datas = [
    item.dataInicioEvento,
    item.data_inicio_evento,
    item.dataFimEvento,
    item.data_fim_evento,
    item.criadoEm,
    item.criado_em,
  ];

  for (const valor of datas) {
    const texto = normalizarTexto(valor);
    const match = texto.match(/^(\d{4})-/);
    if (match) return match[1];
  }

  return "2026";
}

function normalizarAnoEvento(valor) {
  const texto = normalizarTexto(valor);
  if (/^\d{4}$/.test(texto)) return texto;
  return "";
}

function extrairItensIniciais(materiais) {
  const texto = normalizarTexto(materiais);
  if (!texto) return [];

  return texto
    .split(/\r?\n|;/)
    .map((item) => normalizarTexto(item.replace(/^[-*]\s*/, "")))
    .filter(Boolean)
    .filter((descricao) => !descricaoPareceDataSemItem(descricao))
    .map((descricao, index) => ({
      id: gerarId("item-fin"),
      descricao,
      quantidade: 0,
      diarias: 1,
      unidade: "",
      valorUnitario: 0,
      subtotal: 0,
      observacoes: "",
      ordem: index,
    }));
}

function descricaoPareceDataSemItem(valor) {
  const texto = normalizarTexto(valor);
  if (!texto) return false;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(texto)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return true;
  if (/^(mon|tue|wed|thu|fri|sat|sun)\s+[a-z]{3}\s+\d{1,2}\s+\d{4}/i.test(texto)) return true;

  const data = new Date(texto);
  return !Number.isNaN(data.getTime()) && /gmt|hor[áa]rio|standard|daylight|\d{4}/i.test(texto);
}

function gerarId(prefixo = "id") {
  return `${prefixo}-${crypto.randomUUID()}`;
}
function agoraISO(){return new Date().toISOString();}
  function gerar(ordens, listaPrecificacoes, options = {}) {
    const anoAtual = Number(options.anoAtual) || new Date().getFullYear();
    const osLista = ordens;
    const precificacoes = listaPrecificacoes.map(item => ({id:item.id,osId:item.osId,totalItens:item.itens.length}));
    const precificacaoPorOS = new Map(precificacoes.map((item) => [normalizarTexto(item.osId), item]));
    const itens = [];
    const numerosPorAno = new Map();
    const duplicadasPorAnoNumero = new Map();
    const registrosValidosPorNumero = new Map();
    const anosEncontrados = new Set();

    osLista.forEach((os) => {
      const ano = normalizarTexto(os.anoEvento || obterAnoEvento(os));
      if (ano) anosEncontrados.add(ano);

      const numero = numeroOSInteiro(os.numeroOS);
      if (numero !== null && !anoEventoSuspeito(ano, anoAtual)) {
        if (!numerosPorAno.has(ano)) numerosPorAno.set(ano, new Set());
        numerosPorAno.get(ano).add(numero);
      }

      const chaveDuplicada = `${ano}::${normalizarTexto(os.numeroOS).toLowerCase()}`;
      if (ano && normalizarTexto(os.numeroOS)) {
        if (!duplicadasPorAnoNumero.has(chaveDuplicada)) duplicadasPorAnoNumero.set(chaveDuplicada, []);
        duplicadasPorAnoNumero.get(chaveDuplicada).push(os);
      }

      const numeroChave = normalizarTexto(os.numeroOS).toLowerCase();
      if (numeroChave && !anoEventoSuspeito(ano, anoAtual)) {
        if (!registrosValidosPorNumero.has(numeroChave)) registrosValidosPorNumero.set(numeroChave, []);
        registrosValidosPorNumero.get(numeroChave).push(os);
      }
    });

    [...numerosPorAno.entries()]
      .sort(([anoA], [anoB]) => String(anoB).localeCompare(String(anoA)))
      .forEach(([ano, numeros]) => {
        const ordenados = [...numeros].sort((a, b) => a - b);
        const minimo = ordenados[0];
        const maximo = ordenados[ordenados.length - 1];
        for (let numero = minimo; numero <= maximo; numero += 1) {
          if (numeros.has(numero)) continue;
          itens.push(montarLinhaInconsistencia(
            "numero_pulado",
            null,
            "Número de OS pulado",
            `Número ${numero} não existe na sequência de ${ano}.`,
            "Verificar se a OS foi excluída, importada com outro número ou cadastrada com ano incorreto.",
            {
              id: `numero_pulado-${ano}-${numero}`,
              numeroOS: String(numero),
              ano,
            }
          ));
        }
      });

    osLista.forEach((os) => {
      const ano = normalizarTexto(os.anoEvento || obterAnoEvento(os));
      const numero = normalizarTexto(os.numeroOS);
      const numeroInteiro = numeroOSInteiro(numero);
      const materiais = extrairItensIniciais(os.materiais);
      const precificacao = precificacaoPorOS.get(normalizarTexto(os.id));
      const totalItensPrecificacao = Number(precificacao?.totalItens || 0);
      const registrosValidosMesmoNumero = registrosValidosPorNumero
        .get(numero.toLowerCase())
        ?.filter((item) => item.id !== os.id) || [];

      if (anoEventoSuspeito(ano, anoAtual)) {
        const anosValidosMesmoNumero = [...new Set(registrosValidosMesmoNumero.map((item) => item.anoEvento).filter(Boolean))];
        const possuiRegistroValidoMesmoNumero = anosValidosMesmoNumero.length > 0;
        itens.push(montarLinhaInconsistencia(
          "ano_suspeito",
          os,
          possuiRegistroValidoMesmoNumero ? "Registro sombra com ano suspeito" : "Ano suspeito",
          possuiRegistroValidoMesmoNumero
            ? `Este registro está em ${ano || "ano vazio"}, mas existe outra OS ${numero || "-"} no ano ${anosValidosMesmoNumero.join(", ")}.`
            : `Ano ${ano || "vazio"} está fora da janela operacional 2020-${anoAtual + 1}.`,
          possuiRegistroValidoMesmoNumero
            ? "Conferir se este registro antigo e duplicado deve ser removido ou corrigido; a OS visível no ano correto pode ser outro registro."
            : `Verificar se a OS deveria estar em ${anoAtual}.`
        ));
      }

      if (numeroInteiro === null) {
        itens.push(montarLinhaInconsistencia(
          "numero_invalido",
          os,
          "Número de OS inválido",
          numero ? `Campo numeroOS contém texto: ${numero}.` : "Campo numeroOS está vazio.",
          "Corrigir o campo numeroOS para manter apenas o número sequencial da OS."
        ));
      }

      if (osDeveTerMateriais(os) && materiais.length === 0) {
        itens.push(montarLinhaInconsistencia(
          "sem_materiais",
          os,
          "OS sem materiais",
          `Status ${os.status || "vazio"} normalmente exige materiais cadastrados.`,
          "Conferir a OS e preencher os materiais usados, se o atendimento ocorreu."
        ));
      }

      if (materiais.length > 0 && precificacao && totalItensPrecificacao === 0) {
        itens.push(montarLinhaInconsistencia(
          "materiais_sem_itens",
          os,
          "Materiais sem itens de precificação",
          "A OS possui materiais, mas a precificação existe sem itens financeiros.",
          "Abrir a precificação e sincronizar os itens com os materiais da OS."
        ));
      }

      if (osDeveTerPrecificacao(os) && !precificacao) {
        itens.push(montarLinhaInconsistencia(
          "sem_precificacao",
          os,
          "OS sem precificação",
          `Status ${os.status || "vazio"} indica atendimento finalizado, mas não há registro em precificacoes_os.`,
          "Abrir a OS ou alterar o status novamente para gerar a entrada de precificação."
        ));
      }

      const camposFaltando = [];
      if (!numero) camposFaltando.push("numeroOS");
      if (!normalizarTexto(os.solicitante)) camposFaltando.push("solicitante");
      if (!normalizarTexto(os.nomeEvento)) camposFaltando.push("nome do evento");
      if (!normalizarTexto(os.dataInicioEvento || os.periodoEvento)) camposFaltando.push("data");
      if (!normalizarTexto(os.localEvento)) camposFaltando.push("local");
      if (!normalizarTexto(os.status)) camposFaltando.push("status");
      if (!normalizarTexto(os.responsavel)) camposFaltando.push("responsável");

      if (camposFaltando.length) {
        itens.push(montarLinhaInconsistencia(
          "dados_essenciais",
          os,
          "Dados essenciais faltando",
          `Campos vazios: ${camposFaltando.join(", ")}.`,
          "Completar os campos obrigatórios no cadastro da OS.",
          { campos: camposFaltando }
        ));
      }
    });

    duplicadasPorAnoNumero.forEach((grupo) => {
      if (grupo.length < 2) return;
      grupo.forEach((os) => {
        itens.push(montarLinhaInconsistencia(
          "duplicada",
          os,
          "OS duplicada",
          `Número ${os.numeroOS} aparece ${grupo.length} vezes no ano ${os.anoEvento}.`,
          "Comparar os registros duplicados e manter apenas a OS correta."
        ));
      });
    });

    itens.sort((a, b) => {
      const ano = String(b.ano || "").localeCompare(String(a.ano || ""));
      if (ano) return ano;
      const numeroA = numeroOSInteiro(a.numeroOS);
      const numeroB = numeroOSInteiro(b.numeroOS);
      if (numeroA !== null && numeroB !== null && numeroA !== numeroB) return numeroA - numeroB;
      return TIPOS_INCONSISTENCIA.indexOf(a.tipo) - TIPOS_INCONSISTENCIA.indexOf(b.tipo);
    });

    return {
      resumo: montarResumoInconsistencias(itens),
      anos: [...anosEncontrados].sort((a, b) => String(b).localeCompare(String(a))),
      tipos: TIPOS_INCONSISTENCIA,
      geradoEm: agoraISO(),
      itens,
    };
  }

return {gerar};
});
