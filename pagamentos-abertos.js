let pagamentosAbertos = [];
let pagamentosFiltrados = [];
let contratosPagamento = [];
let contratoPagamentoEscolhidoManualmente = false;
let liquidoModoPagamento = "manual";
let liquidoManualBloqueadoPagamento = false;
let arquivoImportacaoAtual = null;
let analiseImportacaoAtual = null;
let canalTempoRealPagamentos = null;
let sincronizacaoPagamentosPendente = null;
let ordenacaoPagamentos = "asc";
let criterioOrdenacaoPagamentos = "nota";
let modoValoresResumoPagamentos = localStorage.getItem("pagamentosResumoModoValor") === "liquido" ? "liquido" : "bruto";
let usuarioLogadoPagamentos = null;
let modoSelecaoPagamentos = false;
const idsPagamentosSelecionados = new Set();
let previaAcoesEmMassaPagamentos = null;
let acaoEmMassaPagamentosAtual = "";
let itensLixeiraPagamentos = [];
const idsLixeiraPagamentosSelecionados = new Set();

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const ordemMeses = new Map([["JAN", 1], ["FEV", 2], ["MAR", 3], ["ABR", 4], ["MAI", 5], ["JUN", 6], ["JUL", 7], ["AGO", 8], ["SET", 9], ["OUT", 10], ["NOV", 11], ["DEZ", 12]]);
const estadoAnimacaoGraficos = { primeiraRenderizacao: true, frameId: null };
const FILTRO_STATUS_NAO_APTO = "__FILTRO_STATUS_NAO_APTO__";
const USUARIOS_IMPORTACAO_PLANILHA_AUTORIZADOS = new Set(["admin", "administrador"]);
const MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA = "Você não está autorizado a importar planilhas.";

