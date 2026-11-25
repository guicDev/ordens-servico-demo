const modal = document.getElementById("modal");
const modalStatus = document.getElementById("modalStatus");
const modalExclusao = document.getElementById("modalExclusao");
const modalPlanilha = document.getElementById("modalPlanilha");
const modalImportacaoDashboard = document.getElementById("modalImportacaoDashboard");
const modalAcoesEmMassaOS = document.getElementById("modalAcoesEmMassaOS");

const campoNumeroOS = document.getElementById("numeroOS");
const campoSolicitante = document.getElementById("solicitante");
const campoResponsavelEvento = document.getElementById("responsavelEvento");
const campoTelefoneEvento = document.getElementById("telefoneEvento");
const campoLocalEvento = document.getElementById("localEvento");
const campoNomeEvento = document.getElementById("nomeEvento");
const campoPeriodoEvento = document.getElementById("periodoEvento");
const campoDataInicioEvento = document.getElementById("dataInicioEvento");
const campoDataFimEvento = document.getElementById("dataFimEvento");
const campoHorarioInicioEvento = document.getElementById("horarioInicioEvento");
const campoQuantidadeDiarias = document.getElementById("quantidadeDiarias");
const campoMateriais = document.getElementById("materiais");
const campoOrcamento = document.getElementById("orcamento");
const campoObservacoes = document.getElementById("observacoes");
const campoOsSolicitanteArquivo = document.getElementById("osSolicitanteArquivo");
const campoArquivoSolicitanteAtual = document.getElementById("arquivoSolicitanteAtual");
const campoAnoFiltro = document.getElementById("anoFiltro");

const detalheVazio = document.getElementById("detalhe-vazio");
const detalheOS = document.getElementById("detalhe-os");
const listaHistorico = document.getElementById("listaHistorico");
const topbar = document.querySelector(".topbar");
const layoutDashboard = document.querySelector(".layout-dashboard");
const painelLateral = document.querySelector(".painel-lateral");
const btnTogglePainelLateral = document.getElementById("btnTogglePainelLateral");
const tabsPainel = Array.from(document.querySelectorAll(".painel-tab"));
const conteudosPainel = Array.from(document.querySelectorAll(".painel-box-tab"));

let osEmEdicao = null;
let versaoOSEmEdicao = "";
let osSelecionada = null;
let listaOriginal = [];
let listaFiltradaAtual = [];
let osArrastandoId = null;
let listaSolicitantes = [];
let modoSelecaoOS = false;
const idsOSSelecionadas = new Set();
let previaAcoesEmMassaOS = null;
let acaoEmMassaOSAtual = "";
let itensLixeiraOS = [];
const idsLixeiraOSSelecionadas = new Set();

let statusTemp = null;
let osTemp = null;
let osExclusaoTemp = null;
let usuarioLogado = null;
let arquivoSolicitanteAtual = null;
let arquivoImportacaoDashboardAtual = null;
let analiseImportacaoDashboardAtual = null;
let canalNotificacoesOS = null;
let sincronizacaoTempoRealPendente = null;
let temporizadorExpiracaoRascunhoFormularioOS = null;
let ordenacaoDashboardOS = {
  pendente: "asc",
  autorizado: "asc",
  em_execucao: "asc",
  na_rua: "asc",
  executado: "asc",
  recusado: "asc",
};

const STATUSS_VALIDOS = [
  "pendente",
  "autorizado",
  "em_execucao",
  "na_rua",
  "executado",
  "recusado",
];
const STATUSS_CARD_REDUZIDO = new Set(["executado", "recusado"]);

function obterUsuarioAtual() {
  return usuarioLogado?.nome || "";
}

function obterUsuarioSessao(dados) {
  return dados?.usuario && typeof dados.usuario === "object" ? dados.usuario : dados;
}

function obterNomeExibicaoUsuario(dados) {
  const usuario = obterUsuarioSessao(dados);
  return usuario?.nome || usuario?.usuario || "-";
}

const USUARIOS_FINANCEIRO_AUTORIZADOS = new Set(["admin", "operador-demo", "gestor-demo", "financeiro-demo", "analista-demo", "assistente-demo"]);
const USUARIOS_IMPORTACAO_PLANILHA_AUTORIZADOS = new Set(["admin", "administrador"]);
const MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA = "Você não está autorizado a importar planilhas.";
const ANO_FILTRO_STORAGE_KEY = "demonstracao.os.ui.ano";
const RASCUNHO_NOVA_OS_STORAGE_KEY = "demonstracao.os.ui.rascunho";
const RASCUNHO_NOVA_OS_TTL_MS = 60 * 1000;
const CAMPOS_RASCUNHO_OS = [
  ["numeroOS", campoNumeroOS],
  ["solicitante", campoSolicitante],
  ["responsavelEvento", campoResponsavelEvento],
  ["telefoneEvento", campoTelefoneEvento],
  ["localEvento", campoLocalEvento],
  ["nomeEvento", campoNomeEvento],
  ["periodoEvento", campoPeriodoEvento],
  ["dataInicioEvento", campoDataInicioEvento],
  ["dataFimEvento", campoDataFimEvento],
  ["horarioInicioEvento", campoHorarioInicioEvento],
  ["quantidadeDiarias", campoQuantidadeDiarias],
  ["materiais", campoMateriais],
  ["orcamento", campoOrcamento],
  ["observacoes", campoObservacoes],
];

