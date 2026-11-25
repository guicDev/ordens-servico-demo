(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./retencoes-pagamentos'));else root.DemoRelatorios=factory(root.CalculoRetencoesPagamento);})(typeof globalThis!=='undefined'?globalThis:this,function(retencoes){
'use strict';
const impostos=(function(){const IMPOSTOS = ["iss", "ir", "csll", "inss"];

function normalizar(valor) {
  return String(valor ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function numeroNota(valor) {
  const texto = normalizar(valor).replace(/^(?:nota fiscal|nfs|nf)\s+/, "");
  if (!/^\d+$/.test(texto)) return texto;
  return texto.replace(/^0+(?=\d)/, "");
}

function mesmaEmpresa(primeira, segunda) {
  const a = normalizar(primeira);
  const b = normalizar(segunda);
  if (!a || !b) return false;
  if (a === b) return true;
  const curta = a.length < b.length ? a : b;
  const longa = a.length < b.length ? b : a;
  return curta.length >= 4 && !curta.includes(" ") && longa.startsWith(`${curta} `);
}

function identificarPagamentoSemImposto(item = {}, existentes = []) {
  const nota = numeroNota(item.notaFiscal);
  const competencia = normalizar(item.competencia);
  const emissao = String(item.emissao || "");
  if (!nota || !competencia || !emissao || !item.empresa) return { estado: "nenhum" };
  const mesmaNotaEmpresa = existentes.filter((existente) =>
    !existente.excluidoEm
    && numeroNota(existente.notaFiscal) === nota
    && mesmaEmpresa(existente.empresa, item.empresa));
  const candidatos = mesmaNotaEmpresa.filter((existente) =>
    normalizar(existente.competencia) === competencia
    && (!existente.emissao || String(existente.emissao) === emissao));
  if (mesmaNotaEmpresa.length && !candidatos.length) {
    return { estado: "conflito", motivo: "Já existe a mesma nota para essa empresa, mas competência ou emissão são diferentes." };
  }
  if (!candidatos.length) return { estado: "nenhum" };
  if (candidatos.length !== 1) return { estado: "conflito", motivo: "Mais de um pagamento existente corresponde à nota, competência, emissão e empresa." };
  const existente = candidatos[0];
  if (Number(existente.valorContaCentavos) !== Number(item.valorContaCentavos)
    || Number(existente.valorLiquidoCentavos) !== Number(item.valorLiquidoCentavos)) {
    return { estado: "conflito", motivo: "O pagamento existente tem valores diferentes da planilha." };
  }
  if (!item.retencoes || !IMPOSTOS.some((imposto) => item.retencoes[imposto] !== null && item.retencoes[imposto] !== undefined)) {
    return { estado: "conflito", motivo: "A planilha não informa impostos para atualizar o pagamento existente." };
  }
  for (const imposto of IMPOSTOS) {
    if (!Object.hasOwn(item.retencoes, imposto)) continue;
    const atual = existente.retencoes?.[imposto];
    if (atual !== null && atual !== undefined && atual !== item.retencoes[imposto]) {
      return { estado: "conflito", motivo: `O pagamento existente já tem ${imposto.toUpperCase()} diferente da planilha.` };
    }
  }
  return { estado: "atualizar_impostos", existente };
}

return { identificarPagamentoSemImposto };

})();
const vinculos=(function(){function texto(valor) {
  return valor === null || valor === undefined ? '' : String(valor).trim();
}

function chaveBusca(valor) {
  return texto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function chaveNumeroBase(valor) {
  const entrada = texto(valor).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const match = entrada.match(/^(?:(?:CT|CONTRATO)\s*)?0*(\d+)(?:\s*-\s*0*(\d+))?\s*\/\s*(\d{4})(.*)$/);
  if (!match) return '';
  const sufixo = match[4].trim();
  if (sufixo && !/\bADITIVO(?:S)?\b/.test(sufixo)) return '';
  return `${Number(match[1])}${match[2] ? `-${Number(match[2])}` : ''}/${match[3]}`;
}

function resolverVinculoContratoPagamento(dados = {}, contratos = [], existente = null) {
  const numeroInformado = texto(dados.numeroContrato ?? dados.numero_contrato);
  if (!numeroInformado) {
    const contratoExistente = contratos.find(contrato => contrato.id === existente?.contratoId);
    return contratoExistente
      ? { estado: 'vinculado', contratoId: contratoExistente.id, numeroContrato: contratoExistente.numeroContrato, motivo: 'Vínculo existente preservado.' }
      : { estado: 'sem_contrato', contratoId: '', numeroContrato: '', motivo: 'Sem contrato informado.' };
  }

  const todos = Array.isArray(contratos) ? contratos : [];
  const exatos = todos.filter(contrato => chaveBusca(contrato.numeroContrato ?? contrato.numero_contrato) === chaveBusca(numeroInformado));
  const chaveBase = chaveNumeroBase(numeroInformado);
  const candidatos = exatos.length ? exatos : chaveBase
    ? todos.filter(contrato => chaveNumeroBase(contrato.numeroContrato ?? contrato.numero_contrato) === chaveBase)
    : [];
  let escolhido = candidatos.length === 1 ? candidatos[0] : null;
  if (!escolhido && candidatos.length > 1) {
    const razao = chaveBusca(dados.razaoSocial ?? dados.razao_social);
    const doOrgao = candidatos.filter(contrato => chaveBusca(contrato.orgao) === razao);
    if (doOrgao.length === 1) escolhido = doOrgao[0];
  }
  if (escolhido) return {
    estado: 'vinculado', contratoId: escolhido.id,
    numeroContrato: texto(escolhido.numeroContrato ?? escolhido.numero_contrato),
    motivo: exatos.includes(escolhido) ? 'Número exato.' : 'Número semelhante, vínculo único.',
  };
  return {
    estado: 'pendente', contratoId: '', numeroContrato: '',
    motivo: candidatos.length ? 'Mais de um contrato semelhante; vínculo pendente.' : 'Contrato não encontrado; vínculo pendente.',
  };
}

return { chaveNumeroBase, resolverVinculoContratoPagamento };

})();
function create(ExcelJS){
const {IMPOSTOS,validarAliquota,parsePercentual,calcularRetencoes}=retencoes;
const {identificarPagamentoSemImposto}=impostos;
const {resolverVinculoContratoPagamento}=vinculos;
const pagamentos=(function(){
const CABECALHOS_RETENCOES = ["ISS (%)", "IR (%)", "CSLL (%)", "INSS (%)", "Tipo do líquido"];
const CABECALHOS_PLANILHA_PAGAMENTOS = [
  "Razao Social",
  "EMPRESA",
  "ESFERA",
  "Nota Fiscal",
  "Emissao",
  "Valor da Conta",
  "Valor Liquido",
  "STATUS",
  "PAGAMENTO",
  "DATA DO PAGAMENTO",
  "Contrato Nº",
  ...CABECALHOS_RETENCOES,
];
const CABECALHOS_PLANILHA_PAGAMENTOS_SECRETARIA = [
  "Competencia",
  ...CABECALHOS_PLANILHA_PAGAMENTOS,
];
const ORDENACAO_PLANILHA_PAGAMENTOS = {
  MES: "mes",
  SECRETARIA: "secretaria",
};
const STATUS_PAGAMENTO_PERMITIDOS = new Set(["APTO", "EM ANALISE", "PENDENTE", "GLOSA", "CANCELADO"]);
const SITUACOES_PAGAMENTO_PERMITIDAS = new Set(["EM ABERTO", "AGENDADO", "PARCIAL", "CONFIRMADO"]);
const ORDEM_COMPETENCIAS_PLANILHA = new Map([
  ["JAN", 1],
  ["FEV", 2],
  ["MAR", 3],
  ["ABR", 4],
  ["MAI", 5],
  ["JUN", 6],
  ["JUL", 7],
  ["AGO", 8],
  ["SET", 9],
  ["OUT", 10],
  ["NOV", 11],
  ["DEZ", 12],
]);

async function criarWorkbookPlanilhaPagamentosAbertos(lista = [], opcoes = {}) {
  const ordenacao = normalizarOrdenacaoPlanilhaPagamentos(opcoes.ordenacao);
  const config = obterConfigPlanilhaPagamentos(ordenacao);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Demonstração fictícia";
  workbook.lastModifiedBy = "Demonstração fictícia";
  workbook.created = new Date();
  workbook.modified = new Date();
  const worksheet = workbook.addWorksheet("GERAL");
  let linhaAtual = 1;
  let totalContaCentavos = 0;
  let totalLiquidoCentavos = 0;
  let totalAptosContaCentavos = 0;
  let totalAptosLiquidoCentavos = 0;

  config.grupos(lista).forEach(([grupo, itens]) => {
    const titulo = worksheet.getRow(linhaAtual);
    titulo.getCell(1).value = grupo;
    estilizarLinhaTituloPlanilha(titulo, config.totalColunas);
    linhaAtual += 1;

    const cabecalho = worksheet.getRow(linhaAtual);
    cabecalho.values = config.cabecalhos;
    estilizarLinhaCabecalhoPlanilha(cabecalho);
    linhaAtual += 1;

    let subtotalContaCentavos = 0;
    let subtotalLiquidoCentavos = 0;
    itens.forEach((item) => {
      subtotalContaCentavos += Number(item.valorContaCentavos || 0);
      subtotalLiquidoCentavos += Number(item.valorLiquidoCentavos || 0);
      totalContaCentavos += Number(item.valorContaCentavos || 0);
      totalLiquidoCentavos += Number(item.valorLiquidoCentavos || 0);
      if (normalizarBusca(item.status) === "apto" && !confirmado(item)) {
        totalAptosContaCentavos += Number(item.valorContaCentavos || 0);
        totalAptosLiquidoCentavos += Number(item.valorLiquidoCentavos || 0);
      }
      const row = worksheet.getRow(linhaAtual);
      row.values = config.valoresLinha(item);
      row.getCell(config.colunaValorConta).numFmt = '"R$" #,##0.00';
      row.getCell(config.colunaValorLiquido).numFmt = '"R$" #,##0.00';
      linhaAtual += 1;
    });

    const total = worksheet.getRow(linhaAtual);
    total.getCell(1).value = `TOTAL ${grupo}`;
    total.getCell(config.colunaValorConta).value = numeroPlanilhaCentavos(subtotalContaCentavos);
    total.getCell(config.colunaValorLiquido).value = numeroPlanilhaCentavos(subtotalLiquidoCentavos);
    total.getCell(config.colunaValorConta).numFmt = '"R$" #,##0.00';
    total.getCell(config.colunaValorLiquido).numFmt = '"R$" #,##0.00';
    estilizarLinhaTotalPlanilha(total);
    linhaAtual += 2;
  });

  const totalGeral = worksheet.getRow(linhaAtual);
  totalGeral.getCell(1).value = "TOTAL GERAL";
  totalGeral.getCell(config.colunaValorConta).value = numeroPlanilhaCentavos(totalContaCentavos);
  totalGeral.getCell(config.colunaValorLiquido).value = numeroPlanilhaCentavos(totalLiquidoCentavos);
  totalGeral.getCell(config.colunaValorConta).numFmt = '"R$" #,##0.00';
  totalGeral.getCell(config.colunaValorLiquido).numFmt = '"R$" #,##0.00';
  estilizarLinhaTotalPlanilha(totalGeral);

  linhaAtual += 1;
  const totalAptos = worksheet.getRow(linhaAtual);
  totalAptos.getCell(1).value = "TOTAL PAGAMENTOS APTOS";
  totalAptos.getCell(config.colunaValorConta).value = numeroPlanilhaCentavos(totalAptosContaCentavos);
  totalAptos.getCell(config.colunaValorLiquido).value = numeroPlanilhaCentavos(totalAptosLiquidoCentavos);
  totalAptos.getCell(config.colunaValorConta).numFmt = '"R$" #,##0.00';
  totalAptos.getCell(config.colunaValorLiquido).numFmt = '"R$" #,##0.00';
  estilizarLinhaTotalPlanilha(totalAptos);

  aplicarEstiloPlanilhaPagamentos(worksheet, linhaAtual, ordenacao);
  worksheet.views = [{ state: "frozen", ySplit: 0 }];
  return workbook;
}

function normalizarOrdenacaoPlanilhaPagamentos(valor) {
  const texto = normalizarBusca(valor);
  if (["secretaria", "razao social", "razaosocial", "cliente"].includes(texto)) return ORDENACAO_PLANILHA_PAGAMENTOS.SECRETARIA;
  return ORDENACAO_PLANILHA_PAGAMENTOS.MES;
}

function normalizarBusca(valor) {
  return normalizarTexto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarTexto(valor) {
  if (valor === undefined || valor === null) return "";
  return String(valor).trim();
}

function obterConfigPlanilhaPagamentos(ordenacao) {
  const porSecretaria = ordenacao === ORDENACAO_PLANILHA_PAGAMENTOS.SECRETARIA;
  return {
    cabecalhos: porSecretaria ? CABECALHOS_PLANILHA_PAGAMENTOS_SECRETARIA : CABECALHOS_PLANILHA_PAGAMENTOS,
    grupos: porSecretaria ? agruparPagamentosPorSecretaria : agruparPagamentosPorCompetencia,
    totalColunas: porSecretaria ? 17 : 16,
    colunaValorConta: porSecretaria ? 7 : 6,
    colunaValorLiquido: porSecretaria ? 8 : 7,
    valoresLinha: (item) => porSecretaria ? [
      textoPlanilhaSeguro(item.competencia),
      textoPlanilhaSeguro(item.razaoSocial),
      textoPlanilhaSeguro(item.empresa),
      textoPlanilhaSeguro(item.esfera),
      textoPlanilhaSeguro(item.notaFiscal),
      formatarDataBR(item.emissao),
      numeroPlanilhaCentavos(item.valorContaCentavos),
      numeroPlanilhaCentavos(item.valorLiquidoCentavos),
      textoPlanilhaSeguro(item.status),
      textoPlanilhaSeguro(item.pagamento) || "EM ABERTO",
      formatarDataBR(item.dataPagamento),
      textoPlanilhaSeguro(item.numeroContrato || item.numeroContratoInformado),
      ...IMPOSTOS.map((imposto) => item.retencoes?.[imposto] === null || item.retencoes?.[imposto] === undefined
        ? null : item.retencoes[imposto] / 10000),
      item.liquidoModo === "automatico" ? "AUTOMÁTICO" : "MANUAL",
    ] : [
      textoPlanilhaSeguro(item.razaoSocial),
      textoPlanilhaSeguro(item.empresa),
      textoPlanilhaSeguro(item.esfera),
      textoPlanilhaSeguro(item.notaFiscal),
      formatarDataBR(item.emissao),
      numeroPlanilhaCentavos(item.valorContaCentavos),
      numeroPlanilhaCentavos(item.valorLiquidoCentavos),
      textoPlanilhaSeguro(item.status),
      textoPlanilhaSeguro(item.pagamento) || "EM ABERTO",
      formatarDataBR(item.dataPagamento),
      textoPlanilhaSeguro(item.numeroContrato || item.numeroContratoInformado),
      ...IMPOSTOS.map((imposto) => item.retencoes?.[imposto] === null || item.retencoes?.[imposto] === undefined
        ? null : item.retencoes[imposto] / 10000),
      item.liquidoModo === "automatico" ? "AUTOMÁTICO" : "MANUAL",
    ],
  };
}

function agruparPagamentosPorSecretaria(lista = []) {
  const grupos = new Map();
  ordenarPagamentosPlanilhaPorSecretaria(lista).forEach((item) => {
    const secretaria = normalizarTexto(item.razaoSocial) || "SEM SECRETARIA";
    const chave = chaveAgrupamentoRazaoSocial(secretaria);
    if (!grupos.has(chave)) grupos.set(chave, { titulo: secretaria, itens: [] });
    grupos.get(chave).itens.push(item);
  });
  return [...grupos.values()].map((grupo) => [grupo.titulo, grupo.itens]);
}

function ordenarPagamentosPlanilhaPorSecretaria(lista = []) {
  return [...(Array.isArray(lista) ? lista : [])].sort((a, b) => {
    const razao = compararTextoPlanilha(chaveAgrupamentoRazaoSocial(a.razaoSocial), chaveAgrupamentoRazaoSocial(b.razaoSocial));
    if (razao !== 0) return razao;
    const competencia = chaveOrdenacaoCompetencia(a.competencia) - chaveOrdenacaoCompetencia(b.competencia);
    if (competencia !== 0) return competencia;
    const emissao = compararTextoPlanilha(a.emissao, b.emissao);
    if (emissao !== 0) return emissao;
    return compararTextoPlanilha(a.notaFiscal, b.notaFiscal);
  });
}

function compararTextoPlanilha(a, b) {
  return normalizarTexto(a).localeCompare(normalizarTexto(b), "pt-BR", { numeric: true, sensitivity: "base" });
}

function chaveAgrupamentoRazaoSocial(valor) {
  return normalizarBusca(valor);
}

function chaveOrdenacaoCompetencia(valor) {
  const texto = normalizarTexto(valor).toUpperCase();
  const match = texto.match(/^([A-Z]{3})(?:\/(\d{2,4}))?$/);
  if (!match) return 999999;
  const ano = match[2] ? Number(match[2].length === 2 ? `20${match[2]}` : match[2]) : 9999;
  return (ano * 100) + (ORDEM_COMPETENCIAS_PLANILHA.get(match[1]) || 99);
}

function agruparPagamentosPorCompetencia(lista = []) {
  const grupos = new Map();
  ordenarPagamentosPlanilhaPorCompetencia(lista).forEach((item) => {
    const competencia = normalizarTexto(item.competencia) || "SEM COMPETENCIA";
    if (!grupos.has(competencia)) grupos.set(competencia, []);
    grupos.get(competencia).push(item);
  });
  return [...grupos.entries()].sort((a, b) => chaveOrdenacaoCompetencia(a[0]) - chaveOrdenacaoCompetencia(b[0]));
}

function ordenarPagamentosPlanilhaPorCompetencia(lista = []) {
  return [...(Array.isArray(lista) ? lista : [])].sort((a, b) => {
    const competencia = chaveOrdenacaoCompetencia(a.competencia) - chaveOrdenacaoCompetencia(b.competencia);
    if (competencia !== 0) return competencia;
    const emissao = compararTextoPlanilha(a.emissao, b.emissao);
    if (emissao !== 0) return emissao;
    return compararTextoPlanilha(a.razaoSocial, b.razaoSocial);
  });
}

function textoPlanilhaSeguro(valor) {
  const texto = normalizarTexto(valor);
  return /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
}

function formatarDataBR(valor) {
  const iso = normalizarDataISO(valor);
  if (!iso) return "";
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function normalizarDataISO(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    // Datas de células Excel são decodificadas em UTC, sem fuso local.
    return valor.toISOString().slice(0, 10);
  }
  const texto = normalizarTexto(valor);
  if (!texto || texto === "-") return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  if (/^\d+(\.\d+)?$/.test(texto)) {
    const serial = Number(texto);
    if (Number.isFinite(serial) && serial > 0) {
      const data = new Date(Date.UTC(1899, 11, 30));
      data.setUTCDate(data.getUTCDate() + Math.floor(serial));
      return data.toISOString().slice(0, 10);
    }
  }
  const br = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return "";
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function numeroPlanilhaCentavos(valor) {
  return Math.round(Number(valor || 0)) / 100;
}

function estilizarLinhaTituloPlanilha(row, totalColunas = 10) {
  row.height = 20;
  for (let coluna = 1; coluna <= totalColunas; coluna += 1) {
    const cell = row.getCell(coluna);
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
    cell.alignment = { vertical: "middle" };
  }
}

function estilizarLinhaCabecalhoPlanilha(row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function confirmado(item = {}) {
  return normalizarBusca(item.pagamento) === "confirmado";
}

function estilizarLinhaTotalPlanilha(row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
}

function aplicarEstiloPlanilhaPagamentos(worksheet, ultimaLinha, ordenacao) {
  worksheet.columns = obterLargurasPlanilhaPagamentos(ordenacao);
  for (let linha = 1; linha <= ultimaLinha; linha += 1) {
    const row = worksheet.getRow(linha);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9E2EC" } },
        left: { style: "thin", color: { argb: "FFD9E2EC" } },
        bottom: { style: "thin", color: { argb: "FFD9E2EC" } },
        right: { style: "thin", color: { argb: "FFD9E2EC" } },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  }
}

function obterLargurasPlanilhaPagamentos(ordenacao) {
  const larguras = [
    { width: 36 },
    { width: 18 },
    { width: 16 },
    { width: 18 },
    { width: 14 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 18 },
    { width: 20 },
    { width: 13 },
    { width: 13 },
    { width: 13 },
    { width: 13 },
    { width: 19 },
  ];
  return ordenacao === ORDENACAO_PLANILHA_PAGAMENTOS.SECRETARIA
    ? [{ width: 16 }, ...larguras]
    : larguras;
}

function analisarWorkbookPagamentosAbertos(workbook, existentes = [], contratos = null) {
  const worksheet = workbook.getWorksheet("GERAL");
  if (!worksheet) {
    const erro = new Error("PLANILHA_SEM_ABA_GERAL");
    erro.statusCode = 400;
    throw erro;
  }
  const existentesPorChave = new Map((Array.isArray(existentes) ? existentes : [])
    .filter((item) => item.chaveImportacao).map((item) => [item.chaveImportacao, item]));
  const registros = [];
  const ignoradas = [];
  const avisos = [];
  const pagamentosJaVinculados = new Set();
  let competenciaAtual = "";
  let colunas = null;
  worksheet.eachRow((row, rowNumber) => {
    const linha = textoLinha(row);
    const normalizada = normalizarBusca(linha).toUpperCase();
    if (!linha) {
      ignoradas.push({ linha: rowNumber, motivo: "Linha vazia" });
      return;
    }
    if (normalizada.startsWith("TOTAL ")) {
      ignoradas.push({ linha: rowNumber, motivo: "Total mensal" });
      return;
    }
    const cabecalho = identificarColunas(row);
    if (cabecalho) {
      colunas = cabecalho;
      ignoradas.push({ linha: rowNumber, motivo: "Cabecalho" });
      return;
    }
    const competencia = detectarCompetencia(linha);
    if (competencia && (row.actualCellCount || 0) <= 3) {
      competenciaAtual = competencia;
      ignoradas.push({ linha: rowNumber, motivo: "Competencia" });
      return;
    }
    if (!colunas && (row.actualCellCount || 0) <= 3) {
      ignoradas.push({ linha: rowNumber, motivo: "Titulo de grupo" });
      return;
    }
    let item;
    try {
      item = mapearLinha(row, colunas || {}, competenciaAtual || competencia);
    } catch {
      avisos.push(`Linha ${rowNumber}: percentual ou modo do líquido inválido.`);
      return;
    }
    if (!item.razaoSocial && !item.notaFiscal) {
      ignoradas.push({ linha: rowNumber, motivo: "Sem dados de pagamento" });
      return;
    }
    if (!Number.isFinite(item.valorContaCentavos) || !Number.isFinite(item.valorLiquidoCentavos)) {
      avisos.push(`Linha ${rowNumber}: valor monetário inválido.`);
      return;
    }
    let existente = existentesPorChave.get(item.chaveImportacao);
    let identificacao = { estado: "nenhum" };
    if (!existente) {
      identificacao = identificarPagamentoSemImposto(item, existentes);
      if (identificacao.estado === "conflito") {
        avisos.push(`Linha ${rowNumber}, NF ${item.notaFiscal}: ${identificacao.motivo} Confira antes de importar.`);
        ignoradas.push({ linha: rowNumber, motivo: identificacao.motivo });
        return;
      }
      if (identificacao.estado === "atualizar_impostos") existente = identificacao.existente;
    }
    if (existente?.id && pagamentosJaVinculados.has(existente.id)) {
      const motivo = "Mais de uma linha da planilha corresponde ao mesmo pagamento existente.";
      avisos.push(`Linha ${rowNumber}, NF ${item.notaFiscal}: ${motivo}`);
      ignoradas.push({ linha: rowNumber, motivo });
      return;
    }
    try {
      const retencoes = { ...existente?.retencoes, ...item.retencoes };
      const calculo = calcularRetencoes(item.valorContaCentavos, retencoes);
      if (item.liquidoModo === "automatico" && calculo.liquidoCentavos !== item.valorLiquidoCentavos) {
        avisos.push(`Linha ${rowNumber}: valor líquido diferente do calculado pelos impostos; corrija a planilha ou marque Manual.`);
        return;
      }
    } catch {
      avisos.push(`Linha ${rowNumber}: retenções inválidas ou superiores ao Valor da conta.`);
      return;
    }
    if (existente && IMPOSTOS.some((imposto) => existente.retencoes?.[imposto] !== null && existente.retencoes?.[imposto] !== undefined)
      && (existente.valorContaCentavos !== item.valorContaCentavos || existente.valorLiquidoCentavos !== item.valorLiquidoCentavos)) {
      avisos.push(`Linha ${rowNumber}: a importação atualizará valores de um pagamento com retenções cadastradas; confira antes de confirmar.`);
    }
    item.linha = rowNumber;
    item.modoImportacao = identificacao.estado === "atualizar_impostos" ? "somente_impostos" : "completo";
    item.pagamentoExistenteId = item.modoImportacao === "somente_impostos" ? existente.id : "";
    item.acao = existente ? "atualizar" : "criar";
    if (item.modoImportacao === "somente_impostos") {
      item.contratoId = existente.contratoId || "";
      item.numeroContratoVinculado = existente.numeroContrato || "";
      item.vinculoContrato = existente.contratoId ? "vinculado" : "mantido";
      item.pagamento = existente.pagamento;
      item.dataPagamento = existente.dataPagamento;
      item.liquidoModo = existente.liquidoModo;
    } else if (Array.isArray(contratos)) {
      const vinculo = resolverVinculoContratoPagamento(item, contratos, existente);
      item.contratoId = vinculo.contratoId;
      item.numeroContratoInformado = item.numeroContrato;
      item.vinculoContrato = vinculo.estado;
      item.numeroContratoVinculado = vinculo.numeroContrato;
      item.motivoVinculo = vinculo.motivo;
      if (vinculo.estado === "pendente") {
        avisos.push(`Linha ${rowNumber}, NF ${item.notaFiscal}: Contrato Nº ${item.numeroContrato} sem vínculo. ${vinculo.motivo} O pagamento será importado sem contrato.`);
      }
    }
    if (existente?.id) pagamentosJaVinculados.add(existente.id);
    registros.push(item);
  });
  const somenteImpostos = registros.filter((item) => item.modoImportacao === "somente_impostos").length;
  if (somenteImpostos) avisos.push(`${somenteImpostos} pagamento(s) existente(s) receberão somente os impostos; os demais dados serão preservados.`);
  return {
    resumo: {
      validos: registros.length,
      criados: registros.filter((item) => item.acao === "criar").length,
      atualizados: registros.filter((item) => item.acao === "atualizar").length,
      linhasIgnoradas: ignoradas.length,
      contratosVinculados: registros.filter((item) => item.vinculoContrato === "vinculado").length,
      contratosPendentes: registros.filter((item) => item.vinculoContrato === "pendente").length,
      semContratoInformado: registros.filter((item) => item.vinculoContrato === "sem_contrato").length,
      valorContaCentavos: registros.reduce((total, item) => total + item.valorContaCentavos, 0),
      valorLiquidoCentavos: registros.reduce((total, item) => total + item.valorLiquidoCentavos, 0),
    },
    registros,
    ignoradas,
    avisos,
  };
}

function chaveImportacao(item = {}) {
  return [item.competencia, item.razaoSocial, item.empresa, item.esfera, item.notaFiscal, item.emissao]
    .map((valor) => normalizarBusca(valor).replace(/\s+/g, "-"))
    .join("|");
}

function textoLinha(row) {
  const partes = [];
  row.eachCell({ includeEmpty: false }, (cell) => {
    const texto = normalizarTexto(obterValorCelula(cell));
    if (texto) partes.push(texto);
  });
  return partes.join(" ").trim();
}

function obterValorCelula(cell) {
  const valor = cell?.value;
  if (valor === undefined || valor === null) return "";
  if (valor instanceof Date) return valor;
  if (typeof valor === "object") {
    if (valor.text !== undefined) return normalizarTexto(valor.text);
    if (valor.result !== undefined) return valor.result;
    if (Array.isArray(valor.richText)) return normalizarTexto(valor.richText.map((parte) => parte.text || "").join(""));
  }
  return valor;
}

function identificarColunas(row) {
  const colunas = {};
  row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const header = normalizarCabecalho(obterValorCelula(cell));
    const rotulo = normalizarBusca(obterValorCelula(cell));
    if (!header) return;
    if (IMPOSTOS.includes(rotulo)) {
      colunas[`aliquota_${rotulo}`] = colNumber;
      return;
    }
    if (rotulo === "tipo do liquido") {
      colunas.liquidoModo = colNumber;
      return;
    }
    if (header.includes("razaoSocial")) colunas.razaoSocial = colNumber;
    else if (header.includes("competencia")) colunas.competencia = colNumber;
    else if (header.includes("contrato")) colunas.numeroContrato = colNumber;
    else if (header.includes("empresa")) colunas.empresa = colNumber;
    else if (header.includes("esfera")) colunas.esfera = colNumber;
    else if (header.includes("notaFiscal")) colunas.notaFiscal = colNumber;
    else if (header.includes("emissao")) colunas.emissao = colNumber;
    else if (header.includes("valorConta")) colunas.valorConta = colNumber;
    else if (header.includes("valorLiquido")) colunas.valorLiquido = colNumber;
    else if (header.includes("status")) colunas.status = colNumber;
    else if (header === "pagamento" || header.includes("pagamento")) colunas.pagamento = colNumber;
    else if (header.includes("dataPagamento")) colunas.dataPagamento = colNumber;
  });
  return Object.keys(colunas).length >= 4 ? colunas : null;
}

function normalizarCabecalho(valor) {
  return normalizarBusca(valor)
    .replace(/razao social|razao|orgao|cliente|solicitante/g, "razaoSocial")
    .replace(/nota fiscal|nf|fatura/g, "notaFiscal")
    .replace(/emissao|data emissao/g, "emissao")
    .replace(/valor da conta|valor conta|valor bruto|conta/g, "valorConta")
    .replace(/valor liquido|liquido/g, "valorLiquido")
    .replace(/data (?:do )?pagamento|dt pagamento/g, "dataPagamento");
}

function detectarCompetencia(texto) {
  const normalizado = normalizarBusca(texto).toUpperCase();
  if (!normalizado || normalizado.startsWith("TOTAL ")) return "";
  const meses = { JAN: "JAN", JANEIRO: "JAN", FEV: "FEV", FEVEREIRO: "FEV", MAR: "MAR", MARCO: "MAR", ABR: "ABR", ABRIL: "ABR", MAI: "MAI", MAIO: "MAI", JUN: "JUN", JUNHO: "JUN", JUL: "JUL", JULHO: "JUL", AGO: "AGO", AGOSTO: "AGO", SET: "SET", SETEMBRO: "SET", OUT: "OUT", OUTUBRO: "OUT", NOV: "NOV", NOVEMBRO: "NOV", DEZ: "DEZ", DEZEMBRO: "DEZ" };
  const match = normalizado.match(/\b(JAN(?:EIRO)?|FEV(?:EREIRO)?|MAR(?:CO)?|ABR(?:IL)?|MAI(?:O)?|JUN(?:HO)?|JUL(?:HO)?|AGO(?:STO)?|SET(?:EMBRO)?|OUT(?:UBRO)?|NOV(?:EMBRO)?|DEZ(?:EMBRO)?)(?:\s*[\/\- ]\s*(\d{2,4}))?\b/);
  if (!match) return "";
  const mes = meses[match[1]] || match[1].slice(0, 3);
  return match[2] ? `${mes}/${match[2]}` : mes;
}

function mapearLinha(row, colunas, competencia) {
  const texto = (coluna) => {
    const valor = coluna ? normalizarTexto(obterValorCelula(row.getCell(coluna))) : "";
    return /^'[=+\-@]/.test(valor) ? valor.slice(1) : valor;
  };
  const data = (coluna) => coluna ? normalizarDataISO(obterValorCelula(row.getCell(coluna))) : "";
  const item = {
    competencia: texto(colunas.competencia) || competencia,
    razaoSocial: texto(colunas.razaoSocial || 1),
    numeroContrato: texto(colunas.numeroContrato),
    empresa: texto(colunas.empresa || 2),
    esfera: texto(colunas.esfera || 3),
    notaFiscal: texto(colunas.notaFiscal || 4),
    emissao: data(colunas.emissao || 5),
    valorContaCentavos: normalizarMoedaCentavos(obterValorCelula(row.getCell(colunas.valorConta || 6))),
    valorLiquidoCentavos: normalizarMoedaCentavos(obterValorCelula(row.getCell(colunas.valorLiquido || 7))),
    status: texto(colunas.status || 8),
    pagamento: texto(colunas.pagamento || 9),
    dataPagamento: data(colunas.dataPagamento || 10),
    origem: "importacao",
  };
  if (IMPOSTOS.some((imposto) => colunas[`aliquota_${imposto}`])) {
    item.retencoes = {};
    for (const imposto of IMPOSTOS) {
      const coluna = colunas[`aliquota_${imposto}`];
      if (!coluna) continue;
      const celula = row.getCell(coluna);
      const valor = obterValorCelula(celula);
      const percentual = typeof valor === "number" && /%/.test(celula.numFmt || "") ? valor * 100 : valor;
      item.retencoes[imposto] = parsePercentual(percentual);
    }
  }
  if (colunas.liquidoModo) {
    const modo = normalizarBusca(texto(colunas.liquidoModo));
    if (modo && !["automatico", "manual"].includes(modo)) throw new Error("MODO_LIQUIDO_INVALIDO");
    if (modo) item.liquidoModo = modo;
  }
  item.chaveImportacao = chaveImportacao(item);
  return item;
}

function normalizarMoedaCentavos(valor) {
  if (valor === undefined || valor === null || valor === "") return 0;
  if (typeof valor === "number") return Math.round(valor * 100);
  const texto = normalizarTexto(valor);
  if (!texto || texto === "-") return 0;
  const limpo = texto.replace(/R\$\s?/gi, "").replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  const numero = Number(limpo);
  return Number.isFinite(numero) && numero >= 0 ? Math.round(numero * 100) : NaN;
}

function montarResumoPagamentosAbertos(lista = []) {
  const itens = (Array.isArray(lista) ? lista : []).filter((item) => !cancelado(item));
  const emAberto = itens.filter((item) => !confirmado(item));
  return {
    total: itens.length,
    confirmados: itens.length - emAberto.length,
    emAberto: emAberto.length,
    semDataPagamento: itens.filter((item) => confirmado(item) && !item.dataPagamento).length,
    valorContaCentavos: itens.reduce((total, item) => total + Number(item.valorContaCentavos || 0), 0),
    valorLiquidoCentavos: itens.reduce((total, item) => total + Number(item.valorLiquidoCentavos || 0), 0),
    valorEmAbertoCentavos: emAberto.reduce((total, item) => total + Number(item.valorLiquidoCentavos || 0), 0),
  };
}

function cancelado(item = {}) {
  return normalizarBusca(item.status) === "cancelado";
}

function filtrarPagamentosAbertos(lista, filtros = {}) {
  const filtroClientesAtivo = Array.isArray(filtros.clientes);
  const clientes = new Set(normalizarListaFiltroExportacao(filtros.clientes).map(normalizarBusca));
  const filtroIdsAtivo = Array.isArray(filtros.ids);
  const ids = new Set(normalizarListaFiltroExportacao(filtros.ids));
  const campoValor = normalizarBusca(filtros.campoBusca);
  const buscaPorValor = campoValor === "valorconta" || campoValor === "valorliquido";
  const valorBuscado = buscaPorValor
    ? digitosBuscaValor(filtros.busca || filtros.q)
    : "";
  return (Array.isArray(lista) ? lista : []).filter((item) => {
    if (filtroClientesAtivo && (!clientes.size || !clientes.has(normalizarBusca(item.razaoSocial)))) return false;
    if (filtroIdsAtivo && (!ids.size || !ids.has(normalizarTexto(item.id)))) return false;
    if (filtros.competencia && item.competencia !== filtros.competencia) return false;
    if (filtros.empresa && item.empresa !== filtros.empresa) return false;
    if (filtros.esfera && item.esfera !== filtros.esfera) return false;
    if (filtros.status && item.status !== filtros.status) return false;
    if (filtros.pagamento === "EM ABERTO" && (confirmado(item) || cancelado(item))) return false;
    if (filtros.pagamento === "CONFIRMADO" && !confirmado(item)) return false;
    if (filtros.pagamento && !["EM ABERTO", "CONFIRMADO"].includes(filtros.pagamento) && item.pagamento !== filtros.pagamento) return false;
    if (filtros.vinculoContrato === "com" && !item.contratoId) return false;
    if (filtros.vinculoContrato === "sem" && item.contratoId) return false;
    const dataFiltrada = filtros.tipoData === "pagamento" ? item.dataPagamento : item.emissao;
    if ((filtros.dataInicial || filtros.dataFinal) && !dataFiltrada) return false;
    if (filtros.dataInicial && dataFiltrada < filtros.dataInicial) return false;
    if (filtros.dataFinal && dataFiltrada > filtros.dataFinal) return false;
    const busca = normalizarTexto(filtros.busca || filtros.q);
    if (busca) {
      if (buscaPorValor) {
        if (!valorBuscado || !digitosValor(item, campoValor).includes(valorBuscado)) return false;
      } else {
        const alvo = normalizarBusca(obterTextoBuscaPagamento(item, filtros.campoBusca));
        if (!alvo.includes(normalizarBusca(busca))) return false;
      }
    }
    return true;
  });
}

function normalizarListaFiltroExportacao(valor) {
  if (Array.isArray(valor)) {
    return valor.map(normalizarTexto).filter(Boolean);
  }
  const texto = normalizarTexto(valor);
  return texto ? [texto] : [];
}

function digitosBuscaValor(valor) {
  const texto = normalizarTexto(valor).replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  return texto && !/[^0-9.,]/.test(texto) ? texto.replace(/\D/g, "") : "";
}

function digitosValor(item, campo) {
  const centavos = Number(item[campo === "valorconta" ? "valorContaCentavos" : "valorLiquidoCentavos"]);
  return Number.isSafeInteger(centavos) && centavos >= 0 ? String(centavos).padStart(3, "0") : "";
}

function obterTextoBuscaPagamento(item = {}, campoBusca = "todos") {
  const campo = normalizarBusca(campoBusca || "todos");
  if (campo === "razaosocial") return item.razaoSocial || "";
  if (campo === "notafiscal") return item.notaFiscal || "";
  if (campo === "empresa") return item.empresa || "";
  if (campo === "status") return item.status || "";
  if (campo === "competencia") return item.competencia || "";
  return [item.razaoSocial, item.empresa, item.esfera, item.notaFiscal, item.status, item.pagamento, item.competencia].join(" ");
}

function normalizarPayloadPagamento(dados = {}) {
  const valorContaCentavos = (dados.valorContaCentavos !== undefined || dados.valor_conta_centavos !== undefined)
    ? normalizarEntradaCentavos(dados.valorContaCentavos ?? dados.valor_conta_centavos)
    : normalizarMoedaCentavos(dados.valorConta);
  const valorLiquidoCentavos = (dados.valorLiquidoCentavos !== undefined || dados.valor_liquido_centavos !== undefined)
    ? normalizarEntradaCentavos(dados.valorLiquidoCentavos ?? dados.valor_liquido_centavos)
    : normalizarMoedaCentavos(dados.valorLiquido);
  if (!Number.isFinite(valorContaCentavos) || !Number.isFinite(valorLiquidoCentavos)) {
    const erro = new Error("VALOR_PAGAMENTO_INVALIDO");
    erro.statusCode = 400;
    throw erro;
  }
  let retencoes;
  if (dados.retencoes !== undefined) {
    if (!dados.retencoes || typeof dados.retencoes !== "object" || Array.isArray(dados.retencoes)
      || Object.keys(dados.retencoes).some((imposto) => !IMPOSTOS.includes(imposto))) {
      const erro = new Error("ALIQUOTA_INVALIDA");
      erro.statusCode = 400;
      throw erro;
    }
    retencoes = {};
    for (const [imposto, valor] of Object.entries(dados.retencoes)) retencoes[imposto] = validarAliquota(valor);
  }
  if (dados.liquidoModo !== undefined && !["manual", "automatico"].includes(dados.liquidoModo)) {
    const erro = new Error("MODO_LIQUIDO_INVALIDO");
    erro.statusCode = 400;
    throw erro;
  }
  if (dados.liquidoModo === "automatico" && retencoes
    && calcularRetencoes(valorContaCentavos, retencoes).liquidoCentavos !== valorLiquidoCentavos) {
    const erro = new Error("VALOR_LIQUIDO_DIVERGENTE");
    erro.statusCode = 400;
    throw erro;
  }
  return {
    ...((dados.contratoId !== undefined || dados.contrato_id !== undefined)
      ? { contratoId: normalizarTexto(dados.contratoId ?? dados.contrato_id) }
      : {}),
    competencia: normalizarTexto(dados.competencia),
    razaoSocial: normalizarTexto(dados.razaoSocial),
    empresa: normalizarTexto(dados.empresa),
    esfera: normalizarTexto(dados.esfera),
    notaFiscal: normalizarTexto(dados.notaFiscal),
    emissao: normalizarDataISO(dados.emissao),
    valorContaCentavos,
    valorLiquidoCentavos,
    ...(retencoes ? { retencoes } : {}),
    ...(dados.liquidoModo !== undefined ? { liquidoModo: dados.liquidoModo } : {}),
    status: normalizarTexto(dados.status),
    pagamento: normalizarTexto(dados.pagamento),
    dataPagamento: normalizarDataISO(dados.dataPagamento),
    observacoes: normalizarTexto(dados.observacoes),
    chaveImportacao: normalizarTexto(dados.chaveImportacao),
    origem: normalizarTexto(dados.origem) || "manual",
  };
}

function normalizarEntradaCentavos(valor) {
  if (valor === undefined || valor === null || valor === "") return 0;
  if (typeof valor === "number") return Number.isFinite(valor) && valor >= 0 ? Math.round(valor) : NaN;
  const texto = normalizarTexto(valor).replace(/\s+/g, "");
  if (!texto || texto === "-") return 0;
  if (/^\d+$/.test(texto)) return Number(texto);
  return normalizarMoedaCentavos(valor);
}
return {criarWorkbookPlanilhaPagamentosAbertos,analisarWorkbookPagamentosAbertos,montarResumoPagamentosAbertos,filtrarPagamentosAbertos,normalizarPayloadPagamento};})();
const contratos=(function(){
const CABECALHOS_PLANILHA_CONTRATOS = [
  "Órgão",
  "Contrato",
  "Descrição",
  "Validade",
  "Status",
  "Valor global",
  "Consumido",
  "Saldo",
  "% consumido",
];

async function criarWorkbookContratos(lista = [], modo = "contratos") {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Demonstração fictícia";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(modo === "vencimentos" ? "VENCIMENTOS" : "CONTRATOS");
  sheet.addRow(CABECALHOS_PLANILHA_CONTRATOS);
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
  sheet.getRow(1).height = 28;
  sheet.columns.forEach((column, index) => { column.width = [25, 19, 38, 15, 22, 17, 17, 17, 16][index]; });
  for (const column of [1, 3]) sheet.getColumn(column).alignment = { vertical: "middle", wrapText: true };
  sheet.getColumn(4).numFmt = "dd/mm/yyyy";
  for (const column of [6, 7, 8]) sheet.getColumn(column).numFmt = '"R$" #,##0.00';
  sheet.getColumn(9).numFmt = "0.00%";

  let totalGlobalCentavos = 0;
  let totalConsumidoCentavos = 0;
  let totalSaldoCentavos = 0;

  for (const item of ordenarContratosPlanilha(lista)) {
    const valorGlobalCentavos = Number(item.valorGlobalCentavos || 0);
    const valorConsumidoCentavos = Number(item.valorConsumidoCentavos || 0);
    const saldoRestanteCentavos = Number(item.saldoRestanteCentavos || 0);
    totalGlobalCentavos += valorGlobalCentavos;
    totalConsumidoCentavos += valorConsumidoCentavos;
    totalSaldoCentavos += saldoRestanteCentavos;
    const dataFinal = normalizarTexto(item.dataFinal);
    const row = sheet.addRow([
      rotuloOrgaoContrato(item.orgao) || "SEM ÓRGÃO",
      normalizarTexto(item.numeroContrato),
      normalizarTexto(item.descricao),
      /^\d{4}-\d{2}-\d{2}$/.test(dataFinal) ? new Date(`${dataFinal}T00:00:00Z`) : dataFinal,
      normalizarTexto(item.statusCalculado),
      formatarMoedaCentavos(valorGlobalCentavos),
      formatarMoedaCentavos(valorConsumidoCentavos),
      formatarMoedaCentavos(saldoRestanteCentavos),
      obterPercentualConsumidoPlanilha(valorConsumidoCentavos, valorGlobalCentavos),
    ]);
    row.height = 30;
    if (row.number % 2 === 0) row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F6FA" } };
  }

  if (sheet.rowCount > 1) sheet.autoFilter = { from: "A1", to: `I${sheet.rowCount}` };
  const total = sheet.addRow(["TOTAL GERAL", "", "", "", "",
    formatarMoedaCentavos(totalGlobalCentavos),
    formatarMoedaCentavos(totalConsumidoCentavos),
    formatarMoedaCentavos(totalSaldoCentavos),
    obterPercentualConsumidoPlanilha(totalConsumidoCentavos, totalGlobalCentavos)]);
  total.font = { bold: true };
  total.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  return workbook;
}

function ordenarContratosPlanilha(lista = []) {
  return [...(Array.isArray(lista) ? lista : [])].sort((a, b) => {
    const orgao = rotuloOrgaoContrato(a.orgao).localeCompare(rotuloOrgaoContrato(b.orgao), "pt-BR", { numeric: true, sensitivity: "base" });
    if (orgao !== 0) return orgao;
    const contrato = normalizarTexto(a.numeroContrato).localeCompare(normalizarTexto(b.numeroContrato), "pt-BR", { numeric: true, sensitivity: "base" });
    if (contrato !== 0) return contrato;
    return normalizarTexto(a.descricao).localeCompare(normalizarTexto(b.descricao), "pt-BR", { numeric: true, sensitivity: "base" });
  });
}

function rotuloOrgaoContrato(orgao) {
  return normalizarTexto(orgao).toUpperCase() === "CLIENTE JARDIM / CONTRATO" ? "CLIENTE JARDIM" : normalizarTexto(orgao);
}

function normalizarTexto(valor) {
  if (valor === undefined || valor === null) return "";
  if (typeof valor === "object") {
    if (Array.isArray(valor.richText)) return valor.richText.map((parte) => parte.text || "").join("").trim();
    if (valor.text) return normalizarTexto(valor.text);
    if (valor.result !== undefined) return normalizarTexto(valor.result);
    if (valor instanceof Date) return valor.toISOString().slice(0, 10);
  }
  return String(valor).trim();
}

function formatarMoedaCentavos(valor) {
  return Math.round(Number(valor || 0)) / 100;
}

function obterPercentualConsumidoPlanilha(valorConsumidoCentavos, valorGlobalCentavos) {
  const global = Number(valorGlobalCentavos || 0);
  if (global <= 0) return null;
  return Number(valorConsumidoCentavos || 0) / global;
}

function filtrarContratos(lista = [], filtros = {}) {
  const modo = normalizarTexto(filtros.modo || "");
  const aba = normalizarTexto(filtros.aba || "");
  const idsFiltroAtivo = Array.isArray(filtros.ids) || normalizarTexto(filtros.ids);
  const ids = new Set(normalizarListaFiltro(filtros.ids));
  return (Array.isArray(lista) ? lista : []).filter((item) => {
    if (idsFiltroAtivo && (!ids.size || !ids.has(item.id))) return false;
    if (modo === "vencimentos" || aba === "vencimentos") {
      if (!contratoEhVencimento(item)) return false;
    }
    if (filtros.orgao && rotuloOrgaoContrato(item.orgao) !== normalizarTexto(filtros.orgao)) return false;
    if (filtros.status && statusNormalizado(item.statusCalculado) !== statusNormalizado(filtros.status)) return false;
    const busca = normalizarBusca(filtros.busca || filtros.q);
    if (busca) {
      const campoBusca = normalizarTexto(filtros.campoBusca || "todos");
      let alvoTexto = [rotuloOrgaoContrato(item.orgao), item.numeroContrato, item.descricao, item.statusCalculado].join(" ");
      if (campoBusca === "orgao") alvoTexto = rotuloOrgaoContrato(item.orgao);
      else if (campoBusca === "numeroContrato") alvoTexto = item.numeroContrato;
      else if (campoBusca === "descricao") alvoTexto = item.descricao;
      else if (campoBusca === "statusCalculado") alvoTexto = item.statusCalculado;
      const alvo = normalizarBusca(alvoTexto);
      if (!alvo.includes(busca)) return false;
    }
    return true;
  });
}

function normalizarListaFiltro(valor) {
  if (Array.isArray(valor)) return valor.map(normalizarTexto).filter(Boolean);
  const texto = normalizarTexto(valor);
  return texto ? [texto] : [];
}

function contratoEhVencimento(item = {}) {
  const dias = Number(item.diasParaVencimento);
  return item.statusCalculado === "VENCIDO" || (Number.isFinite(dias) && dias <= 90);
}

function statusNormalizado(valor) {
  const chave = normalizarBusca(valor).replace(/\s+/g, "_").replace(/_do_/g, "_");
  return chave === "proximo_vencimento" ? "proximo_do_vencimento" : chave;
}

function normalizarBusca(valor) {
  return normalizarTexto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function montarResumoContratos(lista = []) {
  const itens = Array.isArray(lista) ? lista : [];
  return {
    total: itens.length,
    valorGlobalCentavos: itens.reduce((total, item) => total + Number(item.valorGlobalCentavos || 0), 0),
    valorConsumidoCentavos: itens.reduce((total, item) => total + Number(item.valorConsumidoCentavos || 0), 0),
    saldoRestanteCentavos: itens.reduce((total, item) => total + Number(item.saldoRestanteCentavos || 0), 0),
    ativos: itens.filter((item) => item.statusCalculado === "ATIVO").length,
    vencidos: itens.filter((item) => item.statusCalculado === "VENCIDO").length,
    proximosVencimento: itens.filter((item) => item.statusCalculado === "PROXIMO_VENCIMENTO" || item.statusCalculado === "PROXIMO DO VENCIMENTO").length,
    semSaldo: itens.filter((item) => item.statusCalculado === "SEM SALDO").length,
  };
}

function analisarWorkbookContratos(workbook) {
  const worksheet = workbook.worksheets.find((sheet) => normalizarBusca(sheet.name).includes("virgente"))
    || workbook.getWorksheet("CONTRATO ATUALIZADO")
    || workbook.worksheets.find((sheet) => normalizarBusca(sheet.name).includes("atualizado"))
    || workbook.worksheets[0];
  if (!worksheet) throw new Error("PLANILHA_CONTRATOS_SEM_ABA");
  const headerRowNumber = localizarCabecalho(worksheet);
  const registros = [];
  const ignoradas = [];
  const linhasDetalhe = [];
  const grupos = [];
  let grupoAtual = null;

  function iniciarGrupo(registro) {
    if (!grupoAtual || grupoAtual.orgao !== registro.orgao) {
      grupoAtual = {
        orgao: registro.orgao,
        item: registro.item,
        numeros: [],
        descricoes: [],
        dataInicio: "",
        dataFinal: "",
        vigenciaMeses: 0,
        atestado: "",
      };
      grupos.push(grupoAtual);
    }
    grupoAtual.numeros.push(registro.numeroContrato);
    grupoAtual.descricoes.push(registro.descricao);
    if (registro.dataInicio && (!grupoAtual.dataInicio || registro.dataInicio < grupoAtual.dataInicio)) grupoAtual.dataInicio = registro.dataInicio;
    if (registro.dataFinal && (!grupoAtual.dataFinal || registro.dataFinal > grupoAtual.dataFinal)) grupoAtual.dataFinal = registro.dataFinal;
    grupoAtual.vigenciaMeses = Math.max(grupoAtual.vigenciaMeses, registro.vigenciaMeses || 0);
    if (registro.atestado) grupoAtual.atestado = registro.atestado;
  }

  function linhaEhTotal(row) {
    const texto = [1, 2, 3, 4, 5, 6, 7].map((indice) => normalizarBusca(obterCelula(row, indice))).join(" ");
    return texto.includes("vlr total") || texto.includes("valor total");
  }

  function linhaEhTotalGeral(row) {
    const valorOriginal = moedaParaCentavos(obterCelula(row, 5));
    return linhaEhTotal(row) && Number.isFinite(valorOriginal) && valorOriginal > 0;
  }

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;
    if (linhaEhTotal(row) && grupoAtual) {
      if (linhaEhTotalGeral(row)) {
        ignoradas.push({ linha: rowNumber, motivo: "Total geral" });
        grupoAtual = null;
        return;
      }
      const valorGlobalCentavos = moedaParaCentavos(obterCelula(row, 7));
      if (Number.isFinite(valorGlobalCentavos) && valorGlobalCentavos > 0) {
        const registroTotal = {
          linha: rowNumber,
          item: grupoAtual.item,
          orgao: grupoAtual.orgao,
          numeroContrato: grupoAtual.numeros.join(", "),
          descricao: "Total de contratos do órgão",
          valorOriginalCentavos: valorGlobalCentavos,
          valorAditivosCentavos: 0,
          valorGlobalCentavos,
          vigenciaMeses: grupoAtual.vigenciaMeses,
          dataInicio: grupoAtual.dataInicio,
          dataFinal: grupoAtual.dataFinal,
          statusManual: "",
          atestado: grupoAtual.atestado,
          resumoOrgao: true,
        };
        registroTotal.chaveImportacao = chaveContrato({
          orgao: registroTotal.orgao,
          numeroContrato: "TOTAL",
          descricao: registroTotal.descricao,
        });
        registros.push(registroTotal);
      }
      grupoAtual = null;
      return;
    }

    const item = normalizarTexto(obterCelula(row, 1));
    const orgao = normalizarTexto(obterCelula(row, 2));
    const numeroContrato = normalizarTexto(obterCelula(row, 3));
    const descricao = normalizarTexto(obterCelula(row, 4));
    if (!orgao && !numeroContrato && !descricao) return;

    const valorOriginalCentavos = moedaParaCentavos(obterCelula(row, 5));
    const valorAditivosCentavos = moedaParaCentavos(obterCelula(row, 6));
    const valorGlobalCentavos = moedaParaCentavos(obterCelula(row, 7));
    const vigenciaMeses = Number.parseInt(normalizarTexto(obterCelula(row, 8)), 10) || 0;
    const dataInicio = normalizarData(obterCelula(row, 9));
    const dataFinal = normalizarData(obterCelula(row, 10));
    const statusManual = normalizarTexto(obterCelula(row, 11));
    const atestado = normalizarTexto(obterCelula(row, 12));

    if (!orgao || !numeroContrato || !descricao || !Number.isFinite(valorGlobalCentavos) || valorGlobalCentavos <= 0) {
      ignoradas.push({ linha: rowNumber, motivo: "Contrato sem órgão, número, descrição ou valor global válido." });
      return;
    }

    const registro = {
      linha: rowNumber,
      item,
      orgao,
      numeroContrato,
      descricao,
      valorOriginalCentavos,
      valorAditivosCentavos,
      valorGlobalCentavos,
      vigenciaMeses,
      dataInicio,
      dataFinal,
      statusManual,
      atestado,
    };
    registro.chaveImportacao = chaveContrato(registro);
    linhasDetalhe.push(registro);
    iniciarGrupo(registro);
  });

  const finais = linhasDetalhe.length ? linhasDetalhe : registros;

  return {
    resumo: {
      validos: finais.length,
      linhasIgnoradas: ignoradas.length,
      ignoradas: ignoradas.length,
      erros: ignoradas.length,
      valorGlobalCentavos: finais.reduce((total, item) => total + item.valorGlobalCentavos, 0),
    },
    registros: finais,
    ignoradas,
  };
}

function localizarCabecalho(worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(worksheet.rowCount, 20); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const valores = row.values.map(normalizarBusca);
    if (valores.some((v) => v.includes("orgao")) && valores.some((v) => v.includes("contrato"))) {
      return rowNumber;
    }
  }
  return 2;
}

function obterCelula(row, indice) {
  return row.getCell(indice).value;
}

function moedaParaCentavos(valor) {
  if (valor === undefined || valor === null || valor === "") return 0;
  if (typeof valor === "number") return Math.round(valor * 100);
  if (typeof valor === "object") {
    if (typeof valor.result === "number") return Math.round(valor.result * 100);
    if (valor.result !== undefined) return moedaParaCentavos(valor.result);
    if (typeof valor.text === "string") return moedaParaCentavos(valor.text);
    if (Array.isArray(valor.richText)) return moedaParaCentavos(valor.richText.map((parte) => parte.text || "").join(""));
  }
  const texto = normalizarTexto(valor)
    .replace(/R\$/gi, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const numero = Number(texto);
  if (!Number.isFinite(numero) || numero < 0) return NaN;
  return Math.round(numero * 100);
}

function chaveContrato(dados = {}) {
  return [dados.orgao, dados.numeroContrato, dados.descricao].map(normalizarBusca).join("|");
}

function normalizarData(valor) {
  if (!valor) return "";
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) return valor.toISOString().slice(0, 10);
  if (typeof valor === "number" && Number.isFinite(valor)) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    excelEpoch.setUTCDate(excelEpoch.getUTCDate() + Math.floor(valor));
    return excelEpoch.toISOString().slice(0, 10);
  }
  const texto = normalizarTexto(valor);
  const br = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (br) {
    const ano = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${ano}-${br[2].padStart(2, "0")}-${br[1].padStart(2, "0")}`;
  }
  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const data = new Date(texto);
  return Number.isNaN(data.getTime()) ? "" : data.toISOString().slice(0, 10);
}
return {criarWorkbookContratos,filtrarContratos,montarResumoContratos,analisarWorkbookContratos};})();
const ordens=(function(){
const publicBaseUrl='';
const TEXTO_DASHBOARD_IMPORTACAO = { ignorarDatas: true };
function obterNomeClienteTotaisPadrao(valor){return String(valor||'').trim();}
const COLUNAS_PLANILHA_FINANCEIRA_MODELO = [
  { key: "numeroOS", header: "OS", width: 9.2 },
  { key: "solicitante", header: "Solicitante", width: 26.4 },
  { key: "localEvento", header: "Local do Evento", width: 51.4 },
  { key: "nomeEvento", header: "Evento", width: 36 },
  { key: "dataMontagem", header: "Data da Montagem", width: 12.4 },
  { key: "dataDesmontagem", header: "Data da Desmontagem", width: 16.2 },
  { key: "diarias", header: "Diárias", width: 9 },
  { key: "quantidadeMaterial", header: "Qty de Material", width: 10.4 },
  { key: "descricaoMaterial", header: "Descrição do Material", width: 24.5 },
  { key: "valorUnitario", header: "Valor Unitário", width: 13.2 },
  { key: "valorTotalUnitario", header: "Valor Total Unitário", width: 14.2 },
  { key: "valorTotal", header: "Valor Total", width: 16 },
  { key: "statusFinal", header: "Status Final", width: 18.4, hidden: true },
];

const TOTAL_COLUNAS_PLANILHA_FINANCEIRA = COLUNAS_PLANILHA_FINANCEIRA_MODELO.length;

const MESES_PLANILHA_FINANCEIRA = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const PRIMEIRA_LINHA_DADOS_PLANILHA_FINANCEIRA = 31;

async function criarWorkbookPlanilha(lista, nomeAba = "OS") {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Demonstração fictícia";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(nomeAba, {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = [
    { header: "Número da OS", key: "numeroOS", width: 16, minWidth: 14, maxWidth: 18 },
    { header: "Evento", key: "nomeEvento", width: 28, minWidth: 24, maxWidth: 42 },
    { header: "Solicitante", key: "solicitante", width: 24, minWidth: 18, maxWidth: 28 },
    { header: "Responsável do Evento", key: "responsavelEvento", width: 24, minWidth: 18, maxWidth: 30 },
    { header: "Telefone", key: "telefoneEvento", width: 18, minWidth: 16, maxWidth: 24 },
    { header: "Local", key: "localEvento", width: 30, minWidth: 26, maxWidth: 42 },
    { header: "Período", key: "periodoEvento", width: 22, minWidth: 18, maxWidth: 26 },
    { header: "Data Inicial", key: "dataInicioEvento", width: 16, minWidth: 14, maxWidth: 18 },
    { header: "Data Final", key: "dataFimEvento", width: 16, minWidth: 14, maxWidth: 18 },
    { header: "Horário de Início", key: "horarioInicioEvento", width: 16, minWidth: 14, maxWidth: 18 },
    { header: "Quantidade de Diárias", key: "quantidadeDiarias", width: 16, minWidth: 14, maxWidth: 20 },
    { header: "Status", key: "status", width: 16, minWidth: 14, maxWidth: 18 },
    { header: "Orçamento", key: "orcamento", width: 16, minWidth: 14, maxWidth: 18 },
    { header: "Materiais", key: "materiais", width: 32, minWidth: 24, maxWidth: 42 },
    { header: "Observações", key: "observacoes", width: 32, minWidth: 24, maxWidth: 42 },
    { header: "Obs. Aprovação", key: "observacaoAprovacao", width: 24, minWidth: 20, maxWidth: 32 },
    { header: "Responsável", key: "responsavel", width: 18, minWidth: 16, maxWidth: 24 },
    { header: "Criado em", key: "criadoEm", width: 20, minWidth: 18, maxWidth: 24 },
    { header: "Atualizado em", key: "atualizadoEm", width: 20, minWidth: 18, maxWidth: 24 },
    { header: "Arquivo do Solicitante", key: "arquivoSolicitanteNome", width: 28, minWidth: 22, maxWidth: 36 },
    { header: "Link do Arquivo", key: "arquivoSolicitanteUrl", width: 34, minWidth: 24, maxWidth: 44 },
  ];

  const listaOrdenada = [...(Array.isArray(lista) ? lista : [])].sort(compararNumeroOSCrescente);

  listaOrdenada.forEach((os) => {
    const linhaPlanilha = mapearOSParaLinhaPlanilha(os);
    const row = worksheet.addRow(linhaPlanilha);

    if (linhaPlanilha.arquivoSolicitanteNome && linhaPlanilha.arquivoSolicitanteUrl) {
      aplicarHyperlinkExcel(
        row.getCell("arquivoSolicitanteNome"),
        linhaPlanilha.arquivoSolicitanteUrl,
        linhaPlanilha.arquivoSolicitanteNome
      );
    }

    if (linhaPlanilha.arquivoSolicitanteUrl) {
      aplicarHyperlinkExcel(
        row.getCell("arquivoSolicitanteUrl"),
        linhaPlanilha.arquivoSolicitanteUrl,
        "Abrir arquivo"
      );
    }
  });

  worksheet.columns.forEach((column) => {
    const headerLength = String(column.header || "").length + 4;
    let maior = headerLength;

    column.eachCell({ includeEmpty: true }, (cell, rowNumber) => {
      if (rowNumber === 1) return;
      const texto = String(cell.value ?? "");
      const maiorLinha = texto
        .split(/\r?\n/)
        .reduce((acc, linha) => Math.max(acc, linha.length), 0);
      maior = Math.max(maior, maiorLinha + 2);
    });

    const minWidth = column.minWidth || 12;
    const maxWidth = column.maxWidth || 40;
    column.width = Math.max(minWidth, Math.min(maxWidth, maior));
  });

  const cabecalho = worksheet.getRow(1);
  cabecalho.font = { bold: true, color: { argb: "FFFFFFFF" } };
  cabecalho.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0F172A" },
  };
  cabecalho.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  cabecalho.height = 24;

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.alignment = {
        vertical: "top",
        wrapText: true,
      };
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });

    if (rowNumber > 1) {
      let altura = 22;

      row.eachCell((cell, colNumber) => {
        const largura = worksheet.getColumn(colNumber).width || 20;
        altura = Math.max(altura, estimarAlturaLinha(cell.value, largura));
      });

      row.height = altura;
    }
  });

  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columnCount },
  };

  return workbook;
}

function compararNumeroOSCrescente(a, b) {
  const numeroA = normalizarTexto(a?.numeroOS);
  const numeroB = normalizarTexto(b?.numeroOS);

  const aNumerico = /^\d+$/.test(numeroA);
  const bNumerico = /^\d+$/.test(numeroB);

  if (aNumerico && bNumerico) {
    return Number(numeroA) - Number(numeroB);
  }

  return numeroA.localeCompare(numeroB, "pt-BR", { numeric: true, sensitivity: "base" });
}

function normalizarTexto(valor) {
  if (valor === undefined || valor === null) return "";
  return String(valor).trim();
}

function mapearOSParaLinhaPlanilha(os) {
  const arquivoSolicitante = obterArquivoSolicitanteOS(os);

  return {
    numeroOS: normalizarTexto(os?.numeroOS),
    nomeEvento: normalizarTexto(os?.nomeEvento),
    solicitante: normalizarTexto(os?.solicitante),
    responsavelEvento: normalizarTexto(os?.responsavelEvento),
    telefoneEvento: normalizarTexto(os?.telefoneEvento),
    localEvento: normalizarTexto(os?.localEvento),
    periodoEvento: obterPeriodoExibicaoOS(os),
    dataInicioEvento: formatarDataPlanilha(os?.dataInicioEvento),
    dataFimEvento: formatarDataPlanilha(os?.dataFimEvento),
    horarioInicioEvento: normalizarTexto(os?.horarioInicioEvento),
    quantidadeDiarias: Number.isInteger(Number(os?.quantidadeDiarias)) ? Number(os.quantidadeDiarias) : 0,
    status: formatarStatus(os?.status),
    orcamento: normalizarTexto(os?.orcamento),
    materiais: normalizarTexto(os?.materiais),
    observacoes: normalizarTexto(os?.observacoes),
    observacaoAprovacao: normalizarTexto(os?.observacaoAprovacao),
    responsavel: normalizarTexto(os?.responsavel),
    criadoEm: formatarDataPlanilha(os?.criadoEm),
    atualizadoEm: formatarDataPlanilha(os?.atualizadoEm),
    arquivoSolicitanteNome: normalizarTexto(arquivoSolicitante?.nomeOriginal),
    arquivoSolicitanteUrl: obterLinkArquivoSolicitante(arquivoSolicitante),
  };
}

function obterArquivoSolicitanteOS(os) {
  return os?.osSolicitanteArquivo || os?.arquivoSolicitante || null;
}

function obterPeriodoExibicaoOS(os) {
  const periodoTexto = normalizarTexto(os?.periodoEvento);
  if (periodoTexto) return periodoTexto;

  return montarPeriodoAutomatico(os?.dataInicioEvento, os?.dataFimEvento);
}

function montarPeriodoAutomatico(dataInicioEvento, dataFimEvento) {
  const inicio = normalizarDataISO(dataInicioEvento);
  const fim = normalizarDataISO(dataFimEvento);

  if (!inicio && !fim) return "";

  if (inicio && fim) {
    if (inicio === fim) {
      return formatarDataCurta(inicio);
    }
    return `${formatarDataCurta(inicio)} a ${formatarDataCurta(fim)}`;
  }

  if (inicio) {
    return formatarDataCurta(inicio);
  }

  return formatarDataCurta(fim);
}

function normalizarDataISO(valor) {
  const texto = normalizarTexto(valor);
  if (!texto) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return texto;
  }

  const data = new Date(texto);
  if (isNaN(data.getTime())) return "";

  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");

  return `${ano}-${mes}-${dia}`;
}

function formatarDataCurta(dataISO) {
  const texto = normalizarTexto(dataISO);
  if (!texto) return "";

  const partes = texto.split("-");
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  const data = new Date(texto);
  if (isNaN(data.getTime())) return texto;

  return data.toLocaleDateString("pt-BR");
}

function formatarDataPlanilha(valor) {
  const texto = normalizarTexto(valor);
  if (!texto) return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    return formatarDataCurta(texto);
  }

  return formatarDataHora(texto);
}

function formatarDataHora(iso) {
  if (!iso) return "";
  const data = new Date(iso);

  if (isNaN(data.getTime())) return iso;

  return data.toLocaleString("pt-BR");
}

function formatarStatus(status) {
  const mapa = {
    pendente: "Pendente",
    autorizado: "Autorizado",
    em_execucao: "Em execução",
    na_rua: "Na rua",
    executado: "Executado",
    recusado: "Recusado",
  };

  return mapa[status] || status;
}

function obterLinkArquivoSolicitante(arquivoSolicitante) {
  const urlRelativa = normalizarTexto(arquivoSolicitante?.url);
  if (!urlRelativa) return "";

  if (/^https?:\/\//i.test(urlRelativa)) {
    return urlRelativa;
  }

  return `${publicBaseUrl}${urlRelativa.startsWith("/") ? "" : "/"}${urlRelativa}`;
}

function aplicarHyperlinkExcel(cell, destino, textoExibicao) {
  const link = normalizarTexto(destino);
  if (!link) return;

  cell.value = {
    text: normalizarTexto(textoExibicao) || link,
    hyperlink: link,
    tooltip: link,
  };
  cell.font = {
    color: { argb: "FF2563EB" },
    underline: true,
  };
}

function estimarAlturaLinha(texto, larguraColuna = 20) {
  const conteudo = String(texto ?? "");
  if (!conteudo) return 22;

  const linhas = conteudo.split(/\r?\n/);
  let totalLinhas = 0;

  linhas.forEach((linha) => {
    const tamanho = linha.length || 1;
    totalLinhas += Math.max(1, Math.ceil(tamanho / Math.max(larguraColuna - 2, 8)));
  });

  return Math.min(Math.max(22, totalLinhas * 16), 120);
}

async function criarWorkbookPlanilhaFinanceira(lista) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Demonstração fictícia";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet(`Precificação - ${new Date().getFullYear()}`);

  COLUNAS_PLANILHA_FINANCEIRA_MODELO.forEach((coluna, indice) => {
    const column = worksheet.getColumn(indice + 1);
    column.key = coluna.key;
    column.width = coluna.width;
    column.hidden = Boolean(coluna.hidden);
  });

  worksheet.getRow(3).values = COLUNAS_PLANILHA_FINANCEIRA_MODELO.map((coluna) => coluna.header);

  const listaOrdenada = deduplicarPrecificacoesPorOS(lista).sort((a, b) => {
    return compararNumeroOSCrescente({ numeroOS: a.numeroOS }, { numeroOS: b.numeroOS });
  });

  const totaisPorMes = new Array(12).fill(0);
  const totalGeral = listaOrdenada.reduce((total, precificacao) => {
    const valorTotal = prepararItensPlanilhaFinanceira(precificacao).valorTotalOS;
    const mes = obterMesPlanilhaFinanceira(precificacao?.dataEvento);
    if (mes >= 0) totaisPorMes[mes] += valorTotal;
    return total + valorTotal;
  }, 0);

  worksheet.getCell("I5").value = "Total Geral";
  worksheet.getCell("K5").value = totalGeral;

  MESES_PLANILHA_FINANCEIRA.forEach((mes, indice) => {
    const linha = 7 + indice * 2;
    worksheet.mergeCells(`K${linha}:L${linha}`);
    worksheet.getCell(`I${linha}`).value = mes;
    worksheet.getCell(`K${linha}`).value = totaisPorMes[indice];
  });

  let linhaAtual = PRIMEIRA_LINHA_DADOS_PLANILHA_FINANCEIRA;

  listaOrdenada.forEach((precificacao) => {
    const dadosPlanilha = prepararItensPlanilhaFinanceira(precificacao);
    const itens = dadosPlanilha.itens;

    const linhaInicialOS = linhaAtual;
    const diarias = dadosPlanilha.diarias;
    const valorTotalOS = dadosPlanilha.valorTotalOS;

    itens.forEach((item, indiceItem) => {
      const row = worksheet.getRow(linhaAtual);
      const quantidade = item.quantidade === "" ? "" : numeroPlanilhaFinanceira(item.quantidade);
      const valorUnitario = item.valorUnitario === "" ? "" : numeroPlanilhaFinanceira(item.valorUnitario);
      const subtotalCalculado = item.subtotalPlanilha === "" ? "" : numeroPlanilhaFinanceira(item.subtotalPlanilha);

      if (indiceItem === 0) {
        row.getCell("numeroOS").value = normalizarTexto(precificacao.numeroOS);
        row.getCell("solicitante").value = normalizarTexto(precificacao.cliente);
        row.getCell("localEvento").value = normalizarTexto(precificacao.localEvento);
        row.getCell("nomeEvento").value = normalizarTexto(precificacao.nomeEvento);
        row.getCell("dataMontagem").value = formatarDataPlanilhaCurta(precificacao.dataEvento);
        row.getCell("dataDesmontagem").value = formatarDataPlanilhaCurta(precificacao.dataFimEvento);
        row.getCell("diarias").value = diarias;
        row.getCell("valorTotal").value = valorTotalOS;
        row.getCell("statusFinal").value = obterSituacaoPrecificacao(precificacao);
      }

      row.getCell("quantidadeMaterial").value = quantidade;
      row.getCell("descricaoMaterial").value = normalizarTexto(item.descricao);
      row.getCell("valorUnitario").value = valorUnitario;
      row.getCell("valorTotalUnitario").value = subtotalCalculado;
      linhaAtual += 1;
    });

    const linhaFinalOS = linhaAtual - 1;
    if (linhaFinalOS > linhaInicialOS) {
      ["A", "B", "C", "D", "E", "F", "G", "L", "M"].forEach((coluna) => {
        worksheet.mergeCells(`${coluna}${linhaInicialOS}:${coluna}${linhaFinalOS}`);
      });
    }

    linhaAtual += 1;
  });

  aplicarEstiloWorksheetFinanceira(worksheet, Math.max(linhaAtual - 1, PRIMEIRA_LINHA_DADOS_PLANILHA_FINANCEIRA));
  return workbook;
}

function deduplicarPrecificacoesPorOS(lista) {
  const unicas = new Map();

  (Array.isArray(lista) ? lista : []).forEach((item) => {
    const chave = obterChavePrecificacaoUnica(item);
    if (!chave || unicas.has(chave)) return;
    unicas.set(chave, item);
  });

  return Array.from(unicas.values());
}

function obterChavePrecificacaoUnica(item) {
  const osId = normalizarTexto(item?.osId);
  if (osId) return `os:${osId}`;

  const id = normalizarTexto(item?.id);
  if (id) return `id:${id}`;

  const numeroOS = normalizarTexto(item?.numeroOS).toLowerCase();
  return numeroOS ? `numero:${numeroOS}` : "";
}

function prepararItensPlanilhaFinanceira(precificacao) {
  const diarias = obterDiariasPlanilhaFinanceira(precificacao);
  const itensOriginais = Array.isArray(precificacao?.itens) ? precificacao.itens : [];
  const valorTotalOS = arredondarPlanilhaFinanceira(obterValorTotalPrecificacao(precificacao));
  const itens = itensOriginais.length
    ? itensOriginais.map((item) => ({
        ...item,
        subtotalPlanilha: arredondarPlanilhaFinanceira(obterSubtotalItemPlanilhaFinanceira(item, diarias)),
      }))
    : [];

  const somaItens = arredondarPlanilhaFinanceira(
    itens.reduce((total, item) => total + numeroPlanilhaFinanceira(item.subtotalPlanilha), 0)
  );
  const diferenca = arredondarPlanilhaFinanceira(valorTotalOS - somaItens);

  if (!itens.length && valorTotalOS !== 0) {
    itens.push({
      descricao: "Valor final",
      quantidade: "",
      valorUnitario: "",
      subtotalPlanilha: valorTotalOS,
    });
  } else if (diferenca !== 0) {
    itens.push({
      descricao: "Ajuste financeiro",
      quantidade: "",
      valorUnitario: "",
      subtotalPlanilha: diferenca,
    });
  }

  if (!itens.length) {
    itens.push({ descricao: "", quantidade: "", valorUnitario: "", subtotalPlanilha: "" });
  }

  return {
    diarias,
    itens,
    valorTotalOS: arredondarPlanilhaFinanceira(
      itens.reduce((total, item) => total + numeroPlanilhaFinanceira(item.subtotalPlanilha), 0)
    ),
  };
}

function obterDiariasPlanilhaFinanceira(precificacao) {
  const quantidadeDiarias = normalizarQuantidadeDiarias(precificacao?.quantidadeDiarias, 0);
  return Number.isFinite(quantidadeDiarias) && quantidadeDiarias > 0 ? quantidadeDiarias : 1;
}

function normalizarQuantidadeDiarias(valor, fallback = 0) {
  const texto = normalizarTexto(valor);
  if (!texto) {
    const fallbackNumero = Number(fallback);
    return Number.isInteger(fallbackNumero) && fallbackNumero >= 0 ? fallbackNumero : 0;
  }

  const numero = Number(texto);
  if (!Number.isInteger(numero) || numero < 0) {
    return NaN;
  }

  return numero;
}

function arredondarPlanilhaFinanceira(valor) {
  return Math.round(numeroPlanilhaFinanceira(valor) * 100) / 100;
}

function numeroPlanilhaFinanceira(valor) {
  if (valor === "" || valor === undefined || valor === null) return 0;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : 0;
}

function obterValorTotalPrecificacao(precificacao) {
  const valorFinal = valorFinanceiroSeguro(precificacao?.valorFinal);
  if (valorFinal > 0) return valorFinal;

  const itens = Array.isArray(precificacao?.itens) ? precificacao.itens : [];
  return itens.reduce((total, item) => total + valorFinanceiroSeguro(item?.subtotal), 0);
}

function valorFinanceiroSeguro(valor) {
  const numero = Number(valor || 0);
  return Number.isFinite(numero) && numero >= 0 ? numero : 0;
}

function obterSubtotalItemPlanilhaFinanceira(item, diarias) {
  const subtotal = numeroPlanilhaFinanceira(item?.subtotal);
  if (subtotal !== 0) return subtotal;
  return numeroPlanilhaFinanceira(item?.quantidade)
    * numeroPlanilhaFinanceira(item?.valorUnitario)
    * numeroPlanilhaFinanceira(diarias || 1);
}

function obterMesPlanilhaFinanceira(valor) {
  const iso = normalizarDataISO(valor);
  if (!iso) return -1;
  const mes = Number(iso.slice(5, 7));
  return Number.isInteger(mes) && mes >= 1 && mes <= 12 ? mes - 1 : -1;
}

function formatarDataPlanilhaCurta(valor) {
  const texto = normalizarTexto(valor);
  if (!texto) return "";

  let ano;
  let mes;
  let dia;

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) {
    [ano, mes, dia] = texto.split("-");
  } else {
    const data = new Date(texto);
    if (isNaN(data.getTime())) return texto;
    ano = String(data.getFullYear());
    mes = String(data.getMonth() + 1).padStart(2, "0");
    dia = String(data.getDate()).padStart(2, "0");
  }

  return `${dia}/${mes}/${ano.slice(-2)}`;
}

function obterSituacaoPrecificacao(item) {
  if (item?.situacaoPrecificacao === "doacao" || item?.tipoPrecificacao === "doacao" || item?.doacao === true) return "Doação";
  return valorFinanceiroSeguro(item?.valorFinal) > 0 ? "Já precificada" : "Pendente";
}

function aplicarEstiloWorksheetFinanceira(worksheet, ultimaLinhaDados) {
  const verdeSuave = "FFCDE0CD";
  const azulClaro = "FFD9EAF7";
  const moeda = '"R$" #,##0.00';
  const ultimaColuna = worksheet.getColumn(TOTAL_COLUNAS_PLANILHA_FINANCEIRA).letter;

  worksheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: {
      left: 0.4,
      right: 0.4,
      top: 0.5,
      bottom: 0.5,
      header: 0.2,
      footer: 0.2,
    },
  };

  worksheet.views = [{ state: "frozen", ySplit: 3 }];

  worksheet.mergeCells(`A1:${ultimaColuna}1`);
  worksheet.mergeCells(`A2:${ultimaColuna}2`);
  worksheet.mergeCells("K5:L5");

  worksheet.getCell("A1").value = "CONTROLE GERAL DE EVENTOS";
  worksheet.getCell("A2").value = `PRECIFICAÇÃO E COBRANÇA - ${new Date().getFullYear()}`;

  worksheet.getRow(1).height = 30;
  worksheet.getRow(2).height = 32.5;
  worksheet.getRow(3).height = 39.75;

  [1, 2].forEach((linha) => {
    aplicarEstiloFaixaFinanceira(worksheet, linha, 1, TOTAL_COLUNAS_PLANILHA_FINANCEIRA, {
      fill: verdeSuave,
      font: { bold: true, size: 14, color: { argb: "FF000000" } },
      alignment: { vertical: "middle", horizontal: "center", wrapText: true },
    });
  });

  aplicarEstiloFaixaFinanceira(worksheet, 3, 1, TOTAL_COLUNAS_PLANILHA_FINANCEIRA, {
    fill: verdeSuave,
    font: { bold: true, size: 10, color: { argb: "FF000000" } },
    alignment: { vertical: "middle", horizontal: "center", wrapText: true },
  });

  aplicarEstiloFaixaFinanceira(worksheet, 5, 9, 12, {
    fill: verdeSuave,
    font: { bold: true, size: 14, color: { argb: "FF000000" } },
    alignment: { vertical: "middle", horizontal: "center", wrapText: true },
    numFmt: moeda,
  });

  MESES_PLANILHA_FINANCEIRA.forEach((_, indice) => {
    const linha = 7 + indice * 2;
    aplicarEstiloFaixaFinanceira(worksheet, linha, 9, 12, {
      fill: azulClaro,
      font: { bold: true, size: 11, color: { argb: "FF000000" } },
      alignment: { vertical: "middle", horizontal: "center", wrapText: true },
      numFmt: moeda,
    });
  });

  for (let linha = PRIMEIRA_LINHA_DADOS_PLANILHA_FINANCEIRA; linha <= ultimaLinhaDados; linha += 1) {
    const row = worksheet.getRow(linha);
    row.height = 25;
    row.eachCell({ includeEmpty: true }, (cell, coluna) => {
      aplicarBordaFinanceira(cell);
      cell.alignment = {
        vertical: "middle",
        horizontal: coluna >= 7 ? "center" : "left",
        wrapText: true,
      };
      if ([10, 11, 12].includes(coluna)) cell.numFmt = moeda;
      if ([5, 6].includes(coluna)) cell.numFmt = "dd/mm/yy";
    });
  }

  worksheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3, column: TOTAL_COLUNAS_PLANILHA_FINANCEIRA },
  };
}

function aplicarEstiloFaixaFinanceira(worksheet, linha, colInicio, colFim, opcoes = {}) {
  const row = worksheet.getRow(linha);
  for (let coluna = colInicio; coluna <= colFim; coluna += 1) {
    const cell = row.getCell(coluna);
    aplicarBordaFinanceira(cell);
    if (opcoes.fill) aplicarPreenchimento(cell, opcoes.fill);
    if (opcoes.font) cell.font = opcoes.font;
    if (opcoes.alignment) cell.alignment = opcoes.alignment;
    if (opcoes.numFmt) cell.numFmt = opcoes.numFmt;
  }
}

function aplicarBordaFinanceira(cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FF000000" } },
    left: { style: "thin", color: { argb: "FF000000" } },
    bottom: { style: "thin", color: { argb: "FF000000" } },
    right: { style: "thin", color: { argb: "FF000000" } },
  };
}

function aplicarPreenchimento(cell, argb) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb },
  };
}

async function criarWorkbookHistoricoSistema(lista = [], modo = "historico") {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Demonstração fictícia";
  workbook.created = new Date();
  const worksheet = workbook.addWorksheet("HISTORICO");
  const cabecalhos = ["Data/hora", "OS", "Evento", "Solicitante", "Ação", "Alterado por", "Detalhe", "Observação"];
  let linhaAtual = 1;
  let totalGeral = 0;

  agruparHistoricoPorData(lista).forEach(([data, itens]) => {
    const titulo = worksheet.getRow(linhaAtual);
    titulo.getCell(1).value = data;
    worksheet.mergeCells(linhaAtual, 1, linhaAtual, 8);
    estilizarLinhaTituloHistorico(titulo);
    linhaAtual += 1;

    const cabecalho = worksheet.getRow(linhaAtual);
    cabecalho.values = cabecalhos;
    estilizarLinhaCabecalhoHistorico(cabecalho);
    linhaAtual += 1;

    itens.forEach((item) => {
      const row = worksheet.getRow(linhaAtual);
      const dataEvento = new Date(item.data || "");
      row.values = [
        Number.isNaN(dataEvento.getTime()) ? normalizarTexto(item.data) : dataEvento,
        normalizarTexto(item.numeroOS) || "-",
        normalizarTexto(item.nomeEvento) || "-",
        normalizarTexto(item.solicitante) || "-",
        obterRotuloAcaoHistoricoSistema(item.acao) || "-",
        normalizarTexto(item.responsavel) || "-",
        normalizarTexto(item.detalhe) || "-",
        normalizarTexto(item.observacao) || "-",
      ];
      aplicarFormatoPlanilhaHistorico(row);
      linhaAtual += 1;
      totalGeral += 1;
    });

    const total = worksheet.getRow(linhaAtual);
    total.values = [`TOTAL ${data}`, `TOTAL ${data}`, `TOTAL ${data}`, `TOTAL ${data}`, itens.length];
    estilizarLinhaTotalHistorico(total);
    linhaAtual += 2;
  });

  const total = worksheet.getRow(linhaAtual);
  total.values = ["TOTAL GERAL", "TOTAL GERAL", "TOTAL GERAL", "TOTAL GERAL", totalGeral];
  estilizarLinhaTotalHistorico(total);

  aplicarEstiloPlanilhaHistorico(worksheet, linhaAtual);
  worksheet.views = [{ state: "frozen", ySplit: 0 }];
  return workbook;
}

function agruparHistoricoPorData(lista = []) {
  const grupos = new Map();
  ordenarHistoricoPlanilha(lista).forEach((item) => {
    const chave = formatarDataGrupoHistorico(item.data);
    if (!grupos.has(chave)) grupos.set(chave, []);
    grupos.get(chave).push(item);
  });
  return [...grupos.entries()];
}

function ordenarHistoricoPlanilha(lista = []) {
  return [...(Array.isArray(lista) ? lista : [])].sort((a, b) => {
    const data = (Date.parse(b.data || "") || 0) - (Date.parse(a.data || "") || 0);
    if (data !== 0) return data;
    return normalizarTexto(a.numeroOS).localeCompare(normalizarTexto(b.numeroOS), "pt-BR", { numeric: true, sensitivity: "base" });
  });
}

function formatarDataGrupoHistorico(valor) {
  const iso = obterDataISOHistorico(valor);
  return iso ? formatarDataCurta(iso) : "SEM DATA";
}

function obterDataISOHistorico(valor) {
  const texto = normalizarTexto(valor);
  if (!texto) return "";
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return "";
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(data.getDate()).padStart(2, "0")}`;
}

function estilizarLinhaTituloHistorico(row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F172A" } };
  row.alignment = { vertical: "middle", horizontal: "center" };
}

function estilizarLinhaCabecalhoHistorico(row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  row.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
}

function obterRotuloAcaoHistoricoSistema(acao) {
  const texto = normalizarTexto(acao);
  const chave = obterChaveAcaoHistoricoSistema(texto);
  const rotulos = {
    "edicao da os": "Edição da OS",
    "exclusao da os": "Exclusão da OS",
    "mudanca de status": "Mudança de status",
    "observacao da os": "Observação da OS",
    "restauracao da lixeira": "Restauração da lixeira",
  };
  return rotulos[chave] || texto;
}

function obterChaveAcaoHistoricoSistema(acao) {
  return normalizarTextoBuscaFlexivel(acao);
}

function normalizarTextoBuscaFlexivel(valor) {
  return normalizarTexto(valor)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function aplicarFormatoPlanilhaHistorico(row) {
  row.getCell(1).numFmt = "dd/mm/yyyy hh:mm";
}

function estilizarLinhaTotalHistorico(row) {
  row.font = { bold: true };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
}

function aplicarEstiloPlanilhaHistorico(worksheet, ultimaLinha) {
  worksheet.columns = [
    { width: 20 },
    { width: 14 },
    { width: 26 },
    { width: 24 },
    { width: 24 },
    { width: 22 },
    { width: 46 },
    { width: 46 },
  ];
  for (let linha = 1; linha <= ultimaLinha; linha += 1) {
    const row = worksheet.getRow(linha);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9E2EC" } },
        left: { style: "thin", color: { argb: "FFD9E2EC" } },
        bottom: { style: "thin", color: { argb: "FFD9E2EC" } },
        right: { style: "thin", color: { argb: "FFD9E2EC" } },
      };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
  }
}

async function criarWorkbookPlanilhaTotaisClientes(listaPrecificacoes, clientesSelecionados) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Demonstração fictícia";
  workbook.created = new Date();
  workbook.modified = new Date();

  const worksheet = workbook.addWorksheet("Totais");
  const verdeSuave = "FFCDE0CD";
  const moeda = '"R$" #,##0.00';
  const clientes = (Array.isArray(clientesSelecionados) ? clientesSelecionados : [])
    .map(normalizarTexto)
    .filter(Boolean);
  const linhasPorCliente = new Map();

  clientes.forEach((cliente) => {
    const chave = obterChaveClienteTotaisPlanilha(cliente);
    if (chave && !linhasPorCliente.has(chave)) {
      linhasPorCliente.set(chave, criarLinhaBaseTotaisCliente(chave));
    }
  });

  (Array.isArray(listaPrecificacoes) ? listaPrecificacoes : []).forEach((item) => {
    const chave = obterChaveClienteTotaisPlanilha(item?.cliente);
    if (!chave || !linhasPorCliente.has(chave)) return;

    const linha = linhasPorCliente.get(chave);
    const valor = obterValorTotalPrecificacao(item);
    const mes = obterMesPlanilhaFinanceira(item?.dataEvento);
    linha.total += valor;
    if (mes >= 0) linha.meses[mes] += valor;
  });

  const linhas = Array.from(linhasPorCliente.values()).sort((a, b) =>
    a.cliente.localeCompare(b.cliente, "pt-BR")
  );
  const totaisMeses = new Array(12).fill(0);
  const totalGeral = linhas.reduce((total, linha) => {
    linha.meses.forEach((valor, indice) => {
      totaisMeses[indice] += valor;
    });
    return total + linha.total;
  }, 0);

  worksheet.columns = [
    { key: "cliente", width: 28 },
    { key: "espaco1", width: 3 },
    { key: "total", width: 18 },
    { key: "espaco2", width: 3 },
    ...MESES_PLANILHA_FINANCEIRA.map((mes) => ({ key: mes.toLowerCase(), width: 14 })),
  ];

  worksheet.mergeCells("A1:P1");
  worksheet.getCell("A1").value = "GERAL - TOTAIS";
  worksheet.getCell("A2").value = "TOTAL GERAL";
  worksheet.getCell("C2").value = totalGeral;
  MESES_PLANILHA_FINANCEIRA.forEach((mes, indice) => {
    worksheet.getCell(2, 5 + indice).value = totaisMeses[indice];
    worksheet.getCell(4, 5 + indice).value = mes;
  });
  worksheet.getCell("A4").value = "CLIENTE";
  worksheet.getCell("C4").value = "TOTAL TRABALHADO";

  linhas.forEach((linha, indice) => {
    const row = worksheet.getRow(5 + indice);
    row.getCell(1).value = linha.cliente;
    row.getCell(3).value = Math.round(linha.total * 100) / 100;
    linha.meses.forEach((valor, mesIndice) => {
      row.getCell(5 + mesIndice).value = valor ? Math.round(valor * 100) / 100 : "";
    });
  });

  const ultimaLinha = Math.max(5 + linhas.length - 1, 5);
  [1, 2, 4].forEach((linha) => {
    aplicarEstiloFaixaFinanceira(worksheet, linha, 1, 16, {
      fill: verdeSuave,
      font: { bold: true, color: { argb: "FF000000" } },
      alignment: { vertical: "middle", horizontal: "center", wrapText: true },
      numFmt: moeda,
    });
  });

  for (let linha = 5; linha <= ultimaLinha; linha += 1) {
    aplicarEstiloFaixaFinanceira(worksheet, linha, 1, 16, {
      alignment: { vertical: "middle", horizontal: "center", wrapText: true },
      numFmt: moeda,
    });
    worksheet.getRow(linha).getCell(1).alignment = { vertical: "middle", horizontal: "left", wrapText: true };
  }

  worksheet.getColumn(2).hidden = true;
  worksheet.getColumn(4).hidden = true;
  worksheet.getRow(1).height = 28;
  worksheet.getRow(4).height = 26;
  worksheet.views = [{ state: "frozen", ySplit: 4 }];

  return workbook;
}

function criarLinhaBaseTotaisCliente(nome) {
  return {
    cliente: obterNomeClienteTotais(nome),
    total: 0,
    meses: new Array(12).fill(0),
  };
}

function obterNomeClienteTotais(valor) {
  return obterChaveClienteTotais(valor);
}
function obterChaveClienteTotaisPlanilha(valor){return String(valor||'').trim();}
function obterChaveClienteTotais(valor){return String(valor||'').trim();}
function normalizarSolicitantePadrao(valor){return String(valor||'').trim();}
function analisarWorkbookDashboard(workbook, listaExistente = []) {
  const worksheet = workbook.getWorksheet("Geral Geral") || workbook.worksheets[0];
  if (!worksheet) {
    const erro = new Error("PLANILHA_SEM_ABAS");
    erro.statusCode = 400;
    throw erro;
  }

  const simplificada = lerAbaSimplificadaImportacao(workbook);
  const layout = detectarLayoutImportacaoDashboard(worksheet);
  const registros = [];
  const avisos = [];
  let atual = null;
  let linhasIgnoradas = 0;
  let ultimoNumeroSequencial = null;

  worksheet.eachRow((row, rowNumber) => {
    if (layout.headerRows.has(rowNumber)) return;

    const numeroOS = resolverNumeroOSImportacao({
      row,
      rowNumber,
      worksheet,
      layout,
      ultimoNumeroSequencial,
      avisos,
    });
    const numeroSequencialAtual = /^\d+$/.test(numeroOS) ? Number(numeroOS) : null;
    const solicitante = obterTextoCelulaMestre(row, layout.solicitante, TEXTO_DASHBOARD_IMPORTACAO);
    const responsavelEvento = layout.responsavelEvento ? obterTextoCelulaMestre(row, layout.responsavelEvento, TEXTO_DASHBOARD_IMPORTACAO) : "";
    const telefoneEvento = layout.telefoneEvento ? obterTextoCelulaMestre(row, layout.telefoneEvento, TEXTO_DASHBOARD_IMPORTACAO) : "";
    const nomeEventoImportado = layout.nomeEvento ? obterTextoCelulaMestre(row, layout.nomeEvento, TEXTO_DASHBOARD_IMPORTACAO) : "";
    const localEvento = obterTextoCelulaMestre(row, layout.localEvento, TEXTO_DASHBOARD_IMPORTACAO);
    const dataInicioEvento = obterDataCelulaMestre(row, layout.dataInicioEvento);
    const dataFimEvento = obterDataCelulaMestre(row, layout.dataFimEvento);
    const quantidadeDiarias = obterNumeroCelula(row, layout.quantidadeDiarias);
    const mesReferenciaImportado = layout.mesReferencia ? obterTextoCelulaMestre(row, layout.mesReferencia, TEXTO_DASHBOARD_IMPORTACAO) : "";
    const statusLegadoImportado = layout.statusLegado ? obterTextoCelulaMestre(row, layout.statusLegado, TEXTO_DASHBOARD_IMPORTACAO) : "";
    const item = criarItemImportacaoPlanilha(row, layout);

    const iniciaOS = Boolean(
      solicitante ||
      localEvento ||
      dataInicioEvento ||
      dataFimEvento ||
      (numeroOS && !atual)
    );

    if (iniciaOS) {
      const complemento = numeroOS ? simplificada.get(numeroOS.toLowerCase()) : null;
      const statusLegado = [
        complemento?.statusD,
        complemento?.statusE,
        complemento?.statusG,
      ].map(normalizarTexto).filter(Boolean).filter((valor, indice, lista) => lista.indexOf(valor) === indice).join(" / ");

      atual = {
        linhaInicial: rowNumber,
        numeroOS,
        solicitante: solicitante || complemento?.solicitante || "",
        localEvento,
        nomeEvento: nomeEventoImportado || localEvento || solicitante || (numeroOS ? `OS ${numeroOS}` : "Evento importado"),
        responsavelEvento,
        telefoneEvento,
        dataInicioEvento,
        dataFimEvento,
        quantidadeDiarias: quantidadeDiarias === "" ? "" : quantidadeDiarias,
        categoria: complemento?.categoria || "",
        mesReferencia: mesReferenciaImportado || complemento?.mes || "",
        statusLegado: statusLegadoImportado || statusLegado,
        itens: [],
        avisos: [],
      };

      if (!numeroOS) atual.avisos.push("OS sem n\u00famero; ser\u00e1 usada chave alternativa quando poss\u00edvel.");
      if (!solicitante) atual.avisos.push("Solicitante vazio na linha inicial.");
      if (!localEvento) atual.avisos.push("Local do evento vazio na linha inicial.");
      if (!dataInicioEvento) atual.avisos.push("Data de montagem vazia ou inv\u00e1lida.");
      if (!dataFimEvento && normalizarTexto(obterValorCelulaPlanilha(row.getCell(5)))) {
        atual.avisos.push("Data de desmontagem vazia ou inv\u00e1lida.");
      }

      registros.push(atual);
      if (Number.isInteger(numeroSequencialAtual)) {
        ultimoNumeroSequencial = numeroSequencialAtual;
      }
    }

    if (item) {
      if (!atual) {
        linhasIgnoradas += 1;
        avisos.push(`Linha ${rowNumber} ignorada por n\u00e3o estar vinculada a nenhuma OS.`);
        return;
      }

      if (!item.descricao) atual.avisos.push(`Linha ${rowNumber}: item sem descrição.`);
      if (item.quantidade === "") atual.avisos.push(`Linha ${rowNumber}: item sem quantidade.`);
      atual.itens.push(item);
    } else if (!iniciaOS) {
      linhasIgnoradas += 1;
    }
  });

  const porNumero = new Map();
  const duplicadas = [];
  registros.forEach((registro) => {
    const numero = normalizarTexto(registro.numeroOS).toLowerCase();
    if (!numero) return;
    if (!porNumero.has(numero)) {
      porNumero.set(numero, []);
    }
    porNumero.get(numero).push(registro.linhaInicial);
  });
  porNumero.forEach((linhas, numero) => {
    if (linhas.length > 1) {
      duplicadas.push({ numeroOS: numero, linhas });
      avisos.push(`OS ${numero} aparece mais de uma vez na planilha; apenas linhas do mesmo evento ser\u00e3o agrupadas.`);
    }
  });

  const agrupadasPorNumero = new Map();
  const registrosAgrupados = [];
  registros.forEach((registro) => {
    const numero = normalizarTexto(registro.numeroOS).toLowerCase();
    if (!numero) {
      registrosAgrupados.push(registro);
      return;
    }

    const chaveAgrupamento = [
      numero,
      obterAnoEvento(registro),
      registro.solicitante,
      registro.localEvento,
      registro.dataInicioEvento,
    ].map((valor) => normalizarTexto(valor).toLowerCase()).join("::");

    if (!agrupadasPorNumero.has(chaveAgrupamento)) {
      agrupadasPorNumero.set(chaveAgrupamento, registro);
      registrosAgrupados.push(registro);
      return;
    }

    const principal = agrupadasPorNumero.get(chaveAgrupamento);
    principal.solicitante = principal.solicitante || registro.solicitante;
    principal.localEvento = principal.localEvento || registro.localEvento;
    principal.nomeEvento = principal.nomeEvento || registro.nomeEvento;
    principal.dataInicioEvento = principal.dataInicioEvento || registro.dataInicioEvento;
    principal.dataFimEvento = principal.dataFimEvento || registro.dataFimEvento;
    principal.quantidadeDiarias = principal.quantidadeDiarias === "" ? registro.quantidadeDiarias : principal.quantidadeDiarias;
    principal.categoria = principal.categoria || registro.categoria;
    principal.mesReferencia = principal.mesReferencia || registro.mesReferencia;
    principal.statusLegado = principal.statusLegado || registro.statusLegado;
    principal.itens.push(...registro.itens);
    principal.repetidaNaPlanilha = true;
    principal.linhasRepetidas = Array.isArray(principal.linhasRepetidas)
      ? principal.linhasRepetidas
      : [principal.linhaInicial];
    principal.linhasRepetidas.push(registro.linhaInicial);
    principal.avisos.push(`Agrupada tamb\u00e9m com a linha inicial ${registro.linhaInicial}.`, ...registro.avisos);
  });

  const registrosComAcao = registrosAgrupados.map((registro) => {
    const chaveAlternativa = obterChaveAlternativaOS(registro);
    const { os: osExistente, conflito } = encontrarOSImportacao(registro, listaExistente);
    const materiais = montarMateriaisImportados(registro.itens);

    if (conflito) {
      avisos.push(`OS ${registro.numeroOS || "sem número"} (linha ${registro.linhaInicial}): destino ambíguo; informe identificador único antes de importar.`);
    }

    return {
      ...registro,
      chaveAlternativa,
      materiais,
      acao: conflito ? "conflito" : osExistente ? "atualizar" : "criar",
      osExistenteId: osExistente?.id || "",
      osExistenteNumero: osExistente?.numeroOS || "",
      totalItens: registro.itens.length,
      incompleta: Boolean(registro.avisos.length),
      repetidaNaPlanilha: Boolean(registro.repetidaNaPlanilha),
      linhasRepetidas: Array.isArray(registro.linhasRepetidas) ? registro.linhasRepetidas : [],
    };
  });

  const porNumeroAno = new Map();
  registrosComAcao.forEach((registro) => {
    const chave = obterChaveNumeroAno(registro);
    if (!chave) return;
    if (!porNumeroAno.has(chave)) porNumeroAno.set(chave, []);
    porNumeroAno.get(chave).push(registro);
  });
  porNumeroAno.forEach((grupo) => {
    if (grupo.length < 2) return;
    const destinos = grupo.map((registro) => registro.osExistenteId).filter(Boolean);
    if (destinos.length === grupo.length && new Set(destinos).size === grupo.length) return;
    grupo.forEach((registro) => { registro.acao = "conflito"; });
    avisos.push(`OS ${grupo[0].numeroOS}: mais de um evento no mesmo ano sem destino único. Importação bloqueada.`);
  });

  const resumo = {
    totalOS: registrosComAcao.length,
    criar: registrosComAcao.filter((item) => item.acao === "criar").length,
    atualizar: registrosComAcao.filter((item) => item.acao === "atualizar").length,
    conflitos: registrosComAcao.filter((item) => item.acao === "conflito").length,
    existentes: registrosComAcao.filter((item) => item.osExistenteId).length,
    duplicadas: duplicadas.length,
    totalItens: registrosComAcao.reduce((total, item) => total + item.totalItens, 0),
    itensSemQuantidade: registrosComAcao.reduce(
      (total, item) => total + item.itens.filter((subitem) => subitem.quantidade === "").length,
      0
    ),
    itensSemDescricao: registrosComAcao.reduce(
      (total, item) => total + item.itens.filter((subitem) => !subitem.descricao).length,
      0
    ),
    incompletas: registrosComAcao.filter((item) => item.incompleta).length,
    linhasIgnoradas,
  };

  return {
    resumo,
    avisos,
    duplicadas,
    registros: registrosComAcao,
  };
}

function lerAbaSimplificadaImportacao(workbook) {
  const worksheet = workbook.getWorksheet("Simplificada ") || workbook.getWorksheet("Simplificada");
  const mapa = new Map();
  if (!worksheet) return mapa;

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber < 2) return;
    const numeroOS = obterTextoCelula(row, 1, TEXTO_DASHBOARD_IMPORTACAO);
    if (!numeroOS) return;

    mapa.set(numeroOS.toLowerCase(), {
      solicitante: obterTextoCelula(row, 2, TEXTO_DASHBOARD_IMPORTACAO),
      categoria: obterTextoCelula(row, 3, TEXTO_DASHBOARD_IMPORTACAO),
      statusD: obterTextoCelula(row, 4, TEXTO_DASHBOARD_IMPORTACAO),
      statusE: obterTextoCelula(row, 5, TEXTO_DASHBOARD_IMPORTACAO),
      mes: obterTextoCelula(row, 6, TEXTO_DASHBOARD_IMPORTACAO),
      statusG: obterTextoCelula(row, 7, TEXTO_DASHBOARD_IMPORTACAO),
    });
  });

  return mapa;
}

function obterTextoCelula(row, coluna, opcoes = {}) {
  return normalizarTextoPlanilha(obterValorCelulaPlanilha(row.getCell(coluna)), opcoes);
}

function normalizarTextoPlanilha(valor, opcoes = {}) {
  if (opcoes.ignorarDatas && valor instanceof Date) return "";
  const texto = normalizarTexto(valor);
  if (!texto || texto === "-") return "";
  return texto;
}

function obterValorCelulaPlanilha(cell) {
  const valor = cell?.value;
  if (valor === undefined || valor === null) return "";
  if (valor instanceof Date) return valor;
  if (typeof valor === "object") {
    if (valor.text !== undefined) return normalizarTexto(valor.text);
    if (valor.result !== undefined) return valor.result;
    if (Array.isArray(valor.richText)) {
      return normalizarTexto(valor.richText.map((parte) => parte.text || "").join(""));
    }
    if (valor.hyperlink && valor.text) return normalizarTexto(valor.text);
  }
  return valor;
}

function detectarLayoutImportacaoDashboard(worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(5, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const cabecalhos = Array.from({ length: 11 }, (_, indice) =>
      obterTextoCelula(row, indice + 1, TEXTO_DASHBOARD_IMPORTACAO).toLowerCase()
    );

    if (
      cabecalhos[0] === "os" &&
      cabecalhos[3].includes("nome do evento") &&
      cabecalhos[4].includes("local do evento")
    ) {
      return {
        headerRows: new Set([rowNumber]),
        numeroOS: 1,
        solicitante: 2,
        responsavelEvento: 3,
        telefoneEvento: null,
        nomeEvento: 4,
        localEvento: 5,
        mesReferencia: 6,
        dataInicioEvento: 7,
        dataFimEvento: 8,
        quantidadeDiarias: 9,
        itemQuantidade: 9,
        itemDescricao: 10,
        statusLegado: 11,
      };
    }
  }

  return {
    headerRows: new Set([1, 2]),
    numeroOS: 1,
    solicitante: 2,
    responsavelEvento: null,
    telefoneEvento: null,
    nomeEvento: null,
    localEvento: 3,
    mesReferencia: null,
    dataInicioEvento: 4,
    dataFimEvento: 5,
    quantidadeDiarias: 6,
    itemQuantidade: 7,
    itemDescricao: 8,
    statusLegado: null,
  };
}

function resolverNumeroOSImportacao({ row, rowNumber, worksheet, layout, ultimoNumeroSequencial, avisos }) {
  const numeroOS = obterTextoCelulaMestre(row, layout.numeroOS, TEXTO_DASHBOARD_IMPORTACAO);
  if (!numeroOS) return "";

  if (/^\d+$/.test(numeroOS)) return numeroOS;

  const proximaLinha = worksheet.getRow(rowNumber + 1);
  const proximoTexto = obterTextoCelulaMestre(proximaLinha, layout.numeroOS, TEXTO_DASHBOARD_IMPORTACAO);
  const proximoNumero = /^\d+$/.test(proximoTexto) ? Number(proximoTexto) : NaN;

  if (
    Number.isInteger(ultimoNumeroSequencial) &&
    Number.isInteger(proximoNumero) &&
    proximoNumero === ultimoNumeroSequencial + 2
  ) {
    const numeroInferido = String(ultimoNumeroSequencial + 1);
    avisos.push(
      `Linha ${rowNumber}: valor "${numeroOS}" na coluna OS corrigido automaticamente para ${numeroInferido} pela sequência da planilha.`
    );
    return numeroInferido;
  }

  return numeroOS;
}

function obterTextoCelulaMestre(row, coluna, opcoes = {}) {
  const cell = row.getCell(coluna);
  return celulaMescladaHerdada(cell) ? "" : normalizarTextoPlanilha(obterValorCelulaPlanilha(cell), opcoes);
}

function celulaMescladaHerdada(cell) {
  return Boolean(cell?.isMerged && cell.master && cell.master.address !== cell.address);
}

function obterDataCelulaMestre(row, coluna) {
  const cell = row.getCell(coluna);
  return celulaMescladaHerdada(cell) ? "" : normalizarDataPlanilhaImportacao(obterValorCelulaPlanilha(cell));
}

function normalizarDataPlanilhaImportacao(valor) {
  if (valor instanceof Date && !isNaN(valor.getTime())) {
    const ano = valor.getFullYear();
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return `${ano}-${mes}-${dia}`;
  }

  const texto = normalizarTexto(valor);
  if (!texto || texto === "-") return "";

  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;

  if (/^\d+(\.\d+)?$/.test(texto)) {
    const serial = Number(texto);
    if (Number.isFinite(serial) && serial > 0) {
      const data = new Date(Date.UTC(1899, 11, 30));
      data.setUTCDate(data.getUTCDate() + Math.floor(serial));
      return data.toISOString().slice(0, 10);
    }
  }

  const matchBr = texto.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (matchBr) {
    const dia = matchBr[1].padStart(2, "0");
    const mes = matchBr[2].padStart(2, "0");
    const ano = matchBr[3].length === 2 ? `20${matchBr[3]}` : matchBr[3];
    return normalizarDataISO(`${ano}-${mes}-${dia}`);
  }

  return normalizarDataISO(texto);
}

function obterNumeroCelula(row, coluna) {
  return normalizarNumeroPlanilha(obterValorCelulaPlanilha(row.getCell(coluna)));
}

function normalizarNumeroPlanilha(valor) {
  const texto = normalizarTexto(valor).replace(",", ".");
  if (!texto || texto === "-") return "";
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : "";
}

function criarItemImportacaoPlanilha(row, layout = null) {
  const colunas = layout || {
    itemDescricao: 8,
    itemQuantidade: 7,
    quantidadeDiarias: 6,
  };
  const descricao = obterTextoCelula(row, colunas.itemDescricao, TEXTO_DASHBOARD_IMPORTACAO);
  const quantidade = obterNumeroCelula(row, colunas.itemQuantidade);
  const diarias = obterNumeroCelula(row, colunas.quantidadeDiarias);

  if (!descricao && quantidade === "" && diarias === "") return null;

  return {
    linha: row.number,
    descricao,
    quantidade,
    diarias,
  };
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

function obterChaveAlternativaOS(os) {
  const partes = [
    os?.solicitante,
    os?.localEvento,
    os?.dataInicioEvento,
  ].map((item) => normalizarTexto(item).toLowerCase());

  if (partes.filter(Boolean).length < 2) return "";
  return partes.join("|");
}

function encontrarOSImportacao(registro, lista) {
  const numero = obterChaveNumeroAno(registro);
  const candidatos = numero ? lista.filter((os) => obterChaveNumeroAno(os) === numero) : [];
  if (candidatos.length === 1) return { os: candidatos[0], conflito: false };
  if (candidatos.length > 1) {
    const solicitante = normalizarTexto(registro.solicitante).toLowerCase();
    const porSolicitante = solicitante
      ? candidatos.filter((os) => normalizarTexto(os.solicitante).toLowerCase() === solicitante)
      : [];
    if (porSolicitante.length === 1) return { os: porSolicitante[0], conflito: false };
    const chave = obterChaveAlternativaOS(registro);
    const porChave = chave ? candidatos.filter((os) => obterChaveAlternativaOS(os) === chave) : [];
    if (porChave.length === 1) return { os: porChave[0], conflito: false };
    return { os: null, conflito: true };
  }

  const chave = obterChaveAlternativaOS(registro);
  const alternativas = chave ? lista.filter((os) => obterChaveAlternativaOS(os) === chave) : [];
  return { os: alternativas.length === 1 ? alternativas[0] : null, conflito: alternativas.length > 1 };
}

function obterChaveNumeroAno(item = {}) {
  const numero = normalizarTexto(item.numeroOS ?? item.numero_os).toLowerCase();
  if (!numero) return "";
  return `${numero}::${obterAnoEvento(item)}`;
}

function montarMateriaisImportados(itens) {
  return (Array.isArray(itens) ? itens : [])
    .map(obterResumoItemImportacao)
    .filter(Boolean)
    .join("\n");
}

function obterResumoItemImportacao(item) {
  const partes = [];
  if (item.quantidade !== "") partes.push(`Qtd: ${item.quantidade}`);
  if (item.diarias !== "") partes.push(`Di\u00e1rias: ${item.diarias}`);
  if (item.descricao) partes.push(item.descricao);
  return partes.join(" - ");
}

function extrairItensPlanilhaPrecificacao(workbook) {
  const worksheet = workbook.getWorksheet("Precificação") || workbook.worksheets[0];
  if (!worksheet) {
    const erro = new Error("PLANILHA_SEM_ABAS");
    erro.statusCode = 400;
    throw erro;
  }

  const layout = detectarLayoutImportacaoPrecificacao(worksheet);
  const linhas = [];
  const avisos = [];
  let numeroAtual = "";

  for (let rowNumber = layout.firstDataRow; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const numeroLinha = obterTextoCelulaMestre(row, layout.numeroOS);
    if (numeroLinha) numeroAtual = numeroLinha;

    const descricao = obterTextoCelula(row, layout.descricao);
    const diarias = obterDiariasFinanceiras(obterValorCelulaPlanilha(row.getCell(layout.diarias)), 1);
    const quantidade = obterNumeroFinanceiroCelula(row, layout.quantidade);
    const valorUnitario = obterNumeroFinanceiroCelula(row, layout.valorUnitario);
    const valorTotal = layout.valorTotal > 0 ? obterNumeroFinanceiroCelula(row, layout.valorTotal) : "";

    if (ehLinhaResumoPrecificacaoImportacao({ numeroOS: numeroLinha, descricao })) {
      continue;
    }

    const temAlgumDado = numeroLinha || descricao || quantidade !== "" || valorUnitario !== "" || valorTotal !== "";
    if (!temAlgumDado) continue;
    if (descricaoPrecificacaoPareceDataSemItem(descricao) && quantidade === "" && valorUnitario === "") {
      avisos.push(`Linha ${rowNumber}: item ignorado porque a descrição parece ser uma data, não um material.`);
      continue;
    }

    const item = {
      linha: rowNumber,
      numeroOS: numeroAtual || numeroLinha,
      descricao,
      quantidade,
      diarias,
      unidade: quantidade === "" ? "" : String(quantidade),
      valorUnitario,
      subtotal: quantidade !== "" && valorUnitario !== "" ? Math.round(quantidade * valorUnitario * diarias * 100) / 100 : valorTotal,
      valorTotalOS: valorTotal,
      observacoes: layout.observacoes ? obterTextoCelula(row, layout.observacoes) : "",
    };

    item.erros = [];
    if (!item.numeroOS) item.erros.push("OS não informada.");
    if (!item.descricao) item.erros.push("Descrição do item não informada.");
    if (item.quantidade === "") item.erros.push("Quantidade inválida ou vazia.");
    if (item.valorUnitario === "") item.erros.push("Valor unitário inválido ou vazio.");

    if (item.erros.length) {
      avisos.push(`Linha ${rowNumber}: ${item.erros.join(" ")}`);
    }

    linhas.push(item);
  }

  return { worksheetName: worksheet.name, layout, linhas, avisos };
}

function detectarLayoutImportacaoPrecificacao(worksheet) {
  for (let rowNumber = 1; rowNumber <= Math.min(40, worksheet.rowCount); rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const cabecalhos = Array.from({ length: Math.max(13, worksheet.columnCount || 0) }, (_, indice) =>
      obterTextoCelula(row, indice + 1).toLowerCase()
    );

    const colunaOS = cabecalhos.findIndex((texto) => texto === "os" || texto.includes("número da os") || texto.includes("numero da os"));
    const colunaDescricao = cabecalhos.findIndex((texto) => texto.includes("descrição") || texto.includes("descricao"));
    const colunaValor = cabecalhos.findIndex((texto) => texto.includes("valor unit"));
    const colunaQuantidade = cabecalhos.findIndex(cabecalhoEhQuantidadeMaterial);
    const colunaDiarias = cabecalhos.findIndex(cabecalhoEhDiarias);

    if (colunaOS >= 0 && colunaDescricao >= 0 && colunaValor >= 0) {
      return {
        headerRow: rowNumber,
        firstDataRow: rowNumber + 1,
        numeroOS: colunaOS + 1,
        diarias: colunaDiarias >= 0 ? colunaDiarias + 1 : 6,
        quantidade: colunaQuantidade >= 0 ? colunaQuantidade + 1 : 7,
        descricao: colunaDescricao + 1,
        valorUnitario: colunaValor + 1,
        valorTotal: cabecalhos.findIndex((texto) => texto.includes("valor total")) + 1,
        observacoes: 0,
      };
    }
  }

  return {
    headerRow: 3,
    firstDataRow: PRIMEIRA_LINHA_DADOS_PLANILHA_FINANCEIRA,
    numeroOS: 1,
    diarias: 6,
    quantidade: 7,
    descricao: 8,
    valorUnitario: 9,
    valorTotal: 10,
    observacoes: 0,
  };
}

function cabecalhoEhQuantidadeMaterial(texto) {
  if (!texto || cabecalhoEhDiarias(texto)) return false;
  return texto.includes("qty")
    || texto.includes("qtd")
    || texto.includes("quantidade material")
    || texto.includes("quantidade do material")
    || texto.includes("quantidade de material")
    || texto.includes("quantidade produto")
    || texto.includes("quantidade do produto")
    || texto.includes("quantidade de produto")
    || texto === "quantidade";
}

function cabecalhoEhDiarias(texto) {
  return texto.includes("diaria") || texto.includes("diária");
}

function obterDiariasFinanceiras(valor, fallback = 1) {
  const numero = normalizarNumeroFinanceiroPlanilha(valor);
  if (numero === "") {
    const fallbackNumero = Number(fallback);
    return Number.isFinite(fallbackNumero) && fallbackNumero > 0 ? fallbackNumero : 1;
  }
  return Number(numero) > 0 ? Number(numero) : 1;
}

function normalizarNumeroFinanceiroPlanilha(valor) {
  if (valor === undefined || valor === null || valor === "") return "";
  if (typeof valor === "number") return Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 100) / 100 : "";

  let texto = normalizarTexto(valor);
  if (!texto || texto === "-") return "";
  texto = texto.replace(/\s/g, "").replace(/^R\$/i, "");

  if (texto.includes(",") && texto.includes(".")) {
    texto = texto.replace(/\./g, "").replace(",", ".");
  } else if (texto.includes(",")) {
    texto = texto.replace(",", ".");
  }

  const numero = Number(texto);
  return Number.isFinite(numero) && numero >= 0 ? Math.round(numero * 100) / 100 : "";
}

function obterNumeroFinanceiroCelula(row, coluna) {
  return normalizarNumeroFinanceiroPlanilha(obterValorCelulaPlanilha(row.getCell(coluna)));
}

function ehLinhaResumoPrecificacaoImportacao({ numeroOS, descricao }) {
  if (normalizarTexto(numeroOS)) return false;
  const texto = normalizarTexto(descricao).toLowerCase();
  if (!texto) return false;
  return [
    "total geral",
    "janeiro",
    "fevereiro",
    "março",
    "marco",
    "abril",
    "maio",
    "junho",
    "julho",
    "agosto",
    "setembro",
    "outubro",
    "novembro",
    "dezembro",
  ].includes(texto);
}

function descricaoPrecificacaoPareceDataSemItem(valor) {
  const texto = normalizarTexto(valor);
  if (!texto) return false;
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(texto)) return true;
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return true;
  if (/^(mon|tue|wed|thu|fri|sat|sun)\s+[a-z]{3}\s+\d{1,2}\s+\d{4}/i.test(texto)) return true;

  const data = new Date(texto);
  return !Number.isNaN(data.getTime()) && /gmt|hor[áa]rio|standard|daylight|\d{4}/i.test(texto);
}
return {criarWorkbookPlanilha,criarWorkbookPlanilhaFinanceira,criarWorkbookHistoricoSistema,criarWorkbookPlanilhaTotaisClientes,analisarWorkbookDashboard,extrairItensPlanilhaPrecificacao};})();
return {pagamentos,contratos,ordens};}
return {create};
});