function escaparHtml(valor) {
  return String(valor ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
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

function atualizarBarraSelecaoPagamentos() {
  const barra = document.getElementById("barraAcoesEmMassaPagamentos");
  const contador = document.getElementById("contadorSelecaoPagamentos");
  const botao = document.getElementById("btnSelecionarPagamentos");
  const total = idsPagamentosSelecionados.size;
  barra?.classList.toggle("hidden", !modoSelecaoPagamentos);
  document.querySelector(".coluna-selecao-pagamento")?.classList.toggle("hidden", !modoSelecaoPagamentos);
  if (contador) contador.textContent = `${total} ${total === 1 ? "selecionado" : "selecionados"}`;
  if (botao) {
    botao.textContent = modoSelecaoPagamentos ? "Selecionando" : "Selecionar";
    botao.setAttribute("aria-pressed", modoSelecaoPagamentos ? "true" : "false");
  }
  document.querySelectorAll(".checkbox-selecao-pagamento").forEach((checkbox) => {
    checkbox.checked = idsPagamentosSelecionados.has(String(checkbox.dataset.id));
    checkbox.closest("tr")?.classList.toggle("selecionado-em-massa", checkbox.checked);
  });
}

function limparSelecaoPagamentos() {
  idsPagamentosSelecionados.clear();
  previaAcoesEmMassaPagamentos = null;
  const seletor = document.getElementById("acaoEmMassaPagamentos");
  if (seletor) seletor.value = "";
  atualizarBarraSelecaoPagamentos();
}

function alternarModoSelecaoPagamentos() {
  modoSelecaoPagamentos = !modoSelecaoPagamentos;
  limparSelecaoPagamentos();
  renderizarTabela();
  atualizarBarraSelecaoPagamentos();
  document.getElementById("btnSelecionarPagamentos")?.focus();
}

function alternarSelecaoPagamento(id, selecionado) {
  const chave = String(id || "");
  if (selecionado) {
    if (idsPagamentosSelecionados.size >= 100) {
      mostrarAvisoInterface("O limite é de 100 pagamentos por ação.", "aviso");
      atualizarBarraSelecaoPagamentos();
      return;
    }
    idsPagamentosSelecionados.add(chave);
  } else {
    idsPagamentosSelecionados.delete(chave);
  }
  atualizarBarraSelecaoPagamentos();
}

function selecionarPagamentosVisiveis() {
  idsPagamentosSelecionados.clear();
  pagamentosFiltrados.slice(0, 100).forEach((item) => idsPagamentosSelecionados.add(String(item.id)));
  atualizarBarraSelecaoPagamentos();
  if (pagamentosFiltrados.length > 100) mostrarAvisoInterface("Foram selecionados os primeiros 100 pagamentos visíveis.", "aviso");
}

function obterPagamentosSelecionados() {
  return pagamentosAbertos.filter((item) => idsPagamentosSelecionados.has(String(item.id)));
}

function exportarPagamentosSelecionados() {
  const itens = obterPagamentosSelecionados();
  if (!itens.length) return;
  const parametros = new URLSearchParams({ modo: "selecionados", ordenacao: "secretaria" });
  itens.forEach((item) => parametros.append("ids", String(item.id)));
  window.demoBaixar(`/api/pagamentos-abertos/planilha?${parametros.toString()}`);
}

function fecharModalAcoesEmMassaPagamentos() {
  document.getElementById("modalAcoesEmMassaPagamentos").style.display = "none";
  previaAcoesEmMassaPagamentos = null;
  acaoEmMassaPagamentosAtual = "";
  document.getElementById("campoConfirmacaoDestrutivaAcoesEmMassaPagamentos")?.classList.add("hidden");
  const confirmacao = document.getElementById("confirmacaoDestrutivaAcoesEmMassaPagamentos");
  if (confirmacao) confirmacao.value = "";
  const botao = document.getElementById("confirmarAcaoEmMassaPagamentos");
  botao.disabled = false;
  botao.textContent = "Analisar";
  botao.onclick = analisarAcaoEmMassaPagamentos;
}

function atualizarCamposAcoesEmMassaPagamentos() {
  const situacao = document.getElementById("situacaoAcoesEmMassaPagamentos")?.value || "";
  const mostrarData = acaoEmMassaPagamentosAtual === "definir_data_pagamento"
    || (acaoEmMassaPagamentosAtual === "alterar_situacao" && situacao === "CONFIRMADO");
  document.getElementById("campoDataAcoesEmMassaPagamentos")?.classList.toggle("hidden", !mostrarData);
}

function montarParametrosAcoesEmMassaPagamentos() {
  if (acaoEmMassaPagamentosAtual === "alterar_status") {
    return { status: document.getElementById("statusAcoesEmMassaPagamentos")?.value || "" };
  }
  if (acaoEmMassaPagamentosAtual === "alterar_situacao") {
    return {
      situacao: document.getElementById("situacaoAcoesEmMassaPagamentos")?.value || "",
      dataPagamento: document.getElementById("dataAcoesEmMassaPagamentos")?.value || "",
    };
  }
  if (acaoEmMassaPagamentosAtual === "definir_data_pagamento") {
    return { dataPagamento: document.getElementById("dataAcoesEmMassaPagamentos")?.value || "" };
  }
  return { observacao: document.getElementById("observacaoAcoesEmMassaPagamentos")?.value.trim() || "" };
}

function prepararAcaoEmMassaPagamentos() {
  const seletor = document.getElementById("acaoEmMassaPagamentos");
  const acao = seletor?.value || "";
  if (!acao) return;
  if (!idsPagamentosSelecionados.size) {
    mostrarAvisoInterface("Selecione pelo menos um pagamento.", "aviso");
    seletor.value = "";
    return;
  }
  if (acao === "exportar") {
    exportarPagamentosSelecionados();
    seletor.value = "";
    return;
  }
  acaoEmMassaPagamentosAtual = acao;
  previaAcoesEmMassaPagamentos = null;
  document.getElementById("campoStatusAcoesEmMassaPagamentos")?.classList.toggle("hidden", acao !== "alterar_status");
  document.getElementById("campoSituacaoAcoesEmMassaPagamentos")?.classList.toggle("hidden", acao !== "alterar_situacao");
  document.getElementById("campoObservacaoAcoesEmMassaPagamentos")?.classList.toggle("hidden", acao !== "adicionar_observacao");
  document.getElementById("campoConfirmacaoDestrutivaAcoesEmMassaPagamentos")?.classList.toggle("hidden", acao !== "enviar_lixeira");
  const motivo = document.getElementById("motivoAcoesEmMassaPagamentos");
  if (motivo) motivo.placeholder = acao === "enviar_lixeira" ? "Obrigatório para enviar à lixeira" : "Opcional";
  atualizarCamposAcoesEmMassaPagamentos();
  document.getElementById("resumoAcoesEmMassaPagamentos").textContent = `${idsPagamentosSelecionados.size} pagamentos serão analisados antes da alteração.`;
  document.getElementById("previewAcoesEmMassaPagamentos").innerHTML = "";
  atualizarStatusModal("statusAcoesEmMassaPagamentosMsg");
  document.getElementById("modalAcoesEmMassaPagamentos").style.display = "flex";
}

function renderizarPreviewAcoesEmMassaPagamentos(previa) {
  const itens = (previa.itens || []).slice(0, 20);
  document.getElementById("previewAcoesEmMassaPagamentos").innerHTML = `
    <div class="preview-acoes-resumo"><strong>${previa.resumo?.aplicaveis || 0} aplicáveis</strong><span>${previa.resumo?.bloqueados || 0} protegidos</span><span>${previa.resumo?.semAlteracao || 0} sem alteração</span><span>${previa.resumo?.ignorados || 0} ignorados</span></div>
    <ul>${itens.map((item) => `<li><strong>${escaparHtml(item.antes?.razaoSocial || item.entidadeId)}</strong><span>${item.resultado === "aplicavel" ? "Será alterado" : "Sem alteração"}</span></li>`).join("")}</ul>`;
}

async function analisarAcaoEmMassaPagamentos() {
  const parametros = montarParametrosAcoesEmMassaPagamentos();
  const motivo = document.getElementById("motivoAcoesEmMassaPagamentos")?.value.trim() || "";
  const botao = document.getElementById("confirmarAcaoEmMassaPagamentos");
  if (acaoEmMassaPagamentosAtual === "enviar_lixeira" && !motivo) {
    atualizarStatusModal("statusAcoesEmMassaPagamentosMsg", "Informe o motivo da exclusão.", "erro");
    return;
  }
  try {
    botao.disabled = true;
    atualizarStatusModal("statusAcoesEmMassaPagamentosMsg", "Analisando os pagamentos selecionados...", "aviso");
    const resposta = await fetch("/api/acoes-em-massa/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entidade: "pagamento",
        acao: acaoEmMassaPagamentosAtual,
        ids: [...idsPagamentosSelecionados],
        parametros,
        motivo,
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível analisar o lote.");
    previaAcoesEmMassaPagamentos = dados;
    renderizarPreviewAcoesEmMassaPagamentos(dados);
    if (acaoEmMassaPagamentosAtual === "enviar_lixeira") {
      const textoConfirmacao = `EXCLUIR ${dados.resumo?.aplicaveis || 0}`;
      document.getElementById("ajudaConfirmacaoDestrutivaAcoesEmMassaPagamentos").textContent = `Digite ${textoConfirmacao} para confirmar.`;
      document.getElementById("confirmacaoDestrutivaAcoesEmMassaPagamentos")?.focus();
    }
    atualizarStatusModal("statusAcoesEmMassaPagamentosMsg", "Prévia pronta. Confira antes de confirmar.", "sucesso");
    botao.textContent = "Confirmar alteração";
    botao.onclick = confirmarAcaoEmMassaPagamentos;
    botao.disabled = !(dados.resumo?.aplicaveis > 0);
  } catch (erro) {
    atualizarStatusModal("statusAcoesEmMassaPagamentosMsg", erro.message || "Erro ao analisar o lote.", "erro");
    botao.disabled = false;
  }
}

async function confirmarAcaoEmMassaPagamentos() {
  if (!previaAcoesEmMassaPagamentos) return;
  const botao = document.getElementById("confirmarAcaoEmMassaPagamentos");
  try {
    botao.disabled = true;
    atualizarStatusModal("statusAcoesEmMassaPagamentosMsg", "Aplicando as alterações...", "aviso");
    const resposta = await fetch("/api/acoes-em-massa/executar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loteId: previaAcoesEmMassaPagamentos.loteId,
        tokenConfirmacao: previaAcoesEmMassaPagamentos.tokenConfirmacao,
        confirmacaoDestrutiva: document.getElementById("confirmacaoDestrutivaAcoesEmMassaPagamentos")?.value.trim() || "",
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível executar o lote.");
    const totais = dados.totais || {};
    document.getElementById("previewAcoesEmMassaPagamentos").innerHTML = `<div class="preview-acoes-resumo resultado"><strong>${totais.aplicados || 0} aplicados</strong><span>${totais.semAlteracao || 0} sem alteração</span><span>${totais.conflitos || 0} conflitos</span><span>${totais.falhas || 0} falhas</span></div>`;
    atualizarStatusModal("statusAcoesEmMassaPagamentosMsg", "Ação concluída.", "sucesso");
    limparSelecaoPagamentos();
    await carregarPagamentos();
    botao.textContent = "Concluir";
    botao.onclick = fecharModalAcoesEmMassaPagamentos;
    botao.disabled = false;
  } catch (erro) {
    atualizarStatusModal("statusAcoesEmMassaPagamentosMsg", erro.message || "Erro ao executar o lote.", "erro");
    botao.disabled = false;
  }
}

function fecharLixeiraPagamentos() {
  document.getElementById("modalLixeiraPagamentos").style.display = "none";
  idsLixeiraPagamentosSelecionados.clear();
}

function atualizarSelecaoLixeiraPagamentos(id, selecionado) {
  const chave = String(id || "");
  if (selecionado) idsLixeiraPagamentosSelecionados.add(chave);
  else idsLixeiraPagamentosSelecionados.delete(chave);
  const botao = document.getElementById("btnRestaurarLixeiraPagamentos");
  if (botao) botao.disabled = idsLixeiraPagamentosSelecionados.size === 0;
}

function renderizarLixeiraPagamentos() {
  const lista = document.getElementById("listaLixeiraPagamentos");
  const contador = document.getElementById("contadorLixeiraPagamentos");
  if (!lista || !contador) return;
  contador.textContent = `${itensLixeiraPagamentos.length} ${itensLixeiraPagamentos.length === 1 ? "registro" : "registros"}`;
  lista.replaceChildren();
  if (!itensLixeiraPagamentos.length) {
    const vazio = document.createElement("p");
    vazio.className = "lixeira-vazia";
    vazio.textContent = "A lixeira está vazia.";
    lista.appendChild(vazio);
  }
  itensLixeiraPagamentos.forEach((item) => {
    const rotulo = document.createElement("label");
    rotulo.className = "item-lixeira";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = item.id;
    checkbox.checked = idsLixeiraPagamentosSelecionados.has(String(item.id));
    checkbox.setAttribute("aria-label", `Selecionar pagamento de ${item.razaoSocial || item.id}`);
    checkbox.addEventListener("change", () => atualizarSelecaoLixeiraPagamentos(item.id, checkbox.checked));
    const detalhes = document.createElement("span");
    detalhes.className = "item-lixeira-detalhes";
    const titulo = document.createElement("strong");
    titulo.textContent = `${item.razaoSocial || "Sem identificação"} — nota ${item.notaFiscal || "-"}`;
    const exclusao = document.createElement("small");
    exclusao.textContent = `Excluído por ${item.excluidoPor || "usuário não informado"} em ${formatarDataHoraLixeira(item.excluidoEm)}`;
    const motivo = document.createElement("small");
    motivo.textContent = `Motivo: ${item.motivoExclusao || "não informado"}`;
    detalhes.append(titulo, exclusao, motivo);
    rotulo.append(checkbox, detalhes);
    lista.appendChild(rotulo);
  });
  atualizarSelecaoLixeiraPagamentos("", false);
}

function formatarDataHoraLixeira(valor) {
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? "data não informada" : data.toLocaleString("pt-BR");
}

async function abrirLixeiraPagamentos() {
  document.getElementById("modalLixeiraPagamentos").style.display = "flex";
  idsLixeiraPagamentosSelecionados.clear();
  atualizarStatusModal("statusLixeiraPagamentos", "Carregando lixeira...", "aviso");
  try {
    const resposta = await fetch("/api/lixeira?entidade=pagamento");
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível carregar a lixeira.");
    itensLixeiraPagamentos = Array.isArray(dados) ? dados : [];
    renderizarLixeiraPagamentos();
    atualizarStatusModal("statusLixeiraPagamentos");
  } catch (erro) {
    itensLixeiraPagamentos = [];
    renderizarLixeiraPagamentos();
    atualizarStatusModal("statusLixeiraPagamentos", erro.message || "Erro ao carregar a lixeira.", "erro");
  }
}

function selecionarTodosLixeiraPagamentos() {
  const selecionar = idsLixeiraPagamentosSelecionados.size !== itensLixeiraPagamentos.length;
  idsLixeiraPagamentosSelecionados.clear();
  if (selecionar) itensLixeiraPagamentos.slice(0, 100).forEach((item) => idsLixeiraPagamentosSelecionados.add(String(item.id)));
  renderizarLixeiraPagamentos();
}

async function restaurarSelecionadosLixeiraPagamentos() {
  const ids = [...idsLixeiraPagamentosSelecionados];
  if (!ids.length) return;
  const botao = document.getElementById("btnRestaurarLixeiraPagamentos");
  try {
    botao.disabled = true;
    atualizarStatusModal("statusLixeiraPagamentos", "Analisando a restauração...", "aviso");
    const analise = await fetch("/api/lixeira/restaurar/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entidade: "pagamento", ids }),
    });
    const previa = await analise.json();
    if (!analise.ok) throw new Error(previa.erro || "Não foi possível analisar a restauração.");
    const aplicaveis = previa.resumo?.aplicaveis || 0;
    if (!aplicaveis || !window.confirm(`Restaurar ${aplicaveis} ${aplicaveis === 1 ? "pagamento" : "pagamentos"}?`)) return;
    const execucao = await fetch("/api/lixeira/restaurar/executar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loteId: previa.loteId, tokenConfirmacao: previa.tokenConfirmacao }),
    });
    const resultado = await execucao.json();
    if (!execucao.ok) throw new Error(resultado.erro || "Não foi possível restaurar os pagamentos.");
    atualizarStatusModal("statusLixeiraPagamentos", `${resultado.totais?.aplicados || 0} restaurados.`, "sucesso");
    await Promise.all([abrirLixeiraPagamentos(), carregarPagamentos()]);
  } catch (erro) {
    atualizarStatusModal("statusLixeiraPagamentos", erro.message || "Erro ao restaurar os pagamentos.", "erro");
  } finally {
    botao.disabled = idsLixeiraPagamentosSelecionados.size === 0;
  }
}

function formatarMoedaCentavos(valor) {
  return moeda.format(Number(valor || 0) / 100);
}

function formatarCentavosParaCampo(valor) {
  return (Number(valor || 0) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 });
}

function formatarData(data) {
  if (!data) return "";
  const partes = String(data).split("-");
  return partes.length === 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : data;
}

function moedaParaCentavos(valor) {
  const texto = String(valor || "").replace(/R\$\s?/gi, "").replace(/\s+/g, "").replace(/\./g, "").replace(",", ".");
  const numero = Number(texto || 0);
  return Number.isFinite(numero) && numero >= 0 ? Math.round(numero * 100) : NaN;
}

function digitosBuscaValor(valor) {
  const texto = String(valor ?? "").trim().replace(/^R\$\s*/i, "").replace(/\s+/g, "");
  return texto && !/[^0-9.,]/.test(texto) ? texto.replace(/\D/g, "") : "";
}

function digitosValor(item, campo) {
  const centavos = Number(item[campo === "valorConta" ? "valorContaCentavos" : "valorLiquidoCentavos"]);
  return Number.isSafeInteger(centavos) && centavos >= 0 ? String(centavos).padStart(3, "0") : "";
}

function formatarCampoMoedaPagamento(campo) {
  const centavos = moedaParaCentavos(campo.value);
  if (Number.isFinite(centavos)) campo.value = formatarCentavosParaCampo(centavos);
  atualizarResumoModalPagamento();
}

function normalizarBusca(valor) {
  return String(valor || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function obterNomeExibicaoUsuario(dados) {
  const usuario = dados?.usuario && typeof dados.usuario === "object" ? dados.usuario : dados;
  return usuario?.nome || usuario?.usuario || "-";
}

function obterUsuarioSessaoPagamentos(dados) {
  return dados?.usuario && typeof dados.usuario === "object" ? dados.usuario : dados;
}

function usuarioPodeImportarPlanilha() {
  if (usuarioLogadoPagamentos?.permissoes?.importacaoPlanilha === true) return true;
  const identificadores = [
    usuarioLogadoPagamentos?.usuario,
    usuarioLogadoPagamentos?.nome,
  ].map(normalizarBusca);

  return identificadores.some((identificador) =>
    USUARIOS_IMPORTACAO_PLANILHA_AUTORIZADOS.has(identificador)
  );
}

function avisarImportacaoPlanilhaNaoAutorizada(statusId) {
  if (statusId) atualizarStatusModal(statusId, MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA, "erro");
  mostrarAvisoInterface(MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA, "erro");
}

function pagamentoConfirmado(item) {
  return normalizarBusca(item.pagamento) === "confirmado";
}

function pagamentoCancelado(item) {
  return normalizarBusca(item.status) === "cancelado";
}

function chaveOrdenacaoCompetencia(valor) {
  const texto = String(valor || "").toUpperCase();
  const match = texto.match(/^([A-Z]{3})\/(\d{4})$/);
  if (!match) return 999999;
  return Number(match[2]) * 100 + (ordemMeses.get(match[1]) || 99);
}

function obterNumeroNotaFiscal(valor) {
  const match = String(valor || "").match(/\d+/);
  return match ? Number(match[0]) : null;
}

function compararPagamentosPorOrdem(a, b) {
  const direcao = ordenacaoPagamentos === "desc" ? -1 : 1;
  if (criterioOrdenacaoPagamentos === "emissao") {
    const dataA = String(a?.emissao || "");
    const dataB = String(b?.emissao || "");
    if (Boolean(dataA) !== Boolean(dataB)) return dataA ? -1 : 1;
    const diferencaData = dataA.localeCompare(dataB);
    if (diferencaData !== 0) return diferencaData * direcao;
  }
  const notaA = String(a?.notaFiscal || "").trim();
  const notaB = String(b?.notaFiscal || "").trim();
  const semNotaA = !notaA;
  const semNotaB = !notaB;

  if (semNotaA !== semNotaB) return semNotaA ? 1 : -1;

  const numeroNotaA = obterNumeroNotaFiscal(notaA);
  const numeroNotaB = obterNumeroNotaFiscal(notaB);
  if (numeroNotaA !== null && numeroNotaB !== null && numeroNotaA !== numeroNotaB) {
    return (numeroNotaA - numeroNotaB) * direcao;
  }
  if ((numeroNotaA === null) !== (numeroNotaB === null)) return numeroNotaA === null ? 1 : -1;

  const nota = notaA.localeCompare(notaB, "pt-BR", { numeric: true, sensitivity: "base" });
  if (nota !== 0) return nota * direcao;

  const competencia = chaveOrdenacaoCompetencia(a?.competencia) - chaveOrdenacaoCompetencia(b?.competencia);
  if (competencia !== 0) return competencia * direcao;

  const emissao = String(a?.emissao || "").localeCompare(String(b?.emissao || ""), "pt-BR", { numeric: true, sensitivity: "base" });
  if (emissao !== 0) return emissao * direcao;

  const razao = String(a?.razaoSocial || "").localeCompare(String(b?.razaoSocial || ""), "pt-BR", { numeric: true, sensitivity: "base" });
  return razao * direcao;
}

function atualizarBotaoOrdenacaoPagamentos() {
  for (const [id, criterio, rotulo, nome] of [
    ["ordenarPagamentos", "nota", "Nota", "número da nota"],
    ["ordenarPagamentosEmissao", "emissao", "Emissão", "data de emissão"],
  ]) {
    const botao = document.getElementById(id);
    if (!botao) continue;
    const ativo = criterioOrdenacaoPagamentos === criterio;
    const descricao = ativo
      ? `Ordenado por ${nome} em ordem ${ordenacaoPagamentos === "asc" ? "crescente" : "decrescente"}`
      : `Ordenar por ${nome} em ordem crescente`;
    botao.textContent = ativo ? `${rotulo} ${ordenacaoPagamentos === "asc" ? "↑" : "↓"}` : rotulo;
    botao.setAttribute("aria-pressed", String(ativo));
    botao.setAttribute("aria-label", descricao);
    botao.title = descricao;
  }
}

function alternarOrdenacaoPagamentos(criterio = "nota") {
  if (criterioOrdenacaoPagamentos === criterio) ordenacaoPagamentos = ordenacaoPagamentos === "asc" ? "desc" : "asc";
  else {
    criterioOrdenacaoPagamentos = criterio;
    ordenacaoPagamentos = "asc";
  }
  filtrarPagamentos();
}

function alternarModoValoresResumoPagamentos() {
  modoValoresResumoPagamentos = modoValoresResumoPagamentos === "bruto" ? "liquido" : "bruto";
  localStorage.setItem("pagamentosResumoModoValor", modoValoresResumoPagamentos);
  renderizarResumo();
  renderizarGraficos(true);
}

function setTabelaMensagem(mensagem, classe = "financeiro-vazio") {
  const tbody = document.getElementById("tabelaPagamentosAbertos");
  if (tbody) tbody.innerHTML = `<tr><td colspan="13" class="${classe}">${escaparHtml(mensagem)}</td></tr>`;
}

async function carregarContratosPagamento() {
  const resposta = await fetch("/api/contratos/detalhados", { cache: "no-store" });
  if (!resposta.ok) throw new Error("Não foi possível carregar os contratos.");
  const dados = await resposta.json();
  contratosPagamento = Array.isArray(dados.itens) ? dados.itens : [];
  renderizarTabela();
}

function rotuloContratoPagamento(id) {
  if (!id) return "Sem contrato";
  const contrato = contratosPagamento.find((item) => item.id === id);
  return contrato ? `${contrato.orgao} · ${contrato.numeroContrato}` : "Contrato vinculado";
}

function marcarContratoPagamentoManual() {
  contratoPagamentoEscolhidoManualmente = true;
}

function sugerirContratoPagamento() {
  if (contratoPagamentoEscolhidoManualmente || document.getElementById("pagamentoId")?.value) return;
  const razao = normalizarBusca(document.getElementById("pagRazaoSocial")?.value);
  const encontrados = contratosPagamento.filter((item) => normalizarBusca(item.orgao) === razao);
  document.getElementById("pagContratoId").value = encontrados.length === 1 ? encontrados[0].id : "";
}

function preencherContratosPagamento(item = null) {
  const select = document.getElementById("pagContratoId");
  select.innerHTML = '<option value="">Sem contrato</option>' + contratosPagamento
    .map((contrato) => `<option value="${escaparHtml(contrato.id)}">${escaparHtml(contrato.orgao)} · ${escaparHtml(contrato.numeroContrato)} · ${escaparHtml(contrato.descricao)}</option>`)
    .join("");
  select.value = item?.contratoId || "";
  if (!item) sugerirContratoPagamento();
}

async function carregarUsuarioPagamentos() {
  try {
    const resposta = await fetch("/api/me", { cache: "no-store" });
    if (!resposta.ok) throw new Error("HTTP " + resposta.status);
    const dados = await resposta.json();
    usuarioLogadoPagamentos = obterUsuarioSessaoPagamentos(dados);
    document.getElementById("usuarioLogadoNome").textContent = obterNomeExibicaoUsuario(dados);
  } catch {
    usuarioLogadoPagamentos = null;
    document.getElementById("usuarioLogadoNome").textContent = "-";
  }
}

function opcoesUnicas(campo) {
  return [...new Set(pagamentosAbertos.map((item) => item[campo]).filter(Boolean))].sort((a, b) => {
    if (campo === "competencia") return chaveOrdenacaoCompetencia(a) - chaveOrdenacaoCompetencia(b);
    return a.localeCompare(b, "pt-BR");
  });
}

function opcoesPagamento() {
  const possuiAberto = pagamentosAbertos.some((item) => !pagamentoConfirmado(item));
  const possuiConfirmado = pagamentosAbertos.some((item) => pagamentoConfirmado(item));
  return [
    ...(possuiAberto ? ["EM ABERTO"] : []),
    ...(possuiConfirmado ? ["CONFIRMADO"] : []),
  ];
}

function preencherSelect(id, valores, label, rotulos = {}) {
  const el = document.getElementById(id);
  if (!el) return;
  const atual = el.value;
  el.innerHTML = `<option value="">${label}</option>` + valores.map((valor) => `<option value="${escaparHtml(valor)}">${escaparHtml(rotulos[valor] || valor)}</option>`).join("");
  el.value = valores.includes(atual) ? atual : "";
}

function rotuloStatusPagamento(status) {
  return status === "EM ANALISE" ? "EM ANÁLISE" : status;
}

function preencherDatalist(id, valores) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = valores.map((valor) => `<option value="${escaparHtml(valor)}"></option>`).join("");
}

function garantirOpcaoSelect(id, valor) {
  const el = document.getElementById(id);
  const texto = String(valor || "").trim();
  if (!el || !texto) return;
  if ([...el.options].some((option) => option.value === texto)) return;
  const option = document.createElement("option");
  option.value = texto;
  option.textContent = id === "pagStatus" ? rotuloStatusPagamento(texto) : texto;
  el.appendChild(option);
}

function atualizarListasApoioPagamento() {
  preencherDatalist("listaCompetenciasPagamento", opcoesUnicas("competencia"));
  preencherDatalist("listaRazoesPagamento", opcoesUnicas("razaoSocial"));
  preencherDatalist("listaEmpresasPagamento", opcoesUnicas("empresa"));
}

function atualizarFiltros() {
  preencherSelect("filtroCompetenciaPagamentos", opcoesUnicas("competencia"), "Competência");
  preencherSelect("filtroEmpresaPagamentos", opcoesUnicas("empresa"), "Empresa");
  const status = [FILTRO_STATUS_NAO_APTO, ...opcoesUnicas("status")];
  preencherSelect("filtroStatusPagamentos", status, "Status", { [FILTRO_STATUS_NAO_APTO]: "NÃO APTO", "EM ANALISE": "EM ANÁLISE" });
  preencherSelect("filtroPagamentoPagamentos", opcoesPagamento(), "Pagamento");
  atualizarListasApoioPagamento();
}

async function carregarPagamentos() {
  setTabelaMensagem("Carregando pagamentos...");
  try {
    const resposta = await fetch("/api/pagamentos-abertos", { cache: "no-store" });
    if (!resposta.ok) {
      if (resposta.status === 403) throw new Error("Usuário sem permissão para acessar pagamentos em aberto.");
      throw new Error("Erro HTTP " + resposta.status);
    }
    const dados = await resposta.json();
    pagamentosAbertos = Array.isArray(dados.itens) ? dados.itens : [];
    atualizarFiltros();
    filtrarPagamentos();
  } catch (erro) {
    pagamentosAbertos = [];
    pagamentosFiltrados = [];
    renderizarResumo();
    renderizarGraficos();
    setTabelaMensagem(erro.message || "Erro ao carregar pagamentos em aberto.", "financeiro-erro");
  }
}

function sincronizarPagamentosTempoReal() {
  if (sincronizacaoPagamentosPendente) return sincronizacaoPagamentosPendente;
  sincronizacaoPagamentosPendente = carregarPagamentos().finally(() => {
    sincronizacaoPagamentosPendente = null;
  });
  return sincronizacaoPagamentosPendente;
}

function iniciarTempoRealPagamentos() {
  if (!("EventSource" in window) || canalTempoRealPagamentos) return;
  canalTempoRealPagamentos = new EventSource("/api/notificacoes/stream");
  ["pagamentos_atualizados"].forEach((evento) => {
    canalTempoRealPagamentos.addEventListener(evento, sincronizarPagamentosTempoReal);
  });
  canalTempoRealPagamentos.addEventListener("contratos_atualizados", async () => {
    const selecionado = document.getElementById("pagContratoId")?.value || "";
    await carregarContratosPagamento().catch(() => {});
    if (document.getElementById("modalPagamentoAberto")?.style.display === "flex") {
      preencherContratosPagamento({ contratoId: selecionado });
    }
  });
  canalTempoRealPagamentos.addEventListener("error", () => {
    if (canalTempoRealPagamentos?.readyState === EventSource.CLOSED) {
      canalTempoRealPagamentos = null;
    }
  });
}

function obterFiltros() {
  return {
    busca: normalizarBusca(document.getElementById("filtroBuscaPagamentos").value),
    campoBusca: document.getElementById("campoBuscaPagamentos")?.value || "todos",
    competencia: document.getElementById("filtroCompetenciaPagamentos").value,
    empresa: document.getElementById("filtroEmpresaPagamentos").value,
    status: document.getElementById("filtroStatusPagamentos").value,
    pagamento: document.getElementById("filtroPagamentoPagamentos").value,
    vinculoContrato: document.getElementById("filtroVinculoContratoPagamentos").value,
    tipoData: document.getElementById("filtroTipoDataPagamentos")?.value || "emissao",
    dataInicial: document.getElementById("filtroDataInicialPagamentos").value,
    dataFinal: document.getElementById("filtroDataFinalPagamentos").value,
  };
}

function obterTextoBuscaPagamento(item, campoBusca) {
  if (campoBusca === "razaoSocial") return item.razaoSocial || "";
  if (campoBusca === "notaFiscal") return item.notaFiscal || "";
  if (campoBusca === "empresa") return item.empresa || "";
  if (campoBusca === "status") return item.status || "";
  if (campoBusca === "competencia") return item.competencia || "";
  return [item.razaoSocial, item.empresa, item.esfera, item.notaFiscal, item.status, item.pagamento, item.competencia].join(" ");
}

function atualizarCampoBuscaPagamentos() {
  const campo = document.getElementById("filtroBuscaPagamentos");
  const porValor = ["valorConta", "valorLiquido"].includes(document.getElementById("campoBuscaPagamentos")?.value);
  campo.placeholder = porValor ? "Ex.: 1.234,56" : "Buscar...";
  campo.inputMode = porValor ? "decimal" : "text";
}

function atualizarTipoDataPagamentos() {
  const tipo = document.getElementById("filtroTipoDataPagamentos")?.value === "pagamento" ? "Pagamento" : "Emissão";
  ["Inicial", "Final"].forEach((extremo) => {
    const rotulo = extremo.toLowerCase();
    document.getElementById(`ajudaData${extremo}Pagamentos`).textContent = `${tipo} ${rotulo} · dd/mm/aaaa`;
    const campo = document.getElementById(`filtroData${extremo}Pagamentos`);
    campo.title = `Data ${rotulo} de ${tipo.toLowerCase()} da nota`;
    campo.setAttribute("aria-label", campo.title);
  });
}

function filtrarPagamentos() {
  limparSelecaoPagamentos();
  const filtros = obterFiltros();
  const buscaPorValor = ["valorConta", "valorLiquido"].includes(filtros.campoBusca);
  const valorBuscado = buscaPorValor
    ? digitosBuscaValor(filtros.busca)
    : "";
  pagamentosFiltrados = pagamentosAbertos.filter((item) => {
    if (filtros.competencia && item.competencia !== filtros.competencia) return false;
    if (filtros.empresa && item.empresa !== filtros.empresa) return false;
    if (filtros.status === FILTRO_STATUS_NAO_APTO && String(item.status ?? "").trim() !== "") return false;
    if (filtros.status && filtros.status !== FILTRO_STATUS_NAO_APTO && item.status !== filtros.status) return false;
    if (filtros.pagamento === "EM ABERTO" && (pagamentoConfirmado(item) || pagamentoCancelado(item))) return false;
    if (filtros.pagamento === "CONFIRMADO" && !pagamentoConfirmado(item)) return false;
    if (filtros.pagamento && !["EM ABERTO", "CONFIRMADO"].includes(filtros.pagamento) && item.pagamento !== filtros.pagamento) return false;
    if (filtros.vinculoContrato === "com" && !item.contratoId) return false;
    if (filtros.vinculoContrato === "sem" && item.contratoId) return false;
    const dataFiltrada = filtros.tipoData === "pagamento" ? item.dataPagamento : item.emissao;
    if ((filtros.dataInicial || filtros.dataFinal) && !dataFiltrada) return false;
    if (filtros.dataInicial && dataFiltrada < filtros.dataInicial) return false;
    if (filtros.dataFinal && dataFiltrada > filtros.dataFinal) return false;
    if (filtros.busca) {
      if (buscaPorValor) {
        if (!valorBuscado || !digitosValor(item, filtros.campoBusca).includes(valorBuscado)) return false;
      } else {
        const alvo = normalizarBusca(obterTextoBuscaPagamento(item, filtros.campoBusca));
        if (!alvo.includes(filtros.busca)) return false;
      }
    }
    return true;
  }).sort(compararPagamentosPorOrdem);
  atualizarBotaoOrdenacaoPagamentos();
  renderizarResumo();
  renderizarTabela();
  renderizarGraficos(true);
  estadoAnimacaoGraficos.primeiraRenderizacao = false;
}

function obterCampoValorResumoPagamentos() {
  return modoValoresResumoPagamentos === "liquido" ? "valorLiquidoCentavos" : "valorContaCentavos";
}

function renderizarResumo() {
  const itensSomatorio = pagamentosFiltrados.filter((item) => !pagamentoCancelado(item));
  const emAberto = itensSomatorio.filter((item) => !pagamentoConfirmado(item));
  const filtroPagamento = document.getElementById("filtroPagamentoPagamentos")?.value || "";
  const itensValorDestaque = filtroPagamento === "CONFIRMADO" ? itensSomatorio : emAberto;
  const labelValorDestaque = filtroPagamento === "CONFIRMADO" ? "Valor confirmado" : "Valor em aberto";
  const usarLiquido = modoValoresResumoPagamentos === "liquido";
  const campoValor = obterCampoValorResumoPagamentos();
  const modoTexto = usarLiquido ? "Líquido" : "Bruto";
  document.getElementById("pagResumoTotal").textContent = itensSomatorio.length;
  document.getElementById("pagResumoAberto").textContent = emAberto.length;
  document.getElementById("pagResumoValorAbertoLabel").textContent = labelValorDestaque;
  document.getElementById("pagResumoValorAberto").textContent = formatarMoedaCentavos(itensValorDestaque.reduce((total, item) => total + Number(item[campoValor] || 0), 0));
  document.getElementById("pagResumoTotalGeral").textContent = formatarMoedaCentavos(itensSomatorio.reduce((total, item) => total + Number(item[campoValor] || 0), 0));
  document.getElementById("pagResumoModoValorAberto").textContent = modoTexto;
  document.getElementById("pagResumoModoTotalGeral").textContent = modoTexto;
  document.getElementById("pagResumoModoValorAberto").setAttribute("aria-label", `Alternar resumo para valor ${usarLiquido ? "bruto" : "líquido"}`);
  document.getElementById("pagResumoModoTotalGeral").setAttribute("aria-label", `Alternar resumo para valor ${usarLiquido ? "bruto" : "líquido"}`);
  document.getElementById("contadorPagamentos").textContent = pagamentosFiltrados.length;
}

function renderizarTabela() {
  const tbody = document.getElementById("tabelaPagamentosAbertos");
  if (!tbody) return;
  if (!pagamentosFiltrados.length) {
    setTabelaMensagem("Nenhum pagamento encontrado.");
    return;
  }
  tbody.innerHTML = pagamentosFiltrados.map((item) => {
    const classe = pagamentoConfirmado(item) ? "pagamento-confirmado" : "pagamento-aberto";
    const selecionado = idsPagamentosSelecionados.has(String(item.id));
    const colunaSelecao = modoSelecaoPagamentos
      ? `<td class="coluna-selecao-pagamento"><input type="checkbox" class="checkbox-selecao-pagamento" data-id="${escaparHtml(item.id)}" aria-label="Selecionar pagamento de ${escaparHtml(item.razaoSocial)}" ${selecionado ? "checked" : ""} onchange="alternarSelecaoPagamento('${item.id}', this.checked)"></td>`
      : "";
    return `<tr class="${classe}${selecionado ? " selecionado-em-massa" : ""}">
      ${colunaSelecao}
      <td>${escaparHtml(item.competencia)}</td><td>${escaparHtml(item.razaoSocial)}<small class="pagamento-contrato-indicador">${escaparHtml(rotuloContratoPagamento(item.contratoId))}</small></td><td>${escaparHtml(item.empresa)}</td><td>${escaparHtml(item.esfera)}</td>
      <td>${escaparHtml(item.notaFiscal)}</td><td>${formatarData(item.emissao)}</td><td>${formatarMoedaCentavos(item.valorContaCentavos)}</td><td>${formatarMoedaCentavos(item.valorLiquidoCentavos)}</td>
      <td>${escaparHtml(rotuloStatusPagamento(item.status))}</td><td>${escaparHtml(item.pagamento || "EM ABERTO")}</td><td>${formatarData(item.dataPagamento)}</td>
      <td class="acoes-tabela"><button onclick="editarPagamento('${item.id}')">Editar</button><button onclick="excluirPagamento('${item.id}')">Excluir</button></td>
    </tr>`;
  }).join("");
}

function agruparValor(campo) {
  const mapa = new Map();
  const campoValor = obterCampoValorResumoPagamentos();
  pagamentosFiltrados.filter((item) => !pagamentoCancelado(item)).forEach((item) => {
    const chave = item[campo] || "Sem info";
    mapa.set(chave, (mapa.get(chave) || 0) + Number(item[campoValor] || 0));
  });
  const lista = [...mapa.entries()];
  if (campo === "competencia") return lista.sort((a, b) => chaveOrdenacaoCompetencia(a[0]) - chaveOrdenacaoCompetencia(b[0]));
  return lista.sort((a, b) => b[1] - a[1]).slice(0, 8);
}

function desenharBarras(canvasId, dados, opcoes = {}, progresso = 1) {
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
  const valueW = opcoes.valueW || 112;
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
    grad.addColorStop(0, opcoes.corInicio || "#0f766e");
    grad.addColorStop(1, opcoes.corFim || "#14b8a6");
    ctx.fillStyle = "#0f172a";
    ctx.font = "600 12px Arial";
    ctx.fillText(String(label).slice(0, 17), 12, y + 14);
    ctx.fillStyle = grad;
    ctx.fillRect(chartX, y, largura, barH);
    ctx.fillStyle = "#334155";
    ctx.font = "12px Arial";
    const textoValor = opcoes.formatar ? opcoes.formatar(valor) : formatarMoedaCentavos(valor);
    ctx.fillText(textoValor, chartX + chartW + 10, y + 14);
  });
}