function normalizarIdentificadorUsuario(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function obterAnoAtualSistema() {
  return String(new Date().getFullYear());
}

function normalizarAnoSelecionado(valor) {
  const texto = String(valor || "").trim();
  return /^\d{4}$/.test(texto) ? texto : obterAnoAtualSistema();
}

function obterAnoSelecionado() {
  return normalizarAnoSelecionado(campoAnoFiltro?.value || localStorage.getItem(ANO_FILTRO_STORAGE_KEY));
}

function configurarSeletorAno() {
  if (!campoAnoFiltro) return;
  const anoAtual = Number(obterAnoAtualSistema());
  const anoInicial = 2026;
  const anoFinal = Math.max(anoAtual + 1, anoInicial);
  const selecionado = normalizarAnoSelecionado(localStorage.getItem(ANO_FILTRO_STORAGE_KEY));

  campoAnoFiltro.innerHTML = "";
  for (let ano = anoInicial; ano <= anoFinal; ano += 1) {
    const option = document.createElement("option");
    option.value = String(ano);
    option.textContent = String(ano);
    campoAnoFiltro.appendChild(option);
  }
  campoAnoFiltro.value = selecionado;
  if (!campoAnoFiltro.value) campoAnoFiltro.value = obterAnoAtualSistema();
}

async function alterarAnoSelecionado() {
  limparSelecaoOS();
  const ano = obterAnoSelecionado();
  localStorage.setItem(ANO_FILTRO_STORAGE_KEY, ano);
  limparPainelDetalhes();
  await carregarOS();
}

function atualizarOffsetPainelFixo() {
  if (window.matchMedia?.("(max-width: 760px)").matches) {
    document.documentElement.style.setProperty("--painel-sticky-top", "0px");
    return;
  }
  const alturaTopbar = topbar ? topbar.getBoundingClientRect().height : 96;
  document.documentElement.style.setProperty("--painel-sticky-top", `${Math.ceil(alturaTopbar + 12)}px`);
}

function compararNumeroOSDashboard(a, b, direcao = "asc") {
  const numeroA = String(a?.numeroOS || "");
  const numeroB = String(b?.numeroOS || "");
  const resultado = numeroA.localeCompare(numeroB, "pt-BR", { numeric: true, sensitivity: "base" });
  return direcao === "desc" ? -resultado : resultado;
}

function ordenarOSDashboard(lista, status) {
  const direcao = ordenacaoDashboardOS[status] || "asc";
  return [...(Array.isArray(lista) ? lista : [])].sort((a, b) => compararNumeroOSDashboard(a, b, direcao));
}

function atualizarBotoesOrdenacaoDashboard() {
  Object.entries(ordenacaoDashboardOS).forEach(([status, direcao]) => {
    const botao = document.getElementById(`ordenar-${status}`);
    if (!botao) return;
    botao.textContent = direcao === "asc" ? "OS \u2191" : "OS \u2193";
    botao.setAttribute("aria-label", `Ordenar ${traduzirStatus(status)} por OS ${direcao === "asc" ? "decrescente" : "crescente"}`);
  });
}

function alternarOrdenacaoDashboard(status) {
  if (!Object.prototype.hasOwnProperty.call(ordenacaoDashboardOS, status)) return;
  ordenacaoDashboardOS[status] = ordenacaoDashboardOS[status] === "asc" ? "desc" : "asc";
  renderizarOS(listaFiltradaAtual);
  configurarDropZones();
}

function normalizarTextoBuscaFlexivel(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function calcularDistanciaTextoCurto(a, b) {
  const esquerda = normalizarTextoBuscaFlexivel(a);
  const direita = normalizarTextoBuscaFlexivel(b);
  if (esquerda === direita) return 0;
  if (!esquerda) return direita.length;
  if (!direita) return esquerda.length;

  let anterior = Array.from({ length: direita.length + 1 }, (_, indice) => indice);
  for (let i = 1; i <= esquerda.length; i += 1) {
    const atual = [i];
    for (let j = 1; j <= direita.length; j += 1) {
      const custo = esquerda[i - 1] === direita[j - 1] ? 0 : 1;
      atual[j] = Math.min(
        atual[j - 1] + 1,
        anterior[j] + 1,
        anterior[j - 1] + custo
      );
    }
    anterior = atual;
  }
  return anterior[direita.length];
}

function tokenBuscaCombina(tokenAlvo, tokenTermo) {
  if (!tokenAlvo || !tokenTermo) return false;
  if (tokenAlvo === tokenTermo) return true;

  if (/^\d+$/.test(tokenTermo)) {
    return tokenAlvo.startsWith(tokenTermo);
  }

  if (tokenTermo.length <= 4) {
    return tokenAlvo.startsWith(tokenTermo);
  }

  if (tokenAlvo.includes(tokenTermo)) return true;

  if (tokenTermo.length < 5 || tokenAlvo[0] !== tokenTermo[0]) return false;

  const limiteTamanho = tokenTermo.length >= 7 ? 2 : 1;
  if (Math.abs(tokenAlvo.length - tokenTermo.length) > limiteTamanho) return false;

  const limiteDistancia = tokenTermo.length >= 7 ? 2 : 1;
  return calcularDistanciaTextoCurto(tokenAlvo, tokenTermo) <= limiteDistancia;
}

function termoBuscaCombinaFlexivel(alvo, termo) {
  const alvoNormalizado = normalizarTextoBuscaFlexivel(alvo);
  const termoNormalizado = normalizarTextoBuscaFlexivel(termo);
  if (!termoNormalizado) return true;
  if (!alvoNormalizado) return false;
  if (termoNormalizado.length > 4 && alvoNormalizado.includes(termoNormalizado)) return true;
  const termoCompacto = termoNormalizado.replace(/\s+/g, "");
  const alvoCompacto = alvoNormalizado.replace(/\s+/g, "");
  if (termoCompacto.length > 4 && alvoCompacto.includes(termoCompacto)) return true;

  const tokensAlvo = alvoNormalizado.split(" ").filter(Boolean);
  const tokensTermo = termoNormalizado.split(" ").filter(Boolean);
  return tokensTermo.every((tokenTermo) =>
    tokensAlvo.some((tokenAlvo) => tokenBuscaCombina(tokenAlvo, tokenTermo))
  );
}

function usuarioPodeAcessarFinanceiro() {
  const identificadores = [
    usuarioLogado?.usuario,
    usuarioLogado?.nome,
  ].map(normalizarIdentificadorUsuario);

  return identificadores.some((identificador) => USUARIOS_FINANCEIRO_AUTORIZADOS.has(identificador));
}

function usuarioPodeImportarPlanilha() {
  if (usuarioLogado?.permissoes?.importacaoPlanilha === true) return true;
  const identificadores = [
    usuarioLogado?.usuario,
    usuarioLogado?.nome,
  ].map(normalizarIdentificadorUsuario);

  return identificadores.some((identificador) =>
    USUARIOS_IMPORTACAO_PLANILHA_AUTORIZADOS.has(identificador)
  );
}

function avisarImportacaoPlanilhaNaoAutorizada(statusId) {
  if (statusId) atualizarStatusModal(statusId, MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA, "erro");
  mostrarAvisoInterface(MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA, "erro");
}

function abrirFinanceiro() {
  if (!usuarioPodeAcessarFinanceiro()) {
    mostrarAvisoInterface("Voc\u00ea n\u00e3o tem a autoriza\u00e7\u00e3o necess\u00e1ria.", "erro");
    return;
  }

  window.location.href = "/precificacao";
}

function abrirContratos() {
  if (!usuarioPodeAcessarFinanceiro()) {
    mostrarAvisoInterface("Voc\u00ea n\u00e3o tem a autoriza\u00e7\u00e3o necess\u00e1ria.", "erro");
    return;
  }

  window.location.href = "/contratos";
}

function validarUsuarioAtual() {
  if (!usuarioLogado || !usuarioLogado.nome) {
    mostrarAvisoInterface("Usuário não identificado. Faça login novamente.", "erro");
    window.location.href = "/login.html";
    return false;
  }

  return true;
}

function obterOSSelecionadas() {
  return listaOriginal.filter((item) => idsOSSelecionadas.has(String(item.id)));
}

function atualizarBarraAcoesEmMassaOS() {
  const barra = document.getElementById("barraAcoesEmMassaOS");
  const contador = document.getElementById("contadorSelecaoOS");
  const botao = document.getElementById("btnSelecionarOS");
  const total = idsOSSelecionadas.size;
  document.body.classList.toggle("modo-selecao-os", modoSelecaoOS);
  barra?.classList.toggle("hidden", !modoSelecaoOS);
  if (contador) contador.textContent = `${total} ${total === 1 ? "selecionada" : "selecionadas"}`;
  if (botao) {
    botao.textContent = modoSelecaoOS ? "Selecionando" : "Selecionar";
    botao.setAttribute("aria-pressed", modoSelecaoOS ? "true" : "false");
  }
  document.querySelectorAll(".card[data-id]").forEach((card) => {
    const selecionada = idsOSSelecionadas.has(String(card.dataset.id));
    card.classList.toggle("selecionado-em-massa", selecionada);
    const checkbox = card.querySelector(".checkbox-selecao-os");
    if (checkbox) checkbox.checked = selecionada;
  });
  document.querySelectorAll(".btn-selecionar-coluna[data-status]").forEach((controle) => {
    const status = controle.dataset.status;
    const visiveis = listaFiltradaAtual.filter((item) => item.status === status);
    const todasSelecionadas = visiveis.length > 0
      && visiveis.every((item) => idsOSSelecionadas.has(String(item.id)));
    controle.disabled = !modoSelecaoOS || visiveis.length === 0;
    controle.textContent = todasSelecionadas ? "Desmarcar todos" : "Marcar todos";
    controle.setAttribute("aria-pressed", todasSelecionadas ? "true" : "false");
  });
}

function limparSelecaoOS() {
  idsOSSelecionadas.clear();
  previaAcoesEmMassaOS = null;
  const seletor = document.getElementById("acaoEmMassaOS");
  if (seletor) seletor.value = "";
  atualizarBarraAcoesEmMassaOS();
}

function alternarModoSelecaoOS() {
  modoSelecaoOS = !modoSelecaoOS;
  limparSelecaoOS();
  renderizarOS(listaFiltradaAtual);
  configurarDropZones();
  document.getElementById("btnSelecionarOS")?.focus();
}

function alternarSelecaoOS(id, selecionada) {
  const chave = String(id || "");
  if (!chave) return;
  if (selecionada === undefined ? !idsOSSelecionadas.has(chave) : selecionada) {
    idsOSSelecionadas.add(chave);
  } else {
    idsOSSelecionadas.delete(chave);
  }
  atualizarBarraAcoesEmMassaOS();
}

function alternarSelecaoColuna(status) {
  if (!modoSelecaoOS) return;
  const visiveis = listaFiltradaAtual.filter((item) => item.status === status);
  if (!visiveis.length) return;
  const todasSelecionadas = visiveis.every((item) => idsOSSelecionadas.has(String(item.id)));
  visiveis.forEach((item) => {
    const id = String(item.id);
    if (todasSelecionadas) idsOSSelecionadas.delete(id);
    else idsOSSelecionadas.add(id);
  });
  atualizarBarraAcoesEmMassaOS();
}

function selecionarOSVisiveis() {
  const visiveis = listaFiltradaAtual;
  idsOSSelecionadas.clear();
  visiveis.forEach((item) => idsOSSelecionadas.add(String(item.id)));
  atualizarBarraAcoesEmMassaOS();
}

function atualizarApresentacaoModalAcoesEmMassaOS(acao) {
  const apresentacoes = {
    alterar_status: {
      titulo: "Mover OS selecionadas",
      descricao: "Escolha o novo status e confira quais OS serão alteradas antes de confirmar.",
    },
    adicionar_observacao: {
      titulo: "Adicionar observação",
      descricao: "Acrescente a mesma informação ao histórico de todas as OS selecionadas.",
    },
    enviar_lixeira: {
      titulo: "Enviar OS à lixeira",
      descricao: "Revise as proteções e informe o motivo antes de concluir esta ação.",
    },
  };
  const apresentacao = apresentacoes[acao] || {
    titulo: "Ação nas OS selecionadas",
    descricao: "Escolha os dados e confira a prévia antes de aplicar.",
  };
  const titulo = document.getElementById("tituloAcoesEmMassaOS");
  const descricao = document.getElementById("descricaoAcaoEmMassaOS");
  if (titulo) titulo.textContent = apresentacao.titulo;
  if (descricao) descricao.textContent = apresentacao.descricao;
  modalAcoesEmMassaOS?.setAttribute("data-acao", acao || "");
}

function atualizarContadorObservacaoAcoesEmMassaOS() {
  const campo = document.getElementById("observacaoAcoesEmMassaOS");
  const contador = document.getElementById("contadorObservacaoAcoesEmMassaOS");
  if (contador) contador.textContent = `${campo?.value.length || 0} de 2.000 caracteres`;
}

function fecharModalAcoesEmMassaOS() {
  if (!modalAcoesEmMassaOS) return;
  modalAcoesEmMassaOS.style.display = "none";
  previaAcoesEmMassaOS = null;
  acaoEmMassaOSAtual = "";
  atualizarApresentacaoModalAcoesEmMassaOS("");
  document.getElementById("campoConfirmacaoDestrutivaAcoesEmMassaOS")?.classList.add("hidden");
  const confirmacao = document.getElementById("confirmacaoDestrutivaAcoesEmMassaOS");
  if (confirmacao) confirmacao.value = "";
  const observacao = document.getElementById("observacaoAcoesEmMassaOS");
  const motivo = document.getElementById("motivoAcoesEmMassaOS");
  if (observacao) observacao.value = "";
  if (motivo) motivo.value = "";
  atualizarContadorObservacaoAcoesEmMassaOS();
  atualizarStatusModal("statusAcoesEmMassaOSMsg");
  const botao = document.getElementById("confirmarAcaoEmMassaOS");
  if (botao) {
    botao.disabled = false;
    botao.textContent = "Analisar";
    botao.onclick = analisarAcaoEmMassaOS;
  }
}

function montarParametrosAcoesEmMassaOS() {
  if (acaoEmMassaOSAtual === "alterar_status") {
    return { status: document.getElementById("statusAcoesEmMassaOS")?.value || "" };
  }
  return { observacao: document.getElementById("observacaoAcoesEmMassaOS")?.value.trim() || "" };
}

function prepararAcaoEmMassaOS() {
  const seletor = document.getElementById("acaoEmMassaOS");
  const acao = seletor?.value || "";
  if (!acao) return;
  if (!idsOSSelecionadas.size) {
    mostrarAvisoInterface("Selecione pelo menos uma OS.", "aviso");
    seletor.value = "";
    return;
  }
  if (acao === "exportar") {
    exportarResumo(obterOSSelecionadas(), "selecionadas");
    seletor.value = "";
    return;
  }

  acaoEmMassaOSAtual = acao;
  previaAcoesEmMassaOS = null;
  atualizarApresentacaoModalAcoesEmMassaOS(acao);
  document.getElementById("campoStatusAcoesEmMassaOS")?.classList.toggle("hidden", acao !== "alterar_status");
  document.getElementById("campoObservacaoAcoesEmMassaOS")?.classList.toggle("hidden", acao !== "adicionar_observacao");
  document.getElementById("campoConfirmacaoDestrutivaAcoesEmMassaOS")?.classList.toggle("hidden", acao !== "enviar_lixeira");
  const motivo = document.getElementById("motivoAcoesEmMassaOS");
  const observacao = document.getElementById("observacaoAcoesEmMassaOS");
  const confirmacao = document.getElementById("confirmacaoDestrutivaAcoesEmMassaOS");
  if (motivo) motivo.placeholder = acao === "enviar_lixeira" ? "Obrigatório para enviar à lixeira" : "Opcional";
  if (motivo) motivo.value = "";
  if (observacao) observacao.value = "";
  if (confirmacao) confirmacao.value = "";
  atualizarContadorObservacaoAcoesEmMassaOS();
  document.getElementById("resumoAcoesEmMassaOS").textContent =
    `${idsOSSelecionadas.size} OS serão analisadas antes da alteração.`;
  document.getElementById("previewAcoesEmMassaOS").innerHTML = "";
  atualizarStatusModal("statusAcoesEmMassaOSMsg");
  modalAcoesEmMassaOS.style.display = "flex";
  const campoFoco = acao === "alterar_status"
    ? document.getElementById("statusAcoesEmMassaOS")
    : acao === "adicionar_observacao"
      ? document.getElementById("observacaoAcoesEmMassaOS")
      : document.getElementById("motivoAcoesEmMassaOS");
  campoFoco?.focus();
}

function renderizarPreviewAcoesEmMassaOS(previa) {
  const container = document.getElementById("previewAcoesEmMassaOS");
  if (!container) return;
  const itens = (previa.itens || []).slice(0, 20);
  const linhas = itens.map((item) => {
    const numero = item.antes?.numeroOS || item.entidadeId;
    const resultado = item.resultado === "aplicavel" ? "Será alterada" :
      item.resultado === "sem_alteracao" ? "Sem alteração" : "Não encontrada";
    return `<li><strong>OS ${escaparHtml(numero)}</strong><span>${escaparHtml(resultado)}</span></li>`;
  }).join("");
  container.innerHTML = `
    <div class="preview-acoes-resumo">
      <strong>${previa.resumo?.aplicaveis || 0} aplicáveis</strong>
      <span>${previa.resumo?.semAlteracao || 0} sem alteração</span>
      <span>${previa.resumo?.bloqueados || 0} protegidas</span>
      <span>${previa.resumo?.ignorados || 0} ignoradas</span>
    </div>
    <ul>${linhas}</ul>
    ${(previa.itens || []).length > itens.length ? `<p>Mais ${(previa.itens || []).length - itens.length} itens no lote.</p>` : ""}
  `;
}

async function analisarAcaoEmMassaOS() {
  if (!acaoEmMassaOSAtual || !idsOSSelecionadas.size) return;
  const botao = document.getElementById("confirmarAcaoEmMassaOS");
  const parametros = montarParametrosAcoesEmMassaOS();
  const motivo = document.getElementById("motivoAcoesEmMassaOS")?.value.trim() || "";
  if ((acaoEmMassaOSAtual === "alterar_status" && !parametros.status)
    || (acaoEmMassaOSAtual === "adicionar_observacao" && !parametros.observacao)) {
    atualizarStatusModal("statusAcoesEmMassaOSMsg", "Preencha o campo obrigatório.", "erro");
    return;
  }
  if (acaoEmMassaOSAtual === "enviar_lixeira" && !motivo) {
    atualizarStatusModal("statusAcoesEmMassaOSMsg", "Informe o motivo da exclusão.", "erro");
    return;
  }
  try {
    botao.disabled = true;
    atualizarStatusModal("statusAcoesEmMassaOSMsg", "Analisando as OS selecionadas...", "aviso");
    const resposta = await fetch("/api/acoes-em-massa/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        entidade: "os",
        acao: acaoEmMassaOSAtual,
        ids: [...idsOSSelecionadas],
        parametros,
        motivo,
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível analisar o lote.");
    previaAcoesEmMassaOS = dados;
    renderizarPreviewAcoesEmMassaOS(dados);
    if (acaoEmMassaOSAtual === "enviar_lixeira") {
      const textoConfirmacao = `EXCLUIR ${dados.resumo?.aplicaveis || 0}`;
      document.getElementById("ajudaConfirmacaoDestrutivaAcoesEmMassaOS").textContent = `Digite ${textoConfirmacao} para confirmar.`;
      document.getElementById("confirmacaoDestrutivaAcoesEmMassaOS")?.focus();
    }
    atualizarStatusModal("statusAcoesEmMassaOSMsg", "Prévia pronta. Confira antes de confirmar.", "sucesso");
    botao.textContent = "Confirmar alteração";
    botao.onclick = confirmarAcaoEmMassaOS;
    botao.disabled = !(dados.resumo?.aplicaveis > 0);
  } catch (erro) {
    atualizarStatusModal("statusAcoesEmMassaOSMsg", erro.message || "Erro ao analisar o lote.", "erro");
    botao.disabled = false;
  }
}

async function confirmarAcaoEmMassaOS() {
  if (!previaAcoesEmMassaOS) return;
  const botao = document.getElementById("confirmarAcaoEmMassaOS");
  try {
    botao.disabled = true;
    atualizarStatusModal("statusAcoesEmMassaOSMsg", "Aplicando as alterações...", "aviso");
    const resposta = await fetch("/api/acoes-em-massa/executar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        loteId: previaAcoesEmMassaOS.loteId,
        tokenConfirmacao: previaAcoesEmMassaOS.tokenConfirmacao,
        confirmacaoDestrutiva: document.getElementById("confirmacaoDestrutivaAcoesEmMassaOS")?.value.trim() || "",
      }),
    });
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível executar o lote.");
    const totais = dados.totais || {};
    document.getElementById("previewAcoesEmMassaOS").innerHTML = `
      <div class="preview-acoes-resumo resultado">
        <strong>${totais.aplicados || 0} aplicadas</strong>
        <span>${totais.semAlteracao || 0} sem alteração</span>
        <span>${totais.conflitos || 0} conflitos</span>
        <span>${totais.falhas || 0} falhas</span>
      </div>`;
    atualizarStatusModal("statusAcoesEmMassaOSMsg", "Ação concluída.", "sucesso");
    limparSelecaoOS();
    await carregarOS();
    botao.textContent = "Concluir";
    botao.onclick = fecharModalAcoesEmMassaOS;
    botao.disabled = false;
  } catch (erro) {
    atualizarStatusModal("statusAcoesEmMassaOSMsg", erro.message || "Erro ao executar o lote.", "erro");
    botao.disabled = false;
  }
}

