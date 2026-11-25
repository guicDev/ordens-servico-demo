let historicoOriginal = [];
let historicoFiltrado = [];
let historicoEstoqueOriginal = [];
let historicoEstoqueFiltrado = [];
let abaHistoricoAtual = "todos";
let historicoEstoqueCarregado = false;
const estadoAnimacaoGraficosHistorico = { frameId: null };

function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizarBuscaHistorico(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function obterChaveAcaoHistorico(acao) {
  return normalizarBuscaHistorico(acao);
}

function lerObjetoHistorico(texto) {
  try {
    const valor = JSON.parse(texto);
    return valor && typeof valor === "object" && !Array.isArray(valor) ? valor : null;
  } catch {
    return null;
  }
}

function formatarValorHistorico(campo, valor) {
  if (valor === null || valor === undefined || valor === "") return "não informado";
  if (campo.endsWith("Centavos")) {
    return (Number(valor) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (campo === "dataPagamento" && /^\d{4}-\d{2}-\d{2}$/.test(String(valor))) {
    const [ano, mes, dia] = String(valor).split("-");
    return `${dia}/${mes}/${ano}`;
  }
  if (campo === "liquidoModo") return valor === "automatico" ? "automático" : valor === "manual" ? "manual" : String(valor);
  return String(valor);
}

function formatarDetalhePagamentoHistorico(item) {
  const depois = lerObjetoHistorico(item.detalhe);
  if (!depois) return item.detalhe || "-";
  const antes = lerObjetoHistorico(item.detalheAntes);
  const acao = obterChaveAcaoHistorico(item.acao);
  if (acao === "enviado_lixeira") return `Pagamento enviado para a lixeira: nota ${depois.notaFiscal || item.referencia || "sem número"}.`;
  if (acao === "restaurado_lixeira") return `Pagamento restaurado da lixeira: nota ${depois.notaFiscal || item.referencia || "sem número"}.`;
  if (!antes) {
    const inicio = ["criado", "importacao_criado"].includes(acao) ? "Pagamento cadastrado" : "Dados do pagamento";
    return `${inicio}: nota ${depois.notaFiscal || "sem número"}, ${depois.razaoSocial || "sem cliente"}, valor ${formatarValorHistorico("valorContaCentavos", depois.valorContaCentavos)}.`;
  }
  const campos = [
    ["notaFiscal", "Nota fiscal", true], ["razaoSocial", "Cliente"], ["competencia", "Competência", true],
    ["status", "Status"], ["pagamento", "Situação do pagamento", true],
    ["dataPagamento", "Data do pagamento", true], ["valorContaCentavos", "Valor da conta"],
    ["valorLiquidoCentavos", "Valor líquido"], ["numeroContratoInformado", "Contrato informado"],
    ["liquidoModo", "Cálculo do valor líquido"],
  ];
  const alteracoes = campos.filter(([campo]) => antes[campo] !== depois[campo]).map(([campo, nome, feminino]) =>
    `${nome} ${feminino ? "alterada" : "alterado"} para ${formatarValorHistorico(campo, depois[campo])}`);
  if (antes.contratoId !== depois.contratoId) alteracoes.push("Vínculo com contrato alterado");
  if (JSON.stringify(antes.retencoes) !== JSON.stringify(depois.retencoes)) alteracoes.push("Retenções atualizadas");
  return alteracoes.length ? `${alteracoes.join("; ")}.` : "Pagamento atualizado.";
}

function formatarDetalheHistorico(item) {
  const detalhe = String(item.detalhe || "").trim();
  if (!detalhe) return "-";
  if (item.modulo === "pagamentos") return formatarDetalhePagamentoHistorico(item);
  if (item.modulo === "acoes_massa") {
    const totais = lerObjetoHistorico(detalhe);
    if (totais) {
      const nomes = { solicitados: "solicitados", aplicados: "alterados", semAlteracao: "sem mudança", conflitos: "com conflito", bloqueados: "bloqueados", falhas: "com falha", ignorados: "ignorados" };
      return Object.entries(nomes).filter(([chave]) => Number(totais[chave]) > 0)
        .map(([chave, nome]) => `${totais[chave]} ${nome}`).join("; ") || "Nenhum registro alterado.";
    }
  }
  if (item.modulo === "contratos") {
    const [orgao, numero, descricao] = detalhe.split(" | ");
    if (numero) return `Contrato ${numero} do órgão ${orgao || "não informado"}${descricao ? `: ${descricao}` : ""}.`;
  }
  if (item.modulo === "estoque") {
    const [nome, quantidade] = detalhe.split(" | ");
    if (quantidade?.startsWith("Qtd. ")) return `${rotuloTipoMovimentoEstoque(item.acao)}: ${nome}, quantidade ${quantidade.slice(5)}.`;
  }
  if (/^Campos alterados:/i.test(detalhe)) {
    return detalhe.replace(/^Campos alterados:\s*/i, "").split(", ")
      .map((campo) => `${campo.charAt(0).toUpperCase()}${campo.slice(1)} ${/^(data|quantidade|observações|OS do solicitante)/i.test(campo) ? "alterada" : "alterado"}`).join("; ") + ".";
  }
  if (item.modulo === "precificacao" && /valor final:.*->/i.test(detalhe)) {
    return detalhe.split("; ").map((parte) => {
      const valores = parte.match(/^valor final:\s*([\d.]+)\s*->\s*([\d.]+)$/i);
      return valores
        ? `Valor final alterado de ${Number(valores[1]).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })} para ${Number(valores[2]).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`
        : parte;
    }).join("; ") + ".";
  }
  if (/^[^;]+\s->\s[^;]+$/.test(detalhe)) {
    const status = detalhe.match(/^(.+?)\s*->\s*(.+)$/);
    if (status) return `Status alterado de ${status[1]} para ${status[2]}.`;
  }
  return detalhe;
}

function obterRotuloAcaoHistorico(acao) {
  const texto = String(acao || "").trim();
  const chave = obterChaveAcaoHistorico(texto);
  const rotulos = {
    "criado": "Pagamento criado",
    "atualizado": "Pagamento atualizado",
    "situacao_pagamento_alterada": "Situação do pagamento alterada",
    "status_alterado": "Status alterado",
    "data_pagamento_alterada": "Data do pagamento alterada",
    "observacao_alterada": "Observação alterada",
    "importacao_criado": "Pagamento importado",
    "importacao_atualizado": "Pagamento atualizado pela importação",
    "enviado_lixeira": "Enviado para a lixeira",
    "restaurado_lixeira": "Restaurado da lixeira",
    "edicao da os": "Edição da OS",
    "exclusao da os": "Exclusão da OS",
    "mudanca de status": "Mudança de status",
    "observacao da os": "Observação da OS",
    "restauracao da lixeira": "Restauração da lixeira",
  };
  if (chave.startsWith("acao em massa: ")) {
    const acaoEmMassa = {
      alterar_status: "Status alterado",
      alterar_situacao: "Situação do pagamento alterada",
      definir_data_pagamento: "Data do pagamento definida",
      adicionar_observacao: "Observação adicionada",
      enviar_lixeira: "Itens enviados para a lixeira",
      restaurar: "Itens restaurados",
    }[texto.split(":").slice(1).join(":").trim()];
    if (acaoEmMassa) return acaoEmMassa;
  }
  return rotulos[chave] || texto;
}

function rotuloTipoMovimentoEstoque(tipo) {
  return {
    cadastro_item: "Cadastro",
    edicao_item: "Edição",
    entrada_manual: "Entrada manual",
    saida_manual: "Saída manual",
    saida_os: "Saída por OS",
    devolucao_os: "Devolução por OS",
    importacao_catalogo: "Importação catálogo",
  }[tipo] || tipo || "-";
}

function rotuloModuloHistorico(modulo) {
  return {
    dashboard: "Dashboard / OS",
    precificacao: "Precificação",
    pagamentos: "Pagamentos",
    contratos: "Contratos",
    estoque: "Estoque",
    lixeira: "Lixeira",
    acoes_massa: "Ações em massa",
  }[modulo] || modulo || "-";
}

function listarAcoesHistoricoUnicas(lista = historicoOriginal) {
  const mapa = new Map();
  (Array.isArray(lista) ? lista : []).forEach((item) => {
    const rotulo = obterRotuloAcaoHistorico(item.acao);
    const chave = obterChaveAcaoHistorico(rotulo);
    if (chave && !mapa.has(chave)) mapa.set(chave, rotulo);
  });
  return [...mapa.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function responsavelPlanilhaVisivel(responsavel) {
  const texto = normalizarBuscaHistorico(responsavel);
  return !texto.includes("e2e") && !texto.includes("end to end");
}

function formatarDataHoraHistorico(iso) {
  if (!iso) return "-";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR");
}

function obterDataISOHistorico(iso) {
  if (!iso) return "";
  const texto = String(iso);
  const dataIso = texto.match(/^(\d{4}-\d{2}-\d{2})/);
  if (dataIso) return dataIso[1];
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function obterTextoBuscaHistorico(item, campoBusca) {
  if (campoBusca === "referencia") return item.referencia || item.numeroOS || "";
  if (campoBusca === "numeroOS") return item.numeroOS || "";
  if (campoBusca === "nomeEvento") return item.nomeEvento || "";
  if (campoBusca === "solicitante") return item.solicitante || "";
  if (campoBusca === "responsavel") return item.responsavel || "";
  if (campoBusca === "acao") return item.acao || "";
  return [
    item.numeroOS,
    item.referencia,
    item.modulo,
    item.nomeEvento,
    item.solicitante,
    item.localEvento,
    item.acao,
    item.detalhe,
    formatarDetalheHistorico(item),
    item.observacao,
    item.responsavel,
  ].join(" ");
}

function preencherFiltroAcoesHistorico() {
  const select = document.getElementById("filtroAcaoHistorico");
  if (!select) return;
  const valorAtual = select.value;
  const acoes = listarAcoesHistoricoUnicas();
  select.innerHTML = '<option value="">Ação</option>' +
    acoes.map((acao) => `<option value="${escaparHtml(acao)}">${escaparHtml(acao)}</option>`).join("");
  const valorNormalizado = obterRotuloAcaoHistorico(valorAtual);
  select.value = acoes.includes(valorNormalizado) ? valorNormalizado : "";
}

function atualizarStatusModal(id, mensagem = "", tipo = "") {
  const elemento = document.getElementById(id);
  if (!elemento) return;
  elemento.textContent = mensagem;
  elemento.classList.remove("sucesso", "erro", "aviso");
  if (tipo) elemento.classList.add(tipo);
}

function historicoPassaFiltroData(item, dataInicial, dataFinal) {
  const dataItem = obterDataISOHistorico(item.data);
  if (!dataItem && (dataInicial || dataFinal)) return false;
  if (dataInicial && dataItem < dataInicial) return false;
  if (dataFinal && dataItem > dataFinal) return false;
  return true;
}

function filtrarHistorico() {
  const filtros = obterFiltrosHistoricoAtuais();
  const termo = normalizarBuscaHistorico(filtros.busca);

  historicoFiltrado = historicoOriginal.filter((item) => {
    if (abaHistoricoAtual === "lixeira") {
      if (item.modulo !== "lixeira" && item.modulo !== "acoes_massa") return false;
    } else if (abaHistoricoAtual !== "todos" && item.modulo !== abaHistoricoAtual) return false;
    if (filtros.acao && obterChaveAcaoHistorico(item.acao) !== obterChaveAcaoHistorico(filtros.acao)) return false;
    if (!historicoPassaFiltroData(item, filtros.dataInicial, filtros.dataFinal)) return false;
    if (!termo) return true;
    return normalizarBuscaHistorico(obterTextoBuscaHistorico(item, filtros.campoBusca)).includes(termo);
  });

  renderizarResumoHistorico();
  renderizarTabelaHistorico();
  renderizarGraficosHistorico(true);
}

function obterFiltrosHistoricoAtuais() {
  return {
    busca: document.getElementById("buscaHistorico")?.value || "",
    campoBusca: document.getElementById("campoBuscaHistorico")?.value || "todos",
    acao: document.getElementById("filtroAcaoHistorico")?.value || "",
    dataInicial: document.getElementById("dataInicialHistorico")?.value || "",
    dataFinal: document.getElementById("dataFinalHistorico")?.value || "",
  };
}

function limparFiltrosHistorico() {
  document.getElementById("buscaHistorico").value = "";
  document.getElementById("campoBuscaHistorico").value = "todos";
  document.getElementById("filtroAcaoHistorico").value = "";
  document.getElementById("dataInicialHistorico").value = "";
  document.getElementById("dataFinalHistorico").value = "";
  filtrarHistorico();
}

function selecionarAbaHistorico(aba) {
  abaHistoricoAtual = ["todos", "dashboard", "precificacao", "pagamentos", "contratos", "estoque", "lixeira"].includes(aba) ? aba : "todos";
  document.querySelectorAll("[data-modulo-historico]").forEach((botao) => {
    botao.classList.toggle("ativo", botao.dataset.moduloHistorico === abaHistoricoAtual);
  });
  document.getElementById("painelHistoricoDashboard")?.classList.remove("hidden");
  document.getElementById("painelHistoricoEstoque")?.classList.add("hidden");
  filtrarHistorico();
}

function obterTextoBuscaHistoricoEstoque(item) {
  return [
    item.itemNome,
    item.numeroOS,
    item.nomeEvento,
    item.tipo,
    rotuloTipoMovimentoEstoque(item.tipo),
    item.motivo,
    item.observacoes,
    item.descricaoOriginal,
    item.responsavel,
  ].join(" ");
}

function filtrarHistoricoEstoque() {
  const termo = normalizarBuscaHistorico(document.getElementById("buscaHistoricoEstoque")?.value || "");
  const tipo = document.getElementById("filtroTipoHistoricoEstoque")?.value || "";
  historicoEstoqueFiltrado = historicoEstoqueOriginal.filter((item) => {
    if (tipo && item.tipo !== tipo) return false;
    if (!termo) return true;
    return normalizarBuscaHistorico(obterTextoBuscaHistoricoEstoque(item)).includes(termo);
  });
  renderizarResumoHistoricoEstoque();
  renderizarTabelaHistoricoEstoque();
}

function limparFiltrosHistoricoEstoque() {
  const busca = document.getElementById("buscaHistoricoEstoque");
  const tipo = document.getElementById("filtroTipoHistoricoEstoque");
  if (busca) busca.value = "";
  if (tipo) tipo.value = "";
  filtrarHistoricoEstoque();
}

function renderizarResumoHistoricoEstoque() {
  const lista = historicoEstoqueFiltrado;
  const entradas = lista.filter((item) => item.tipo === "entrada_manual" || item.tipo === "devolucao_os").length;
  const saidas = lista.filter((item) => item.tipo === "saida_manual" || item.tipo === "saida_os").length;
  const os = new Set(lista.map((item) => item.osId || item.numeroOS).filter(Boolean));
  document.getElementById("estoqueHistTotal").textContent = lista.length;
  document.getElementById("estoqueHistEntradas").textContent = entradas;
  document.getElementById("estoqueHistSaidas").textContent = saidas;
  document.getElementById("estoqueHistOS").textContent = os.size;
  document.getElementById("contadorHistoricoEstoque").textContent = lista.length;
}

function renderizarTabelaHistoricoEstoque() {
  const tbody = document.getElementById("tabelaHistoricoEstoque");
  if (!tbody) return;
  if (!historicoEstoqueFiltrado.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="financeiro-vazio">Nenhuma movimentação de estoque encontrada.</td></tr>';
    return;
  }
  tbody.innerHTML = historicoEstoqueFiltrado.map((item) => `
    <tr>
      <td>${escaparHtml(formatarDataHoraHistorico(item.data))}</td>
      <td><strong>${escaparHtml(item.itemNome || "-")}</strong></td>
      <td><span class="historico-acao-badge">${escaparHtml(rotuloTipoMovimentoEstoque(item.tipo))}</span></td>
      <td>${escaparHtml(String(item.quantidade ?? 0))}</td>
      <td>${escaparHtml(item.numeroOS || "-")}</td>
      <td>${escaparHtml(item.responsavel || "-")}</td>
      <td class="historico-texto-longo">${escaparHtml(item.motivo || "-")}</td>
      <td class="historico-texto-longo">${escaparHtml(item.observacoes || item.descricaoOriginal || "-")}</td>
    </tr>
  `).join("");
}

async function carregarHistoricoEstoque() {
  const tbody = document.getElementById("tabelaHistoricoEstoque");
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="financeiro-vazio">Carregando...</td></tr>';
  try {
    const resposta = await fetch("/api/estoque/movimentacoes?limite=200", { cache: "no-store" });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      throw new Error(erro.erro || "Erro ao carregar histórico do estoque.");
    }
    const dados = await resposta.json();
    historicoEstoqueOriginal = Array.isArray(dados.itens) ? dados.itens : [];
    historicoEstoqueCarregado = true;
    filtrarHistoricoEstoque();
  } catch (erro) {
    historicoEstoqueOriginal = [];
    historicoEstoqueFiltrado = [];
    renderizarResumoHistoricoEstoque();
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="financeiro-vazio">${escaparHtml(erro.message || "Erro ao carregar histórico do estoque.")}</td></tr>`;
    }
  }
}

function renderizarResumoHistorico() {
  const lista = historicoFiltrado;
  const modulos = new Set(lista.map((item) => item.modulo).filter(Boolean));
  const responsaveis = new Set(lista.map((item) => item.responsavel).filter(Boolean));
  const referencias = new Set(lista.map((item) => item.referencia || item.numeroOS).filter(Boolean));

  document.getElementById("histResumoTotal").textContent = lista.length;
  document.getElementById("histResumoOS").textContent = modulos.size;
  document.getElementById("histResumoEdicoes").textContent = responsaveis.size;
  document.getElementById("histResumoStatus").textContent = referencias.size;
  document.getElementById("contadorHistorico").textContent = lista.length;
}

function renderizarTabelaHistorico() {
  const tbody = document.getElementById("tabelaHistorico");
  if (!tbody) return;

  if (!historicoFiltrado.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="financeiro-vazio">Nenhum histórico encontrado.</td></tr>';
    return;
  }

  tbody.innerHTML = historicoFiltrado.map((item) => `
    <tr>
      <td>${escaparHtml(formatarDataHoraHistorico(item.data))}</td>
      <td><strong>${escaparHtml(rotuloModuloHistorico(item.modulo))}</strong></td>
      <td>${escaparHtml(item.referencia || item.numeroOS || "-")}</td>
      <td>${escaparHtml([item.nomeEvento, item.solicitante].filter(Boolean).join(" | ") || "-")}</td>
      <td><span class="historico-acao-badge">${escaparHtml(obterRotuloAcaoHistorico(item.acao) || "-")}</span></td>
      <td>${escaparHtml(item.responsavel || "-")}</td>
      <td class="historico-texto-longo">${escaparHtml(formatarDetalheHistorico(item))}</td>
      <td class="historico-texto-longo">${escaparHtml(item.observacao || "-")}</td>
    </tr>
  `).join("");
}

function formatarDataGraficoHistorico(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(valor || ""))) return valor || "Sem data";
  const [ano, mes, dia] = valor.split("-");
  return `${dia}/${mes}/${ano.slice(2)}`;
}

function adicionarContagemHistorico(mapa, chave, incremento = 1) {
  const texto = String(chave || "").trim() || "Sem info";
  mapa.set(texto, (mapa.get(texto) || 0) + incremento);
}

function obterTopContagensHistorico(lista, obterChave, limite = 8) {
  const mapa = new Map();
  (Array.isArray(lista) ? lista : []).forEach((item) => {
    adicionarContagemHistorico(mapa, obterChave(item));
  });
  return [...mapa.entries()]
    .sort((a, b) => {
      const quantidade = Number(b[1] || 0) - Number(a[1] || 0);
      if (quantidade !== 0) return quantidade;
      return String(a[0]).localeCompare(String(b[0]), "pt-BR", { numeric: true, sensitivity: "base" });
    })
    .slice(0, limite);
}

function obterDadosPeriodoHistorico() {
  const mapa = new Map();
  historicoFiltrado.forEach((item) => {
    adicionarContagemHistorico(mapa, obterDataISOHistorico(item.data) || "Sem data");
  });

  const hoje = new Date();
  hoje.setHours(12, 0, 0, 0);

  return Array.from({ length: 8 }, (_, indice) => {
    const data = new Date(hoje);
    data.setDate(hoje.getDate() - indice);
    const chave = [
      data.getFullYear(),
      String(data.getMonth() + 1).padStart(2, "0"),
      String(data.getDate()).padStart(2, "0"),
    ].join("-");
    return [formatarDataGraficoHistorico(chave), mapa.get(chave) || 0];
  });
}

function obterRotuloAcaoGraficoHistorico(acao) {
  const rotulo = obterRotuloAcaoHistorico(acao);
  const chave = obterChaveAcaoHistorico(rotulo);
  const abreviacoes = {
    "cadastro da os": "Cad. manual",
    "edicao da os": "Edição OS",
    "exclusao da os": "Exclusão OS",
    "mudanca de status": "Mud. status",
    "importacao de planilha": "Import. planilha",
  };
  return abreviacoes[chave] || rotulo;
}

function obterChaveOSHistorico(item) {
  return String(item?.osId || item?.numeroOS || "").trim();
}

function contarOSDistintasHistorico(lista) {
  return new Set(
    (Array.isArray(lista) ? lista : [])
      .map(obterChaveOSHistorico)
      .filter(Boolean)
  ).size;
}

function obterTopOSDistintasHistorico(lista, obterChave, limite = 8) {
  const mapa = new Map();
  (Array.isArray(lista) ? lista : []).forEach((item) => {
    const chave = String(obterChave(item) || "").trim() || "Sem info";
    const os = obterChaveOSHistorico(item);
    if (!os) return;
    if (!mapa.has(chave)) mapa.set(chave, new Set());
    mapa.get(chave).add(os);
  });
  return [...mapa.entries()]
    .map(([chave, os]) => [chave, os.size])
    .sort((a, b) => {
      const quantidade = Number(b[1] || 0) - Number(a[1] || 0);
      if (quantidade !== 0) return quantidade;
      return String(a[0]).localeCompare(String(b[0]), "pt-BR", { numeric: true, sensitivity: "base" });
    })
    .slice(0, limite);
}

function obterDadosAcoesHistorico() {
  const filtros = obterFiltrosHistoricoAtuais();
  const totalOS = contarOSDistintasHistorico(historicoFiltrado);
  const porAcao = obterTopOSDistintasHistorico(
    historicoFiltrado,
    (item) => obterRotuloAcaoGraficoHistorico(item.acao),
    7
  );
  const rotuloTotal = filtros.acao ? "OS no filtro" : "OS cadastradas";
  return totalOS ? [[rotuloTotal, totalOS], ...porAcao] : porAcao;
}

function obterDadosGraficosHistorico() {
  const historicoResponsaveis = historicoFiltrado.filter((item) => responsavelPlanilhaVisivel(item.responsavel));
  return {
    periodo: obterDadosPeriodoHistorico(),
    acoes: obterDadosAcoesHistorico(),
    responsaveis: obterTopContagensHistorico(historicoResponsaveis, (item) => item.responsavel || "Sem responsável", 8),
  };
}

function desenharBarrasHistorico(canvasId, dados, opcoes = {}, progresso = 1) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(canvas.clientWidth || 360, 280);
  const linhas = Math.max(dados.length, 1);
  const cssHeight = Math.max(190, 44 * linhas + 38);
  canvas.style.height = `${cssHeight}px`;
  canvas.width = Math.round(cssWidth * dpr);
  canvas.height = Math.round(cssHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, cssWidth, cssHeight);
  ctx.strokeStyle = "#e2e8f0";
  ctx.strokeRect(0.5, 0.5, cssWidth - 1, cssHeight - 1);

  if (!dados.length) {
    ctx.fillStyle = "#64748b";
    ctx.font = "13px Arial";
    ctx.fillText("Sem dados para os filtros atuais", 16, 32);
    return;
  }

  const labelW = opcoes.labelW || 104;
  const valueW = opcoes.valueW || 70;
  const chartX = labelW;
  const chartW = Math.max(80, cssWidth - labelW - valueW - 18);
  const max = Math.max(...dados.map(([, valor]) => Number(valor || 0)), 1);
  const barH = 18;
  const gap = 24;
  const top = 26;

  ctx.strokeStyle = "#edf2f7";
  for (let i = 0; i <= 4; i += 1) {
    const x = chartX + (chartW * i / 4);
    ctx.beginPath();
    ctx.moveTo(x, 14);
    ctx.lineTo(x, cssHeight - 14);
    ctx.stroke();
  }

  dados.forEach(([label, valor], i) => {
    const y = top + i * (barH + gap);
    const larguraBase = Math.round(chartW * Number(valor || 0) / max);
    const largura = Math.max(2, Math.round(larguraBase * progresso));
    const grad = ctx.createLinearGradient(chartX, y, chartX + largura, y);
    grad.addColorStop(0, opcoes.corInicio || "#155e75");
    grad.addColorStop(1, opcoes.corFim || "#0891b2");
    ctx.fillStyle = "#0f172a";
    ctx.font = "600 12px Arial";
    ctx.fillText(String(label).slice(0, opcoes.labelMax || 17), 12, y + 14);
    ctx.fillStyle = grad;
    ctx.fillRect(chartX, y, largura, barH);
    ctx.fillStyle = "#334155";
    ctx.font = "12px Arial";
    const textoValor = opcoes.formatar ? opcoes.formatar(valor) : `${Number(valor || 0)} reg.`;
    ctx.fillText(textoValor, chartX + chartW + 10, y + 14);
  });
}

function desenharGraficosHistoricoComProgresso(graficos, progresso) {
  desenharBarrasHistorico("graficoPeriodoHistorico", graficos.periodo, { labelW: 76, corInicio: "#155e75", corFim: "#0891b2" }, progresso);
  desenharBarrasHistorico("graficoAcoesHistorico", graficos.acoes, { labelW: 104, labelMax: 15, corInicio: "#7c3aed", corFim: "#a78bfa", formatar: (valor) => `${Number(valor || 0)} OS` }, progresso);
  desenharBarrasHistorico("graficoResponsaveisHistorico", graficos.responsaveis, { labelW: 104, corInicio: "#166534", corFim: "#22c55e", formatar: (valor) => `${Number(valor || 0)} ações` }, progresso);
}

function renderizarGraficosHistorico(animar = false) {
  const graficos = obterDadosGraficosHistorico();
  if (!animar) {
    desenharGraficosHistoricoComProgresso(graficos, 1);
    return;
  }
  if (estadoAnimacaoGraficosHistorico.frameId) cancelAnimationFrame(estadoAnimacaoGraficosHistorico.frameId);
  desenharGraficosHistoricoComProgresso(graficos, 0);
  const inicio = performance.now();
  const duracaoMs = 1100;
  const passo = (agora) => {
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    const easeOut = 1 - Math.pow(1 - t, 3);
    desenharGraficosHistoricoComProgresso(graficos, easeOut);
    if (t < 1) {
      estadoAnimacaoGraficosHistorico.frameId = requestAnimationFrame(passo);
    } else {
      estadoAnimacaoGraficosHistorico.frameId = null;
    }
  };
  estadoAnimacaoGraficosHistorico.frameId = requestAnimationFrame(passo);
}

function preencherOpcoesPlanilhaHistorico() {
  const selectAcao = document.getElementById("campoAcaoPlanilhaHistorico");
  if (selectAcao) {
    const acoes = listarAcoesHistoricoUnicas();
    selectAcao.innerHTML = acoes.map((acao) => `<option value="${escaparHtml(acao)}">${escaparHtml(acao)}</option>`).join("");
    const filtroAcao = obterRotuloAcaoHistorico(document.getElementById("filtroAcaoHistorico")?.value || "");
    if (filtroAcao && acoes.includes(filtroAcao)) selectAcao.value = filtroAcao;
  }

  const selectResponsavel = document.getElementById("campoResponsavelPlanilhaHistorico");
  if (selectResponsavel) {
    const responsaveis = [...new Set(historicoOriginal.map((item) => item.responsavel).filter(Boolean))]
      .filter(responsavelPlanilhaVisivel)
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    selectResponsavel.innerHTML = responsaveis.map((responsavel) => `<option value="${escaparHtml(responsavel)}">${escaparHtml(responsavel)}</option>`).join("");
    const filtros = obterFiltrosHistoricoAtuais();
    if (filtros.campoBusca === "responsavel" && responsaveis.includes(filtros.busca)) {
      selectResponsavel.value = filtros.busca;
    }
  }

  const filtros = obterFiltrosHistoricoAtuais();
  const dataInicial = document.getElementById("campoDataInicialPlanilhaHistorico");
  const dataFinal = document.getElementById("campoDataFinalPlanilhaHistorico");
  if (dataInicial) dataInicial.value = filtros.dataInicial;
  if (dataFinal) dataFinal.value = filtros.dataFinal;
  renderizarListaPlanilhaHistorico();
}

function obterModoPlanilhaHistorico() {
  return document.querySelector('input[name="modoPlanilhaHistorico"]:checked')?.value || "contexto";
}

function atualizarModoPlanilhaHistorico() {
  const modo = obterModoPlanilhaHistorico();
  ["Contexto", "Acao", "Responsavel", "Periodo", "Selecionados"].forEach((sufixo) => {
    document.getElementById(`blocoPlanilhaHistorico${sufixo}`)?.classList.add("hidden");
  });
  const blocoAtivo = {
    contexto: "blocoPlanilhaHistoricoContexto",
    acao: "blocoPlanilhaHistoricoAcao",
    responsavel: "blocoPlanilhaHistoricoResponsavel",
    periodo: "blocoPlanilhaHistoricoPeriodo",
    selecionados: "blocoPlanilhaHistoricoSelecionados",
  }[modo];
  if (blocoAtivo) document.getElementById(blocoAtivo)?.classList.remove("hidden");
  const resumo = document.getElementById("resumoPlanilhaHistoricoContexto");
  if (resumo) resumo.textContent = `${historicoFiltrado.length} registros no contexto atual.`;
  atualizarResumoSelecaoPlanilhaHistorico();
}

function abrirModalPlanilhaHistorico() {
  atualizarStatusModal("statusPlanilhaHistorico");
  const opcaoContexto = document.querySelector('input[name="modoPlanilhaHistorico"][value="contexto"]');
  if (opcaoContexto) opcaoContexto.checked = true;
  preencherOpcoesPlanilhaHistorico();
  atualizarModoPlanilhaHistorico();
  const modal = document.getElementById("modalPlanilhaHistorico");
  if (modal) modal.style.display = "flex";
}

function fecharModalPlanilhaHistorico() {
  atualizarStatusModal("statusPlanilhaHistorico");
  const modal = document.getElementById("modalPlanilhaHistorico");
  if (modal) modal.style.display = "none";
}

function renderizarListaPlanilhaHistorico() {
  const container = document.getElementById("listaHistoricoPlanilha");
  if (!container) return;
  if (!historicoOriginal.length) {
    container.innerHTML = '<div class="lista-os-vazia">Nenhum registro dispon&iacute;vel.</div>';
    atualizarResumoSelecaoPlanilhaHistorico();
    return;
  }
  container.innerHTML = historicoOriginal.map((item) => `
    <label class="item-os-planilha">
      <input type="checkbox" name="historicoPlanilhaSelecionado" value="${escaparHtml(item.id)}" onchange="atualizarResumoSelecaoPlanilhaHistorico()">
      <span class="item-os-planilha-texto">
        ${escaparHtml(formatarDataHoraHistorico(item.data))} - OS ${escaparHtml(item.numeroOS || "-")} - ${escaparHtml(obterRotuloAcaoHistorico(item.acao) || "-")} - ${escaparHtml(item.responsavel || "-")}
      </span>
    </label>
  `).join("");
  atualizarResumoSelecaoPlanilhaHistorico();
}

function atualizarResumoSelecaoPlanilhaHistorico() {
  const resumo = document.getElementById("resumoSelecaoPlanilhaHistorico");
  if (!resumo) return;
  const total = document.querySelectorAll('input[name="historicoPlanilhaSelecionado"]:checked').length;
  resumo.textContent = `${total} registros marcados.`;
}

function marcarHistoricoPlanilha(ids) {
  const selecionados = new Set(ids);
  document.querySelectorAll('input[name="historicoPlanilhaSelecionado"]').forEach((checkbox) => {
    checkbox.checked = selecionados.has(checkbox.value);
  });
  atualizarResumoSelecaoPlanilhaHistorico();
}

function selecionarTodosPlanilhaHistorico() {
  marcarHistoricoPlanilha(historicoOriginal.map((item) => item.id));
}

function selecionarFiltradosPlanilhaHistorico() {
  marcarHistoricoPlanilha(historicoFiltrado.map((item) => item.id));
}

function limparSelecaoPlanilhaHistorico() {
  marcarHistoricoPlanilha([]);
}

function obterIdsPlanilhaHistoricoSelecionados() {
  return Array.from(document.querySelectorAll('input[name="historicoPlanilhaSelecionado"]:checked')).map((checkbox) => checkbox.value);
}

function montarUrlPlanilhaHistorico() {
  const modo = obterModoPlanilhaHistorico();
  const params = new URLSearchParams({ modo });
  if (modo === "contexto") {
    const filtros = obterFiltrosHistoricoAtuais();
    Object.entries(filtros).forEach(([chave, valor]) => {
      if (valor) params.set(chave, valor);
    });
  } else if (modo === "acao") {
    const acao = document.getElementById("campoAcaoPlanilhaHistorico")?.value || "";
    if (acao) params.set("acao", acao);
  } else if (modo === "responsavel") {
    const responsavel = document.getElementById("campoResponsavelPlanilhaHistorico")?.value || "";
    if (responsavel) params.set("responsavel", responsavel);
  } else if (modo === "periodo") {
    const dataInicial = document.getElementById("campoDataInicialPlanilhaHistorico")?.value || "";
    const dataFinal = document.getElementById("campoDataFinalPlanilhaHistorico")?.value || "";
    if (dataInicial) params.set("dataInicial", dataInicial);
    if (dataFinal) params.set("dataFinal", dataFinal);
  } else if (modo === "selecionados") {
    obterIdsPlanilhaHistoricoSelecionados().forEach((id) => params.append("ids", id));
  }
  return `/api/historico-sistema/planilha?${params.toString()}`;
}

function gerarPlanilhaHistorico() {
  const modo = obterModoPlanilhaHistorico();
  if (modo === "contexto" && !historicoFiltrado.length) {
    atualizarStatusModal("statusPlanilhaHistorico", "Nenhum registro no contexto atual.", "erro");
    return;
  }
  if (modo === "periodo") {
    const dataInicial = document.getElementById("campoDataInicialPlanilhaHistorico")?.value || "";
    const dataFinal = document.getElementById("campoDataFinalPlanilhaHistorico")?.value || "";
    if (!dataInicial && !dataFinal) {
      atualizarStatusModal("statusPlanilhaHistorico", "Informe pelo menos uma data.", "erro");
      return;
    }
    if (dataInicial && dataFinal && dataInicial > dataFinal) {
      atualizarStatusModal("statusPlanilhaHistorico", "A data inicial deve ser menor ou igual a data final.", "erro");
      return;
    }
  }
  if (modo === "selecionados" && !obterIdsPlanilhaHistoricoSelecionados().length) {
    atualizarStatusModal("statusPlanilhaHistorico", "Selecione pelo menos um registro.", "erro");
    return;
  }
  atualizarStatusModal("statusPlanilhaHistorico", "Gerando planilha...", "aviso");
  window.demoBaixar(montarUrlPlanilhaHistorico());
  fecharModalPlanilhaHistorico();
}

async function carregarHistorico() {
  const tbody = document.getElementById("tabelaHistorico");
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="financeiro-vazio">Carregando...</td></tr>';

  try {
    const resposta = await fetch("/api/historico-unificado", { cache: "no-store" });
    if (!resposta.ok) {
      const erro = await resposta.json().catch(() => ({}));
      throw new Error(erro.erro || "Erro ao carregar histórico.");
    }
    const dados = await resposta.json();
    historicoOriginal = Array.isArray(dados.itens) ? dados.itens : [];
    preencherFiltroAcoesHistorico();
    filtrarHistorico();
  } catch (erro) {
    historicoOriginal = [];
    historicoFiltrado = [];
    renderizarResumoHistorico();
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="8" class="financeiro-vazio">${escaparHtml(erro.message || "Erro ao carregar histórico.")}</td></tr>`;
    }
  }
}

window.filtrarHistorico = filtrarHistorico;
window.limparFiltrosHistorico = limparFiltrosHistorico;
window.selecionarAbaHistorico = selecionarAbaHistorico;
window.filtrarHistoricoEstoque = filtrarHistoricoEstoque;
window.limparFiltrosHistoricoEstoque = limparFiltrosHistoricoEstoque;
window.abrirModalPlanilhaHistorico = abrirModalPlanilhaHistorico;
window.fecharModalPlanilhaHistorico = fecharModalPlanilhaHistorico;
window.atualizarModoPlanilhaHistorico = atualizarModoPlanilhaHistorico;
window.selecionarTodosPlanilhaHistorico = selecionarTodosPlanilhaHistorico;
window.selecionarFiltradosPlanilhaHistorico = selecionarFiltradosPlanilhaHistorico;
window.limparSelecaoPlanilhaHistorico = limparSelecaoPlanilhaHistorico;
window.gerarPlanilhaHistorico = gerarPlanilhaHistorico;

document.addEventListener("DOMContentLoaded", carregarHistorico);
