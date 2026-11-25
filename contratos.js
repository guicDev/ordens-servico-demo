let contratos = [];
let contratosFiltrados = [];
let abaContratosAtual = "contratos";
let arquivoImportacaoContratosAtual = null;
let canalTempoRealContratos = null;
let sincronizacaoContratosPendente = null;
let usuarioLogadoContratos = null;
let contratoDetalheAtual = null;
let contratoDetalhadoEditando = null;
let anexoContratoIdAtual = "";
const estadoAnimacaoGraficosContratos = { frameId: null };
const USUARIOS_IMPORTACAO_PLANILHA_AUTORIZADOS = new Set(["admin", "administrador", "operador-demo", "gestor-demo", "analista-demo"]);
const MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA = "Você não está autorizado a importar planilhas.";

function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function atualizarStatusModal(id, mensagem = "", tipo = "") {
  const elemento = document.getElementById(id);
  if (!elemento) return;
  elemento.textContent = mensagem;
  elemento.classList.remove("sucesso", "erro", "aviso");
  if (tipo) elemento.classList.add(tipo);
}

function mostrarAvisoInterface(mensagem, tipo = "erro") {
  if (typeof window.mostrarAvisoSistema === "function") {
    window.mostrarAvisoSistema(mensagem, tipo);
    return;
  }
  console.warn(mensagem);
}

function obterUsuarioSessaoContratos(dados) {
  return dados?.usuario && typeof dados.usuario === "object" ? dados.usuario : dados;
}

function usuarioPodeAlterarContratos() {
  if (usuarioLogadoContratos?.permissoes?.contratosSomenteLeitura !== true) return true;
  mostrarAvisoInterface("Você não tem autorização para esta ação.");
  return false;
}

function usuarioPodeImportarPlanilha() {
  if (usuarioLogadoContratos?.permissoes?.importacaoPlanilha === true) return true;
  const identificadores = [
    usuarioLogadoContratos?.usuario,
    usuarioLogadoContratos?.nome,
  ].map(normalizarBusca);

  return identificadores.some((identificador) =>
    USUARIOS_IMPORTACAO_PLANILHA_AUTORIZADOS.has(identificador)
  );
}

function avisarImportacaoPlanilhaNaoAutorizada(statusId) {
  if (statusId) atualizarStatusModal(statusId, MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA, "erro");
  mostrarAvisoInterface(MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA, "erro");
}