function fecharLixeiraOS() {
  const modalLixeira = document.getElementById("modalLixeiraOS");
  if (modalLixeira) modalLixeira.style.display = "none";
  idsLixeiraOSSelecionadas.clear();
}

function atualizarSelecaoLixeiraOS(id, selecionada) {
  const chave = String(id || "");
  if (selecionada) idsLixeiraOSSelecionadas.add(chave);
  else idsLixeiraOSSelecionadas.delete(chave);
  const botao = document.getElementById("btnRestaurarLixeiraOS");
  if (botao) botao.disabled = idsLixeiraOSSelecionadas.size === 0;
}

function renderizarLixeiraOS() {
  const lista = document.getElementById("listaLixeiraOS");
  const contador = document.getElementById("contadorLixeiraOS");
  if (!lista || !contador) return;
  contador.textContent = `${itensLixeiraOS.length} ${itensLixeiraOS.length === 1 ? "registro" : "registros"}`;
  lista.replaceChildren();
  if (!itensLixeiraOS.length) {
    lista.appendChild(criarElemento("p", "lixeira-vazia", "A lixeira está vazia."));
  }
  itensLixeiraOS.forEach((item) => {
    const rotulo = criarElemento("label", "item-lixeira");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = item.id;
    checkbox.checked = idsLixeiraOSSelecionadas.has(String(item.id));
    checkbox.setAttribute("aria-label", `Selecionar OS ${item.numeroOS || item.id}`);
    checkbox.addEventListener("change", () => atualizarSelecaoLixeiraOS(item.id, checkbox.checked));
    const detalhes = criarElemento("span", "item-lixeira-detalhes");
    detalhes.appendChild(criarElemento("strong", "", `OS ${item.numeroOS || item.id} — ${item.nomeEvento || item.solicitante || "Sem identificação"}`));
    detalhes.appendChild(criarElemento("small", "", `${traduzirStatus(item.status)} · excluída por ${item.excluidoPor || "usuário não informado"} em ${formatarData(item.excluidoEm)}`));
    detalhes.appendChild(criarElemento("small", "", `Motivo: ${item.motivoExclusao || "não informado"}`));
    rotulo.appendChild(checkbox);
    rotulo.appendChild(detalhes);
    lista.appendChild(rotulo);
  });
  atualizarSelecaoLixeiraOS("", false);
}

async function abrirLixeiraOS() {
  const modalLixeira = document.getElementById("modalLixeiraOS");
  if (!modalLixeira) return;
  modalLixeira.style.display = "flex";
  idsLixeiraOSSelecionadas.clear();
  atualizarStatusModal("statusLixeiraOS", "Carregando lixeira...", "aviso");
  try {
    const resposta = await fetch("/api/lixeira?entidade=os");
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || "Não foi possível carregar a lixeira.");
    itensLixeiraOS = Array.isArray(dados) ? dados : [];
    renderizarLixeiraOS();
    atualizarStatusModal("statusLixeiraOS");
  } catch (erro) {
    itensLixeiraOS = [];
    renderizarLixeiraOS();
    atualizarStatusModal("statusLixeiraOS", erro.message || "Erro ao carregar a lixeira.", "erro");
  }
}

function selecionarTodosLixeiraOS() {
  const selecionar = idsLixeiraOSSelecionadas.size !== itensLixeiraOS.length;
  idsLixeiraOSSelecionadas.clear();
  if (selecionar) itensLixeiraOS.forEach((item) => idsLixeiraOSSelecionadas.add(String(item.id)));
  renderizarLixeiraOS();
}

async function restaurarSelecionadosLixeiraOS() {
  const ids = [...idsLixeiraOSSelecionadas];
  if (!ids.length) return;
  const botao = document.getElementById("btnRestaurarLixeiraOS");
  try {
    botao.disabled = true;
    atualizarStatusModal("statusLixeiraOS", "Analisando a restauração...", "aviso");
    const analise = await fetch("/api/lixeira/restaurar/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entidade: "os", ids }),
    });
    const previa = await analise.json();
    if (!analise.ok) throw new Error(previa.erro || "Não foi possível analisar a restauração.");
    const aplicaveis = previa.resumo?.aplicaveis || 0;
    if (!aplicaveis || !window.confirm(`Restaurar ${aplicaveis} ${aplicaveis === 1 ? "OS" : "OS"}?`)) return;
    const execucao = await fetch("/api/lixeira/restaurar/executar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loteId: previa.loteId, tokenConfirmacao: previa.tokenConfirmacao }),
    });
    const resultado = await execucao.json();
    if (!execucao.ok) throw new Error(resultado.erro || "Não foi possível restaurar as OS.");
    atualizarStatusModal("statusLixeiraOS", `${resultado.totais?.aplicados || 0} restauradas.`, "sucesso");
    await Promise.all([abrirLixeiraOS(), carregarOS()]);
  } catch (erro) {
    atualizarStatusModal("statusLixeiraOS", erro.message || "Erro ao restaurar as OS.", "erro");
  } finally {
    botao.disabled = idsLixeiraOSSelecionadas.size === 0;
  }
}

function escaparHtml(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function criarElemento(tag, className, textContent) {
  const elemento = document.createElement(tag);
  if (className) elemento.className = className;
  if (textContent !== undefined) elemento.textContent = textContent;
  return elemento;
}

function criarLinhaInfo(rotulo, valor) {
  const paragrafo = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = `${rotulo}: `;
  const span = document.createElement("span");
  span.textContent = valor || "-";
  paragrafo.appendChild(strong);
  paragrafo.appendChild(span);
  return paragrafo;
}

function traduzirStatus(status) {
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

function formatarData(dataISO) {
  const data = new Date(dataISO);
  if (isNaN(data.getTime())) return "";
  return data.toLocaleString("pt-BR");
}

function formatarDataCurta(dataISO) {
  if (!dataISO) return "";
  const partes = String(dataISO).split("-");
  if (partes.length === 3) {
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
  }

  const data = new Date(dataISO);
  if (isNaN(data.getTime())) return "";
  return data.toLocaleDateString("pt-BR");
}

function normalizarQuantidadeDiarias(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return 0;
  if (!/^\d+$/.test(texto)) return NaN;
  return Number(texto);
}

function obterModoPlanilhaSelecionado() {
  return document.querySelector('input[name="modoPlanilha"]:checked')?.value || "filtradas";
}

function atualizarResumoPlanilhaFiltradas() {
  const resumo = document.getElementById("resumoPlanilhaFiltradas");
  if (!resumo) return;

  const quantidade = Array.isArray(listaFiltradaAtual) ? listaFiltradaAtual.length : 0;
  resumo.textContent = `${quantidade} OS selecionadas pelos filtros atuais.`;
}

function atualizarResumoSelecaoPlanilha() {
  const resumo = document.getElementById("resumoSelecaoPlanilha");
  if (!resumo) return;

  const total = document.querySelectorAll('input[name="osPlanilhaSelecionada"]:checked').length;
  resumo.textContent = `${total} OS marcadas.`;
}

function renderizarListaOSPlanilha() {
  const container = document.getElementById("listaOSPlanilha");
  if (!container) return;

  container.innerHTML = "";

  const listaOrdenada = [...listaOriginal].sort((a, b) => {
    const numeroA = String(a?.numeroOS || "");
    const numeroB = String(b?.numeroOS || "");
    return numeroA.localeCompare(numeroB, "pt-BR", { numeric: true });
  });

  if (!listaOrdenada.length) {
    container.appendChild(criarElemento("div", "lista-os-vazia", "Nenhuma OS disponível."));
    atualizarResumoSelecaoPlanilha();
    return;
  }

  listaOrdenada.forEach((item) => {
    const label = criarElemento("label", "item-os-planilha");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.name = "osPlanilhaSelecionada";
    checkbox.value = item.id;
    checkbox.onchange = atualizarResumoSelecaoPlanilha;

    const texto = criarElemento(
      "span",
      "item-os-planilha-texto",
      `OS ${item.numeroOS || "-"} - ${item.nomeEvento || "Sem evento"} (${traduzirStatus(item.status)})`
    );

    label.appendChild(checkbox);
    label.appendChild(texto);
    container.appendChild(label);
  });

  atualizarResumoSelecaoPlanilha();
}

function selecionarTodasOSPlanilha() {
  document.querySelectorAll('input[name="osPlanilhaSelecionada"]').forEach((checkbox) => {
    checkbox.checked = true;
  });
  atualizarResumoSelecaoPlanilha();
}

function selecionarOSFiltradasNaPlanilha() {
  const idsFiltrados = new Set((Array.isArray(listaFiltradaAtual) ? listaFiltradaAtual : []).map((item) => item.id));
  document.querySelectorAll('input[name="osPlanilhaSelecionada"]').forEach((checkbox) => {
    checkbox.checked = idsFiltrados.has(checkbox.value);
  });
  atualizarResumoSelecaoPlanilha();
}

function limparSelecaoOSPlanilha() {
  document.querySelectorAll('input[name="osPlanilhaSelecionada"]').forEach((checkbox) => {
    checkbox.checked = false;
  });
  atualizarResumoSelecaoPlanilha();
}

function atualizarModoPlanilhaPersonalizada() {
  const modo = obterModoPlanilhaSelecionado();
  const blocoFiltradas = document.getElementById("blocoPlanilhaFiltradas");
  const blocoStatus = document.getElementById("blocoPlanilhaStatus");
  const blocoEspecificas = document.getElementById("blocoPlanilhaEspecificas");

  if (blocoFiltradas) blocoFiltradas.classList.toggle("hidden", modo !== "filtradas");
  if (blocoStatus) blocoStatus.classList.toggle("hidden", modo !== "status");
  if (blocoEspecificas) blocoEspecificas.classList.toggle("hidden", modo !== "especificas");

  atualizarResumoPlanilhaFiltradas();
  atualizarResumoSelecaoPlanilha();
}

function abrirModalPlanilhaPersonalizada() {
  if (!Array.isArray(listaOriginal) || !listaOriginal.length) {
    mostrarAvisoInterface("Não há OS disponíveis para gerar a planilha.", "aviso");
    return;
  }

  atualizarStatusModal("statusPlanilhaPersonalizada");
  renderizarListaOSPlanilha();
  atualizarResumoPlanilhaFiltradas();

  const opcaoPadrao = document.querySelector('input[name="modoPlanilha"][value="filtradas"]');
  if (opcaoPadrao) {
    opcaoPadrao.checked = true;
  }

  atualizarModoPlanilhaPersonalizada();
  modalPlanilha.style.display = "flex";
}

function fecharModalPlanilhaPersonalizada() {
  if (!modalPlanilha) return;
  atualizarStatusModal("statusPlanilhaPersonalizada");
  modalPlanilha.style.display = "none";
}

function obterIdsPlanilhaSelecionadas() {
  return Array.from(document.querySelectorAll('input[name="osPlanilhaSelecionada"]:checked')).map(
    (checkbox) => checkbox.value
  );
}

function baixarBlobComoArquivo(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function extrairNomeArquivo(contentDisposition) {
  const cabecalho = String(contentDisposition || "");
  const correspondencia = cabecalho.match(/filename="?([^"]+)"?/i);
  return correspondencia?.[1] || `planilha-os-${Date.now()}.xlsx`;
}

async function gerarPlanilhaPersonalizada() {
  const modo = obterModoPlanilhaSelecionado();
  const payload = { modo, ano: obterAnoSelecionado() };

  if (modo === "filtradas") {
    const ids = (Array.isArray(listaFiltradaAtual) ? listaFiltradaAtual : []).map((item) => item.id);
    if (!ids.length) {
      atualizarStatusModal("statusPlanilhaPersonalizada", "Não há OS filtradas para gerar a planilha.", "erro");
      return;
    }
    payload.ids = ids;
  }

  if (modo === "status") {
    const status = document.getElementById("statusPlanilhaSelect")?.value || "";
    if (!status) {
      atualizarStatusModal("statusPlanilhaPersonalizada", "Selecione um status para gerar a planilha.", "erro");
      return;
    }
    payload.ids = [];
    payload.status = status;
  }

  if (modo === "especificas") {
    const ids = obterIdsPlanilhaSelecionadas();
    if (!ids.length) {
      atualizarStatusModal("statusPlanilhaPersonalizada", "Selecione pelo menos uma OS para gerar a planilha.", "erro");
      return;
    }
    payload.status = "";
    payload.ids = ids;
  }

  try {
    atualizarStatusModal("statusPlanilhaPersonalizada", "Gerando planilha...", "aviso");
    const resposta = await fetch("/api/planilhas/personalizada", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!resposta.ok) {
      const resultado = await resposta.json().catch(() => ({}));
      atualizarStatusModal("statusPlanilhaPersonalizada", resultado.erro || "Erro ao gerar a planilha personalizada.", "erro");
      return;
    }

    const blob = await resposta.blob();
    const nomeArquivo = extrairNomeArquivo(resposta.headers.get("Content-Disposition"));
    fecharModalPlanilhaPersonalizada();
    baixarBlobComoArquivo(blob, nomeArquivo);
  } catch (error) {
    atualizarStatusModal("statusPlanilhaPersonalizada", "Erro ao gerar a planilha personalizada.", "erro");
  }
}

function normalizarDataParaComparacao(dataStr, fimDoDia = false) {
  if (!dataStr) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(dataStr)) {
    return new Date(`${dataStr}T${fimDoDia ? "23:59:59" : "00:00:00"}`);
  }

  const data = new Date(dataStr);
  if (isNaN(data.getTime())) return null;

  if (fimDoDia) {
    data.setHours(23, 59, 59, 999);
  } else {
    data.setHours(0, 0, 0, 0);
  }

  return data;
}

function montarPeriodoAutomatico(dataInicio, dataFim) {
  if (!dataInicio && !dataFim) return "";

  if (dataInicio && dataFim) {
    if (dataInicio === dataFim) {
      return formatarDataCurta(dataInicio);
    }
    return `${formatarDataCurta(dataInicio)} a ${formatarDataCurta(dataFim)}`;
  }

  if (dataInicio) {
    return formatarDataCurta(dataInicio);
  }

  return formatarDataCurta(dataFim);
}

function obterPeriodoExibicao(item) {
  if (item.periodoEvento && String(item.periodoEvento).trim()) {
    return item.periodoEvento;
  }

  return montarPeriodoAutomatico(item.dataInicioEvento, item.dataFimEvento) || "-";
}

function exibirHorarioInicio(item) {
  return item?.horarioInicioEvento || "-";
}

function obterDataResumoExecutado(item) {
  const dataInicio = formatarDataCurta(item?.dataInicioEvento || "");
  if (dataInicio) {
    return dataInicio;
  }

  return obterPeriodoExibicao(item);
}

function obterArquivoSolicitante(item) {
  return item?.osSolicitanteArquivo || item?.arquivoSolicitante || null;
}

function atualizarResumoArquivoSolicitante(arquivo) {
  arquivoSolicitanteAtual = arquivo || null;

  if (!campoArquivoSolicitanteAtual) return;

  if (arquivoSolicitanteAtual?.nomeOriginal) {
    campoArquivoSolicitanteAtual.textContent = `Arquivo atual: ${arquivoSolicitanteAtual.nomeOriginal}`;
    return;
  }

  campoArquivoSolicitanteAtual.textContent = "Nenhum arquivo anexado.";
}

function lerArquivoComoBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const resultado = String(reader.result || "");
      const [, base64 = ""] = resultado.split(",");
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("Falha ao ler arquivo."));
    reader.readAsDataURL(arquivo);
  });
}

