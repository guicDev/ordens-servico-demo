const usuarioLogadoNome = document.getElementById("usuarioLogadoNome");
const listaPrecificacoesEl = document.getElementById("listaPrecificacoes");
const listaPrecificacoesPendentesEl = document.getElementById("listaPrecificacoesPendentes");
const listaPrecificacoesConcluidasEl = document.getElementById("listaPrecificacoesConcluidas");
const modalFinanceiro = document.getElementById("modalFinanceiro");
const modalPlanilhaFinanceira = document.getElementById("modalPlanilhaFinanceira");
const modalImportacaoPrecificacao = document.getElementById("modalImportacaoPrecificacao");
const itensFinanceirosEl = document.getElementById("itensFinanceiros");
const historicoFinanceiroEl = document.getElementById("historicoFinanceiro");
const campoAnoFiltroFinanceiro = document.getElementById("anoFiltroFinanceiro");

let listaPrecificacoesOriginal = [];
let listaPrecificacoesFiltrada = [];
let precificacoesPendentes = [];
let precificacoesConcluidas = [];
let precificacaoSelecionada = null;
let listaSolicitantesFinanceiro = [];
let arquivoImportacaoPrecificacaoAtual = null;
let analiseImportacaoPrecificacaoAtual = null;
let canalTempoRealFinanceiro = null;
let sincronizacaoFinanceiroPendente = null;
let sincronizacaoFinanceiroAdiada = false;
let usuarioLogadoFinanceiro = null;
const timersPrecificacaoAutomatica = new Map();
let ordenacaoFinanceiraOS = {
  pendentes: "asc",
  precificadas: "asc",
};

const ANO_FILTRO_STORAGE_KEY = "demonstracao.os.ui.ano";
const USUARIOS_IMPORTACAO_PLANILHA_AUTORIZADOS = new Set(["admin", "administrador"]);
const MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA = "Você não está autorizado a importar planilhas.";

function obterNomeExibicaoUsuario(dados) {
  const usuario = dados?.usuario && typeof dados.usuario === "object" ? dados.usuario : dados;
  return usuario?.nome || usuario?.usuario || "-";
}

function obterUsuarioSessaoFinanceiro(dados) {
  return dados?.usuario && typeof dados.usuario === "object" ? dados.usuario : dados;
}