function normalizarBusca(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function obterEl(...ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function setText(id, valor) {
  const el = document.getElementById(id);
  if (el) el.textContent = valor;
}

function formatarMoedaCentavos(valor) {
  return (Number(valor || 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatarData(valor) {
  if (!valor) return "-";
  const data = new Date(`${valor}T00:00:00`);
  if (Number.isNaN(data.getTime())) return valor;
  return data.toLocaleDateString("pt-BR");
}

function rotuloOrgaoContrato(orgao) {
  return String(orgao || "").trim().toUpperCase() === "CLIENTE JARDIM / CONTRATO" ? "CLIENTE JARDIM" : (orgao || "-");
}

function statusNormalizado(valor) {
  const chave = normalizarBusca(valor).replace(/\s+/g, "_").replace(/_do_/g, "_");
  return chave === "proximo_vencimento" ? "proximo_do_vencimento" : chave;
}

function statusEhProximoVencimento(valor) {
  const texto = normalizarBusca(valor).replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
  return texto.includes("venc")
    && (texto.startsWith("prox") || texto.startsWith("proximo") || texto.startsWith("pr ximo"));
}

function classeStatusContrato(status) {
  return `status-contrato status-${statusNormalizado(status || "ativo").replace(/_/g, "-")}`;
}

function rotuloStatusContrato(status) {
  const chave = statusNormalizado(status);
  if (chave === "proximo_do_vencimento" || statusEhProximoVencimento(status)) return "PROX. DO VENCIMENTO";
  if (chave === "sem_saldo") return "SEM SALDO";
  if (chave === "inativo" || chave === "encerrado") return "INATIVO";
  return String(status || "-").replace(/_/g, " ");
}

function rotuloStatusGraficoContrato(status) {
  const chave = statusNormalizado(status);
  if (chave === "proximo_do_vencimento" || statusEhProximoVencimento(status)) return "PROX DO VENC";
  return rotuloStatusContrato(status);
}

function preencherFiltrosContratos() {
  const orgaoSelect = obterEl("filtroOrgaoContratos", "filtroOrgaoContrato");
  if (!orgaoSelect) return;
  const orgaoAtual = orgaoSelect.value;
  const orgaos = [...new Set(contratos.map((item) => rotuloOrgaoContrato(item.orgao)).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
  orgaoSelect.innerHTML = '<option value="">Todos os orgaos</option>' +
    orgaos.map((orgao) => `<option value="${escaparHtml(orgao)}">${escaparHtml(orgao)}</option>`).join("");
  orgaoSelect.value = orgaoAtual;
}

async function carregarContratos() {
  const tbody = obterEl("tabelaContratos", "tabelaContratosBody");
  if (tbody) tbody.innerHTML = '<tr><td colspan="11" class="financeiro-vazio">Carregando contratos...</td></tr>';
  try {
    const resposta = await fetch(`/api/contratos?_=${Date.now()}`, { cache: "no-store" });
    if (!resposta.ok) throw new Error("Erro ao carregar contratos.");
    const dados = await resposta.json();
    contratos = Array.isArray(dados.itens) ? dados.itens : [];
    preencherFiltrosContratos();
    aplicarFiltrosContratos();
  } catch (erro) {
    contratos = [];
    contratosFiltrados = [];
    if (tbody) tbody.innerHTML = `<tr><td colspan="11" class="financeiro-vazio">${escaparHtml(erro.message)}</td></tr>`;
  }
}

function sincronizarContratosTempoReal() {
  if (sincronizacaoContratosPendente) return sincronizacaoContratosPendente;
  const detalheId = contratoDetalheAtual?.id;
  sincronizacaoContratosPendente = carregarContratos().then(async () => {
    if (detalheId && contratoDetalheAtual?.id === detalheId) await abrirDetalheContrato(detalheId);
  }).finally(() => {
    sincronizacaoContratosPendente = null;
  });
  return sincronizacaoContratosPendente;
}

function iniciarTempoRealContratos() {
  if (!("EventSource" in window) || canalTempoRealContratos) return;
  canalTempoRealContratos = new EventSource("/api/notificacoes/stream");
  ["contratos_atualizados", "pagamentos_atualizados"].forEach((evento) => {
    canalTempoRealContratos.addEventListener(evento, sincronizarContratosTempoReal);
  });
  canalTempoRealContratos.addEventListener("error", () => {
    if (canalTempoRealContratos?.readyState === EventSource.CLOSED) {
      canalTempoRealContratos = null;
    }
  });
}

function contratoEntraNaAba(item) {
  if (abaContratosAtual === "contratos") return true;
  const dias = Number(item.diasParaVencimento);
  return item.statusCalculado === "VENCIDO" || (Number.isFinite(dias) && dias <= 90);
}

function obterTextoBuscaContrato(item, campoBusca) {
  if (campoBusca === "orgao") return rotuloOrgaoContrato(item.orgao);
  if (campoBusca === "numeroContrato") return item.numeroContrato || "";
  if (campoBusca === "descricao") return item.descricao || "";
  if (campoBusca === "statusCalculado") return item.statusCalculado || "";
  return [rotuloOrgaoContrato(item.orgao), item.numeroContrato, item.descricao, item.statusCalculado].join(" ");
}

function aplicarFiltrosContratos() {
  const termo = normalizarBusca(obterEl("filtroBuscaContratos", "filtroBuscaContrato")?.value || "");
  const campoBusca = obterEl("campoBuscaContratos")?.value || "todos";
  const orgao = obterEl("filtroOrgaoContratos", "filtroOrgaoContrato")?.value || "";
  const status = obterEl("filtroStatusContratos", "filtroStatusContrato")?.value || "";
  contratosFiltrados = contratos.filter((item) => {
    if (!contratoEntraNaAba(item)) return false;
    if (orgao && rotuloOrgaoContrato(item.orgao) !== orgao) return false;
    if (status && statusNormalizado(item.statusCalculado) !== statusNormalizado(status)) return false;
    if (!termo) return true;
    return normalizarBusca(obterTextoBuscaContrato(item, campoBusca)).includes(termo);
  });
  renderizarResumoContratos();
  renderizarTabelaContratos();
  renderizarGraficosContratos(true);
}

function filtrarContratos() {
  aplicarFiltrosContratos();
}

function limparFiltrosContratos() {
  const busca = obterEl("filtroBuscaContratos", "filtroBuscaContrato");
  const campoBusca = obterEl("campoBuscaContratos");
  const orgao = obterEl("filtroOrgaoContratos", "filtroOrgaoContrato");
  const status = obterEl("filtroStatusContratos", "filtroStatusContrato");
  if (busca) busca.value = "";
  if (campoBusca) campoBusca.value = "todos";
  if (orgao) orgao.value = "";
  if (status) status.value = "";
  aplicarFiltrosContratos();
}

function obterFiltrosContratosAtuais() {
  return {
    aba: abaContratosAtual,
    busca: obterEl("filtroBuscaContratos", "filtroBuscaContrato")?.value || "",
    campoBusca: obterEl("campoBuscaContratos")?.value || "todos",
    orgao: obterEl("filtroOrgaoContratos", "filtroOrgaoContrato")?.value || "",
    status: obterEl("filtroStatusContratos", "filtroStatusContrato")?.value || "",
  };
}

function somarContrato(campo) {
  return contratosFiltrados.reduce((total, item) => total + Number(item[campo] || 0), 0);
}

function renderizarResumoContratos() {
  const ativos = contratosFiltrados.filter((item) => item.statusCalculado === "ATIVO").length;
  const vencidos = contratosFiltrados.filter((item) => item.statusCalculado === "VENCIDO").length;
  const proximos = contratosFiltrados.filter((item) => statusNormalizado(item.statusCalculado) === "proximo_do_vencimento").length;
  setText("contrResumoGlobal", formatarMoedaCentavos(somarContrato("valorGlobalCentavos")));
  setText("contratoResumoTotal", formatarMoedaCentavos(somarContrato("valorGlobalCentavos")));
  setText("contrResumoConsumido", formatarMoedaCentavos(somarContrato("valorConsumidoCentavos")));
  setText("contratoResumoConsumido", formatarMoedaCentavos(somarContrato("valorConsumidoCentavos")));
  setText("contrResumoSaldo", formatarMoedaCentavos(somarContrato("saldoRestanteCentavos")));
  setText("contratoResumoSaldo", formatarMoedaCentavos(somarContrato("saldoRestanteCentavos")));
  setText("contrResumoAtivos", ativos);
  setText("contratoResumoAtivos", ativos);
  setText("contrResumoVencidos", vencidos);
  setText("contratoResumoVencidos", vencidos);
  setText("contrResumoProximos", proximos);
  setText("contratoResumoVencendo", proximos);
  setText("contadorContratos", contratosFiltrados.length);
}

function descricaoContratoVisivel(descricao) {
  return descricao === "Total de contratos do orgao" ? "Total de contratos do órgão" : descricao;
}

function renderizarTabelaContratos() {
  const tbody = obterEl("tabelaContratos", "tabelaContratosBody");
  const titulo = document.getElementById("tituloTabelaContratos");
  if (titulo) titulo.textContent = abaContratosAtual === "vencimentos" ? "Contratos a vencer" : "Contratos cadastrados";
  if (!tbody) return;
  if (!contratosFiltrados.length) {
    tbody.innerHTML = '<tr><td colspan="11" class="financeiro-vazio">Nenhum contrato encontrado.</td></tr>';
    return;
  }
  tbody.innerHTML = contratosFiltrados.map((item) => {
    const percentual = Math.max(0, Math.min(100, Number(item.percentualConsumido || 0)));
    const diasNumero = Number(item.diasParaVencimento);
    const dias = Number.isFinite(diasNumero) ? diasNumero : null;
    return `
      <tr>
        <td>${escaparHtml(rotuloOrgaoContrato(item.orgao))}</td>
        <td>${escaparHtml(item.numeroContrato || "-")}</td>
        <td>${escaparHtml(descricaoContratoVisivel(item.descricao) || "-")}</td>
        <td>${formatarMoedaCentavos(item.valorGlobalCentavos)}</td>
        <td>${formatarMoedaCentavos(item.valorConsumidoCentavos)}</td>
        <td>${formatarMoedaCentavos(item.saldoRestanteCentavos)}</td>
        <td>
          <div class="barra-progresso-contrato"><span style="width:${percentual}%"></span></div>
          <small>${percentual.toFixed(1).replace(".", ",")}%</small>
        </td>
        <td>${Number(item.quantidadeEventos || 0)}</td>
        <td>${formatarData(item.dataFinal)}${dias === null ? "" : `<small class="contrato-dias">${dias} dia(s)</small>`}</td>
        <td><span class="${classeStatusContrato(item.statusCalculado)}">${escaparHtml(rotuloStatusContrato(item.statusCalculado))}</span></td>
        <td class="acoes-tabela"><button type="button" onclick="abrirDetalheContrato('${escaparHtml(item.id)}')">Detalhes</button></td>
      </tr>`;
  }).join("");
}

function alternarAbaContratos(aba) {
  abaContratosAtual = aba === "vencimentos" ? "vencimentos" : "contratos";
  document.querySelectorAll(".contratos-tabs button").forEach((botao) => {
    const botaoAba = botao.dataset.aba || (botao.id === "tabVencimentos" ? "vencimentos" : "contratos");
    botao.classList.toggle("ativo", botaoAba === abaContratosAtual);
  });
  aplicarFiltrosContratos();
}

function selecionarAbaContratos(aba) {
  alternarAbaContratos(aba);
}

function agruparPor(lista, chave, campo) {
  return lista.reduce((mapa, item) => {
    const nome = chave === "orgao" ? rotuloOrgaoContrato(item[chave]) : (item[chave] || "Sem órgão");
    mapa[nome] = (mapa[nome] || 0) + Number(item[campo] || 0);
    return mapa;
  }, {});
}

function desenharBarras(canvasId, dados, cor, formatarValor = formatarMoedaCentavos, opcoes = {}, progresso = 1) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const entradas = Object.entries(dados).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = Math.max(canvas.clientWidth || 360, 280);
  const linhas = Math.max(entradas.length, 1);
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
  if (!entradas.length) {
    ctx.fillStyle = "#64748b";
    ctx.font = "13px Arial";
    ctx.fillText("Sem dados para os filtros atuais", 16, 32);
    return;
  }
  const maximo = Math.max(...entradas.map(([, valor]) => valor), 1);
  const labelWidth = opcoes.labelWidth || 148;
  const valueWidth = opcoes.valueWidth || 120;
  const formatarRotulo = opcoes.formatarRotulo || ((nome) => rotuloStatusContrato(nome).slice(0, 20));
  const chartX = labelWidth;
  const chartW = Math.max(80, cssWidth - labelWidth - valueWidth - 18);
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
  entradas.forEach(([nome, valor], indice) => {
    const y = top + indice * (barH + gap);
    const larguraBase = Math.round(chartW * Number(valor || 0) / maximo);
    const barra = Math.max(2, Math.round(larguraBase * progresso));
    const grad = ctx.createLinearGradient(chartX, y, chartX + barra, y);
    grad.addColorStop(0, opcoes.corInicio || cor);
    grad.addColorStop(1, opcoes.corFim || cor);
    ctx.fillStyle = "#334155";
    ctx.font = "600 12px Arial";
    ctx.fillText(formatarRotulo(nome), 10, y + 11);
    ctx.fillStyle = grad;
    ctx.fillRect(chartX, y, barra, barH);
    ctx.fillStyle = "#0f172a";
    ctx.font = "12px Arial";
    ctx.fillText(formatarValor(valor), chartX + chartW + 10, y + 14);
  });
}

function obterDadosGraficosContratos() {
  const status = contratosFiltrados.reduce((mapa, item) => {
    const chave = rotuloStatusContrato(item.statusCalculado || "SEM STATUS");
    mapa[chave] = (mapa[chave] || 0) + 1;
    return mapa;
  }, {});
  return {
    consumo: agruparPor(contratosFiltrados, "orgao", "valorConsumidoCentavos"),
    saldo: agruparPor(contratosFiltrados, "orgao", "saldoRestanteCentavos"),
    status,
  };
}

function desenharGraficosContratosComProgresso(graficos, progresso) {
  desenharBarras("graficoConsumoSecretaria", graficos.consumo, "#2563eb", formatarMoedaCentavos, {
    corInicio: "#1d4ed8",
    corFim: "#2563eb",
  }, progresso);
  desenharBarras("graficoSaldoSecretaria", graficos.saldo, "#16a34a", formatarMoedaCentavos, {
    corInicio: "#15803d",
    corFim: "#22c55e",
  }, progresso);
  desenharBarras("graficoStatusContratos", graficos.status, "#14b8a6", (valor) => String(valor), {
    labelWidth: 136,
    valueWidth: 36,
    corInicio: "#0f766e",
    corFim: "#14b8a6",
    formatarRotulo: rotuloStatusGraficoContrato,
  }, progresso);
}

function renderizarGraficosContratos(animar = false) {
  const graficos = obterDadosGraficosContratos();
  if (!animar) {
    desenharGraficosContratosComProgresso(graficos, 1);
    return;
  }
  if (estadoAnimacaoGraficosContratos.frameId) cancelAnimationFrame(estadoAnimacaoGraficosContratos.frameId);
  const inicio = performance.now();
  const duracaoMs = 1500;
  const passo = (agora) => {
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    const easeOut = 1 - Math.pow(1 - t, 3);
    desenharGraficosContratosComProgresso(graficos, easeOut);
    if (t < 1) {
      estadoAnimacaoGraficosContratos.frameId = requestAnimationFrame(passo);
    } else {
      estadoAnimacaoGraficosContratos.frameId = null;
    }
  };
  estadoAnimacaoGraficosContratos.frameId = requestAnimationFrame(passo);
}

async function abrirDetalheContrato(id) {
  const modal = document.getElementById("modalDetalheContrato");
  const resumo = document.getElementById("detalheContratoResumo");
  const listaContratos = document.getElementById("listaContratosDetalhados");
  const tbody = obterEl("detalheContratoConsumos", "tabelaConsumosContratoBody");
  if (!modal || !resumo || !tbody) return;
  atualizarStatusModal("statusAnexoContrato");
  modal.classList.remove("hidden");
  modal.style.display = "flex";
  resumo.innerHTML = '<p>Carregando...</p>';
  if (listaContratos) listaContratos.innerHTML = '<div class="financeiro-vazio">Carregando contratos...</div>';
  tbody.innerHTML = '<tr><td colspan="6" class="financeiro-vazio">Carregando...</td></tr>';
  try {
    const resposta = await fetch(`/api/contratos/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (!resposta.ok) throw new Error("Erro ao carregar contrato.");
    const contrato = await resposta.json();
    contratoDetalheAtual = contrato;
    resumo.innerHTML = `
      <p><strong>Órgão</strong><span>${escaparHtml(rotuloOrgaoContrato(contrato.orgao))}</span></p>
      <p><strong>Contrato</strong><span>${escaparHtml(contrato.numeroContrato || "-")}</span></p>
      <p><strong>Descrição</strong><span>${escaparHtml(descricaoContratoVisivel(contrato.descricao) || "-")}</span></p>
      <p><strong>Valor global</strong><span>${formatarMoedaCentavos(contrato.valorGlobalCentavos)}</span></p>
      <p><strong>Consumido</strong><span>${formatarMoedaCentavos(contrato.valorConsumidoCentavos)}</span></p>
      <p><strong>Saldo</strong><span>${formatarMoedaCentavos(contrato.saldoRestanteCentavos)}</span></p>
      <p><strong>Vigencia</strong><span>${formatarData(contrato.dataInicio)} a ${formatarData(contrato.dataFinal)}</span></p>
      <p><strong>Status</strong><span>${escaparHtml(rotuloStatusContrato(contrato.statusCalculado))}</span></p>`;
    renderizarContratosDetalhados(contrato.contratosDetalhados || []);
    const consumos = Array.isArray(contrato.consumos) ? contrato.consumos : [];
    tbody.innerHTML = consumos.length ? consumos.map((consumo) => `
      <tr>
        <td>${formatarData(consumo.emissao)}</td>
        <td>${escaparHtml(consumo.notaFiscal || "-")}</td>
        <td>${escaparHtml(consumo.razaoSocial || "-")}</td>
        <td>${formatarMoedaCentavos(consumo.valorConsumidoCentavos)}</td>
        <td>${escaparHtml(consumo.usuario || "-")}</td>
        <td>${formatarData((consumo.criadoEm || "").slice(0, 10))}</td>
      </tr>`).join("") : '<tr><td colspan="6" class="financeiro-vazio">Nenhum consumo vinculado.</td></tr>';
  } catch (erro) {
    contratoDetalheAtual = null;
    resumo.innerHTML = `<p>${escaparHtml(erro.message)}</p>`;
    if (listaContratos) listaContratos.innerHTML = '<div class="financeiro-vazio">Falha ao carregar contratos.</div>';
    tbody.innerHTML = '<tr><td colspan="6" class="financeiro-vazio">Falha ao carregar consumos.</td></tr>';
  }
}

function valorCentavosParaInput(valor) {
  return String((Number(valor || 0) / 100).toFixed(2));
}

function inputMoedaParaCentavos(valor) {
  const numero = Number(String(valor || "").replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? Math.round(numero * 100) : NaN;
}

function renderizarContratosDetalhados(lista) {
  const container = document.getElementById("listaContratosDetalhados");
  const subtitulo = document.getElementById("contratosDetalhadosSubtitulo");
  if (!container) return;
  const itens = normalizarContratosDetalhadosParaModal(Array.isArray(lista) ? lista : []);
  if (subtitulo) subtitulo.textContent = `${itens.length} contrato(s) separado(s) neste órgão.`;
  if (!itens.length) {
    container.innerHTML = '<div class="financeiro-vazio">Nenhum contrato separado cadastrado.</div>';
    return;
  }
  container.innerHTML = itens.map((contrato) => `
    <article class="contrato-detalhado-card">
      <div class="contrato-detalhado-info">
        <strong>${escaparHtml(contrato.numeroContrato || "-")}</strong>
        <span>${escaparHtml(descricaoContratoVisivel(contrato.descricao) || "-")}</span>
        ${contrato.anexo ? `<small>Documento: ${escaparHtml(contrato.anexo.nomeOriginal)}</small>` : ""}
        <small>${formatarData(contrato.dataInicio)} a ${formatarData(contrato.dataFinal)} · ${escaparHtml(rotuloStatusContrato(contrato.statusCalculado))}</small>
      </div>
      <div class="contrato-detalhado-valores">
        <span>Valor</span>
        <strong>${formatarMoedaCentavos(contrato.valorGlobalCentavos)}</strong>
        <small>Saldo ${formatarMoedaCentavos(contrato.saldoRestanteCentavos)}</small>
      </div>
      <div class="contrato-detalhado-acoes">
        ${contrato.anexo ? `<button type="button" onclick="baixarAnexoContrato('${escaparHtml(contrato.id)}')">Abrir/baixar</button>` : ""}
        <button type="button" onclick="abrirAnexoContrato('${escaparHtml(contrato.id)}')">${contrato.anexo ? "Substituir" : "Anexar documento"}</button>
        <button type="button" onclick="editarContratoDetalhado('${escaparHtml(contrato.id)}')">Editar</button>
        <button type="button" onclick="removerContratoDetalhado('${escaparHtml(contrato.id)}')">Remover</button>
      </div>
    </article>
  `).join("");
}

function abrirAnexoContrato(id) {
  if (!usuarioPodeAlterarContratos()) return;
  anexoContratoIdAtual = id;
  const input = document.getElementById("arquivoAnexoContrato");
  if (!input) return;
  input.value = "";
  input.click();
}

async function enviarAnexoContrato() {
  if (!usuarioPodeAlterarContratos()) return;
  const arquivo = document.getElementById("arquivoAnexoContrato")?.files?.[0];
  if (!arquivo || !anexoContratoIdAtual) return;
  if (arquivo.size > 25 * 1024 * 1024) {
    atualizarStatusModal("statusAnexoContrato", "O anexo excede 25 MB.", "erro");
    return;
  }
  atualizarStatusModal("statusAnexoContrato", "Enviando documento...", "aviso");
  try {
    const resposta = await fetch(`/api/contratos/${encodeURIComponent(anexoContratoIdAtual)}/anexo`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivo: { nomeOriginal: arquivo.name, mimeType: arquivo.type, conteudoBase64: await lerArquivoComoBase64(arquivo) } }),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || "Erro ao anexar documento.");
    await abrirDetalheContrato(contratoDetalheAtual.id);
    atualizarStatusModal("statusAnexoContrato", "Documento anexado ao contrato.", "sucesso");
  } catch (erro) {
    atualizarStatusModal("statusAnexoContrato", erro.message || "Erro ao anexar documento.", "erro");
  }
}

async function baixarAnexoContrato(id) {
  try {
    const resposta = await fetch(`/api/contratos/${encodeURIComponent(id)}/anexo`, { cache: "no-store" });
    if (!resposta.ok) throw new Error("Não foi possível baixar o documento.");
    const arquivo = await resposta.blob();
    const contrato = contratoDetalheAtual?.contratosDetalhados?.find((item) => item.id === id);
    const url = URL.createObjectURL(arquivo);
    const link = document.createElement("a");
    link.href = url;
    link.download = contrato?.anexo?.nomeOriginal || "contrato";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (erro) {
    atualizarStatusModal("statusAnexoContrato", erro.message, "erro");
  }
}

function normalizarContratosDetalhadosParaModal(itens) {
  if (itens.length !== 1) return itens;
  const contrato = itens[0] || {};
  const descricao = normalizarBusca(contrato.descricao || "");
  const numeroContrato = String(contrato.numeroContrato || "");
  if (!descricao.includes("total de contratos") || !numeroContrato.includes(",")) return itens;

  const partes = numeroContrato
    .split(/,\s+(?=(?:\d{3}(?:[-/]|$)|CT\b|ADESAO\b))/i)
    .map((numero) => numero.trim())
    .filter(Boolean);
  if (partes.length <= 1) return itens;

  return partes.map((numero, indice) => ({
    ...contrato,
    id: `${contrato.id || "contrato"}-visual-${indice}`,
    numeroContrato: numero,
    descricao: "Contrato separado do órgão",
  }));
}

function preencherFormContratoDetalhado(contrato = {}) {
  document.getElementById("contratoDetalhadoId").value = contrato.id || "";
  document.getElementById("contratoDetalhadoOrgao").value = contrato.orgao || contratoDetalheAtual?.orgao || "";
  document.getElementById("contratoDetalhadoNumero").value = contrato.numeroContrato || "";
  document.getElementById("contratoDetalhadoDescricao").value = contrato.descricao || "";
  document.getElementById("contratoDetalhadoValorOriginal").value = valorCentavosParaInput(contrato.valorOriginalCentavos);
  document.getElementById("contratoDetalhadoValorAditivos").value = valorCentavosParaInput(contrato.valorAditivosCentavos);
  document.getElementById("contratoDetalhadoValorGlobal").value = valorCentavosParaInput(contrato.valorGlobalCentavos);
  document.getElementById("contratoDetalhadoDataInicio").value = contrato.dataInicio || "";
  document.getElementById("contratoDetalhadoDataFinal").value = contrato.dataFinal || "";
  document.getElementById("contratoDetalhadoStatus").value = contrato.statusManual || "";
  document.getElementById("contratoDetalhadoObservacoes").value = contrato.observacoes || "";
  atualizarStatusModal("statusFormContratoDetalhado");
}

function abrirFormContratoDetalhado(id = "") {
  if (!usuarioPodeAlterarContratos()) return;
  const contratosDetalhados = normalizarContratosDetalhadosParaModal(contratoDetalheAtual?.contratosDetalhados || []);
  contratoDetalhadoEditando = id ? contratosDetalhados.find((contrato) => contrato.id === id) || null : null;
  document.getElementById("tituloFormContratoDetalhado").textContent = contratoDetalhadoEditando ? "Editar contrato" : "Novo contrato";
  preencherFormContratoDetalhado(contratoDetalhadoEditando || { orgao: contratoDetalheAtual?.orgao || "" });
  const modal = document.getElementById("modalFormContratoDetalhado");
  if (modal) modal.style.display = "flex";
}

function editarContratoDetalhado(id) {
  abrirFormContratoDetalhado(id);
}

function fecharFormContratoDetalhado() {
  contratoDetalhadoEditando = null;
  atualizarStatusModal("statusFormContratoDetalhado");
  const modal = document.getElementById("modalFormContratoDetalhado");
  if (modal) modal.style.display = "none";
}

async function salvarContratoDetalhado() {
  if (!usuarioPodeAlterarContratos()) return;
  const id = document.getElementById("contratoDetalhadoId").value;
  const valorOriginalCentavos = inputMoedaParaCentavos(document.getElementById("contratoDetalhadoValorOriginal").value);
  const valorAditivosCentavos = inputMoedaParaCentavos(document.getElementById("contratoDetalhadoValorAditivos").value);
  const valorGlobalCentavos = inputMoedaParaCentavos(document.getElementById("contratoDetalhadoValorGlobal").value);
  const payload = {
    orgao: document.getElementById("contratoDetalhadoOrgao").value.trim(),
    numeroContrato: document.getElementById("contratoDetalhadoNumero").value.trim(),
    descricao: document.getElementById("contratoDetalhadoDescricao").value.trim(),
    valorOriginalCentavos,
    valorAditivosCentavos,
    valorGlobalCentavos,
    dataInicio: document.getElementById("contratoDetalhadoDataInicio").value,
    dataFinal: document.getElementById("contratoDetalhadoDataFinal").value,
    statusManual: document.getElementById("contratoDetalhadoStatus").value,
    observacoes: document.getElementById("contratoDetalhadoObservacoes").value.trim(),
  };
  if (!payload.orgao || !payload.numeroContrato || !payload.descricao || !Number.isFinite(payload.valorGlobalCentavos)) {
    atualizarStatusModal("statusFormContratoDetalhado", "Preencha órgão, contrato, descrição e valor global.", "erro");
    return;
  }
  atualizarStatusModal("statusFormContratoDetalhado", "Salvando contrato...", "aviso");
  try {
    const resposta = await fetch(id ? `/api/contratos/${encodeURIComponent(id)}` : "/api/contratos", {
      method: id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || "Erro ao salvar contrato.");
    fecharFormContratoDetalhado();
    await carregarContratos();
    await abrirDetalheContrato(dados.id || id);
  } catch (erro) {
    atualizarStatusModal("statusFormContratoDetalhado", erro.message || "Erro ao salvar contrato.", "erro");
  }
}

async function removerContratoDetalhado(id) {
  if (!usuarioPodeAlterarContratos()) return;
  if (!confirm("Remover este contrato? Esta ação não será permitida se houver consumo vinculado.")) return;
  try {
    const resposta = await fetch(`/api/contratos/${encodeURIComponent(id)}`, { method: "DELETE" });
    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(dados.erro || "Erro ao remover contrato.");
    await carregarContratos();
    if (contratoDetalheAtual?.id) await abrirDetalheContrato(contratoDetalheAtual.id);
  } catch (erro) {
    mostrarAvisoInterface(erro.message || "Erro ao remover contrato.", "erro");
  }
}

function fecharDetalheContrato() {
  const modal = document.getElementById("modalDetalheContrato");
  if (modal) modal.style.display = "none";
  contratoDetalheAtual = null;
}

function abrirModalImportacaoContratos() {
  if (!usuarioPodeImportarPlanilha()) {
    avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoContratos");
    return;
  }

  arquivoImportacaoContratosAtual = null;
  atualizarStatusModal("statusImportacaoContratos");
  const input = document.getElementById("arquivoImportacaoContratos");
  const resultado = document.getElementById("resultadoImportacaoContratos");
  const preview = obterEl("impContrPreview", "previewImportacaoContratos");
  if (input) input.value = "";
  if (resultado) resultado.classList.add("hidden");
  if (preview) preview.innerHTML = "";
  const modal = document.getElementById("modalImportacaoContratos");
  if (modal) modal.style.display = "flex";
}

function fecharModalImportacaoContratos() {
  atualizarStatusModal("statusImportacaoContratos");
  const modal = document.getElementById("modalImportacaoContratos");
  if (modal) modal.style.display = "none";
}

function lerArquivoComoBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",").pop());
    reader.onerror = () => reject(new Error("Erro ao ler arquivo."));
    reader.readAsDataURL(arquivo);
  });
}

async function analisarImportacaoContratos() {
  if (!usuarioPodeImportarPlanilha()) {
    avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoContratos");
    return;
  }

  const input = document.getElementById("arquivoImportacaoContratos");
  const arquivo = input?.files?.[0];
  if (!arquivo) {
    atualizarStatusModal("statusImportacaoContratos", "Selecione uma planilha.", "erro");
    return;
  }
  atualizarStatusModal("statusImportacaoContratos", "Analisando contratos...", "aviso");
  try {
    arquivoImportacaoContratosAtual = {
      nome: arquivo.name,
      conteudoBase64: await lerArquivoComoBase64(arquivo),
    };
    const resposta = await fetch("/api/contratos/importacao/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivo: arquivoImportacaoContratosAtual }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || "Erro ao analisar planilha.");
    atualizarStatusModal("statusImportacaoContratos", `Análise pronta: ${dados.resumo?.validos || 0} contratos válidos e ${dados.resumo?.ignoradas || dados.resumo?.linhasIgnoradas || 0} ignorados.`, "sucesso");
    const resultado = document.getElementById("resultadoImportacaoContratos");
    const preview = obterEl("impContrPreview", "previewImportacaoContratos");
    if (resultado) resultado.classList.remove("hidden");
    setText("impContrValidos", dados.resumo?.validos || 0);
    setText("impContrCriar", dados.resumo?.validos || 0);
    setText("impContrAtualizar", 0);
    setText("impContrIgnoradas", dados.resumo?.ignoradas || dados.resumo?.linhasIgnoradas || 0);
    if (preview) {
      preview.innerHTML = (dados.registros || []).slice(0, 12).map((item) => `
        <div class="resumo-planilha">${escaparHtml(item.orgao)} | ${escaparHtml(item.numeroContrato)} | ${formatarMoedaCentavos(item.valorGlobalCentavos)}</div>
      `).join("") || '<div class="financeiro-vazio">Nenhum contrato v&aacute;lido encontrado.</div>';
    }
  } catch (erro) {
    atualizarStatusModal("statusImportacaoContratos", erro.message || "Erro ao analisar planilha.", "erro");
  }
}

async function confirmarImportacaoContratos() {
  if (!usuarioPodeImportarPlanilha()) {
    avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoContratos");
    return;
  }

  if (!arquivoImportacaoContratosAtual) {
    atualizarStatusModal("statusImportacaoContratos", "Analise a planilha antes de confirmar.", "erro");
    return;
  }
  atualizarStatusModal("statusImportacaoContratos", "Importando contratos analisados...", "aviso");
  try {
    const resposta = await fetch("/api/contratos/importacao/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivo: arquivoImportacaoContratosAtual }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || "Erro ao importar contratos.");
    atualizarStatusModal("statusImportacaoContratos", `Importação concluída. Criados: ${dados.criados}. Atualizados: ${dados.atualizados}. Ignorados: ${dados.ignorados}.`, "sucesso");
    fecharModalImportacaoContratos();
    await carregarContratos();
  } catch (erro) {
    atualizarStatusModal("statusImportacaoContratos", erro.message || "Erro ao importar contratos.", "erro");
  }
}

function preencherOpcoesPlanilhaContratos() {
  const selectOrgao = document.getElementById("campoOrgaoPlanilhaContratos");
  if (selectOrgao) {
    const orgaos = [...new Set(contratos.map((item) => rotuloOrgaoContrato(item.orgao)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, "pt-BR"));
    const opcoes = orgaos.map((orgao) => `<option value="${escaparHtml(orgao)}">${escaparHtml(orgao)}</option>`).join("");
    selectOrgao.innerHTML = opcoes;
    const selectMapa = document.getElementById("campoOrgaoMapaEmpenhos");
    if (selectMapa) selectMapa.innerHTML = '<option value="">Selecione um órgão</option>' + opcoes;
    const filtroOrgao = obterEl("filtroOrgaoContratos", "filtroOrgaoContrato")?.value || "";
    if (filtroOrgao && orgaos.includes(filtroOrgao)) selectOrgao.value = filtroOrgao;
  }
  renderizarListaPlanilhaContratos();
}

function obterModoPlanilhaContratos() {
  return document.querySelector('input[name="modoPlanilhaContratos"]:checked')?.value || "contexto";
}

function atualizarModoPlanilhaContratos() {
  const modo = obterModoPlanilhaContratos();
  ["Contexto", "Orgao", "MapaEmpenhos", "Status", "Selecionados"].forEach((sufixo) => {
    const bloco = document.getElementById(`blocoPlanilhaContratos${sufixo}`);
    if (bloco) bloco.classList.add("hidden");
  });
  const blocoAtivo = {
    contexto: "blocoPlanilhaContratosContexto",
    orgao: "blocoPlanilhaContratosOrgao",
    mapa_empenhos: "blocoPlanilhaContratosMapaEmpenhos",
    status: "blocoPlanilhaContratosStatus",
    selecionados: "blocoPlanilhaContratosSelecionados",
  }[modo];
  if (blocoAtivo) document.getElementById(blocoAtivo)?.classList.remove("hidden");
  const campoMapa = document.getElementById("campoOrgaoMapaEmpenhos");
  if (campoMapa) campoMapa.required = modo === "mapa_empenhos";
  const resumo = document.getElementById("resumoPlanilhaContratosContexto");
  if (resumo) resumo.textContent = `${contratosFiltrados.length} contratos no contexto atual.`;
  atualizarResumoSelecaoPlanilhaContratos();
}

function abrirModalPlanilhaContratos() {
  atualizarStatusModal("statusPlanilhaContratos");
  const opcaoContexto = document.querySelector('input[name="modoPlanilhaContratos"][value="contexto"]');
  if (opcaoContexto) opcaoContexto.checked = true;
  preencherOpcoesPlanilhaContratos();
  atualizarModoPlanilhaContratos();
  const modal = document.getElementById("modalPlanilhaContratos");
  if (modal) modal.style.display = "flex";
}

function fecharModalPlanilhaContratos() {
  atualizarStatusModal("statusPlanilhaContratos");
  const modal = document.getElementById("modalPlanilhaContratos");
  if (modal) modal.style.display = "none";
}

function contratoEhVencimento(item) {
  const dias = Number(item.diasParaVencimento);
  return item.statusCalculado === "VENCIDO" || (Number.isFinite(dias) && dias <= 90);
}

function renderizarListaPlanilhaContratos() {
  const container = document.getElementById("listaContratosPlanilha");
  if (!container) return;
  const lista = [...contratos].sort((a, b) => {
    const orgao = rotuloOrgaoContrato(a.orgao).localeCompare(rotuloOrgaoContrato(b.orgao), "pt-BR");
    if (orgao !== 0) return orgao;
    return String(a.numeroContrato || "").localeCompare(String(b.numeroContrato || ""), "pt-BR", { numeric: true });
  });
  if (!lista.length) {
    container.innerHTML = '<div class="lista-os-vazia">Nenhum contrato dispon&iacute;vel.</div>';
    atualizarResumoSelecaoPlanilhaContratos();
    return;
  }
  container.innerHTML = lista.map((item) => `
    <label class="item-os-planilha">
      <input type="checkbox" name="contratoPlanilhaSelecionado" value="${escaparHtml(item.id)}" onchange="atualizarResumoSelecaoPlanilhaContratos()">
      <span class="item-os-planilha-texto">
        ${escaparHtml(rotuloOrgaoContrato(item.orgao))} - ${escaparHtml(item.numeroContrato || "-")} - ${escaparHtml(item.descricao || "-")} (${formatarMoedaCentavos(item.saldoRestanteCentavos)})
      </span>
    </label>
  `).join("");
  atualizarResumoSelecaoPlanilhaContratos();
}

function atualizarResumoSelecaoPlanilhaContratos() {
  const resumo = document.getElementById("resumoSelecaoPlanilhaContratos");
  if (!resumo) return;
  const total = document.querySelectorAll('input[name="contratoPlanilhaSelecionado"]:checked').length;
  resumo.textContent = `${total} contratos marcados.`;
}

function marcarContratosPlanilha(predicate) {
  const ids = new Set(contratos.filter(predicate).map((item) => item.id));
  document.querySelectorAll('input[name="contratoPlanilhaSelecionado"]').forEach((checkbox) => {
    checkbox.checked = ids.has(checkbox.value);
  });
  atualizarResumoSelecaoPlanilhaContratos();
}

function selecionarTodosPlanilhaContratos() {
  document.querySelectorAll('input[name="contratoPlanilhaSelecionado"]').forEach((checkbox) => {
    checkbox.checked = true;
  });
  atualizarResumoSelecaoPlanilhaContratos();
}

function selecionarVencimentosPlanilhaContratos() {
  marcarContratosPlanilha(contratoEhVencimento);
}

function limparSelecaoPlanilhaContratos() {
  document.querySelectorAll('input[name="contratoPlanilhaSelecionado"]').forEach((checkbox) => {
    checkbox.checked = false;
  });
  atualizarResumoSelecaoPlanilhaContratos();
}

function obterIdsPlanilhaContratosSelecionados() {
  return Array.from(document.querySelectorAll('input[name="contratoPlanilhaSelecionado"]:checked')).map((checkbox) => checkbox.value);
}

function montarUrlPlanilhaContratos() {
  const modo = obterModoPlanilhaContratos();
  const params = new URLSearchParams({ modo });
  if (modo === "contexto") {
    const filtros = obterFiltrosContratosAtuais();
    Object.entries(filtros).forEach(([chave, valor]) => {
      if (valor) params.set(chave, valor);
    });
  } else if (modo === "orgao" || modo === "mapa_empenhos") {
    const campo = modo === "mapa_empenhos" ? "campoOrgaoMapaEmpenhos" : "campoOrgaoPlanilhaContratos";
    const orgao = document.getElementById(campo)?.value || "";
    if (orgao) params.set("orgao", orgao);
  } else if (modo === "status") {
    const status = document.getElementById("campoStatusPlanilhaContratos")?.value || "";
    if (status) params.set("status", status);
  } else if (modo === "selecionados") {
    obterIdsPlanilhaContratosSelecionados().forEach((id) => params.append("ids", id));
  }
  return `/api/contratos/planilha?${params.toString()}`;
}

async function gerarPlanilhaContratos() {
  const modo = obterModoPlanilhaContratos();
  if (modo === "mapa_empenhos") {
    const campo = document.getElementById("campoOrgaoMapaEmpenhos");
    if (!campo?.value) {
      atualizarStatusModal("statusPlanilhaContratos", "Selecione um órgão para gerar o mapa de empenhos.", "erro");
      campo?.focus();
      return;
    }
    const botao = document.getElementById("botaoGerarPlanilhaContratos");
    if (botao) botao.disabled = true;
    atualizarStatusModal("statusPlanilhaContratos", "Consultando empenhos e gerando planilha...", "aviso");
    try {
      const resposta = await fetch(montarUrlPlanilhaContratos(), { cache: "no-store" });
      if (!resposta.ok) {
        const dados = await resposta.json().catch(() => ({}));
        throw new Error(dados.erro || "Não foi possível consultar os empenhos. Tente novamente.");
      }
      const tipo = resposta.headers.get("content-type") || "";
      if (!/^application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet(?:;|$)/i.test(tipo)) {
        throw new Error("O servidor não retornou uma planilha válida. Tente novamente ou entre novamente no sistema.");
      }
      const arquivo = await resposta.blob();
      const cabecalho = resposta.headers.get("content-disposition") || "";
      const nome = cabecalho.match(/filename="?([^";]+)"?/i)?.[1] || "mapa-empenhos.xlsx";
      const url = URL.createObjectURL(arquivo);
      const link = document.createElement("a");
      link.href = url;
      link.download = nome;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      fecharModalPlanilhaContratos();
    } catch (erro) {
      atualizarStatusModal("statusPlanilhaContratos", erro.message || "Erro ao gerar planilha.", "erro");
    } finally {
      if (botao) botao.disabled = false;
    }
    return;
  }
  if (modo === "contexto" && !contratosFiltrados.length) {
    atualizarStatusModal("statusPlanilhaContratos", "Nenhum contrato no contexto atual.", "erro");
    return;
  }
  if (modo === "selecionados" && !obterIdsPlanilhaContratosSelecionados().length) {
    atualizarStatusModal("statusPlanilhaContratos", "Selecione pelo menos um contrato.", "erro");
    return;
  }
  atualizarStatusModal("statusPlanilhaContratos", "Gerando planilha...", "aviso");
  window.demoBaixar(montarUrlPlanilhaContratos());
  fecharModalPlanilhaContratos();
}

function exportarContratos() {
  abrirModalPlanilhaContratos();
}

async function logoutContratos() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login.html";
}

window.addEventListener("DOMContentLoaded", async () => {
  const usuarioNavegacao = await window.inicializarNavegacao?.();
  if (usuarioNavegacao) usuarioLogadoContratos = obterUsuarioSessaoContratos(usuarioNavegacao);
  await carregarContratos();
  if (usuarioLogadoContratos?.permissoes?.contratosSomenteLeitura !== true) iniciarTempoRealContratos();
});
window.addEventListener("resize", () => renderizarGraficosContratos(false));
window.addEventListener("click", (event) => {
  if (event.target === document.getElementById("modalFormContratoDetalhado")) fecharFormContratoDetalhado();
});