function obterArquivoImportacaoDashboard() {
  const input = document.getElementById("arquivoImportacaoDashboard");
  return input?.files?.[0] || null;
}

function obterStatusImportacaoDashboard() {
  return document.getElementById("statusImportacaoDashboard")?.value || "executado";
}

function resetarPreviewImportacaoDashboard() {
  analiseImportacaoDashboardAtual = null;
  arquivoImportacaoDashboardAtual = null;
  atualizarStatusModal("statusImportacaoDashboardMsg");

  const resultado = document.getElementById("resultadoImportacaoDashboard");
  const avisos = document.getElementById("impAvisos");
  const lista = document.getElementById("impListaPreview");
  const botao = document.getElementById("btnConfirmarImportacaoDashboard");

  if (resultado) resultado.classList.add("hidden");
  if (avisos) avisos.innerHTML = "";
  if (lista) lista.innerHTML = "";
  if (botao) botao.disabled = true;
}

function abrirModalImportacaoDashboard() {
  if (!usuarioPodeImportarPlanilha()) {
    avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoDashboardMsg");
    return;
  }

  resetarPreviewImportacaoDashboard();
  const input = document.getElementById("arquivoImportacaoDashboard");
  if (input) input.value = "";
  const status = document.getElementById("statusImportacaoDashboard");
  if (status) status.value = "executado";
  if (modalImportacaoDashboard) modalImportacaoDashboard.style.display = "flex";
}

function fecharModalImportacaoDashboard() {
  resetarPreviewImportacaoDashboard();
  if (modalImportacaoDashboard) modalImportacaoDashboard.style.display = "none";
}

function montarPayloadArquivoImportacao(arquivo, base64) {
  return {
    nomeOriginal: arquivo.name,
    mimeType: arquivo.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    tamanho: arquivo.size,
    conteudoBase64: base64,
  };
}

function preencherTexto(id, valor) {
  const elemento = document.getElementById(id);
  if (elemento) elemento.textContent = valor;
}

function obterTagsImportacaoDashboard(item) {
  const tags = [];

  if (item.acao === "conflito") {
    tags.push({ texto: "Conflito", classe: "tag-importacao-incompleta" });
  } else if (item.acao === "criar") {
    tags.push({ texto: "Nova", classe: "tag-importacao-nova" });
  } else {
    tags.push({ texto: "Existente", classe: "tag-importacao-existente" });
  }

  if (item.repetidaNaPlanilha) {
    tags.push({ texto: "Repetida", classe: "tag-importacao-repetida" });
  }

  if (item.incompleta) {
    tags.push({ texto: "Incompleta", classe: "tag-importacao-incompleta" });
  }

  if (item.acao !== "conflito" && !item.repetidaNaPlanilha && !item.incompleta) {
    tags.push({ texto: "OK", classe: "tag-importacao-ok" });
  }

  return tags;
}

function renderizarTagsImportacaoDashboard(item) {
  return obterTagsImportacaoDashboard(item)
    .map((tag) => `<span class="tag-importacao ${tag.classe}">${escaparHtml(tag.texto)}</span>`)
    .join("");
}

function renderizarPreviewImportacaoDashboard(analise) {
  const resumo = analise?.resumo || {};
  preencherTexto("impTotalOS", resumo.totalOS || 0);
  preencherTexto("impCriar", resumo.criar || 0);
  preencherTexto("impAtualizar", resumo.atualizar || 0);
  preencherTexto("impItens", resumo.totalItens || 0);
  preencherTexto("impIncompletas", resumo.incompletas || 0);
  preencherTexto("impIgnoradas", resumo.linhasIgnoradas || 0);

  const avisos = document.getElementById("impAvisos");
  if (avisos) {
    const mensagens = [
      "Valores financeiros e precifica\u00e7\u00e3o n\u00e3o ser\u00e3o importados.",
      ...(Array.isArray(analise?.avisos) ? analise.avisos.slice(0, 8) : []),
    ];
    avisos.innerHTML = mensagens
      .map((mensagem) => `<p>${escaparHtml(mensagem)}</p>`)
      .join("");
  }

  const lista = document.getElementById("impListaPreview");
  if (lista) {
    const registros = Array.isArray(analise?.registros) ? analise.registros : [];
    preencherTexto(
      "impResumoLista",
      `Lista completa: ${registros.length} OS exibidas na pr\u00e9-visualiza\u00e7\u00e3o.`
    );
    lista.innerHTML = registros.length
      ? registros.map((item) => {
          const acao = item.acao === "conflito" ? "Conflito na" : item.acao === "criar" ? "Criar" : "Complementar";
          const detalhes = [
            item.solicitante || "Sem solicitante",
            item.localEvento || "Sem local",
            `${item.totalItens || 0} item(ns)`,
          ].join(" - ");
          return `
            <label class="item-os-planilha">
              <span>
                <strong>${escaparHtml(acao)} OS ${escaparHtml(item.numeroOS || "-")}</strong>
                <small>${escaparHtml(detalhes)}</small>
              </span>
              <span class="tags-importacao">${renderizarTagsImportacaoDashboard(item)}</span>
            </label>
          `;
        }).join("")
      : "<p class=\"texto-planilha-ajuda\">Nenhuma OS encontrada para importa\u00e7\u00e3o.</p>";
  }

  const resultado = document.getElementById("resultadoImportacaoDashboard");
  if (resultado) resultado.classList.remove("hidden");

  const botao = document.getElementById("btnConfirmarImportacaoDashboard");
  if (botao) botao.disabled = !(resumo.totalOS > 0) || Boolean(resumo.conflitos);
}

async function analisarImportacaoDashboard() {
  if (!usuarioPodeImportarPlanilha()) {
    avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoDashboardMsg");
    return;
  }

  const arquivo = obterArquivoImportacaoDashboard();
  if (!arquivo) {
    atualizarStatusModal("statusImportacaoDashboardMsg", "Selecione uma planilha Excel.", "erro");
    return;
  }

  if (!/\.xlsx$/i.test(arquivo.name)) {
    atualizarStatusModal("statusImportacaoDashboardMsg", "Selecione um arquivo .xlsx.", "erro");
    return;
  }

  try {
    resetarPreviewImportacaoDashboard();
    atualizarStatusModal("statusImportacaoDashboardMsg", "Analisando planilha...", "aviso");
    const base64 = await lerArquivoComoBase64(arquivo);
    const payloadArquivo = montarPayloadArquivoImportacao(arquivo, base64);
    const resposta = await fetch("/api/os/importacao-dashboard/analisar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ arquivo: payloadArquivo }),
    });
    const resultado = await resposta.json();

    if (!resposta.ok) {
      atualizarStatusModal("statusImportacaoDashboardMsg", resultado.erro || "Erro ao analisar a planilha.", "erro");
      return;
    }

    arquivoImportacaoDashboardAtual = payloadArquivo;
    analiseImportacaoDashboardAtual = resultado;
    renderizarPreviewImportacaoDashboard(resultado);
    const resumo = resultado.resumo || {};
    atualizarStatusModal(
      "statusImportacaoDashboardMsg",
      (resumo.conflitos || 0)
        ? `Importação bloqueada: ${resumo.conflitos} OS com destino ambíguo. Confira os avisos e identifique a OS correta.`
        : `Análise pronta: ${resumo.totalOS || 0} OS encontradas, ${resumo.criar || 0} novas e ${resumo.atualizar || 0} existentes.`,
      (resumo.conflitos || 0) ? "erro" : "sucesso"
    );
  } catch (error) {
    atualizarStatusModal("statusImportacaoDashboardMsg", "Erro ao analisar a planilha.", "erro");
  }
}

async function confirmarImportacaoDashboard() {
  if (!usuarioPodeImportarPlanilha()) {
    avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoDashboardMsg");
    return;
  }

  if (!arquivoImportacaoDashboardAtual || !analiseImportacaoDashboardAtual) {
    atualizarStatusModal("statusImportacaoDashboardMsg", "Analise a planilha antes de confirmar.", "erro");
    return;
  }

  const resumo = analiseImportacaoDashboardAtual.resumo || {};
  const statusImportacao = obterStatusImportacaoDashboard();
  const statusTexto = traduzirStatus(statusImportacao);
  const confirmar = window.confirm(
    `Confirmar importa\u00e7\u00e3o de ${resumo.totalOS || 0} OS como ${statusTexto}? ` +
    `${resumo.criar || 0} ser\u00e3o criadas e ${resumo.atualizar || 0} ser\u00e3o complementadas.`
  );
  if (!confirmar) return;

  const botao = document.getElementById("btnConfirmarImportacaoDashboard");
  if (botao) botao.disabled = true;
  atualizarStatusModal("statusImportacaoDashboardMsg", "Importando OS analisadas...", "aviso");

  try {
    const resposta = await fetch("/api/os/importacao-dashboard/confirmar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ arquivo: arquivoImportacaoDashboardAtual, status: statusImportacao }),
    });
    const resultado = await resposta.json();

    if (!resposta.ok) {
      atualizarStatusModal("statusImportacaoDashboardMsg", resultado.erro || "Erro ao confirmar a importa\u00e7\u00e3o.", "erro");
      if (botao) botao.disabled = false;
      return;
    }

    const final = resultado.resumo || {};
    atualizarStatusModal("statusImportacaoDashboardMsg", `Importação concluída. Criadas: ${final.criadas || 0}. Complementadas: ${final.atualizadas || 0}.`, "sucesso");
    fecharModalImportacaoDashboard();
    await carregarSolicitantes();
    await carregarOS();
  } catch (error) {
    atualizarStatusModal("statusImportacaoDashboardMsg", "Erro ao confirmar a importa\u00e7\u00e3o.", "erro");
    if (botao) botao.disabled = false;
  }
}

function limparDigitosMoeda(valor) {
  return String(valor ?? "").replace(/\D/g, "");
}