function obterDadosGraficos() {
  const dadosCompetencia = agruparValor("competencia");
  const dadosEmpresa = agruparValor("empresa");
  const status = new Map([["Confirmado", 0], ["Em aberto", 0], ["Cancelado", 0]]);
  pagamentosFiltrados.forEach((item) => {
    const chave = pagamentoCancelado(item)
      ? "Cancelado"
      : pagamentoConfirmado(item) ? "Confirmado" : "Em aberto";
    status.set(chave, (status.get(chave) || 0) + 1);
  });
  return {
    dadosCompetencia,
    dadosEmpresa,
    dadosStatus: [...status.entries()],
  };
}

function desenharGraficosComProgresso(graficos, progresso) {
  desenharBarras("graficoCompetenciaPagamentos", graficos.dadosCompetencia, { labelW: 96, valueW: 124, corInicio: "#155e75", corFim: "#0891b2" }, progresso);
  desenharBarras("graficoEmpresaPagamentos", graficos.dadosEmpresa, { labelW: 84, valueW: 124, corInicio: "#166534", corFim: "#22c55e" }, progresso);
  desenharBarras("graficoStatusPagamentos", graficos.dadosStatus, { labelW: 92, valueW: 70, corInicio: "#7c3aed", corFim: "#a78bfa", formatar: (valor) => `${valor} reg.` }, progresso);
}