function normalizarIdentificadorUsuario(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function usuarioPodeImportarPlanilha() {
  if (usuarioLogadoFinanceiro?.permissoes?.importacaoPlanilha === true) return true;
  const identificadores = [
    usuarioLogadoFinanceiro?.usuario,
    usuarioLogadoFinanceiro?.nome,
  ].map(normalizarIdentificadorUsuario);

  return identificadores.some((identificador) =>
    USUARIOS_IMPORTACAO_PLANILHA_AUTORIZADOS.has(identificador)
  );
}

function obterAnoAtualSistema() {
  return String(new Date().getFullYear());
}

function normalizarAnoSelecionado(valor) {
  const texto = String(valor || "").trim();
  return /^\d{4}$/.test(texto) ? texto : obterAnoAtualSistema();
}

function obterAnoFinanceiroSelecionado() {
  return normalizarAnoSelecionado(
    campoAnoFiltroFinanceiro?.value || localStorage.getItem(ANO_FILTRO_STORAGE_KEY)
  );
}

function configurarSeletorAnoFinanceiro() {
  if (!campoAnoFiltroFinanceiro) return;
  const anoAtual = Number(obterAnoAtualSistema());
  const anoInicial = 2026;
  const anoFinal = Math.max(anoAtual + 1, anoInicial);
  const selecionado = normalizarAnoSelecionado(localStorage.getItem(ANO_FILTRO_STORAGE_KEY));

  campoAnoFiltroFinanceiro.innerHTML = "";
  for (let ano = anoInicial; ano <= anoFinal; ano += 1) {
    const option = document.createElement("option");
    option.value = String(ano);
    option.textContent = String(ano);
    campoAnoFiltroFinanceiro.appendChild(option);
  }
  campoAnoFiltroFinanceiro.value = selecionado;
  if (!campoAnoFiltroFinanceiro.value) campoAnoFiltroFinanceiro.value = obterAnoAtualSistema();
}

async function alterarAnoFinanceiro() {
  localStorage.setItem(ANO_FILTRO_STORAGE_KEY, obterAnoFinanceiroSelecionado());
  await carregarPrecificacoes();
}

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

function avisarImportacaoPlanilhaNaoAutorizada(statusId) {
  if (statusId) atualizarStatusModal(statusId, MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA, "erro");
  mostrarAvisoInterface(MENSAGEM_IMPORTACAO_PLANILHA_NAO_AUTORIZADA, "erro");
}

function numeroFinanceiro(valor) {
  const numero = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : 0;
}

function obterValorFinalSeguro(item) {
  return numeroFinanceiro(item?.valorFinal);
}

function precificacaoEhDoacao(item) {
  return item?.doacao === true || item?.tipoPrecificacao === "doacao" || item?.situacaoPrecificacao === "doacao";
}

function formatarValorPrecificacao(valor, doacao = false) {
  return doacao ? `Doa\u00e7\u00e3o (${formatarMoeda(0)})` : formatarMoeda(valor);
}

function modalFinanceiroMarcadoComoDoacao() {
  return document.getElementById("campoDoacaoFinanceiro")?.checked === true;
}

function separarPrecificacoes(lista) {
  const pendentes = [];
  const concluidas = [];

  (Array.isArray(lista) ? lista : []).forEach((item) => {
    if (obterValorFinalSeguro(item) > 0 || precificacaoEhDoacao(item)) {
      concluidas.push(item);
    } else {
      pendentes.push(item);
    }
  });

  return { pendentes, concluidas };
}

function compararNumeroOSFinanceira(a, b, direcao = "asc") {
  const numeroA = String(a?.numeroOS || "");
  const numeroB = String(b?.numeroOS || "");
  const resultado = numeroA.localeCompare(numeroB, "pt-BR", { numeric: true, sensitivity: "base" });
  return direcao === "desc" ? -resultado : resultado;
}

function ordenarPrecificacoesPorOS(lista, chave) {
  const direcao = ordenacaoFinanceiraOS[chave] || "asc";
  return [...(Array.isArray(lista) ? lista : [])].sort((a, b) => compararNumeroOSFinanceira(a, b, direcao));
}

function atualizarBotoesOrdenacaoFinanceira() {
  const pendentes = document.getElementById("ordenarPendentesOS");
  const precificadas = document.getElementById("ordenarPrecificadasOS");
  if (pendentes) {
    pendentes.textContent = ordenacaoFinanceiraOS.pendentes === "asc" ? "OS ↑" : "OS ↓";
    pendentes.setAttribute("aria-label", `Ordenar pendentes por OS ${ordenacaoFinanceiraOS.pendentes === "asc" ? "decrescente" : "crescente"}`);
  }
  if (precificadas) {
    precificadas.textContent = ordenacaoFinanceiraOS.precificadas === "asc" ? "OS ↑" : "OS ↓";
    precificadas.setAttribute("aria-label", `Ordenar precificadas por OS ${ordenacaoFinanceiraOS.precificadas === "asc" ? "decrescente" : "crescente"}`);
  }
}

function alternarOrdenacaoFinanceira(chave) {
  if (!["pendentes", "precificadas"].includes(chave)) return;
  ordenacaoFinanceiraOS[chave] = ordenacaoFinanceiraOS[chave] === "asc" ? "desc" : "asc";
  renderizarPrecificacoes();
}

function formatarMoeda(valor) {
  return numeroFinanceiro(valor).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatarDataCurta(dataISO) {
  if (!dataISO) return "-";
  const partes = String(dataISO).split("-");
  if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
  const data = new Date(dataISO);
  if (isNaN(data.getTime())) return dataISO;
  return data.toLocaleDateString("pt-BR");
}

function formatarDataHora(iso) {
  if (!iso) return "-";
  const data = new Date(iso);
  if (isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR");
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

const ALIASES_CLIENTES_TOTAIS = [
  { nome: "CLIENTE HORIZONTE", aliases: ["HORIZONTE", "CLIENTE HORIZONTE"] },
  { nome: "CLIENTE AURORA", aliases: ["AURORA", "CLIENTE AURORA"] },
  { nome: "CLIENTE PRISMA", aliases: ["PRISMA", "CLIENTE PRISMA"] }
];

const GRUPOS_CLIENTES_TOTAIS = {
  politicos: { nome: "Grupo A (fictício)", clientes: ["Cliente Horizonte", "Cliente Aurora"] },
  secretarias: { nome: "Grupo B (fictício)", clientes: ["Cliente Prisma", "Cliente Jardim"] }
};

function normalizarClienteTotaisBase(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[\\|]+/g, "/")
    .replace(/\s*[/–—-]\s*/g, "/")
    .replace(/[^A-Z0-9/ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function obterChaveClienteTotais(valor) {
  const texto = normalizarClienteTotaisBase(valor);
  if (!texto) return "";
  const textoComparavel = texto.replace(/\//g, " ").replace(/\s+/g, " ").trim();

  for (const grupo of ALIASES_CLIENTES_TOTAIS) {
    const nome = normalizarClienteTotaisBase(grupo.nome);
    const aliases = (Array.isArray(grupo.aliases) ? grupo.aliases : []).map(normalizarClienteTotaisBase);
    if ([nome, ...aliases].some((alias) => {
      const aliasComparavel = alias.replace(/\//g, " ").replace(/\s+/g, " ").trim();
      return aliasComparavel && (textoComparavel === aliasComparavel || textoComparavel.startsWith(`${aliasComparavel} `));
    })) {
      return nome;
    }
  }

  return texto.split("/")[0].trim();
}

function obterNomeClienteTotais(valor) {
  return obterChaveClienteTotais(valor);
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

function traduzirStatusFinanceiro(status) {
  const mapa = {
    pendente: "Pendente",
    autorizado: "Autorizado",
    em_execucao: "Em execução",
    executado: "Executado",
    recusado: "Recusado",
  };
  return mapa[status] || status || "-";
}

function obterArquivoSolicitanteFinanceiro(item) {
  return item?.osSolicitanteArquivo || item?.arquivoSolicitante || null;
}

function criarLinhaDadosOS(rotulo, valor, classe = "") {
  const conteudo = valor === undefined || valor === null || valor === "" ? "-" : valor;
  return `
    <p class="${classe}">
      <strong>${escaparHtml(rotulo)}:</strong>
      <span>${escaparHtml(conteudo)}</span>
    </p>
  `;
}

function criarLinhaArquivoOS(item) {
  const arquivo = obterArquivoSolicitanteFinanceiro(item);
  if (!arquivo?.url) {
    return criarLinhaDadosOS("OS do solicitante", "-");
  }

  return `
    <p>
      <strong>OS do solicitante:</strong>
      <a href="${escaparHtml(arquivo.url)}" target="_blank" rel="noopener">
        ${escaparHtml(arquivo.nomeOriginal || "Abrir arquivo")}
      </a>
    </p>
  `;
}

function normalizarDataFiltro(valor) {
  const texto = String(valor || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(texto) ? texto : "";
}

function precificacaoDentroDoPeriodo(item, dataInicial, dataFinal) {
  const inicioFiltro = normalizarDataFiltro(dataInicial);
  const fimFiltro = normalizarDataFiltro(dataFinal);

  if (!inicioFiltro && !fimFiltro) return true;

  const inicioEvento = normalizarDataFiltro(item?.dataEvento);
  const fimEvento = normalizarDataFiltro(item?.dataFimEvento) || inicioEvento;

  if (!inicioEvento && !fimEvento) return false;

  const inicioComparacao = inicioEvento || fimEvento;
  const fimComparacao = fimEvento || inicioEvento;

  if (inicioFiltro && fimComparacao < inicioFiltro) return false;
  if (fimFiltro && inicioComparacao > fimFiltro) return false;

  return true;
}

async function verificarSessaoFinanceiro() {
  const resposta = await fetch("/api/me");
  if (!resposta.ok) {
    if (!mostrarCarregando) {
      mostrarAvisoInterface("Erro ao atualizar precificaÃ§Ãµes.", "erro");
      return;
    }
    window.location.href = "/login.html";
    return;
  }

  const usuario = await resposta.json();
  usuarioLogadoFinanceiro = obterUsuarioSessaoFinanceiro(usuario);
  usuarioLogadoNome.textContent = obterNomeExibicaoUsuario(usuario);
}

async function logoutFinanceiro() {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "/login.html";
}

function localizarCardPrecificacao(id) {
  const identificador = String(id || "");
  if (!identificador) return null;
  return Array.from(document.querySelectorAll("[data-precificacao-id]"))
    .find((card) => card.dataset.precificacaoId === identificador) || null;
}

function capturarAncoraVisualPrecificacao(id) {
  const cardAtual = localizarCardPrecificacao(id);
  if (!cardAtual) return null;
  const cardAncora = cardAtual.nextElementSibling || cardAtual.previousElementSibling || cardAtual;
  return {
    id: cardAncora.dataset.precificacaoId || id,
    topo: cardAncora.getBoundingClientRect().top,
  };
}

function capturarAncoraViewportPrecificacao() {
  const cards = Array.from(document.querySelectorAll("[data-precificacao-id]"));
  const cardAncora = cards.find((card) => card.getBoundingClientRect().bottom > 120) || cards[0];
  if (!cardAncora) return null;
  return {
    id: cardAncora.dataset.precificacaoId,
    topo: cardAncora.getBoundingClientRect().top,
  };
}

function restaurarAncoraVisualPrecificacao(ancora) {
  if (!ancora?.id || !Number.isFinite(Number(ancora.topo))) return;
  const card = localizarCardPrecificacao(ancora.id);
  if (!card) return;
  const deslocamento = card.getBoundingClientRect().top - Number(ancora.topo);
  if (Math.abs(deslocamento) < 1) return;
  window.scrollBy({ top: deslocamento, left: 0, behavior: "instant" });
}

async function carregarPrecificacoes({ ancoraVisual = null, mostrarCarregando = true } = {}) {
  if (mostrarCarregando) {
  if (listaPrecificacoesPendentesEl) {
    listaPrecificacoesPendentesEl.innerHTML = '<div class="financeiro-vazio">Carregando...</div>';
  }
  if (listaPrecificacoesConcluidasEl) {
    listaPrecificacoesConcluidasEl.innerHTML = '<div class="financeiro-vazio">Carregando...</div>';
  }
  if (listaPrecificacoesEl) {
    listaPrecificacoesEl.innerHTML = '<tr><td colspan="10" class="financeiro-vazio">Carregando...</td></tr>';
  }
  }
  const resposta = await fetch(`/api/financeiro/precificacoes?ano=${encodeURIComponent(obterAnoFinanceiroSelecionado())}`);
  if (!resposta.ok) {
    const mensagem = '<div class="financeiro-vazio">Erro ao carregar precificações.</div>';
    if (listaPrecificacoesPendentesEl) listaPrecificacoesPendentesEl.innerHTML = mensagem;
    if (listaPrecificacoesConcluidasEl) listaPrecificacoesConcluidasEl.innerHTML = mensagem;
    if (listaPrecificacoesEl) {
      listaPrecificacoesEl.innerHTML = '<tr><td colspan="10" class="financeiro-vazio">Erro ao carregar precificações.</td></tr>';
    }
    return;
  }

  const dados = await resposta.json();
  listaPrecificacoesOriginal = Array.isArray(dados.itens) ? dados.itens : [];
  filtrarPrecificacoes();
  if (ancoraVisual) {
    requestAnimationFrame(() => restaurarAncoraVisualPrecificacao(ancoraVisual));
  }
}

function modalFinanceiroEstaAberto() {
  return Boolean(
    precificacaoSelecionada
    && modalFinanceiro
    && getComputedStyle(modalFinanceiro).display !== "none"
  );
}

function sincronizarFinanceiroTempoReal() {
  if (modalFinanceiroEstaAberto()) {
    sincronizacaoFinanceiroAdiada = true;
    return Promise.resolve(null);
  }
  if (sincronizacaoFinanceiroPendente) return sincronizacaoFinanceiroPendente;
  const ancoraVisual = capturarAncoraViewportPrecificacao();
  sincronizacaoFinanceiroPendente = carregarPrecificacoes({
    ancoraVisual,
    mostrarCarregando: false,
  }).finally(() => {
    sincronizacaoFinanceiroPendente = null;
  });
  return sincronizacaoFinanceiroPendente;
}

function iniciarTempoRealFinanceiro() {
  if (!("EventSource" in window) || canalTempoRealFinanceiro) return;
  canalTempoRealFinanceiro = new EventSource("/api/notificacoes/stream");
  [
    "financeiro_atualizado",
    "os_criada",
    "os_atualizada",
    "os_status_alterado",
    "os_excluida",
    "os_sincronizar",
  ].forEach((evento) => {
    canalTempoRealFinanceiro.addEventListener(evento, sincronizarFinanceiroTempoReal);
  });
  canalTempoRealFinanceiro.addEventListener("error", () => {
    if (canalTempoRealFinanceiro?.readyState === EventSource.CLOSED) {
      canalTempoRealFinanceiro = null;
    }
  });
}

function obterTextoBuscaFinanceira(item, campoBusca) {
  if (campoBusca === "numeroOS") return item.numeroOS || "";
  if (campoBusca === "nomeEvento") return item.nomeEvento || "";
  if (campoBusca === "cliente") return item.cliente || "";
  if (campoBusca === "localEvento") return item.localEvento || "";
  return [item.numeroOS, item.nomeEvento, item.cliente, item.localEvento].join(" ");
}

function filtrarPrecificacoes() {
  const busca = document.getElementById("buscaFinanceira").value.trim();
  const campoBusca = document.getElementById("campoBuscaFinanceira")?.value || "todos";
  const dataInicial = document.getElementById("dataInicialFinanceiro").value;
  const dataFinal = document.getElementById("dataFinalFinanceiro").value;

  listaPrecificacoesFiltrada = listaPrecificacoesOriginal.filter((item) => {
    if (busca) {
      const alvo = obterTextoBuscaFinanceira(item, campoBusca);
      if (!termoBuscaCombinaFlexivel(alvo, busca)) return false;
    }
    if (!precificacaoDentroDoPeriodo(item, dataInicial, dataFinal)) return false;
    return true;
  });

  renderizarPrecificacoes();
}

function limparFiltrosFinanceiros() {
  document.getElementById("buscaFinanceira").value = "";
  const campoBuscaFinanceira = document.getElementById("campoBuscaFinanceira");
  document.getElementById("dataInicialFinanceiro").value = "";
  document.getElementById("dataFinalFinanceiro").value = "";
  if (campoBuscaFinanceira) campoBuscaFinanceira.value = "todos";
  filtrarPrecificacoes();
}

function renderizarResumoFinanceiro() {
  const lista = listaPrecificacoesFiltrada;
  document.getElementById("totalOSFinanceiras").textContent = lista.length;
  document.getElementById("valorTotalFinal").textContent = formatarMoeda(
    lista.reduce((total, item) => total + obterValorFinalSeguro(item), 0)
  );
  document.getElementById("aguardandoPrecificacao").textContent = precificacoesPendentes.length;
  document.getElementById("totalPrecificadas").textContent = precificacoesConcluidas.length;
  const contadorPendentes = document.getElementById("contadorPendentesPrecificacao");
  const contadorConcluidas = document.getElementById("contadorPrecificadas");
  if (contadorPendentes) contadorPendentes.textContent = precificacoesPendentes.length;
  if (contadorConcluidas) contadorConcluidas.textContent = precificacoesConcluidas.length;
}

function renderizarPrecificacoes() {
  const grupos = separarPrecificacoes(listaPrecificacoesFiltrada);
  precificacoesPendentes = ordenarPrecificacoesPorOS(grupos.pendentes, "pendentes");
  precificacoesConcluidas = ordenarPrecificacoesPorOS(grupos.concluidas, "precificadas");
  atualizarBotoesOrdenacaoFinanceira();
  renderizarResumoFinanceiro();
  renderizarGrupoPrecificacoes(listaPrecificacoesPendentesEl, precificacoesPendentes, "Nenhuma OS pendente de precificação.");
  renderizarGrupoPrecificacoes(listaPrecificacoesConcluidasEl, precificacoesConcluidas, "Nenhuma OS já precificada.");
}

function renderizarGrupoPrecificacoes(container, lista, mensagemVazia) {
  if (!container) return;

  if (!lista.length) {
    container.innerHTML = `<div class="financeiro-vazio">${mensagemVazia}</div>`;
    return;
  }

  container.innerHTML = lista.map((item) => criarCardPrecificacao(item)).join("");
}

function criarCardPrecificacao(item) {
  const valorFinal = obterValorFinalSeguro(item);
  const doacao = precificacaoEhDoacao(item);
  const situacaoPrecificacao = doacao ? "Doa\u00e7\u00e3o" : (valorFinal > 0 ? "J\u00e1 precificada" : "Pendente");
  const classeStatus = doacao ? "financeiro-card-doacao" : (valorFinal <= 0 ? "financeiro-card-pendente" : "financeiro-card-concluido");
  const classeTag = doacao ? "tag-financeira tag-financeira-doacao" : "tag-financeira";
  return `
    <article class="financeiro-card-os ${classeStatus}" data-precificacao-id="${escaparHtml(item.id)}">
      <div class="financeiro-card-topo">
        <span class="financeiro-os-numero">OS ${escaparHtml(item.numeroOS || "-")}</span>
        <span class="${classeTag}">${situacaoPrecificacao}</span>
      </div>
      <h3>${escaparHtml(item.nomeEvento || "-")}</h3>
      <div class="financeiro-card-info">
        <span><strong>Cliente:</strong> ${escaparHtml(item.cliente || "-")}</span>
        <span><strong>Local:</strong> ${escaparHtml(item.localEvento || "-")}</span>
        <span><strong>Data:</strong> ${formatarDataCurta(item.dataEvento)}</span>
      </div>
      <div class="financeiro-card-rodape">
        <strong>${formatarValorPrecificacao(valorFinal, doacao)}</strong>
        <button class="btn-detalhe btn-primario" onclick="abrirPrecificacao('${escaparHtml(item.id)}')">Abrir</button>
      </div>
    </article>
  `;
}
async function abrirPrecificacao(id) {
  const resposta = await fetch(`/api/financeiro/precificacoes/${encodeURIComponent(id)}`);
  if (!resposta.ok) {
    mostrarAvisoInterface("Erro ao abrir a precificação.", "erro");
    return;
  }

  precificacaoSelecionada = await resposta.json();
  preencherModalFinanceiro();
  modalFinanceiro.style.display = "flex";
}

function preencherModalFinanceiro() {
  const item = precificacaoSelecionada;
  document.getElementById("tituloModalFinanceiro").textContent = `Precificação da OS ${item.numeroOS || "-"}`;
  document.getElementById("dadosOSFinanceiro").innerHTML = `
    ${criarLinhaDadosOS("Número da OS", item.numeroOS)}
    ${criarLinhaDadosOS("Evento", item.nomeEvento)}
    ${criarLinhaDadosOS("Solicitante", item.cliente)}
    ${criarLinhaDadosOS("Responsável do evento", item.responsavelEvento)}
    ${criarLinhaDadosOS("Local", item.localEvento)}
    ${criarLinhaDadosOS("Data inicial", formatarDataCurta(item.dataEvento))}
    ${criarLinhaDadosOS("Data final", formatarDataCurta(item.dataFimEvento))}
    ${criarLinhaDadosOS("Horário de início", item.horarioInicioEvento)}
    ${criarLinhaDadosOS("Quantidade de diárias", String(item.quantidadeDiarias ?? 0))}
    ${criarLinhaArquivoOS(item)}
    ${criarLinhaDadosOS("Status operacional", traduzirStatusFinanceiro(item.statusOperacional))}
    ${criarLinhaDadosOS("Responsável pela execução", item.responsavelExecucao)}
    ${criarLinhaDadosOS("Orçamento", item.orcamento)}
    ${criarLinhaDadosOS("Observações", item.observacoes, "financeiro-dado-longo")}
    ${criarLinhaDadosOS("Obs. aprovação", item.observacaoAprovacao, "financeiro-dado-longo")}
  `;
  renderizarResumoPrecificacaoPadrao();
  document.getElementById("campoObservacoesFinanceiras").value = item.observacoesFinanceiras || "";
  const campoDoacao = document.getElementById("campoDoacaoFinanceiro");
  if (campoDoacao) campoDoacao.checked = precificacaoEhDoacao(item);
  renderizarItensFinanceiros();
  renderizarHistoricoFinanceiro();
  recalcularFinanceiro();
}

function renderizarResumoPrecificacaoPadrao() {
  const resumo = document.getElementById("resumoPrecificacaoPadrao");
  if (!resumo) return;

  const regra = precificacaoSelecionada?.precificacaoPadrao;
  if (!regra?.aplicavel) {
    resumo.textContent = "";
    resumo.classList.add("hidden");
    resumo.classList.remove("sucesso", "aviso");
    return;
  }

  const itensPendentes = Array.isArray(regra.naoReconhecidos)
    ? regra.naoReconhecidos.map((item) => item.descricao || item).filter(Boolean)
    : [];
  const percentual = regra.percentualTexto || `${Number(regra.percentual || 0) * 100}%`;

  if (regra.aplicadaAutomaticamente) {
    resumo.textContent = `Tabela padrão aplicada: ${regra.clienteTabela || precificacaoSelecionada.cliente}, cobrança de ${percentual}.`;
    resumo.classList.add("sucesso");
    resumo.classList.remove("aviso");
  } else if (regra.completo) {
    resumo.textContent = `Tabela padrão disponível: ${regra.clienteTabela || precificacaoSelecionada.cliente}, cobrança de ${percentual}. Os valores atuais foram preservados.`;
    resumo.classList.add("sucesso");
    resumo.classList.remove("aviso");
  } else {
    resumo.textContent = `Tabela padrão encontrada (${percentual}), mas a precificação automática não foi aplicada. Itens para revisão: ${itensPendentes.join(", ") || regra.motivo || "material não reconhecido"}.`;
    resumo.classList.add("aviso");
    resumo.classList.remove("sucesso");
  }
  resumo.classList.remove("hidden");
}

function renderizarItensFinanceiros() {
  const itens = Array.isArray(precificacaoSelecionada?.itens) ? precificacaoSelecionada.itens : [];
  const diariasPadrao = Math.max(1, parseInt(precificacaoSelecionada?.quantidadeDiarias || 1, 10) || 1);
  if (!itens.length) {
    itensFinanceirosEl.innerHTML = '<div class="financeiro-vazio">Nenhum item financeiro cadastrado.</div>';
    return;
  }

  itensFinanceirosEl.innerHTML = itens.map((item, index) => `
    <div class="item-financeiro" data-index="${index}">
      <label class="item-campo item-descricao-campo">
        <span>Descrição</span>
        <input type="text" class="item-descricao" value="${escaparHtml(item.descricao)}" placeholder="Descrição" oninput="agendarPrecificacaoAutomatica(${index})" onpaste="agendarPrecificacaoAutomaticaAposColar(${index})">
      </label>
      <label class="item-campo item-unidade-campo">
        <span>Unid.</span>
        <input type="number" min="0" step="1" inputmode="numeric" class="item-unidade" value="${parseInt(item.quantidade, 10) || 0}" oninput="this.value = this.value.replace(/[^0-9]/g, ''); recalcularFinanceiro(); agendarPrecificacaoAutomatica(${index});">
      </label>
      <label class="item-campo item-diarias-campo">
        <span>Diárias</span>
        <input type="number" min="1" step="1" inputmode="numeric" class="item-diarias" value="${parseInt(item.diarias || diariasPadrao, 10) || diariasPadrao}" oninput="this.value = this.value.replace(/[^0-9]/g, ''); recalcularFinanceiro(); agendarPrecificacaoAutomatica(${index});">
      </label>
      <label class="item-campo item-valor-campo">
        <span>Valor unitário</span>
        <input type="text" inputmode="decimal" class="item-valor" value="${numeroFinanceiro(item.valorUnitario)}" data-preco-automatico="${item.precoAutomatico ? "true" : "false"}" oninput="this.dataset.valorManual = 'true'; this.dataset.precoAutomatico = 'false'; this.value = this.value.replace(/[^0-9,.]/g, ''); recalcularFinanceiro();">
      </label>
      <div class="item-subtotal-campo">
        <span>Subtotal</span>
        <strong class="item-subtotal">${formatarMoeda(item.subtotal)}</strong>
      </div>
      <button class="btn-remover-item" onclick="removerItemFinanceiro(${index})">Remover</button>
    </div>
  `).join("");
}

function agendarPrecificacaoAutomatica(index) {
  clearTimeout(timersPrecificacaoAutomatica.get(index));
  timersPrecificacaoAutomatica.set(index, setTimeout(() => {
    timersPrecificacaoAutomatica.delete(index);
    preencherPrecoAutomaticoItem(index);
  }, 450));
}

function agendarPrecificacaoAutomaticaAposColar(index) {
  setTimeout(() => agendarPrecificacaoAutomatica(index), 0);
}

async function preencherPrecoAutomaticoItem(index) {
  if (!precificacaoSelecionada?.id) return;
  if (modalFinanceiroMarcadoComoDoacao()) return;
  const linha = document.querySelector(`.item-financeiro[data-index="${index}"]`);
  if (!linha) return;

  const descricao = linha.querySelector(".item-descricao")?.value.trim() || "";
  const quantidade = parseInt(linha.querySelector(".item-unidade")?.value, 10) || 0;
  const diarias = parseInt(linha.querySelector(".item-diarias")?.value, 10) || 1;
  const valorInput = linha.querySelector(".item-valor");
  const valorAtual = numeroFinanceiro(valorInput?.value);
  const podePreencher = valorAtual === 0 || valorInput?.dataset.precoAutomatico === "true";
  if (!descricao || quantidade <= 0 || !valorInput || !podePreencher) return;

  const requisicao = `${Date.now()}-${Math.random()}`;
  linha.dataset.requisicaoPreco = requisicao;
  const resposta = await fetch(
    `/api/financeiro/precificacoes/${encodeURIComponent(precificacaoSelecionada.id)}/calcular-item`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ descricao, quantidade, diarias }),
    }
  ).catch(() => null);
  if (!resposta?.ok || linha.dataset.requisicaoPreco !== requisicao) return;

  const dados = await resposta.json();
  if (!dados?.item || linha.dataset.requisicaoPreco !== requisicao) return;
  valorInput.value = numeroFinanceiro(dados.item.valorUnitario);
  valorInput.dataset.precoAutomatico = "true";
  valorInput.dataset.valorManual = "false";
  valorInput.title = `Preço automático: ${dados.percentualTexto || ""} da tabela padrão`;
  recalcularFinanceiro();
  atualizarStatusModal(
    "statusModalFinanceiro",
    `Preço automático aplicado em ${dados.item.descricao}: ${formatarMoeda(dados.item.valorUnitario)}.`,
    "sucesso"
  );
}

function coletarItensFinanceiros() {
  return Array.from(document.querySelectorAll(".item-financeiro")).map((linha, index) => {
    const existente = precificacaoSelecionada.itens[index] || {};
    const valorUnitario = numeroFinanceiro(linha.querySelector(".item-valor").value);
    const unidade = parseInt(linha.querySelector(".item-unidade").value, 10);
    const diariasInput = parseInt(linha.querySelector(".item-diarias")?.value, 10);
    const quantidade = Number.isInteger(unidade) && unidade >= 0 ? unidade : 0;
    const diarias = Number.isInteger(diariasInput) && diariasInput > 0 ? diariasInput : 1;
    return {
      id: existente.id,
      descricao: linha.querySelector(".item-descricao").value.trim(),
      quantidade,
      diarias,
      unidade: Number.isInteger(unidade) && unidade >= 0 ? String(unidade) : "0",
      valorUnitario,
      subtotal: quantidade * valorUnitario * diarias,
      precoAutomatico: linha.querySelector(".item-valor")?.dataset.precoAutomatico === "true",
      observacoes: existente.observacoes || "",
      ordem: index,
    };
  });
}

function adicionarItemFinanceiro() {
  if (!precificacaoSelecionada) return;
  if (!Array.isArray(precificacaoSelecionada.itens)) precificacaoSelecionada.itens = [];
  precificacaoSelecionada.itens = coletarItensFinanceiros();
  precificacaoSelecionada.itens.push({
    descricao: "",
    quantidade: 0,
    diarias: Math.max(1, parseInt(precificacaoSelecionada?.quantidadeDiarias || 1, 10) || 1),
    unidade: "",
    valorUnitario: 0,
    subtotal: 0,
    observacoes: "",
    ordem: precificacaoSelecionada.itens.length,
  });
  renderizarItensFinanceiros();
  recalcularFinanceiro();
  const novoIndex = precificacaoSelecionada.itens.length - 1;
  document.querySelector(`.item-financeiro[data-index="${novoIndex}"] .item-descricao`)?.focus();
}

function removerItemFinanceiro(index) {
  precificacaoSelecionada.itens = coletarItensFinanceiros().filter((_, itemIndex) => itemIndex !== index);
  renderizarItensFinanceiros();
  recalcularFinanceiro();
}

function recalcularFinanceiro() {
  const itens = coletarItensFinanceiros();
  const totalItens = itens.reduce((total, item) => total + numeroFinanceiro(item.subtotal), 0);
  const doacao = modalFinanceiroMarcadoComoDoacao();

  document.querySelectorAll(".item-financeiro").forEach((linha, index) => {
    const subtotalEl = linha.querySelector(".item-subtotal");
    if (subtotalEl) subtotalEl.textContent = formatarMoeda(itens[index]?.subtotal || 0);
  });
  const totalItensEl = document.getElementById("totalItensFinanceiro");
  const valorFinalEl = document.getElementById("valorFinalFinanceiro");
  const ajudaDoacaoEl = document.getElementById("ajudaDoacaoFinanceiro");
  if (totalItensEl) totalItensEl.textContent = formatarMoeda(totalItens);
  if (valorFinalEl) {
    valorFinalEl.textContent = formatarValorPrecificacao(totalItens, doacao);
    valorFinalEl.classList.toggle("valor-doacao", doacao);
  }
  if (ajudaDoacaoEl) ajudaDoacaoEl.classList.toggle("hidden", !doacao);
}

function alternarDoacaoFinanceira() {
  document.querySelectorAll(".item-valor").forEach((input) => {
    if (modalFinanceiroMarcadoComoDoacao()) {
      input.dataset.valorManual = "true";
      input.dataset.precoAutomatico = "false";
    }
  });
  recalcularFinanceiro();
}

function renderizarHistoricoFinanceiro() {
  const historico = Array.isArray(precificacaoSelecionada?.historico) ? precificacaoSelecionada.historico : [];
  if (!historico.length) {
    historicoFinanceiroEl.innerHTML = '<div class="historico-item">Nenhuma alteração financeira registrada.</div>';
    return;
  }

  historicoFinanceiroEl.innerHTML = historico.map((item) => `
    <div class="historico-item">
      <strong>${escaparHtml(item.acao || "Alteração financeira")}</strong>
      <span>${escaparHtml(item.detalhe || "")}</span>
      <small>${escaparHtml(item.responsavel || "-")} - ${formatarDataHora(item.data)}</small>
    </div>
  `).join("");
}

async function salvarPrecificacao() {
  if (!precificacaoSelecionada) return;
  const ancoraVisual = capturarAncoraVisualPrecificacao(precificacaoSelecionada.id);
  atualizarStatusModal("statusModalFinanceiro", "Salvando precificação...", "aviso");
  const itens = coletarItensFinanceiros();
  const valorFinal = itens.reduce((total, item) => total + numeroFinanceiro(item.subtotal), 0);
  const doacao = modalFinanceiroMarcadoComoDoacao();
  if (doacao && valorFinal > 0 && !confirm("Esta OS está marcada como doação, mas possui valor maior que zero. Deseja salvar como doação mesmo assim?")) return;
  const payload = {
    observacoesFinanceiras: document.getElementById("campoObservacoesFinanceiras").value,
    tipoPrecificacao: doacao ? "doacao" : "normal",
    itens,
  };

  const resposta = await fetch(`/api/financeiro/precificacoes/${encodeURIComponent(precificacaoSelecionada.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const dados = await resposta.json().catch(() => ({}));
  if (!resposta.ok) {
    atualizarStatusModal("statusModalFinanceiro", dados.erro || "Erro ao salvar a precificação.", "erro");
    return;
  }

  precificacaoSelecionada = dados;
  preencherModalFinanceiro();
  sincronizacaoFinanceiroAdiada = false;
  await carregarPrecificacoes({ ancoraVisual, mostrarCarregando: false });
  atualizarStatusModal("statusModalFinanceiro", "Precificação salva.", "sucesso");
  fecharModalFinanceiro();
}

function fecharModalFinanceiro() {
  const deveSincronizarDepois = sincronizacaoFinanceiroAdiada;
  sincronizacaoFinanceiroAdiada = false;
  atualizarStatusModal("statusModalFinanceiro");
  modalFinanceiro.style.display = "none";
  precificacaoSelecionada = null;
  if (deveSincronizarDepois) {
    sincronizarFinanceiroTempoReal();
  }
}

function obterArquivoImportacaoPrecificacao() {
  const input = document.getElementById("arquivoImportacaoPrecificacao");
  return input?.files?.[0] || null;
}

function lerArquivoComoBase64(arquivo) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(arquivo);
  });
}

function montarPayloadArquivoImportacao(arquivo, base64) {
  return {
    nomeOriginal: arquivo.name,
    tamanho: arquivo.size,
    tipo: arquivo.type,
    conteudoBase64: base64,
  };
}

function resetarPreviewImportacaoPrecificacao() {
  analiseImportacaoPrecificacaoAtual = null;
  arquivoImportacaoPrecificacaoAtual = null;
  atualizarStatusModal("statusImportacaoPrecificacao");
  const resultado = document.getElementById("resultadoImportacaoPrecificacao");
  if (resultado) resultado.classList.add("hidden");
  const botao = document.getElementById("btnConfirmarImportacaoPrecificacao");
  if (botao) botao.disabled = true;
}

function abrirModalImportacaoPrecificacao() {
  if (!usuarioPodeImportarPlanilha()) {
    avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoPrecificacao");
    return;
  }

  resetarPreviewImportacaoPrecificacao();
  const input = document.getElementById("arquivoImportacaoPrecificacao");
  if (input) input.value = "";
  if (modalImportacaoPrecificacao) modalImportacaoPrecificacao.style.display = "flex";
}

function fecharModalImportacaoPrecificacao() {
  resetarPreviewImportacaoPrecificacao();
  if (modalImportacaoPrecificacao) modalImportacaoPrecificacao.style.display = "none";
}

function obterTagsImportacaoPrecificacao(item) {
  const tags = [];
  if (Array.isArray(item.erros) && item.erros.length) {
    tags.push({ texto: "Erro", classe: "tag-importacao-incompleta" });
  } else if (item.acao === "atualizar_precificacao") {
    tags.push({ texto: "Atualizar OS", classe: "tag-importacao-existente" });
  } else if (item.acao === "sem_alteracao") {
    tags.push({ texto: "Sem alteração", classe: "tag-importacao-repetida" });
  } else if (item.acao === "criar_item") {
    tags.push({ texto: "Criar item", classe: "tag-importacao-nova" });
  } else if (item.acao === "atualizar_item") {
    tags.push({ texto: "Atualizar item", classe: "tag-importacao-existente" });
  } else if (item.acao === "substituir_placeholder") {
    tags.push({ texto: "Substituir zero", classe: "tag-importacao-existente" });
  } else if (item.acao === "ignorar") {
    tags.push({ texto: "Repetido", classe: "tag-importacao-repetida" });
  }
  if (!tags.length) tags.push({ texto: "OK", classe: "tag-importacao-ok" });
  return tags;
}

function renderizarTagsImportacaoPrecificacao(item) {
  return obterTagsImportacaoPrecificacao(item)
    .map((tag) => `<span class="tag-importacao ${tag.classe}">${escaparHtml(tag.texto)}</span>`)
    .join("");
}

function renderizarPreviewImportacaoPrecificacao(analise) {
  const resumo = analise?.resumo || {};
  document.getElementById("importacaoPrecificacaoOSEncontradas").textContent = resumo.osEncontradas || 0;
  document.getElementById("importacaoPrecificacaoOSNaoEncontradas").textContent = resumo.osNaoEncontradas || 0;
  document.getElementById("importacaoPrecificacaoItensCriados").textContent = resumo.itensCriados || 0;
  document.getElementById("importacaoPrecificacaoItensAtualizados").textContent = resumo.itensAtualizados || 0;
  document.getElementById("importacaoPrecificacaoSubstituicoes").textContent = resumo.placeholdersSubstituidos || 0;
  document.getElementById("importacaoPrecificacaoErros").textContent = resumo.linhasComErro || 0;
  document.getElementById("importacaoPrecificacaoDivergencias").textContent = resumo.osComDivergenciaTotal || 0;
  document.getElementById("importacaoPrecificacaoValorTotal").textContent = formatarMoeda(resumo.valorTotalImportado || 0);

  const alertas = [
    ...(resumo.osAmbiguas ? [`Importação bloqueada: ${resumo.osAmbiguas} número(s) de OS ambíguo(s). Identifique a OS correta antes de importar.`] : []),
    ...(Array.isArray(analise?.avisos) ? analise.avisos.slice(0, 8) : []),
  ];
  const alertasEl = document.getElementById("importacaoPrecificacaoAlertas");
  alertasEl.innerHTML = alertas.length
    ? alertas.map((aviso) => `<p>${escaparHtml(aviso)}</p>`).join("")
    : "<p>Prévia calculada. Confira os itens antes de confirmar.</p>";

  const registros = Array.isArray(analise?.registros) ? analise.registros.slice(0, 80) : [];
  const preview = registros.length
    ? `
      <table>
        <thead>
          <tr>
            <th>OS</th>
            <th>Linhas</th>
            <th>Itens</th>
            <th>Criar</th>
            <th>Atualizar</th>
            <th>Substituir</th>
            <th>Ignorar</th>
            <th>Soma itens</th>
            <th>Total OS</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${registros.map((item) => `
            <tr>
              <td>${escaparHtml(item.numeroOS || "-")}</td>
              <td>${escaparHtml(Array.isArray(item.linhasOrigem) ? item.linhasOrigem.join(", ") : "-")}</td>
              <td>${escaparHtml(item.totalItens || 0)}</td>
              <td>${escaparHtml(item.itensCriados || 0)}</td>
              <td>${escaparHtml(item.itensAtualizados || 0)}</td>
              <td>${escaparHtml(item.placeholdersSubstituidos || 0)}</td>
              <td>${escaparHtml(item.itensIgnorados || 0)}</td>
              <td>${formatarMoeda(item.somaItensPlanilha || 0)}</td>
              <td>${item.divergenciaTotal ? `Divergente (${formatarMoeda(item.valorTotalPlanilha || 0)})` : formatarMoeda(item.valorTotalPlanilha || item.somaItensPlanilha || 0)}</td>
              <td>
                <span class="tags-importacao">${renderizarTagsImportacaoPrecificacao(item)}</span>
                ${item.erros?.length ? `<small>${escaparHtml(item.erros.join(" "))}</small>` : ""}
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `
    : '<p class="texto-planilha-ajuda">Nenhuma OS financeira encontrada na planilha.</p>';

  document.getElementById("importacaoPrecificacaoPreview").innerHTML = preview;
  document.getElementById("resultadoImportacaoPrecificacao").classList.remove("hidden");
  const botao = document.getElementById("btnConfirmarImportacaoPrecificacao");
  if (botao) botao.disabled = Boolean(resumo.osAmbiguas) || !((resumo.itensCriados || 0) + (resumo.itensAtualizados || 0) + (resumo.placeholdersSubstituidos || 0));
}

async function analisarImportacaoPrecificacao() {
  if (!usuarioPodeImportarPlanilha()) {
    avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoPrecificacao");
    return;
  }

  const arquivo = obterArquivoImportacaoPrecificacao();
  if (!arquivo) {
    atualizarStatusModal("statusImportacaoPrecificacao", "Selecione uma planilha Excel para importar.", "erro");
    return;
  }
  if (!/\.xlsx$/i.test(arquivo.name)) {
    atualizarStatusModal("statusImportacaoPrecificacao", "Selecione um arquivo .xlsx.", "erro");
    return;
  }

  try {
    resetarPreviewImportacaoPrecificacao();
    atualizarStatusModal("statusImportacaoPrecificacao", "Analisando planilha de precificação...", "aviso");
    const payloadArquivo = montarPayloadArquivoImportacao(arquivo, await lerArquivoComoBase64(arquivo));
    const resposta = await fetch("/api/financeiro/importacao-precificacao/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivo: payloadArquivo }),
    });
    const resultado = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      atualizarStatusModal("statusImportacaoPrecificacao", resultado.erro || "Erro ao analisar a planilha de precificação.", "erro");
      return;
    }

    arquivoImportacaoPrecificacaoAtual = payloadArquivo;
    analiseImportacaoPrecificacaoAtual = resultado;
    renderizarPreviewImportacaoPrecificacao(resultado);
    const resumo = resultado.resumo || {};
    atualizarStatusModal(
      "statusImportacaoPrecificacao",
      (resumo.osAmbiguas || 0)
        ? `Importação bloqueada: ${resumo.osAmbiguas} número(s) de OS ambíguo(s).`
        : `Análise pronta: ${resumo.itensCriados || 0} itens criados, ${resumo.itensAtualizados || 0} atualizados e ${resumo.linhasComErro || 0} linhas com erro.`,
      (resumo.osAmbiguas || 0) ? "erro" : (resumo.linhasComErro || 0) ? "aviso" : "sucesso"
    );
  } catch {
    atualizarStatusModal("statusImportacaoPrecificacao", "Erro ao analisar a planilha de precificação.", "erro");
  }
}

async function confirmarImportacaoPrecificacao() {
  if (!usuarioPodeImportarPlanilha()) {
    avisarImportacaoPlanilhaNaoAutorizada("statusImportacaoPrecificacao");
    return;
  }

  if (!arquivoImportacaoPrecificacaoAtual || !analiseImportacaoPrecificacaoAtual) {
    atualizarStatusModal("statusImportacaoPrecificacao", "Analise a planilha antes de confirmar.", "erro");
    return;
  }

  const resumo = analiseImportacaoPrecificacaoAtual.resumo || {};
  const totalItens = (resumo.itensCriados || 0) + (resumo.itensAtualizados || 0) + (resumo.placeholdersSubstituidos || 0);
  if (!confirm(`Confirmar importação de ${totalItens} item(ns) financeiros?`)) return;

  const botao = document.getElementById("btnConfirmarImportacaoPrecificacao");
  if (botao) botao.disabled = true;
  atualizarStatusModal("statusImportacaoPrecificacao", "Importando itens financeiros analisados...", "aviso");

  try {
    const resposta = await fetch("/api/financeiro/importacao-precificacao/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ arquivo: arquivoImportacaoPrecificacaoAtual }),
    });
    const resultado = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
      atualizarStatusModal("statusImportacaoPrecificacao", resultado.erro || "Erro ao confirmar a importação de precificação.", "erro");
      if (botao) botao.disabled = false;
      return;
    }

    atualizarStatusModal("statusImportacaoPrecificacao", `Importação concluída. Itens criados: ${resultado.resumo?.itensCriados || 0}. Itens atualizados: ${resultado.resumo?.itensAtualizados || 0}. Substituições: ${resultado.resumo?.placeholdersSubstituidos || 0}.`, "sucesso");
    fecharModalImportacaoPrecificacao();
    await carregarPrecificacoes();
  } catch {
    atualizarStatusModal("statusImportacaoPrecificacao", "Erro ao confirmar a importação de precificação.", "erro");
    if (botao) botao.disabled = false;
  }
}

function obterModoPlanilhaFinanceira() {
  return document.querySelector('input[name="modoPlanilhaFinanceira"]:checked')?.value || "geral";
}

function atualizarModoPlanilhaFinanceira() {
  const modo = obterModoPlanilhaFinanceira();
  const blocos = {
    geral: document.getElementById("blocoPlanilhaFinanceiraGeral"),
    numero_os: document.getElementById("blocoPlanilhaFinanceiraNumero"),
    cliente: document.getElementById("blocoPlanilhaFinanceiraCliente"),
    status: document.getElementById("blocoPlanilhaFinanceiraStatus"),
    especificas: document.getElementById("blocoPlanilhaFinanceiraEspecificas"),
    totais_clientes: document.getElementById("blocoPlanilhaFinanceiraTotaisClientes"),
  };

  Object.entries(blocos).forEach(([chave, bloco]) => {
    if (bloco) bloco.classList.toggle("hidden", chave !== modo);
  });

  if (modo === "especificas") {
    renderizarListaOSPlanilhaFinanceira();
  }
  if (modo === "totais_clientes") {
    renderizarListaClientesPlanilhaFinanceiraTotais();
  }
}

function abrirModalPlanilhaFinanceira() {
  atualizarStatusModal("statusPlanilhaFinanceira");
  const opcaoGeral = document.querySelector('input[name="modoPlanilhaFinanceira"][value="geral"]');
  if (opcaoGeral) opcaoGeral.checked = true;
  atualizarModoPlanilhaFinanceira();
  modalPlanilhaFinanceira.style.display = "flex";
}

function fecharModalPlanilhaFinanceira() {
  atualizarStatusModal("statusPlanilhaFinanceira");
  modalPlanilhaFinanceira.style.display = "none";
}

function renderizarListaOSPlanilhaFinanceira() {
  const container = document.getElementById("listaOSPlanilhaFinanceira");
  if (!container) return;

  const lista = [...listaPrecificacoesOriginal].sort((a, b) => {
    return String(a.numeroOS || "").localeCompare(String(b.numeroOS || ""), "pt-BR", { numeric: true });
  });

  if (!lista.length) {
    container.innerHTML = '<div class="lista-os-vazia">Nenhuma OS financeira disponível.</div>';
    atualizarResumoSelecaoPlanilhaFinanceira();
    return;
  }

  container.innerHTML = lista.map((item) => `
    <label class="item-os-planilha">
      <input type="checkbox" name="osPlanilhaFinanceiraSelecionada" value="${escaparHtml(item.id)}" onchange="atualizarResumoSelecaoPlanilhaFinanceira()">
      <span class="item-os-planilha-texto">
        OS ${escaparHtml(item.numeroOS || "-")} - ${escaparHtml(item.cliente || "-")} - ${escaparHtml(item.nomeEvento || "-")} (${formatarMoeda(item.valorFinal)})
      </span>
    </label>
  `).join("");
  atualizarResumoSelecaoPlanilhaFinanceira();
}

function atualizarResumoSelecaoPlanilhaFinanceira() {
  const resumo = document.getElementById("resumoSelecaoPlanilhaFinanceira");
  if (!resumo) return;
  const total = document.querySelectorAll('input[name="osPlanilhaFinanceiraSelecionada"]:checked').length;
  resumo.textContent = `${total} OS marcadas.`;
}

function obterClientesPlanilhaFinanceiraTotais() {
  const clientes = new Map();
  const solicitantesAtivos = new Map(
    (Array.isArray(listaSolicitantesFinanceiro) ? listaSolicitantesFinanceiro : [])
      .map((nome) => String(nome || "").trim())
      .filter(Boolean)
      .map((nome) => [nome.toLowerCase(), nome])
  );

  if (!solicitantesAtivos.size) return [];

  (Array.isArray(listaPrecificacoesOriginal) ? listaPrecificacoesOriginal : []).forEach((item) => {
    const nome = String(item?.cliente || "").trim();
    if (!nome) return;
    const chave = nome.toLowerCase();
    const nomeCadastrado = solicitantesAtivos.get(chave);
    if (!nomeCadastrado) return;
    if (!clientes.has(chave)) clientes.set(chave, nomeCadastrado);
  });

  return Array.from(clientes.values()).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function atualizarResumoSelecaoClientesPlanilhaFinanceira() {
  const resumo = document.getElementById("resumoSelecaoClientesPlanilhaFinanceira");
  if (!resumo) return;
  const total = document.querySelectorAll('input[name="clientePlanilhaFinanceiraTotal"]:checked').length;
  resumo.textContent = `${total} clientes marcados.`;
}

function renderizarListaClientesPlanilhaFinanceiraTotais() {
  const container = document.getElementById("listaClientesPlanilhaFinanceiraTotais");
  if (!container) return;

  const clientes = obterClientesPlanilhaFinanceiraTotais();
  if (!clientes.length) {
    container.innerHTML = '<div class="lista-os-vazia">Nenhum cliente financeiro disponível.</div>';
    atualizarResumoSelecaoClientesPlanilhaFinanceira();
    return;
  }

  container.innerHTML = clientes.map((nome) => `
    <label class="item-os-planilha">
      <input type="checkbox" name="clientePlanilhaFinanceiraTotal" value="${escaparHtml(nome)}" onchange="atualizarResumoSelecaoClientesPlanilhaFinanceira()">
      <span class="item-os-planilha-texto">${escaparHtml(nome)}</span>
    </label>
  `).join("");
  atualizarResumoSelecaoClientesPlanilhaFinanceira();
}

function selecionarTodosClientesPlanilhaFinanceira() {
  document.querySelectorAll('input[name="clientePlanilhaFinanceiraTotal"]').forEach((checkbox) => {
    checkbox.checked = true;
  });
  atualizarResumoSelecaoClientesPlanilhaFinanceira();
}

function selecionarGrupoClientesPlanilhaFinanceira(grupoId) {
  const grupo = GRUPOS_CLIENTES_TOTAIS[grupoId];
  if (!grupo) return;

  const chavesGrupo = new Set(
    grupo.clientes
      .map(obterChaveClienteTotais)
      .filter(Boolean)
  );

  document.querySelectorAll('input[name="clientePlanilhaFinanceiraTotal"]').forEach((checkbox) => {
    if (chavesGrupo.has(obterChaveClienteTotais(checkbox.value))) {
      checkbox.checked = true;
    }
  });
  atualizarResumoSelecaoClientesPlanilhaFinanceira();
}

function limparSelecaoClientesPlanilhaFinanceira() {
  document.querySelectorAll('input[name="clientePlanilhaFinanceiraTotal"]').forEach((checkbox) => {
    checkbox.checked = false;
  });
  atualizarResumoSelecaoClientesPlanilhaFinanceira();
}

function obterClientesPlanilhaFinanceiraSelecionados() {
  return Array.from(document.querySelectorAll('input[name="clientePlanilhaFinanceiraTotal"]:checked')).map(
    (checkbox) => checkbox.value
  );
}

function marcarOSPlanilhaFinanceira(predicate) {
  const ids = new Set(listaPrecificacoesOriginal.filter(predicate).map((item) => item.id));
  document.querySelectorAll('input[name="osPlanilhaFinanceiraSelecionada"]').forEach((checkbox) => {
    checkbox.checked = ids.has(checkbox.value);
  });
  atualizarResumoSelecaoPlanilhaFinanceira();
}

function selecionarTodasPlanilhaFinanceira() {
  document.querySelectorAll('input[name="osPlanilhaFinanceiraSelecionada"]').forEach((checkbox) => {
    checkbox.checked = true;
  });
  atualizarResumoSelecaoPlanilhaFinanceira();
}

function selecionarPendentesPlanilhaFinanceira() {
  marcarOSPlanilhaFinanceira((item) => obterValorFinalSeguro(item) <= 0);
}

function selecionarPrecificadasPlanilhaFinanceira() {
  marcarOSPlanilhaFinanceira((item) => obterValorFinalSeguro(item) > 0);
}

function limparSelecaoPlanilhaFinanceira() {
  document.querySelectorAll('input[name="osPlanilhaFinanceiraSelecionada"]').forEach((checkbox) => {
    checkbox.checked = false;
  });
  atualizarResumoSelecaoPlanilhaFinanceira();
}

function obterIdsPlanilhaFinanceiraSelecionadas() {
  return Array.from(document.querySelectorAll('input[name="osPlanilhaFinanceiraSelecionada"]:checked')).map(
    (checkbox) => checkbox.value
  );
}

function obterFiltrosAtuaisPlanilhaFinanceira() {
  return {
    busca: document.getElementById("buscaFinanceira").value,
    campoBusca: document.getElementById("campoBuscaFinanceira")?.value || "todos",
    dataInicial: document.getElementById("dataInicialFinanceiro").value,
    dataFinal: document.getElementById("dataFinalFinanceiro").value,
  };
}

function obterNomeArquivoResposta(resposta) {
  const header = resposta.headers.get("Content-Disposition") || "";
  const match = header.match(/filename="?([^"]+)"?/i);
  return match?.[1] || "precificacao-financeira.xlsx";
}

async function carregarSolicitantesFinanceiro() {
  try {
    const resposta = await fetch("/api/solicitantes", { cache: "no-store" });
    const dados = await resposta.json();
    listaSolicitantesFinanceiro = resposta.ok && Array.isArray(dados) ? dados : [];
  } catch {
    listaSolicitantesFinanceiro = [];
  }
}

function baixarBlobComoArquivo(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function gerarPlanilhaFinanceira() {
  const modo = obterModoPlanilhaFinanceira();
  const payload = { modo, ano: obterAnoFinanceiroSelecionado() };

  if (modo === "geral") {
    payload.usarFiltrosAtuais = document.getElementById("usarFiltrosAtuaisPlanilhaFinanceira").checked;
    payload.filtros = obterFiltrosAtuaisPlanilhaFinanceira();
  } else if (modo === "numero_os") {
    payload.numerosOS = document.getElementById("campoNumerosOSPlanilhaFinanceira").value
      .split(/[,\s;]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  } else if (modo === "cliente") {
    payload.cliente = document.getElementById("campoClientePlanilhaFinanceira").value.trim();
  } else if (modo === "status") {
    payload.statusPrecificacao = document.getElementById("campoStatusPlanilhaFinanceira").value;
  } else if (modo === "especificas") {
    payload.ids = obterIdsPlanilhaFinanceiraSelecionadas();
  } else if (modo === "totais_clientes") {
    payload.clientes = obterClientesPlanilhaFinanceiraSelecionados();
    if (!payload.clientes.length) {
      atualizarStatusModal("statusPlanilhaFinanceira", "Selecione pelo menos um cliente para gerar a planilha de totais.", "erro");
      return;
    }
  }

  let resposta;
  try {
    atualizarStatusModal("statusPlanilhaFinanceira", "Gerando planilha financeira...", "aviso");
    resposta = await fetch("/api/financeiro/planilhas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
  } catch (erro) {
    atualizarStatusModal("statusPlanilhaFinanceira", `Erro ao gerar a planilha financeira: ${erro?.message || "falha de comunicação"}.`, "erro");
    return;
  }

  if (!resposta.ok) {
    const textoErro = await resposta.text().catch(() => "");
    let mensagem = "";
    try {
      mensagem = JSON.parse(textoErro).erro || "";
    } catch {
      mensagem = textoErro;
    }
    atualizarStatusModal("statusPlanilhaFinanceira", mensagem || `Erro ao gerar a planilha financeira. Código ${resposta.status}.`, "erro");
    return;
  }

  const blob = await resposta.blob();
  baixarBlobComoArquivo(blob, obterNomeArquivoResposta(resposta));
  fecharModalPlanilhaFinanceira();
}

window.addEventListener("click", (event) => {
  if (event.target === modalImportacaoPrecificacao) {
    fecharModalImportacaoPrecificacao();
  }
});

document.addEventListener("DOMContentLoaded", async () => {
  configurarSeletorAnoFinanceiro();
  await verificarSessaoFinanceiro();
  await Promise.all([carregarSolicitantesFinanceiro(), carregarPrecificacoes()]);
  iniciarTempoRealFinanceiro();
});