function formatarMoedaCentavos(digitos) {
  const numero = Number(digitos || "0") / 100;
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarMoedaReaisInteiros(digitos) {
  const numero = Number(digitos || "0");
  return numero.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarOrcamentoParaInput(valor) {
  const texto = String(valor ?? "").trim();
  if (!texto) return "";

  const soDigitos = limparDigitosMoeda(texto);
  if (!soDigitos) return "";

  if (/^\d+$/.test(texto) || /^\d{1,3}(\.\d{3})+$/.test(texto)) {
    return formatarMoedaReaisInteiros(soDigitos);
  }

  return formatarMoedaCentavos(soDigitos);
}

function aplicarMascaraOrcamento() {
  if (!campoOrcamento) return;

  const digitos = limparDigitosMoeda(campoOrcamento.value);
  campoOrcamento.value = digitos ? formatarMoedaCentavos(digitos) : "";
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

function atualizarListaSolicitantesUI() {
  const listaSolicitantesDataList = document.getElementById("listaSolicitantes");
  if (!listaSolicitantesDataList) return;

  listaSolicitantesDataList.innerHTML = "";

  listaSolicitantes.forEach((nome) => {
    const option = document.createElement("option");
    option.value = nome;
    listaSolicitantesDataList.appendChild(option);
  });
}

async function carregarSolicitantes() {
  try {
    const resposta = await fetch("/api/solicitantes", { cache: "no-store" });
    const dados = await resposta.json();

    if (!resposta.ok) {
      return;
    }

    listaSolicitantes = Array.isArray(dados) ? dados : [];
    atualizarListaSolicitantesUI();
  } catch (error) {
    // ignora para não travar o sistema
  }
}

async function carregarUsuarioLogado() {
  try {
    const usuarioNavegacao = await window.inicializarNavegacao?.();
    if (usuarioNavegacao) {
      usuarioLogado = obterUsuarioSessao(usuarioNavegacao);
      const campoNome = document.getElementById("usuarioLogadoNome");
      if (campoNome) {
        const nome = obterNomeExibicaoUsuario(usuarioNavegacao);
        if (nome && nome !== "-") campoNome.textContent = nome;
      }
      return;
    }

    const resposta = await fetch("/api/me", { cache: "no-store" });
    const dados = await resposta.json();

    if (!resposta.ok) {
      window.location.href = "/login.html";
      return;
    }

    usuarioLogado = obterUsuarioSessao(dados);

    const campoNome = document.getElementById("usuarioLogadoNome");
    if (campoNome) {
      const nome = obterNomeExibicaoUsuario(dados);
      if (nome && nome !== "-") campoNome.textContent = nome;
    }
  } catch (error) {
    window.location.href = "/login.html";
  }
}

async function logout() {
  try {
    await fetch("/api/logout", {
      method: "POST",
    });
  } catch (error) {
    // ignora e redireciona
  }

  window.location.href = "/login.html";
}

function abrirModal() {
  atualizarStatusModal("statusFormularioOS");
  if (!osEmEdicao) {
    restaurarRascunhoFormularioOS();
  }
  modal.style.display = "flex";
}

function fecharModal(opcoes = {}) {
  atualizarStatusModal("statusFormularioOS");
  if (opcoes.limparFormulario) {
    modal.style.display = "none";
    limparFormulario();
    return;
  }

  if (osEmEdicao) {
    modal.style.display = "none";
    limparFormulario();
    return;
  }

  salvarRascunhoFormularioOS();
  modal.style.display = "none";
}

function limparFormulario() {
  osEmEdicao = null;
  versaoOSEmEdicao = "";
  campoNumeroOS.value = "";
  campoSolicitante.value = "";
  if (campoResponsavelEvento) campoResponsavelEvento.value = "";
  if (campoTelefoneEvento) campoTelefoneEvento.value = "";
  campoLocalEvento.value = "";
  campoNomeEvento.value = "";
  campoPeriodoEvento.value = "";
  if (campoDataInicioEvento) campoDataInicioEvento.value = "";
  if (campoDataFimEvento) campoDataFimEvento.value = "";
  if (campoHorarioInicioEvento) campoHorarioInicioEvento.value = "";
  if (campoQuantidadeDiarias) campoQuantidadeDiarias.value = "";
  campoMateriais.value = "";
  campoOrcamento.value = "";
  campoObservacoes.value = "";
  if (campoOsSolicitanteArquivo) campoOsSolicitanteArquivo.value = "";
  atualizarResumoArquivoSolicitante(null);
  document.getElementById("tituloModal").textContent = "Nova OS";
}

function obterCamposRascunhoFormularioOS() {
  return CAMPOS_RASCUNHO_OS.filter(([, campo]) => campo);
}

function coletarRascunhoFormularioOS() {
  const dados = {};

  obterCamposRascunhoFormularioOS().forEach(([chave, campo]) => {
    dados[chave] = campo.value || "";
  });

  const arquivo = campoOsSolicitanteArquivo?.files?.[0];
  dados.osSolicitanteArquivoNome = arquivo?.name || "";
  dados.anoEvento = obterAnoSelecionado();
  dados.atualizadoEm = new Date().toISOString();
  dados.expiraEm = Date.now() + RASCUNHO_NOVA_OS_TTL_MS;

  return dados;
}

function rascunhoFormularioOSTemConteudo(rascunho) {
  if (!rascunho || typeof rascunho !== "object") return false;

  return obterCamposRascunhoFormularioOS().some(([chave]) => String(rascunho[chave] || "").trim()) ||
    Boolean(String(rascunho.osSolicitanteArquivoNome || "").trim());
}

function obterRascunhoFormularioOS() {
  try {
    const texto = localStorage.getItem(RASCUNHO_NOVA_OS_STORAGE_KEY);
    if (!texto) return null;
    const rascunho = JSON.parse(texto);

    if (!rascunho.expiraEm || Number(rascunho.expiraEm) <= Date.now()) {
      limparRascunhoFormularioOS({ manterFormulario: true });
      return null;
    }

    return rascunhoFormularioOSTemConteudo(rascunho) ? rascunho : null;
  } catch (error) {
    return null;
  }
}

function limparFormularioOSOcultoAposExpirar() {
  if (modal?.style.display === "flex" || osEmEdicao) return;
  limparFormulario();
}

function agendarExpiracaoRascunhoFormularioOS(rascunho) {
  clearTimeout(temporizadorExpiracaoRascunhoFormularioOS);
  if (!rascunho?.expiraEm) return;

  const atraso = Math.max(0, Number(rascunho.expiraEm) - Date.now());
  temporizadorExpiracaoRascunhoFormularioOS = setTimeout(() => {
    limparRascunhoFormularioOS({ manterFormulario: true });
    limparFormularioOSOcultoAposExpirar();
  }, atraso);
}

function removerRascunhoFormularioOSExpirado() {
  const rascunho = obterRascunhoFormularioOS();
  if (rascunho) {
    agendarExpiracaoRascunhoFormularioOS(rascunho);
    return false;
  }

  return true;
}

function salvarRascunhoFormularioOS() {
  if (osEmEdicao) return;

  const rascunho = coletarRascunhoFormularioOS();
  if (!rascunhoFormularioOSTemConteudo(rascunho)) {
    limparRascunhoFormularioOS({ manterFormulario: true });
    return;
  }

  try {
    localStorage.setItem(RASCUNHO_NOVA_OS_STORAGE_KEY, JSON.stringify(rascunho));
    agendarExpiracaoRascunhoFormularioOS(rascunho);
  } catch (error) {
    // Sem acao: rascunho temporario indisponivel neste navegador.
  }
}

function aplicarRascunhoFormularioOS(rascunho) {
  if (!rascunhoFormularioOSTemConteudo(rascunho)) return false;

  obterCamposRascunhoFormularioOS().forEach(([chave, campo]) => {
    campo.value = rascunho[chave] || "";
  });

  if (campoOsSolicitanteArquivo) campoOsSolicitanteArquivo.value = "";
  if (rascunho.osSolicitanteArquivoNome) {
    arquivoSolicitanteAtual = null;
    if (campoArquivoSolicitanteAtual) {
      campoArquivoSolicitanteAtual.textContent = `Arquivo anterior: ${rascunho.osSolicitanteArquivoNome} (anexe novamente).`;
    }
  } else {
    atualizarResumoArquivoSolicitante(null);
  }

  return true;
}

function restaurarRascunhoFormularioOS() {
  const rascunho = obterRascunhoFormularioOS();
  if (!rascunho) {
    limparFormularioOSOcultoAposExpirar();
    return false;
  }

  const restaurado = aplicarRascunhoFormularioOS(rascunho);
  agendarExpiracaoRascunhoFormularioOS(rascunho);
  return restaurado;
}

function limparRascunhoFormularioOS(opcoes = {}) {
  try {
    localStorage.removeItem(RASCUNHO_NOVA_OS_STORAGE_KEY);
  } catch (error) {
    // Sem acao: rascunho local indisponivel.
  }
  clearTimeout(temporizadorExpiracaoRascunhoFormularioOS);

  if (!opcoes.manterFormulario) {
    limparFormulario();
  }
}

function configurarRascunhoFormularioOS() {
  removerRascunhoFormularioOSExpirado();

  window.addEventListener("beforeunload", () => {
    if (!osEmEdicao && modal?.style.display === "flex") {
      salvarRascunhoFormularioOS();
    }
  });
}

function atualizarResumo(lista) {
  const pendentes = lista.filter((item) => item.status === "pendente").length;
  const autorizados = lista.filter((item) => item.status === "autorizado").length;
  const execucao = lista.filter((item) => item.status === "em_execucao").length;
  const naRua = lista.filter((item) => item.status === "na_rua").length;
  const executados = lista.filter((item) => item.status === "executado").length;
  const recusados = lista.filter((item) => item.status === "recusado").length;

  document.getElementById("pendentes").textContent = pendentes;
  document.getElementById("autorizados").textContent = autorizados;
  document.getElementById("execucao").textContent = execucao;
  document.getElementById("naRua").textContent = naRua;
  document.getElementById("executados").textContent = executados;
  document.getElementById("recusados").textContent = recusados;

  document.getElementById("badge-pendente").textContent = pendentes;
  document.getElementById("badge-autorizado").textContent = autorizados;
  document.getElementById("badge-em_execucao").textContent = execucao;
  document.getElementById("badge-na_rua").textContent = naRua;
  document.getElementById("badge-executado").textContent = executados;
  document.getElementById("badge-recusado").textContent = recusados;
}

function limparColunas() {
  document.querySelectorAll(".cards").forEach((coluna) => {
    coluna.innerHTML = "";
    coluna.classList.remove("drop-hover");
  });
}

function criarBotao(texto, classe, acao) {
  const botao = document.createElement("button");
  botao.type = "button";
  botao.textContent = texto;
  botao.className = classe;
  botao.onclick = (e) => {
    e.stopPropagation();
    acao();
  };
  return botao;
}

function configurarTogglePainelLateral() {
  if (!btnTogglePainelLateral || !painelLateral || !layoutDashboard) return;
  const OFFSET_BORDA_EXTERNA_PAINEL = 22;

  function atualizarPosicaoBotaoPainelLateral(oculto) {
    if (oculto) {
      btnTogglePainelLateral.style.left = "";
      btnTogglePainelLateral.style.right = "0px";
      btnTogglePainelLateral.style.transform = "";
      return;
    }

    const painelRect = painelLateral.getBoundingClientRect();
    btnTogglePainelLateral.style.right = "auto";
    btnTogglePainelLateral.style.left = `${Math.max(0, Math.round(painelRect.left - OFFSET_BORDA_EXTERNA_PAINEL))}px`;
    btnTogglePainelLateral.style.transform = "translateX(-100%)";
  }

  function atualizarBotaoPainelLateral(oculto) {
    const texto = oculto ? "Mostrar lateral direita" : "Esconder lateral direita";
    btnTogglePainelLateral.textContent = oculto ? "\u2039" : "\u203a";
    btnTogglePainelLateral.setAttribute("aria-label", texto);
    btnTogglePainelLateral.setAttribute("title", texto);
    btnTogglePainelLateral.classList.toggle("painel-oculto", oculto);
    atualizarPosicaoBotaoPainelLateral(oculto);
  }

  atualizarOffsetPainelFixo();
  atualizarBotaoPainelLateral(painelLateral.classList.contains("hidden"));
  window.addEventListener("resize", () => {
    atualizarOffsetPainelFixo();
    atualizarPosicaoBotaoPainelLateral(painelLateral.classList.contains("hidden"));
  });
  window.addEventListener("scroll", () => {
    atualizarPosicaoBotaoPainelLateral(painelLateral.classList.contains("hidden"));
  }, { passive: true });

  btnTogglePainelLateral.addEventListener("click", () => {
    const oculto = painelLateral.classList.toggle("hidden");
    layoutDashboard.classList.toggle("sem-lateral", oculto);
    requestAnimationFrame(() => atualizarBotaoPainelLateral(oculto));
  });
}

function configurarRolagemHorizontalDashboard() {
  const quadro = document.querySelector(".kanban-board");
  const barra = document.getElementById("kanbanScrollFixo");
  const conteudo = barra?.firstElementChild;
  if (!quadro || !conteudo || typeof ResizeObserver === "undefined") return;

  function atualizarLargura() {
    barra.hidden = quadro.scrollWidth <= quadro.clientWidth + 1;
    conteudo.style.width = `${quadro.scrollWidth}px`;
    barra.scrollLeft = quadro.scrollLeft;
  }

  quadro.addEventListener("scroll", () => { barra.scrollLeft = quadro.scrollLeft; }, { passive: true });
  barra.addEventListener("scroll", () => { quadro.scrollLeft = barra.scrollLeft; }, { passive: true });
  new ResizeObserver(atualizarLargura).observe(quadro);
  atualizarLargura();
  quadro.classList.add("kanban-board-scroll-oculto");
}

function abrirAbaPainel(nomeAba) {
  tabsPainel.forEach((tab) => {
    const ativa = tab.dataset.tab === nomeAba;
    tab.classList.toggle("ativo", ativa);
    tab.setAttribute("aria-selected", ativa ? "true" : "false");
  });

  conteudosPainel.forEach((conteudo) => {
    conteudo.classList.toggle("ativo", conteudo.dataset.tabContent === nomeAba);
  });
}

function configurarAbasPainel() {
  tabsPainel.forEach((tab) => {
    tab.addEventListener("click", () => abrirAbaPainel(tab.dataset.tab));
  });
}

function montarCard(item) {
  const card = document.createElement("div");
  card.className = "card";
  card.draggable = modoSelecaoOS ? false : true;
  card.dataset.id = item.id;
  card.dataset.status = item.status;
  card.classList.toggle("modo-selecao", modoSelecaoOS);
  card.classList.toggle("selecionado-em-massa", idsOSSelecionadas.has(String(item.id)));
  const cardReduzido = STATUSS_CARD_REDUZIDO.has(item.status);

  const topo = criarElemento("div", "card-topo");
  if (modoSelecaoOS) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.className = "checkbox-selecao-os";
    checkbox.checked = idsOSSelecionadas.has(String(item.id));
    checkbox.setAttribute("aria-label", `Selecionar OS ${item.numeroOS || item.id}`);
    checkbox.addEventListener("click", (evento) => evento.stopPropagation());
    checkbox.addEventListener("change", () => alternarSelecaoOS(item.id, checkbox.checked));
    topo.appendChild(checkbox);
  }
  topo.appendChild(criarElemento("span", "card-os", item.numeroOS || "Sem número"));
  topo.appendChild(criarElemento("span", "card-status", traduzirStatus(item.status)));

  const info = criarElemento("div", "card-info");
  const titulo = criarElemento("h3", "card-titulo", item.nomeEvento || "-");

  if (cardReduzido) {
    info.appendChild(criarLinhaInfo("Solicitante", item.solicitante || "-"));
    info.appendChild(criarLinhaInfo("Data", obterDataResumoExecutado(item)));
  } else {
    info.appendChild(criarLinhaInfo("Solicitante", item.solicitante || "-"));
    info.appendChild(criarLinhaInfo("Resp. do evento", item.responsavelEvento || "-"));
    info.appendChild(criarLinhaInfo("Telefone", item.telefoneEvento || "-"));
    info.appendChild(criarLinhaInfo("Local", item.localEvento || "-"));
    info.appendChild(criarLinhaInfo("Periodo", obterPeriodoExibicao(item)));
    info.appendChild(criarLinhaInfo("Horario", exibirHorarioInicio(item)));
    info.appendChild(criarLinhaInfo("Diárias", String(item.quantidadeDiarias ?? 0)));
    info.appendChild(criarLinhaInfo("Orçamento", item.orcamento || "-"));
    info.appendChild(criarLinhaInfo("Obs.", item.observacoes || item.observacaoAprovacao || "-"));
    info.appendChild(criarLinhaInfo("Responsavel atual", item.responsavel || "-"));
  }

  card.appendChild(topo);
  card.appendChild(titulo);
  card.appendChild(info);

  if (!cardReduzido) {
    const acoes = criarElemento("div", "card-acoes");
    const btnEditar = criarBotao("Editar", "btn-editar", () => editarOS(item));
    const btnMover = criarBotao("Mover", "btn-mover", () => moverStatus(item));
    const btnPDF = criarBotao("Gerar PDF", "btn-pdf", () => gerarPDF(item.id));
    const btnExcluir = criarBotao("Excluir", "btn-excluir", () => excluirOS(item));

    acoes.appendChild(btnEditar);
    acoes.appendChild(btnMover);
    acoes.appendChild(btnPDF);
    acoes.appendChild(btnExcluir);
    card.appendChild(acoes);
  }

  card.onclick = () => {
    if (modoSelecaoOS) {
      alternarSelecaoOS(item.id);
      return;
    }
    selecionarOS(item);
  };

  card.addEventListener("dragstart", (e) => {
    if (modoSelecaoOS) {
      e.preventDefault();
      return;
    }
    osArrastandoId = item.id;
    card.classList.add("dragging");
    e.dataTransfer.setData("text/plain", item.id);
    e.dataTransfer.effectAllowed = "move";
  });

  card.addEventListener("dragend", () => {
    osArrastandoId = null;
    card.classList.remove("dragging");
    document.querySelectorAll(".cards").forEach((area) => {
      area.classList.remove("drop-hover");
    });
  });

  return card;
}

function renderizarOS(lista) {
  listaFiltradaAtual = [...lista];

  limparColunas();
  atualizarResumo(lista);
  atualizarBotoesOrdenacaoDashboard();

  STATUSS_VALIDOS.forEach((status) => {
    const coluna = document.querySelector(`#${status} .cards`);
    if (coluna) {
      ordenarOSDashboard(lista.filter((item) => item.status === status), status).forEach((item) => {
        coluna.appendChild(montarCard(item));
      });
    }
  });

  if (osSelecionada) {
    const atualizada = listaOriginal.find((item) => item.id === osSelecionada.id);
    if (atualizada) {
      selecionarOS(atualizada);
    } else {
      limparPainelDetalhes();
    }
  }

  atualizarHistorico();
  atualizarResumoPlanilhaFiltradas();
  atualizarBarraAcoesEmMassaOS();
}

function abrirModalStatus(item, novoStatus) {
  if (!STATUSS_VALIDOS.includes(novoStatus)) {
    mostrarAvisoInterface("Status inválido.", "erro");
    return;
  }

  statusTemp = novoStatus;
  osTemp = item;

  document.getElementById("textoStatus").textContent =
    `${traduzirStatus(item.status)} -> ${traduzirStatus(novoStatus)}`;

  const select = document.getElementById("novoStatusSelect");
  if (select) {
    select.value = novoStatus;
  }

  atualizarStatusModal("statusMudancaStatus");
  document.getElementById("observacaoStatus").value = "";
  modalStatus.style.display = "flex";
}

function fecharModalStatus() {
  modalStatus.style.display = "none";
  statusTemp = null;
  osTemp = null;
  atualizarStatusModal("statusMudancaStatus");
  document.getElementById("observacaoStatus").value = "";
}

async function confirmarMudancaStatus() {
  if (!validarUsuarioAtual()) return;

  const observacao = document.getElementById("observacaoStatus").value.trim();
  const select = document.getElementById("novoStatusSelect");
  const novoStatus = select ? select.value : statusTemp;

  if (!novoStatus) {
    atualizarStatusModal("statusMudancaStatus", "Selecione o novo status.", "erro");
    return;
  }

  if (!osTemp) {
    atualizarStatusModal("statusMudancaStatus", "Não foi possível identificar a OS.", "erro");
    return;
  }

  try {
    atualizarStatusModal("statusMudancaStatus", "Alterando status...", "aviso");
    const resposta = await fetch(`/api/os/${osTemp.id}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        status: novoStatus,
        observacaoAprovacao: observacao,
      }),
    });

    const resultado = await resposta.json();

  if (!resposta.ok) {
      atualizarStatusModal("statusMudancaStatus", resultado.erro || "Erro ao alterar status.", "erro");
      return;
    }

    fecharModalStatus();
    await carregarOS();
  } catch (error) {
    atualizarStatusModal("statusMudancaStatus", "Erro ao alterar status.", "erro");
  }
}

function abrirModalExclusao(item) {
  osExclusaoTemp = item;
  document.getElementById("textoExclusao").textContent =
    `Você está prestes a excluir a OS ${item.numeroOS || "-"} - ${item.nomeEvento || "Sem evento"}.`;
  document.getElementById("motivoExclusao").value = "";
  atualizarStatusModal("statusExclusaoOS");
  modalExclusao.style.display = "flex";
}

function fecharModalExclusao() {
  modalExclusao.style.display = "none";
  osExclusaoTemp = null;
  atualizarStatusModal("statusExclusaoOS");
  document.getElementById("motivoExclusao").value = "";
}

async function confirmarExclusao() {
  if (!validarUsuarioAtual()) return;
  if (!osExclusaoTemp) return;

  const motivoExclusao = document.getElementById("motivoExclusao").value.trim();

  if (!motivoExclusao) {
    atualizarStatusModal("statusExclusaoOS", "O motivo da exclus\u00e3o \u00e9 obrigat\u00f3rio.", "erro");
    return;
  }

  try {
    atualizarStatusModal("statusExclusaoOS", "Excluindo OS...", "aviso");
    const resposta = await fetch(`/api/os/${osExclusaoTemp.id}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        motivoExclusao,
      }),
    });

    const resultado = await resposta.json();

    if (!resposta.ok) {
      atualizarStatusModal("statusExclusaoOS", resultado.erro || "Erro ao excluir a OS.", "erro");
      return;
    }

    if (osSelecionada && osSelecionada.id === osExclusaoTemp.id) {
      limparPainelDetalhes();
    }

    fecharModalExclusao();
    await carregarOS();
  } catch (error) {
    atualizarStatusModal("statusExclusaoOS", "Erro ao excluir a OS.", "erro");
  }
}