function atualizarTitulosGraficosPagamentos() {
  const modoTexto = modoValoresResumoPagamentos === "liquido" ? "líquidos" : "brutos";
  const tituloCompetencia = document.getElementById("tituloGraficoCompetenciaPagamentos");
  const tituloEmpresa = document.getElementById("tituloGraficoEmpresaPagamentos");
  if (tituloCompetencia) tituloCompetencia.textContent = `Valores ${modoTexto} por competência (R$)`;
  if (tituloEmpresa) tituloEmpresa.textContent = `Valores ${modoTexto} por empresa (R$)`;
}

function renderizarGraficos(animar = false) {
  atualizarTitulosGraficosPagamentos();
  const graficos = obterDadosGraficos();
  if (!animar) {
    desenharGraficosComProgresso(graficos, 1);
    return;
  }
  if (estadoAnimacaoGraficos.frameId) cancelAnimationFrame(estadoAnimacaoGraficos.frameId);
  const inicio = performance.now();
  const duracaoMs = 1100;
  const passo = (agora) => {
    const t = Math.min(1, (agora - inicio) / duracaoMs);
    const easeOut = 1 - Math.pow(1 - t, 3);
    desenharGraficosComProgresso(graficos, easeOut);
    if (t < 1) {
      estadoAnimacaoGraficos.frameId = requestAnimationFrame(passo);
    } else {
      estadoAnimacaoGraficos.frameId = null;
    }
  };
  estadoAnimacaoGraficos.frameId = requestAnimationFrame(passo);
}