async function carregarOS() {
  try {
    const ano = encodeURIComponent(obterAnoSelecionado());
    const resposta = await fetch(`/api/os?ano=${ano}&_=${Date.now()}`, {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache",
      },
    });

    const lista = await resposta.json();

    if (!resposta.ok) {
      mostrarAvisoInterface(lista.erro || "Erro ao carregar as OS.", "erro");
      return;
    }

    listaOriginal = Array.isArray(lista) ? lista : [];
    filtrarOS();
    configurarDropZones();
  } catch (error) {
    mostrarAvisoInterface("Erro ao carregar as OS.", "erro");
  }
}

function obterContainerNotificacoesOS() {
  let container = document.querySelector(".notificacoes-os");

  if (!container) {
    container = document.createElement("div");
    container.className = "notificacoes-os";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }

  return container;
}

function mostrarNotificacaoNovaOS(dados) {
  const container = obterContainerNotificacoesOS();
  const aviso = document.createElement("button");
  aviso.type = "button";
  aviso.className = "notificacao-os";

  const titulo = dados.numeroOS ? `Nova OS ${dados.numeroOS}` : "Nova OS criada";
  const descricao = [dados.nomeEvento, dados.solicitante].filter(Boolean).join(" - ");

  aviso.innerHTML = `
    <strong>${escaparHtml(titulo)}</strong>
    <span>${escaparHtml(descricao || "A lista foi atualizada.")}</span>
  `;

  aviso.addEventListener("click", () => {
    const item = listaOriginal.find((os) => os.id === dados.id);
    if (item) selecionarOS(item);
    aviso.remove();
  });

  container.appendChild(aviso);
  setTimeout(() => aviso.remove(), 9000);
}

function tocarSomNovaOS() {
  const AudioContexto = window.AudioContext || window.webkitAudioContext;
  if (!AudioContexto) return;

  try {
    const contexto = new AudioContexto();
    const oscilador = contexto.createOscillator();
    const ganho = contexto.createGain();

    oscilador.type = "sine";
    oscilador.frequency.setValueAtTime(880, contexto.currentTime);
    oscilador.frequency.setValueAtTime(1175, contexto.currentTime + 0.08);
    ganho.gain.setValueAtTime(0.001, contexto.currentTime);
    ganho.gain.exponentialRampToValueAtTime(0.16, contexto.currentTime + 0.02);
    ganho.gain.exponentialRampToValueAtTime(0.001, contexto.currentTime + 0.28);

    oscilador.connect(ganho);
    ganho.connect(contexto.destination);
    oscilador.start();
    oscilador.stop(contexto.currentTime + 0.3);
    oscilador.addEventListener("ended", () => contexto.close());
  } catch {
    // Alguns navegadores bloqueiam audio sem interacao previa do usuario.
  }
}

function eventoPertenceAoAnoSelecionado(dados) {
  return !dados?.anoEvento || String(dados.anoEvento) === obterAnoSelecionado();
}

function sincronizarOSTempoReal() {
  if (sincronizacaoTempoRealPendente) return sincronizacaoTempoRealPendente;

  sincronizacaoTempoRealPendente = carregarOS().finally(() => {
    sincronizacaoTempoRealPendente = null;
  });

  return sincronizacaoTempoRealPendente;
}

function obterDadosEventoOS(evento) {
  let dados = {};

  try {
    dados = JSON.parse(evento.data || "{}");
  } catch {
    dados = {};
  }

  return dados;
}

async function tratarOSCriadaTempoReal(evento) {
  const dados = obterDadosEventoOS(evento);

  await sincronizarOSTempoReal();

  if (!eventoPertenceAoAnoSelecionado(dados)) return;

  mostrarNotificacaoNovaOS(dados);
  tocarSomNovaOS();

  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    const titulo = dados.numeroOS ? `Nova OS ${dados.numeroOS}` : "Nova OS criada";
    const body = [dados.nomeEvento, dados.solicitante].filter(Boolean).join(" - ");
    new Notification(titulo, { body: body || "A lista de OS foi atualizada." });
  }
}

function tratarSincronizacaoOSTempoReal() {
  sincronizarOSTempoReal();
}

function iniciarNotificacoesTempoReal() {
  if (!("EventSource" in window) || canalNotificacoesOS) return;

  canalNotificacoesOS = new EventSource("/api/notificacoes/stream");
  canalNotificacoesOS.addEventListener("os_criada", tratarOSCriadaTempoReal);
  canalNotificacoesOS.addEventListener("os_atualizada", tratarSincronizacaoOSTempoReal);
  canalNotificacoesOS.addEventListener("os_status_alterado", tratarSincronizacaoOSTempoReal);
  canalNotificacoesOS.addEventListener("os_excluida", tratarSincronizacaoOSTempoReal);
  canalNotificacoesOS.addEventListener("os_sincronizar", tratarSincronizacaoOSTempoReal);

  canalNotificacoesOS.addEventListener("error", () => {
    if (canalNotificacoesOS?.readyState === EventSource.CLOSED) {
      canalNotificacoesOS = null;
    }
  });
}

async function obterDadosFormulario() {
  const dataInicioEvento = campoDataInicioEvento ? campoDataInicioEvento.value : "";
  const dataFimEvento = campoDataFimEvento ? campoDataFimEvento.value : "";
  const horarioInicioEvento = campoHorarioInicioEvento ? campoHorarioInicioEvento.value : "";
  let osSolicitanteArquivo;

  let periodoEvento = campoPeriodoEvento.value.trim();

  if (dataInicioEvento || dataFimEvento) {
    periodoEvento = montarPeriodoAutomatico(dataInicioEvento, dataFimEvento);
  }

  if (campoOsSolicitanteArquivo?.files?.length) {
    const arquivo = campoOsSolicitanteArquivo.files[0];
    osSolicitanteArquivo = {
      nomeOriginal: arquivo.name,
      mimeType: arquivo.type || "application/octet-stream",
      tamanho: arquivo.size,
      conteudoBase64: await lerArquivoComoBase64(arquivo),
    };
  }

  return {
    numeroOS: campoNumeroOS.value.trim(),
    solicitante: campoSolicitante.value.trim(),
    responsavelEvento: campoResponsavelEvento ? campoResponsavelEvento.value.trim() : "",
    telefoneEvento: campoTelefoneEvento ? campoTelefoneEvento.value.trim() : "",
    localEvento: campoLocalEvento.value.trim(),
    nomeEvento: campoNomeEvento.value.trim(),
    periodoEvento,
    dataInicioEvento,
    dataFimEvento,
    horarioInicioEvento,
    quantidadeDiarias: campoQuantidadeDiarias ? campoQuantidadeDiarias.value.trim() : "",
    materiais: campoMateriais.value.trim(),
    orcamento: campoOrcamento.value.trim(),
    observacoes: campoObservacoes.value.trim(),
    osSolicitanteArquivo,
    anoEvento: obterAnoSelecionado(),
  };
}