function limparFiltrosPagamentos() {
  ["filtroBuscaPagamentos", "filtroCompetenciaPagamentos", "filtroEmpresaPagamentos", "filtroStatusPagamentos", "filtroPagamentoPagamentos", "filtroVinculoContratoPagamentos", "filtroDataInicialPagamentos", "filtroDataFinalPagamentos"].forEach((id) => { document.getElementById(id).value = ""; });
  const campoBusca = document.getElementById("campoBuscaPagamentos");
  if (campoBusca) campoBusca.value = "todos";
  document.getElementById("filtroTipoDataPagamentos").value = "emissao";
  atualizarTipoDataPagamentos();
  atualizarCampoBuscaPagamentos();
  filtrarPagamentos();
}

function abrirModalExportacaoPagamentos() {
  atualizarStatusModal("statusExportacaoPagamentos");
  const opcaoTodos = document.querySelector('input[name="modoExportacaoPagamentos"][value="todos"]');
  if (opcaoTodos) opcaoTodos.checked = true;
  const opcaoSecretaria = document.querySelector('input[name="ordenacaoExportacaoPagamentos"][value="secretaria"]');
  if (opcaoSecretaria) opcaoSecretaria.checked = true;
  renderizarListaClientesExportacaoPagamentos();
  atualizarModoExportacaoPagamentos();
  document.getElementById("modalExportacaoPagamentos").style.display = "flex";
}