async function salvarOS() {
  if (!validarUsuarioAtual()) return;

  const dados = {
    ...(await obterDadosFormulario()),
    responsavel: obterUsuarioAtual(),
  };

  if (!dados.nomeEvento) {
    atualizarStatusModal("statusFormularioOS", "Informe o nome do evento.", "erro");
    return;
  }

  if (!dados.solicitante) {
    atualizarStatusModal("statusFormularioOS", "Informe o solicitante.", "erro");
    return;
  }

  if (dados.dataInicioEvento && dados.dataFimEvento && dados.dataFimEvento < dados.dataInicioEvento) {
    atualizarStatusModal("statusFormularioOS", "A data final não pode ser menor que a data inicial.", "erro");
    return;
  }

  const quantidadeDiarias = normalizarQuantidadeDiarias(dados.quantidadeDiarias);
  if (!Number.isFinite(quantidadeDiarias) || quantidadeDiarias < 0) {
    atualizarStatusModal("statusFormularioOS", "Informe uma quantidade de diárias válida.", "erro");
    return;
  }
  dados.quantidadeDiarias = quantidadeDiarias;

  try {
    atualizarStatusModal("statusFormularioOS", "Salvando OS...", "aviso");
    let resposta;

    if (osEmEdicao) {
      dados.versaoEdicao = versaoOSEmEdicao;
      resposta = await fetch(`/api/os/${osEmEdicao}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dados),
      });
    } else {
      resposta = await fetch("/api/os", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(dados),
      });
    }

    const resultado = await resposta.json();

    if (!resposta.ok) {
      atualizarStatusModal("statusFormularioOS", resultado.erro || "Erro ao salvar a OS.", "erro");
      return;
    }

    const eraEdicao = Boolean(osEmEdicao);
    if (!eraEdicao) {
      limparRascunhoFormularioOS({ manterFormulario: true });
    }

    atualizarStatusModal("statusFormularioOS", "OS salva.", "sucesso");
    fecharModal({ limparFormulario: true });
    await carregarSolicitantes();
    await carregarOS();
  } catch (error) {
    atualizarStatusModal("statusFormularioOS", "Erro ao salvar a OS.", "erro");
  }
}

function editarOS(item) {
  osEmEdicao = item.id;
  versaoOSEmEdicao = item.atualizadoEm || "";

  campoNumeroOS.value = item.numeroOS || "";
  campoSolicitante.value = item.solicitante || "";
  if (campoResponsavelEvento) {
    campoResponsavelEvento.value =
      item.responsavelEvento ??
      item.responsavel_evento ??
      item.responsavelDoEvento ??
      "";
  }
  if (campoTelefoneEvento) {
    campoTelefoneEvento.value =
      item.telefoneEvento ??
      item.telefone_evento ??
      item.telefoneDoEvento ??
      item.telefoneResponsavelEvento ??
      item.telefoneResponsavel ??
      "";
  }
  campoLocalEvento.value = item.localEvento || "";
  campoNomeEvento.value = item.nomeEvento || "";
  campoPeriodoEvento.value = item.periodoEvento || "";
  if (campoDataInicioEvento) campoDataInicioEvento.value = item.dataInicioEvento || "";
  if (campoDataFimEvento) campoDataFimEvento.value = item.dataFimEvento || "";
  if (campoHorarioInicioEvento) campoHorarioInicioEvento.value = item.horarioInicioEvento || "";
  if (campoQuantidadeDiarias) campoQuantidadeDiarias.value = String(item.quantidadeDiarias ?? 0);
  campoMateriais.value = item.materiais || "";
  campoOrcamento.value = formatarOrcamentoParaInput(item.orcamento || "");
  campoObservacoes.value = item.observacoes || "";
  if (campoOsSolicitanteArquivo) campoOsSolicitanteArquivo.value = "";
  atualizarResumoArquivoSolicitante(obterArquivoSolicitante(item));

  document.getElementById("tituloModal").textContent = "Editar OS";
  abrirModal();
}

function moverStatus(item) {
  osTemp = item;
  statusTemp = item.status;

  const select = document.getElementById("novoStatusSelect");
  if (select) {
    select.value = item.status;
  }

  document.getElementById("textoStatus").textContent =
    `Selecione o novo status para a OS ${item.numeroOS || "-"}`;

  document.getElementById("observacaoStatus").value = "";
  modalStatus.style.display = "flex";
}

function gerarPDF(id) {
  window.open(`/api/os/${id}/pdf`, "_blank");
}

function imprimirOSSelecionada() {
  if (!osSelecionada) {
    mostrarAvisoInterface("Selecione uma OS primeiro.", "aviso");
    return;
  }

  const janela = window.open("", "_blank");
  if (!janela) {
    mostrarAvisoInterface("Não foi possível abrir a janela de impressão.", "erro");
    return;
  }

  const conteudo = `
    <html>
      <head>
        <title>Impressão OS</title>
        <style>
          body { font-family: Arial, sans-serif; padding: 30px; color: #000; }
          h1 { text-align: center; margin-bottom: 30px; }
          p { font-size: 15px; line-height: 1.6; margin: 8px 0; }
          .bloco { margin-top: 24px; }
          .titulo { font-weight: bold; margin-bottom: 8px; }
          .caixa {
            border: 1px solid #ccc;
            border-radius: 8px;
            padding: 14px;
            white-space: pre-wrap;
          }
        </style>
      </head>
      <body>
        <h1>ORDEM DE SERVIÇO - EVENTO</h1>
        <p><strong>Número da OS:</strong> ${escaparHtml(osSelecionada.numeroOS || "-")}</p>
        <p><strong>Evento:</strong> ${escaparHtml(osSelecionada.nomeEvento || "-")}</p>
        <p><strong>Solicitante:</strong> ${escaparHtml(osSelecionada.solicitante || "-")}</p>
        <p><strong>Responsavel do evento:</strong> ${escaparHtml(osSelecionada.responsavelEvento || "-")}</p>
        <p><strong>Telefone:</strong> ${escaparHtml(osSelecionada.telefoneEvento || "-")}</p>
        <p><strong>Local do evento:</strong> ${escaparHtml(osSelecionada.localEvento || "-")}</p>
        <p><strong>Periodo do evento:</strong> ${escaparHtml(obterPeriodoExibicao(osSelecionada))}</p>
        <p><strong>Horario de inicio:</strong> ${escaparHtml(exibirHorarioInicio(osSelecionada))}</p>
        <p><strong>Quantidade de diárias:</strong> ${escaparHtml(String(osSelecionada.quantidadeDiarias ?? 0))}</p>
        <p><strong>OS do solicitante:</strong> ${escaparHtml(obterArquivoSolicitante(osSelecionada)?.nomeOriginal || "-")}</p>
        <p><strong>Status atual:</strong> ${escaparHtml(traduzirStatus(osSelecionada.status))}</p>
        <p><strong>Orçamento:</strong> ${escaparHtml(osSelecionada.orcamento || "-")}</p>

        <div class="bloco">
          <div class="titulo">MATERIAIS</div>
          <div class="caixa">${escaparHtml(osSelecionada.materiais || "Não informado.")}</div>
        </div>

        <div class="bloco">
          <div class="titulo">OBSERVAÇÕES</div>
          <div class="caixa">${escaparHtml(osSelecionada.observacoes || osSelecionada.observacaoAprovacao || "Sem observações.")}</div>
        </div>
      </body>
    </html>
  `;

  janela.document.open();
  janela.document.write(conteudo);
  janela.document.close();
  janela.focus();
  janela.print();
}

function excluirOS(item) {
  abrirModalExclusao(item);
}

function fecharModalRelatorioFotografico() {
  const modal = document.getElementById("modalRelatorioFotografico");
  if (!modal) return;
  modal.style.display = "none";
  modal.setAttribute("aria-hidden", "true");
}

function mostrarCandidatosRelatorioFotografico(item, candidatos) {
  const modal = document.getElementById("modalRelatorioFotografico");
  const lista = document.getElementById("listaRelatoriosFotograficos");
  if (!modal || !lista) return;

  lista.innerHTML = "";
  candidatos.forEach((candidato) => {
    const botao = criarElemento("button", "relatorio-fotografico-candidato");
    botao.type = "button";
    const titulo = candidato.os ? `OS ${candidato.os}` : (candidato.nomeEvento || "Relatório sem OS");
    botao.appendChild(criarElemento("strong", "", `${candidato.empresa} · ${titulo}`));
    botao.appendChild(criarElemento("span", "", candidato.solicitante || "Solicitante não informado"));
    const tamanho = Number.isFinite(Number(candidato.tamanhoBytes)) && Number(candidato.tamanhoBytes) > 0
      ? `${(Number(candidato.tamanhoBytes) / (1024 * 1024)).toFixed(1)} MB`
      : "";
    botao.appendChild(criarElemento("small", "", [
      candidato.caminhoRelativo ? `Pasta: ${candidato.caminhoRelativo}` : "",
      tamanho,
      candidato.periodo,
      candidato.geradoEm ? `Gerado em ${formatarDataHora(candidato.geradoEm)}` : "",
    ].filter(Boolean).join(" · ")));
    botao.addEventListener("click", () => {
      fecharModalRelatorioFotografico();
      baixarRelatorioFotografico(item, candidato.id);
    });
    lista.appendChild(botao);
  });

  modal.style.display = "flex";
  modal.setAttribute("aria-hidden", "false");
}

async function baixarRelatorioFotografico(item, idRelatorio = "") {
  const botao = document.getElementById("btnDetalheRelatorio");
  const textoOriginal = botao?.textContent || "Baixar relatório fotográfico";
  if (botao) {
    botao.disabled = true;
    botao.textContent = "Procurando relatório...";
  }

  try {
    const parametros = new URLSearchParams();
    if (idRelatorio) parametros.set("id", idRelatorio);
    const sufixo = parametros.toString() ? `?${parametros}` : "";
    const resposta = await fetch(`/api/os/${encodeURIComponent(item.id)}/relatorio-fotografico${sufixo}`);

    if (resposta.status === 409) {
      const dados = await resposta.json();
      mostrarCandidatosRelatorioFotografico(item, dados.candidatos || []);
      return;
    }
    if (!resposta.ok) {
      const dados = await resposta.json().catch(() => ({}));
      alert(dados.erro || "Não foi possível encontrar o relatório fotográfico desta OS.");
      return;
    }

    const blob = await resposta.blob();
    const nomeArquivo = extrairNomeArquivo(resposta.headers.get("Content-Disposition")) || "relatorio-fotografico.docx";
    baixarBlobComoArquivo(blob, nomeArquivo);
  } catch (erro) {
    alert("Não foi possível baixar o relatório fotográfico. Tente novamente.");
  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = textoOriginal;
    }
  }
}

document.getElementById("btnFecharModalRelatorioFotografico")?.addEventListener("click", fecharModalRelatorioFotografico);

function selecionarOS(item) {
  osSelecionada = item;
  abrirAbaPainel("detalhes");

  detalheVazio.classList.add("hidden");
  detalheOS.classList.remove("hidden");

  document.getElementById("detalhe-numero").textContent = item.numeroOS || "-";
  document.getElementById("detalhe-evento").textContent = item.nomeEvento || "-";
  document.getElementById("detalhe-solicitante").textContent = item.solicitante || "-";
  document.getElementById("detalhe-responsavel-evento").textContent = item.responsavelEvento || "-";
  document.getElementById("detalhe-telefone-evento").textContent = item.telefoneEvento || "-";
  document.getElementById("detalhe-local").textContent = item.localEvento || "-";
  document.getElementById("detalhe-periodo").textContent = obterPeriodoExibicao(item);
  document.getElementById("detalhe-horario-inicio").textContent = exibirHorarioInicio(item);
  document.getElementById("detalhe-quantidade-diarias").textContent = String(item.quantidadeDiarias ?? 0);
  document.getElementById("detalhe-status").textContent = traduzirStatus(item.status);
  document.getElementById("detalhe-orcamento").textContent = item.orcamento || "-";
  document.getElementById("detalhe-materiais").textContent = item.materiais || "-";
  document.getElementById("detalhe-observacoes").textContent = item.observacoes || "-";
  document.getElementById("detalhe-aprovacao").textContent = item.observacaoAprovacao || "-";

  const linkArquivo = document.getElementById("detalhe-os-solicitante-link");
  const vazioArquivo = document.getElementById("detalhe-os-solicitante-vazio");
  const arquivoSolicitante = obterArquivoSolicitante(item);
  if (linkArquivo) {
    if (arquivoSolicitante?.url) {
      linkArquivo.href = arquivoSolicitante.url;
      linkArquivo.classList.remove("hidden");
      if (vazioArquivo) vazioArquivo.classList.add("hidden");
    } else {
      linkArquivo.href = "#";
      linkArquivo.classList.add("hidden");
      if (vazioArquivo) vazioArquivo.classList.remove("hidden");
    }
  }

  document.getElementById("btnDetalheEditar").onclick = () => editarOS(item);
  document.getElementById("btnDetalheMover").onclick = () => moverStatus(item);
  document.getElementById("btnDetalheImprimir").onclick = () => imprimirOSSelecionada();
  document.getElementById("btnDetalhePdf").onclick = () => gerarPDF(item.id);
  document.getElementById("btnDetalheRelatorio").onclick = () => baixarRelatorioFotografico(item);
}

function limparPainelDetalhes() {
  osSelecionada = null;
  detalheVazio.classList.remove("hidden");
  detalheOS.classList.add("hidden");
}

function renderizarHistoricoMensagem(texto) {
  listaHistorico.innerHTML = "";
  listaHistorico.appendChild(criarElemento("div", "historico-item", texto));
}

async function atualizarHistorico() {
  try {
    const resposta = await fetch(`/api/historico?ano=${encodeURIComponent(obterAnoSelecionado())}`, { cache: "no-store" });
    const historicos = await resposta.json();

    if (!resposta.ok) {
      renderizarHistoricoMensagem("Erro ao carregar histórico.");
      return;
    }

    if (!Array.isArray(historicos) || !historicos.length) {
      renderizarHistoricoMensagem("Nenhuma alteração registrada.");
      return;
    }

    const ultimos = historicos.slice(0, 6);
    listaHistorico.innerHTML = "";

    ultimos.forEach((item) => {
      const bloco = criarElemento("div", "historico-item");
      bloco.appendChild(criarElemento("strong", "", `OS ${item.numeroOS || "-"}`));
      bloco.appendChild(document.createElement("br"));
      bloco.appendChild(document.createTextNode(item.detalhe || "-"));
      bloco.appendChild(document.createElement("br"));
      bloco.appendChild(criarElemento("small", "", item.observacao || ""));
      bloco.appendChild(document.createElement("br"));
      bloco.appendChild(criarElemento("small", "", `Responsavel: ${item.responsavel || "-"}`));
      bloco.appendChild(document.createElement("br"));

      const data = criarElemento("small", "");
      data.style.color = "#64748b";
      data.textContent = formatarData(item.data);
      bloco.appendChild(data);

      listaHistorico.appendChild(bloco);
    });
  } catch (error) {
    renderizarHistoricoMensagem("Erro ao carregar histórico.");
  }
}

function itemPassaFiltroData(item, dataInicialFiltro, dataFinalFiltro) {
  if (!dataInicialFiltro && !dataFinalFiltro) {
    return true;
  }

  const inicioEvento = normalizarDataParaComparacao(item.dataInicioEvento || item.dataFimEvento, false);
  const fimEvento = normalizarDataParaComparacao(item.dataFimEvento || item.dataInicioEvento, true);

  if (!inicioEvento && !fimEvento) {
    return false;
  }

  const inicioComparacao = inicioEvento || fimEvento;
  const fimComparacao = fimEvento || inicioEvento;

  const dataInicial = normalizarDataParaComparacao(dataInicialFiltro, false);
  const dataFinal = normalizarDataParaComparacao(dataFinalFiltro, true);

  if (dataInicial && fimComparacao < dataInicial) {
    return false;
  }

  if (dataFinal && inicioComparacao > dataFinal) {
    return false;
  }

  return true;
}

function obterTextoBuscaOS(item, campoBusca) {
  if (campoBusca === "numeroOS") return item.numeroOS || "";
  if (campoBusca === "nomeEvento") return item.nomeEvento || "";
  if (campoBusca === "solicitante") return item.solicitante || "";
  if (campoBusca === "responsavelEvento") return item.responsavelEvento || "";
  if (campoBusca === "localEvento") return item.localEvento || "";
  if (campoBusca === "materiais") return item.materiais || "";

  return [
    item.numeroOS,
    item.nomeEvento,
    item.solicitante,
    item.responsavelEvento,
    item.telefoneEvento,
    item.localEvento,
    item.periodoEvento,
    item.horarioInicioEvento,
    String(item.quantidadeDiarias ?? 0),
    item.orcamento,
    item.observacoes,
    item.materiais,
  ]
    .filter(Boolean)
    .join(" ");
}

function filtrarOS() {
  limparSelecaoOS();
  const termo = document.getElementById("buscaGeral").value.trim();
  const campoBusca = document.getElementById("campoBuscaFiltro")?.value || "todos";
  const status = document.getElementById("filtroStatus").value;
  const dataInicialFiltro = document.getElementById("dataInicialFiltro")?.value || "";
  const dataFinalFiltro = document.getElementById("dataFinalFiltro")?.value || "";

  const filtrada = listaOriginal.filter((item) => {
    const texto = obterTextoBuscaOS(item, campoBusca);

    const matchTexto = !termo || termoBuscaCombinaFlexivel(texto, termo);
    const matchStatus = !status || item.status === status;
    const matchData = itemPassaFiltroData(item, dataInicialFiltro, dataFinalFiltro);

    return matchTexto && matchStatus && matchData;
  });

  renderizarOS(filtrada);
  configurarDropZones();
}

function limparFiltros() {
  document.getElementById("buscaGeral").value = "";
  document.getElementById("filtroStatus").value = "";

  const campoDataInicialFiltro = document.getElementById("dataInicialFiltro");
  const campoDataFinalFiltro = document.getElementById("dataFinalFiltro");
  const campoBuscaFiltro = document.getElementById("campoBuscaFiltro");

  if (campoDataInicialFiltro) campoDataInicialFiltro.value = "";
  if (campoDataFinalFiltro) campoDataFinalFiltro.value = "";
  if (campoBuscaFiltro) campoBuscaFiltro.value = "todos";

  renderizarOS(listaOriginal);
  configurarDropZones();
}

function baixarArquivo(nomeArquivo, conteudo, tipo = "text/plain;charset=utf-8;") {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

function escaparCSV(valor) {
  const entrada = String(valor ?? "");
  const texto = (/^\s*[=+\-@\t\r]/.test(entrada) ? "'" + entrada : entrada).replace(/"/g, '""');
  return `"${texto}"`;
}

function exportarResumo(listaInformada, sufixo = "") {
  const lista = Array.isArray(listaInformada)
    ? listaInformada
    : (Array.isArray(listaFiltradaAtual) ? listaFiltradaAtual : []);

  if (!lista.length) {
    mostrarAvisoInterface("Não há OS para exportar com os filtros atuais.", "aviso");
    return;
  }

  const linhas = [
    [
      "Número da OS",
      "Evento",
      "Solicitante",
      "Responsavel do Evento",
      "Telefone",
      "Local",
      "Periodo",
      "Horario de Inicio",
      "Quantidade de Diárias",
      "Data Inicial",
      "Data Final",
      "Status",
      "Orçamento",
      "Responsavel",
      "Observações",
    ].map(escaparCSV).join(";"),
  ];

  lista.forEach((item) => {
    linhas.push(
      [
        item.numeroOS || "",
        item.nomeEvento || "",
        item.solicitante || "",
        item.responsavelEvento || "",
        item.telefoneEvento || "",
        item.localEvento || "",
        obterPeriodoExibicao(item),
        item.horarioInicioEvento || "",
        String(item.quantidadeDiarias ?? 0),
        formatarDataCurta(item.dataInicioEvento || ""),
        formatarDataCurta(item.dataFimEvento || ""),
        traduzirStatus(item.status || ""),
        item.orcamento || "",
        item.responsavel || "",
        item.observacoes || item.observacaoAprovacao || "",
      ].map(escaparCSV).join(";")
    );
  });

  const agora = new Date();
  const dataArquivo = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-${String(agora.getDate()).padStart(2, "0")}`;
  const complemento = sufixo ? `-${sufixo}` : "";
  baixarArquivo(`resumo-os-eventos${complemento}-${dataArquivo}.csv`, linhas.join("\n"), "text/csv;charset=utf-8;");
}

function configurarDropZones() {
  document.querySelectorAll(".coluna").forEach((coluna) => {
    const areaCards = coluna.querySelector(".cards");
    const statusDestino = coluna.id;

    if (!areaCards) return;

    areaCards.ondragover = (e) => {
      if (modoSelecaoOS) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      areaCards.classList.add("drop-hover");
    };

    areaCards.ondragleave = () => {
      areaCards.classList.remove("drop-hover");
    };

    areaCards.ondrop = (e) => {
      if (modoSelecaoOS) return;
      e.preventDefault();
      areaCards.classList.remove("drop-hover");

      const id = e.dataTransfer.getData("text/plain") || osArrastandoId;
      if (!id) return;

      const item = listaOriginal.find((os) => os.id === id);
      if (!item) return;
      if (item.status === statusDestino) return;

      abrirModalStatus(item, statusDestino);
    };
  });
}

function sincronizarPeriodoPelasDatas() {
  if (!campoPeriodoEvento || !campoDataInicioEvento || !campoDataFimEvento) return;

  const dataInicio = campoDataInicioEvento.value;
  const dataFim = campoDataFimEvento.value;

  if (!dataInicio && !dataFim) {
    return;
  }

  campoPeriodoEvento.value = montarPeriodoAutomatico(dataInicio, dataFim);
}

if (campoDataInicioEvento) {
  campoDataInicioEvento.addEventListener("change", sincronizarPeriodoPelasDatas);
}

if (campoDataFimEvento) {
  campoDataFimEvento.addEventListener("change", sincronizarPeriodoPelasDatas);
}

if (campoOrcamento) {
  campoOrcamento.addEventListener("input", aplicarMascaraOrcamento);
}

if (campoOsSolicitanteArquivo) {
  campoOsSolicitanteArquivo.addEventListener("change", () => {
    const arquivo = campoOsSolicitanteArquivo.files?.[0];

    if (arquivo) {
      atualizarResumoArquivoSolicitante({ nomeOriginal: arquivo.name });
      return;
    }

    atualizarResumoArquivoSolicitante(arquivoSolicitanteAtual);
  });
}

configurarRolagemHorizontalDashboard();
configurarTogglePainelLateral();
configurarAbasPainel();
configurarSeletorAno();
configurarRascunhoFormularioOS();

async function iniciarSistema() {
  await carregarUsuarioLogado();
  await Promise.all([carregarSolicitantes(), carregarOS()]);
  iniciarNotificacoesTempoReal();
  window.iniciarEfeitoCopaBrasil?.();
}

window.onclick = function (event) {
  if (event.target === modal) {
    fecharModal();
  }

  if (event.target === modalStatus) {
    fecharModalStatus();
  }

  if (event.target === modalExclusao) {
    fecharModalExclusao();
  }

  if (event.target === modalPlanilha) {
    fecharModalPlanilhaPersonalizada();
  }

  if (event.target === modalImportacaoDashboard) {
    fecharModalImportacaoDashboard();
  }

  if (event.target === modalAcoesEmMassaOS) {
    fecharModalAcoesEmMassaOS();
  }

  if (event.target === document.getElementById("modalLixeiraOS")) {
    fecharLixeiraOS();
  }
};

document.getElementById("observacaoAcoesEmMassaOS")?.addEventListener("input", atualizarContadorObservacaoAcoesEmMassaOS);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && modalAcoesEmMassaOS?.style.display === "flex") {
    fecharModalAcoesEmMassaOS();
  }
});

iniciarSistema();