function fecharModalExportacaoPagamentos() {
  atualizarStatusModal("statusExportacaoPagamentos");
  document.getElementById("modalExportacaoPagamentos").style.display = "none";
}

function obterModoExportacaoPagamentos() {
  return document.querySelector('input[name="modoExportacaoPagamentos"]:checked')?.value || "todos";
}

function obterOrdenacaoExportacaoPagamentos() {
  return document.querySelector('input[name="ordenacaoExportacaoPagamentos"]:checked')?.value || "secretaria";
}

function atualizarModoExportacaoPagamentos() {
  const blocoClientes = document.getElementById("blocoExportacaoPagamentosClientes");
  if (!blocoClientes) return;
  blocoClientes.classList.toggle("hidden", obterModoExportacaoPagamentos() !== "clientes");
}

function obterClientesExportacaoPagamentos() {
  const clientes = new Map();
  pagamentosAbertos.forEach((item) => {
    const nome = String(item.razaoSocial || "").trim();
    const chave = normalizarBusca(nome);
    if (nome && !clientes.has(chave)) clientes.set(chave, nome);
  });
  return [...clientes.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function atualizarResumoSelecaoClientesExportacaoPagamentos() {
  const resumo = document.getElementById("resumoSelecaoClientesExportacaoPagamentos");
  if (!resumo) return;
  const total = document.querySelectorAll('input[name="clienteExportacaoPagamentos"]:checked').length;
  resumo.textContent = `${total} clientes marcados.`;
}

function renderizarListaClientesExportacaoPagamentos() {
  const container = document.getElementById("listaClientesExportacaoPagamentos");
  if (!container) return;
  const clientes = obterClientesExportacaoPagamentos();
  if (!clientes.length) {
    container.innerHTML = '<div class="lista-os-vazia">Nenhum cliente dispon&iacute;vel.</div>';
    atualizarResumoSelecaoClientesExportacaoPagamentos();
    return;
  }
  container.innerHTML = clientes.map((nome) => `
    <label class="item-os-planilha">
      <input type="checkbox" name="clienteExportacaoPagamentos" value="${escaparHtml(nome)}" onchange="atualizarResumoSelecaoClientesExportacaoPagamentos()">
      <span class="item-os-planilha-texto">${escaparHtml(nome)}</span>
    </label>
  `).join("");
  atualizarResumoSelecaoClientesExportacaoPagamentos();
}

function selecionarTodosClientesExportacaoPagamentos() {
  document.querySelectorAll('input[name="clienteExportacaoPagamentos"]').forEach((checkbox) => {
    checkbox.checked = true;
  });
  atualizarResumoSelecaoClientesExportacaoPagamentos();
}

function limparSelecaoClientesExportacaoPagamentos() {
  document.querySelectorAll('input[name="clienteExportacaoPagamentos"]').forEach((checkbox) => {
    checkbox.checked = false;
  });
  atualizarResumoSelecaoClientesExportacaoPagamentos();
}

function obterClientesExportacaoPagamentosSelecionados() {
  return Array.from(document.querySelectorAll('input[name="clienteExportacaoPagamentos"]:checked')).map((checkbox) => checkbox.value);
}

function montarUrlExportacaoPagamentos() {
  const params = new URLSearchParams({
    modo: obterModoExportacaoPagamentos(),
    ordenacao: obterOrdenacaoExportacaoPagamentos(),
  });
  if (params.get("modo") === "filtros") {
    const filtros = obterFiltros();
    Object.entries(filtros).forEach(([chave, valor]) => {
      if (valor) params.set(chave, valor);
    });
  } else if (params.get("modo") === "clientes") {
    obterClientesExportacaoPagamentosSelecionados().forEach((cliente) => {
      params.append("clientes", cliente);
    });
  }
  return `/api/pagamentos-abertos/planilha?${params.toString()}`;
}

function exportarPlanilhaPagamentos() {
  if (obterModoExportacaoPagamentos() === "clientes" && !obterClientesExportacaoPagamentosSelecionados().length) {
    atualizarStatusModal("statusExportacaoPagamentos", "Selecione pelo menos um cliente para exportar.", "erro");
    return;
  }
  atualizarStatusModal("statusExportacaoPagamentos", "Exportando planilha...", "aviso");
  window.demoBaixar(montarUrlExportacaoPagamentos());
  fecharModalExportacaoPagamentos();
}

function normalizarCompetenciaPagamento() {
  const campo = document.getElementById("pagCompetencia");
  if (!campo) return;
  const inicio = campo.selectionStart;
  const fim = campo.selectionEnd;
  campo.value = campo.value.toUpperCase();
  campo.setSelectionRange(inicio, fim);
}

function pagamentoModalConfirmado() {
  return normalizarBusca(document.getElementById("pagPagamento")?.value) === "confirmado";
}

function atualizarResumoModalPagamento() {
  const conta = moedaParaCentavos(document.getElementById("pagValorConta")?.value);
  const liquido = moedaParaCentavos(document.getElementById("pagValorLiquido")?.value);
  const contaSegura = Number.isFinite(conta) ? conta : 0;
  const liquidoSeguro = Number.isFinite(liquido) ? liquido : 0;
  const retencao = Math.max(0, contaSegura - liquidoSeguro);
  const confirmado = pagamentoModalConfirmado();
  const status = document.getElementById("pagStatus")?.value || "";
  const estadoEl = document.getElementById("pagamentoModalEstado");

  document.getElementById("pagResumoModalConta").textContent = formatarMoedaCentavos(contaSegura);
  document.getElementById("pagResumoModalLiquido").textContent = formatarMoedaCentavos(liquidoSeguro);
  document.getElementById("pagResumoModalRetencao").textContent = formatarMoedaCentavos(retencao);

  if (estadoEl) {
    estadoEl.textContent = confirmado ? "Confirmado" : (status || "Em aberto");
    estadoEl.classList.toggle("pagamento-modal-confirmado", confirmado);
    estadoEl.classList.toggle("pagamento-modal-aberto", !confirmado);
  }
}

function lerRetencoesPagamento() {
  const retencoes = {};
  for (const imposto of CalculoRetencoesPagamento.IMPOSTOS) {
    const id = `pagAliquota${imposto[0].toUpperCase()}${imposto.slice(1)}`;
    retencoes[imposto] = CalculoRetencoesPagamento.parsePercentual(document.getElementById(id).value);
  }
  return retencoes;
}

function atualizarRetencoesModalPagamento(aplicarAutomatico = false) {
  const estado = document.getElementById("pagRetencoesStatus");
  try {
    const conta = moedaParaCentavos(document.getElementById("pagValorConta").value);
    const retencoes = lerRetencoesPagamento();
    const calculo = CalculoRetencoesPagamento.calcularRetencoes(conta, retencoes);
    for (const imposto of CalculoRetencoesPagamento.IMPOSTOS) {
      const id = `pagValor${imposto[0].toUpperCase()}${imposto.slice(1)}`;
      document.getElementById(id).textContent = formatarMoedaCentavos(calculo.valores[imposto]);
    }
    if (aplicarAutomatico && liquidoModoPagamento === "automatico") {
      document.getElementById("pagValorLiquido").value = formatarCentavosParaCampo(calculo.liquidoCentavos);
    }
    const liquido = moedaParaCentavos(document.getElementById("pagValorLiquido").value);
    const diferenca = conta - liquido - calculo.totalCentavos;
    estado.textContent = liquidoModoPagamento === "automatico"
      ? `Líquido calculado. Impostos: ${formatarMoedaCentavos(calculo.totalCentavos)}.`
      : `Líquido manual.${diferenca ? ` Diferença além dos impostos: ${formatarMoedaCentavos(diferenca)}.` : ""}`;
    atualizarResumoModalPagamento();
    return { retencoes, calculo };
  } catch (erro) {
    estado.textContent = erro.message === "RETENCOES_SUPERAM_CONTA"
      ? "A soma dos impostos supera o Valor da conta."
      : "Informe percentuais válidos entre 0 e 100, com até quatro casas decimais.";
    atualizarResumoModalPagamento();
    return null;
  }
}

function alterarValorContaPagamento() {
  atualizarRetencoesModalPagamento(true);
}

function alterarAliquotaPagamento() {
  if (!liquidoManualBloqueadoPagamento) liquidoModoPagamento = "automatico";
  atualizarRetencoesModalPagamento(true);
}

function marcarLiquidoManualPagamento() {
  liquidoModoPagamento = "manual";
  liquidoManualBloqueadoPagamento = true;
  atualizarRetencoesModalPagamento();
}

function recalcularLiquidoPagamento() {
  liquidoModoPagamento = "automatico";
  liquidoManualBloqueadoPagamento = false;
  atualizarRetencoesModalPagamento(true);
}

function formatarAliquotaPagamento(campo) {
  try {
    campo.value = CalculoRetencoesPagamento.formatarPercentual(CalculoRetencoesPagamento.parsePercentual(campo.value));
  } catch { /* O aviso permanece visível até corrigir o campo. */ }
  atualizarRetencoesModalPagamento(true);
}

async function abrirModalPagamento(item = null) {
  try {
    await carregarContratosPagamento();
  } catch (erro) {
    mostrarAvisoInterface(erro.message, "erro");
    return;
  }
  contratoPagamentoEscolhidoManualmente = false;
  atualizarStatusModal("statusPagamentoAberto");
  document.getElementById("tituloModalPagamento").textContent = item ? "Editar pagamento" : "Novo pagamento";
  document.getElementById("subtituloModalPagamento").textContent = item
    ? "Atualize a situação, valores ou dados de conferência deste pagamento."
    : "Registre a cobrança, conferência e baixa do pagamento.";
  document.getElementById("pagamentoId").value = item?.id || "";
  document.getElementById("pagCompetencia").value = item?.competencia || "";
  document.getElementById("pagRazaoSocial").value = item?.razaoSocial || "";
  preencherContratosPagamento(item);
  document.getElementById("pagEmpresa").value = item?.empresa || "";
  garantirOpcaoSelect("pagEsfera", item?.esfera);
  document.getElementById("pagEsfera").value = item?.esfera || "";
  document.getElementById("pagNotaFiscal").value = item?.notaFiscal || "";
  document.getElementById("pagEmissao").value = item?.emissao || "";
  document.getElementById("pagValorConta").value = item ? formatarCentavosParaCampo(item.valorContaCentavos) : "";
  document.getElementById("pagValorLiquido").value = item ? formatarCentavosParaCampo(item.valorLiquidoCentavos) : "";
  for (const imposto of CalculoRetencoesPagamento.IMPOSTOS) {
    const id = `pagAliquota${imposto[0].toUpperCase()}${imposto.slice(1)}`;
    document.getElementById(id).value = CalculoRetencoesPagamento.formatarPercentual(item?.retencoes?.[imposto]);
  }
  liquidoModoPagamento = item?.liquidoModo || (item ? "manual" : "automatico");
  liquidoManualBloqueadoPagamento = Boolean(item && liquidoModoPagamento === "manual"
    && CalculoRetencoesPagamento.IMPOSTOS.some((imposto) => item.retencoes?.[imposto] !== null && item.retencoes?.[imposto] !== undefined));
  garantirOpcaoSelect("pagStatus", item?.status);
  document.getElementById("pagStatus").value = item?.status || "";
  garantirOpcaoSelect("pagPagamento", item?.pagamento);
  document.getElementById("pagPagamento").value = item?.pagamento || "";
  document.getElementById("pagDataPagamento").value = item?.dataPagamento || "";
  document.getElementById("pagObservacoes").value = item?.observacoes || "";
  atualizarListasApoioPagamento();
  atualizarResumoModalPagamento();
  atualizarRetencoesModalPagamento();
  document.getElementById("modalPagamentoAberto").style.display = "flex";
  setTimeout(() => document.getElementById("pagCompetencia")?.focus(), 0);
}

function fecharModalPagamento() { atualizarStatusModal("statusPagamentoAberto"); document.getElementById("modalPagamentoAberto").style.display = "none"; }
function editarPagamento(id) { const item = pagamentosAbertos.find((pagamento) => pagamento.id === id); if (item) abrirModalPagamento(item); }

async function salvarPagamento(event) {
  event.preventDefault();
  const retencoesCalculadas = atualizarRetencoesModalPagamento();
  if (!retencoesCalculadas) {
    atualizarStatusModal("statusPagamentoAberto", "Corrija os percentuais dos impostos antes de salvar.", "erro");
    return;
  }
  if (liquidoModoPagamento === "automatico"
    && moedaParaCentavos(document.getElementById("pagValorLiquido").value) !== retencoesCalculadas.calculo.liquidoCentavos) {
    liquidoModoPagamento = "manual";
    liquidoManualBloqueadoPagamento = true;
    atualizarRetencoesModalPagamento();
  }
  const id = document.getElementById("pagamentoId").value;
  const payload = {
    contratoId: document.getElementById("pagContratoId").value,
    competencia: document.getElementById("pagCompetencia").value.trim().toUpperCase(),
    razaoSocial: document.getElementById("pagRazaoSocial").value.trim(),
    empresa: document.getElementById("pagEmpresa").value.trim(),
    esfera: document.getElementById("pagEsfera").value.trim(),
    notaFiscal: document.getElementById("pagNotaFiscal").value.trim(),
    emissao: document.getElementById("pagEmissao").value,
    valorContaCentavos: moedaParaCentavos(document.getElementById("pagValorConta").value),
    valorLiquidoCentavos: moedaParaCentavos(document.getElementById("pagValorLiquido").value),
    retencoes: retencoesCalculadas.retencoes,
    liquidoModo: liquidoModoPagamento,
    status: document.getElementById("pagStatus").value.trim(),
    pagamento: document.getElementById("pagPagamento").value.trim(),
    dataPagamento: document.getElementById("pagDataPagamento").value,
    observacoes: document.getElementById("pagObservacoes").value.trim(),
  };
  if (!payload.competencia || !payload.razaoSocial) { atualizarStatusModal("statusPagamentoAberto", "Informe competência e razão social.", "erro"); return; }
  if (!Number.isFinite(payload.valorContaCentavos) || !Number.isFinite(payload.valorLiquidoCentavos)) { atualizarStatusModal("statusPagamentoAberto", "Informe valores válidos.", "erro"); return; }
  if (payload.valorLiquidoCentavos > payload.valorContaCentavos && !confirm("O valor líquido está maior que o valor da conta. Deseja salvar mesmo assim?")) return;
  if (normalizarBusca(payload.pagamento) === "confirmado" && !payload.dataPagamento && !confirm("Pagamento confirmado sem data de pagamento. Deseja salvar mesmo assim?")) return;
  const resposta = await fetch(id ? `/api/pagamentos-abertos/${id}` : "/api/pagamentos-abertos", { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
  if (!resposta.ok) { const erro = await resposta.json().catch(() => ({})); atualizarStatusModal("statusPagamentoAberto", erro.erro || "Erro ao salvar pagamento.", "erro"); return; }
  atualizarStatusModal("statusPagamentoAberto", "Pagamento salvo.", "sucesso");
  fecharModalPagamento(); await carregarPagamentos();
}

async function excluirPagamento(id) {
  const motivoExclusao = prompt("Para enviar este pagamento à lixeira, informe o motivo (obrigatório):");
  if (!motivoExclusao?.trim()) {
    mostrarAvisoInterface("A exclusão exige o motivo. Nenhum pagamento foi alterado.", "erro");
    return;
  }
  const resposta = await fetch(`/api/pagamentos-abertos/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivoExclusao: motivoExclusao.trim() }),
  });
  if (!resposta.ok) { const erro = await resposta.json().catch(() => ({})); mostrarAvisoInterface(erro.erro || "Erro ao enviar pagamento à lixeira.", "erro"); return; }
  await carregarPagamentos();
}

function lerArquivoComoBase64(arquivo) {
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(arquivo); });
}
function abrirModalImportacaoPagamentos() {
  if (!usuarioPodeImportarPlanilha()) { avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoPagamentos"); return; }
  invalidarAnaliseImportacaoPagamentos(); document.getElementById("arquivoImportacaoPagamentos").value = ""; document.getElementById("modalImportacaoPagamentos").style.display = "flex";
}
function fecharModalImportacaoPagamentos() { atualizarStatusModal("statusImportacaoPagamentos"); document.getElementById("modalImportacaoPagamentos").style.display = "none"; }

function invalidarAnaliseImportacaoPagamentos() {
  arquivoImportacaoAtual = null;
  analiseImportacaoAtual = null;
  atualizarStatusModal("statusImportacaoPagamentos");
  document.getElementById("resultadoImportacaoPagamentos").classList.add("hidden");
  document.getElementById("btnConfirmarImportacaoPagamentos").disabled = true;
}

async function analisarImportacaoPagamentos() {
  if (!usuarioPodeImportarPlanilha()) { avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoPagamentos"); return; }
  const arquivo = document.getElementById("arquivoImportacaoPagamentos").files[0];
  invalidarAnaliseImportacaoPagamentos();
  if (!arquivo) { atualizarStatusModal("statusImportacaoPagamentos", "Selecione uma planilha Excel.", "erro"); return; }
  atualizarStatusModal("statusImportacaoPagamentos", "Analisando planilha...", "aviso");
  const arquivoAtual = { nomeOriginal: arquivo.name };
  arquivoImportacaoAtual = arquivoAtual;
  try {
    arquivoAtual.conteudoBase64 = await lerArquivoComoBase64(arquivo);
    if (arquivoImportacaoAtual !== arquivoAtual) return;
    const resposta = await fetch("/api/pagamentos-abertos/importacao/analisar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivo: arquivoAtual }) });
    const resultado = await resposta.json().catch(() => ({}));
    if (arquivoImportacaoAtual !== arquivoAtual) return;
    if (!resposta.ok) { atualizarStatusModal("statusImportacaoPagamentos", resultado.erro || "Erro ao analisar planilha.", "erro"); return; }
    analiseImportacaoAtual = resultado; renderizarPreviewImportacao(resultado);
    atualizarStatusModal("statusImportacaoPagamentos", `Análise pronta: ${resultado.resumo?.validos || 0} válidos, ${resultado.resumo?.criados || 0} novos e ${resultado.resumo?.atualizados || 0} atualizações. Confira também os avisos.`, resultado.resumo?.validos ? "sucesso" : "aviso");
  } catch {
    if (arquivoImportacaoAtual === arquivoAtual) atualizarStatusModal("statusImportacaoPagamentos", "Não foi possível analisar a planilha. Tente novamente.", "erro");
  }
}

function formatarImpostoPreviewImportacao(item, imposto) {
  if (!Object.hasOwn(item.retencoes || {}, imposto)) return item.acao === "atualizar" ? "Manter atual" : "Não informado";
  const aliquota = item.retencoes[imposto];
  return aliquota === null || aliquota === undefined ? "Não informado" : `${CalculoRetencoesPagamento.formatarPercentual(aliquota)}%`;
}

function renderizarPreviewImportacao(analise) {
  const resumo = analise.resumo || {};
  document.getElementById("impPagValidos").textContent = resumo.validos || 0;
  document.getElementById("impPagCriar").textContent = resumo.criados || 0;
  document.getElementById("impPagAtualizar").textContent = resumo.atualizados || 0;
  document.getElementById("impPagIgnoradas").textContent = resumo.linhasIgnoradas || 0;
  document.getElementById("impPagValor").textContent = formatarMoedaCentavos(resumo.valorLiquidoCentavos || 0);
  document.getElementById("impPagAvisos").innerHTML = (analise.avisos || []).map((aviso) => `<p>${escaparHtml(aviso)}</p>`).join("");
  const registros = analise.registros || [];
  const visiveis = registros.slice(0, 80);
  document.getElementById("impPagPreviewInfo").textContent = `Exibindo ${visiveis.length} de ${registros.length} registros válidos. Contratos: ${resumo.contratosVinculados || 0} vinculados, ${resumo.contratosPendentes || 0} pendentes, ${resumo.semContratoInformado || 0} sem número informado. Nas linhas "Atualizar impostos", os demais dados e o vínculo atual serão mantidos. Os novos com vínculo pendente serão importados sem contrato. Deslize a tabela para conferir todas as colunas.`;
  document.getElementById("impPagPreview").innerHTML = `<table><thead><tr><th>Linha</th><th>Ação</th><th>Razão</th><th>Nota</th><th>Contrato informado</th><th>Vínculo</th><th>Contrato vinculado</th><th>Valor bruto</th><th>ISS (%)</th><th>IR (%)</th><th>CSLL (%)</th><th>INSS (%)</th><th>Valor líquido</th><th>Tipo do líquido</th><th>Pagamento</th></tr></thead><tbody>${visiveis.map((item) => `<tr><td>${escaparHtml(item.linha)}</td><td>${item.modoImportacao === "somente_impostos" ? "Atualizar impostos" : escaparHtml(item.acao)}</td><td>${escaparHtml(item.razaoSocial)}</td><td>${escaparHtml(item.notaFiscal)}</td><td>${escaparHtml(item.numeroContrato || "—")}</td><td>${item.vinculoContrato === "vinculado" ? "Vinculado" : item.vinculoContrato === "mantido" ? "Vínculo atual mantido" : item.vinculoContrato === "pendente" ? "Vínculo pendente" : "Sem contrato informado"}</td><td>${escaparHtml(item.numeroContratoVinculado || "—")}</td><td>${formatarMoedaCentavos(item.valorContaCentavos)}</td>${CalculoRetencoesPagamento.IMPOSTOS.map((imposto) => `<td>${formatarImpostoPreviewImportacao(item, imposto)}</td>`).join("")}<td>${formatarMoedaCentavos(item.valorLiquidoCentavos)}</td><td>${item.liquidoModo === "automatico" ? "Automático" : item.liquidoModo === "manual" ? "Manual" : "Não informado"}</td><td>${escaparHtml(item.pagamento)}</td></tr>`).join("")}</tbody></table>`;
  document.getElementById("btnConfirmarImportacaoPagamentos").disabled = !registros.length;
  document.getElementById("resultadoImportacaoPagamentos").classList.remove("hidden");
}

async function confirmarImportacaoPagamentos() {
  if (!usuarioPodeImportarPlanilha()) { avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoPagamentos"); return; }
  if (!arquivoImportacaoAtual || !analiseImportacaoAtual) { atualizarStatusModal("statusImportacaoPagamentos", "Analise a planilha antes de confirmar.", "erro"); return; }
  const total = analiseImportacaoAtual.resumo?.validos || 0;
  if (!total) { atualizarStatusModal("statusImportacaoPagamentos", "Não há pagamentos válidos para importar. Confira os avisos e corrija a planilha.", "erro"); return; }
  if (!confirm(`Confirmar importação de ${total} pagamento(s)? ${analiseImportacaoAtual.resumo?.contratosPendentes || 0} vínculo(s) pendente(s) serão importados sem contrato.`)) return;
  atualizarStatusModal("statusImportacaoPagamentos", "Importando pagamentos analisados...", "aviso");
  const resposta = await fetch("/api/pagamentos-abertos/importacao/confirmar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ arquivo: arquivoImportacaoAtual }) });
  const resultado = await resposta.json().catch(() => ({}));
  if (!resposta.ok) { atualizarStatusModal("statusImportacaoPagamentos", resultado.erro || "Erro ao confirmar importação.", "erro"); return; }
  atualizarStatusModal("statusImportacaoPagamentos", `Importação concluída. Criados: ${resultado.resumo?.criados || 0}. Atualizados: ${resultado.resumo?.atualizados || 0}. Vínculos pendentes: ${resultado.resumo?.contratosPendentes || 0}.`, "sucesso");
  document.getElementById("btnConfirmarImportacaoPagamentos").disabled = true;
  await carregarPagamentos();
}

async function logoutPagamentos() { await fetch("/api/logout", { method: "POST" }).catch(() => {}); window.location.href = "/login.html"; }
window.addEventListener("click", (event) => { if (event.target === document.getElementById("modalPagamentoAberto")) fecharModalPagamento(); if (event.target === document.getElementById("modalImportacaoPagamentos")) fecharModalImportacaoPagamentos(); if (event.target === document.getElementById("modalExportacaoPagamentos")) fecharModalExportacaoPagamentos(); if (event.target === document.getElementById("modalAcoesEmMassaPagamentos")) fecharModalAcoesEmMassaPagamentos(); if (event.target === document.getElementById("modalLixeiraPagamentos")) fecharLixeiraPagamentos(); });
window.addEventListener("resize", () => renderizarGraficos(false));

carregarUsuarioPagamentos();
document.getElementById("pagRazaoSocial")?.addEventListener("input", sugerirContratoPagamento);
Promise.all([carregarPagamentos(), carregarContratosPagamento().catch(() => {})]).then(iniciarTempoRealPagamentos);
