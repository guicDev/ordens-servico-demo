const MODULOS_SISTEMA = [
  { id: "dashboard", titulo: "Dashboard de OS", rota: "/os", permissao: "dashboard" },
  { id: "financeiro", titulo: "Precifica&ccedil;&atilde;o e Cobran&ccedil;a", rota: "/precificacao", permissao: "financeiro" },
  { id: "pagamentos", titulo: "Pagamentos em Aberto", rota: "/pagamentos", permissao: "pagamentos" },
  { id: "contratos", titulo: "Contratos", rota: "/contratos", permissao: "contratos" },
  { id: "historico", titulo: "Hist&oacute;rico", rota: "/historico", permissao: "historico" },
  { id: "estoque", titulo: "Estoque (beta)", rota: "/estoque", permissao: "estoque" },
  { id: "inconsistencias", titulo: "Inconsist&ecirc;ncias", rota: "/inconsistencias", permissao: "dashboard" },
];

let navegacaoUsuarioPromise = null;
let aberturaMenuPendente = false;
let navegacaoUsuarioAtual = null;
let acoesMoveisTrigger = null;
let acoesMoveisPainel = null;
let acoesMoveisOverlay = null;
const USUARIOS_FINANCEIRO_MENU = new Set(["admin", "administrador", "operador-demo", "gestor-demo", "financeiro-demo", "analista-demo", "assistente-demo", "consulta-demo"]);
const USUARIOS_PAGAMENTOS_MENU = new Set(["admin", "administrador", "operador-demo", "gestor-demo", "financeiro-demo", "analista-demo", "assistente-demo"]);
const USUARIOS_CONTRATOS_MENU = new Set(["admin", "administrador", "operador-demo", "gestor-demo", "financeiro-demo", "analista-demo", "assistente-demo"]);
const USUARIOS_HISTORICO_MENU = new Set(["operador-demo"]);
const USUARIOS_ESTOQUE_MENU = new Set(["operador-demo"]);
const IDS_HISTORICO_MENU = new Set(["1"]);

function normalizarIdentificadorMenu(valor) {
  return String(valor || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function obterNomeUsuarioExibido() {
  const texto = String(document.getElementById("usuarioLogadoNome")?.textContent || "").trim();
  return texto && texto !== "-" ? texto : "";
}

function montarUsuarioParaMenu(usuario) {
  const nomeExibido = obterNomeUsuarioExibido();
  return {
    ...(usuario && typeof usuario === "object" ? usuario : {}),
    nome: usuario?.nome || nomeExibido,
    usuario: usuario?.usuario || nomeExibido,
  };
}

function usuarioTemPermissaoModulo(usuario, modulo) {
  const usuarioMenu = montarUsuarioParaMenu(usuario);
  if (!usuarioMenu) return false;
  if (
    usuarioMenu.permissoes
    && Object.prototype.hasOwnProperty.call(usuarioMenu.permissoes, modulo.permissao)
  ) {
    return Boolean(usuarioMenu.permissoes[modulo.permissao]);
  }
  if (modulo.permissao === "dashboard") return true;
  const identificadores = [usuarioMenu.usuario, usuarioMenu.nome].map(normalizarIdentificadorMenu);
  if (modulo.permissao === "historico") {
    const idAutorizadoHistorico = IDS_HISTORICO_MENU.has(normalizarIdentificadorMenu(usuarioMenu.id));
    const usuarioAutorizadoHistorico = identificadores.some((identificador) =>
      USUARIOS_HISTORICO_MENU.has(identificador) || identificador.startsWith("operador-demo ")
    );
    return idAutorizadoHistorico || usuarioAutorizadoHistorico;
  }
  if (modulo.permissao === "estoque") {
    return identificadores.some((identificador) =>
      USUARIOS_ESTOQUE_MENU.has(identificador) || identificador.startsWith("operador-demo ")
    );
  }
  const autorizados = modulo.permissao === "financeiro"
    ? USUARIOS_FINANCEIRO_MENU
    : modulo.permissao === "pagamentos"
      ? USUARIOS_PAGAMENTOS_MENU
      : modulo.permissao === "contratos"
        ? USUARIOS_CONTRATOS_MENU
        : new Set();
  return identificadores.some((identificador) => autorizados.has(identificador));
}

async function consultarUsuarioNavegacao() {
  const resposta = await fetch("/api/me", { cache: "no-store" });
  if (!resposta.ok) {
    window.location.href = "/login.html";
    return null;
  }
  const dados = await resposta.json();
  if (dados?.usuario && typeof dados.usuario === "object") {
    return {
      ...dados.usuario,
      permissoes: dados.usuario.permissoes || dados.permissoes || {},
    };
  }
  return dados;
}

function definirNomeUsuario(usuario) {
  const nomeEl = document.getElementById("usuarioLogadoNome");
  if (!nomeEl) return;
  const nome = String(usuario?.nome || usuario?.usuario || "").trim();
  if (nome) nomeEl.textContent = nome;
}

function detectarModuloAtual() {
  const path = window.location.pathname;
  if (path === "/" || path === "/os" || path.endsWith("/index.html")) return "dashboard";
  if (path === "/precificacao" || path.endsWith("/financeiro.html")) return "financeiro";
  if (path === "/pagamentos" || path.endsWith("/pagamentos-abertos.html")) return "pagamentos";
  if (path === "/contratos" || path.endsWith("/contratos.html")) return "contratos";
  if (path === "/historico" || path.endsWith("/historico.html")) return "historico";
  if (path === "/estoque" || path.endsWith("/estoque.html")) return "estoque";
  if (path === "/inconsistencias" || path.endsWith("/inconsistencias.html")) return "inconsistencias";
  return "";
}

function renderizarIconeModulo(id) {
  const icones = {
    dashboard: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5h8l1.5 2H20v14H4V7h2.5L8 5Z"></path>
        <path d="M9 5v4h6V5"></path>
        <path d="M8 13h.01"></path>
        <path d="M12 13h4"></path>
        <path d="M8 17h.01"></path>
        <path d="M12 17h4"></path>
      </svg>
    `,
    financeiro: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v16"></path>
        <path d="M16.5 7.5c-.9-1.2-2.4-1.8-4.2-1.8-2.5 0-4.4 1.2-4.4 3.2 0 4.6 8.6 2.2 8.6 6.6 0 1.9-1.8 3-4.4 3-2 0-3.8-.7-4.8-2"></path>
      </svg>
    `,
    pagamentos: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8.5 16 5l2 6.5"></path>
        <path d="M5 10h15v9H5v-9Z"></path>
        <path d="M16 14h4"></path>
        <path d="M16 15.5h.01"></path>
      </svg>
    `,
    contratos: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h8l4 4v14H6V3Z"></path>
        <path d="M14 3v5h4"></path>
        <path d="M9 12h6"></path>
        <path d="M9 16h6"></path>
      </svg>
    `,
    historico: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 8v5l3 2"></path>
        <path d="M4 12a8 8 0 1 0 2.3-5.6"></path>
        <path d="M4 4v4h4"></path>
      </svg>
    `,
    estoque: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 7.5 12 3l8 4.5-8 4.5-8-4.5Z"></path>
        <path d="M4 7.5V16l8 5 8-5V7.5"></path>
        <path d="M12 12v9"></path>
      </svg>
    `,
    inconsistencias: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 3.5 19h17L12 3Z"></path>
        <path d="M12 9v4"></path>
        <path d="M12 17h.01"></path>
      </svg>
    `,
  };
  return icones[id] || "";
}

function abrirMenuLateral() {
  let menu = document.getElementById("sideNavigation");
  if (menu) {
    renderizarMenuLateral(montarUsuarioParaMenu(navegacaoUsuarioAtual));
    menu = document.getElementById("sideNavigation");
  }
  if (!menu) {
    aberturaMenuPendente = true;
    inicializarNavegacao();
    return;
  }
  menu.classList.add("open");
  document.getElementById("sideMenuOverlay")?.classList.add("show");
  document.body.classList.add("menu-lateral-aberto");
  document.querySelectorAll(".logo-menu-trigger, .menu-access-button").forEach((trigger) => trigger.setAttribute("aria-expanded", "true"));
}

function fecharMenuLateral() {
  document.getElementById("sideNavigation")?.classList.remove("open");
  document.getElementById("sideMenuOverlay")?.classList.remove("show");
  document.body.classList.remove("menu-lateral-aberto");
  document.querySelectorAll(".logo-menu-trigger, .menu-access-button").forEach((trigger) => trigger.setAttribute("aria-expanded", "false"));
}

function mostrarAvisoSistema(mensagem, tipo = "erro", duracao = 4500) {
  if (!mensagem) return;
  const tipoAviso = ["erro", "sucesso", "aviso"].includes(tipo) ? tipo : "erro";
  let aviso = document.getElementById("avisoSistemaGlobal");
  if (!aviso) {
    aviso = document.createElement("div");
    aviso.id = "avisoSistemaGlobal";
    aviso.className = "aviso-sistema-global";
    document.body.appendChild(aviso);
  }
  aviso.setAttribute("role", tipoAviso === "erro" ? "alert" : "status");
  aviso.setAttribute("aria-live", tipoAviso === "erro" ? "assertive" : "polite");
  aviso.setAttribute("aria-atomic", "true");
  aviso.textContent = mensagem;
  aviso.classList.remove("erro", "sucesso", "aviso", "visivel");
  aviso.classList.add(tipoAviso, "visivel");
  clearTimeout(aviso._timerAvisoSistema);
  aviso._timerAvisoSistema = setTimeout(() => {
    aviso.classList.remove("visivel");
  }, duracao);
}

function prepararLogoMenu() {
  const logo = document.querySelector(".topbar-logo");
  if (!logo || logo.dataset.menuPreparado === "true") return;
  logo.dataset.menuPreparado = "true";
  logo.setAttribute("role", "button");
  logo.setAttribute("tabindex", "0");
  logo.setAttribute("title", "Abrir menu principal");
  logo.setAttribute("aria-label", "Abrir menu principal");
  logo.setAttribute("aria-controls", "sideNavigation");
  logo.setAttribute("aria-expanded", "false");
  logo.classList.add("logo-menu-trigger");
  const acesso = document.createElement("div");
  acesso.className = "menu-access";
  logo.before(acesso);
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "menu-access-button";
  botao.textContent = "☰ Menu";
  botao.title = "Abrir menu: pagamentos, contratos e outras telas";
  botao.setAttribute("aria-controls", "sideNavigation");
  botao.setAttribute("aria-expanded", "false");
  botao.addEventListener("click", abrirMenuLateral);
  acesso.append(logo, botao);
  logo.addEventListener("click", abrirMenuLateral);
  logo.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      abrirMenuLateral();
    }
  });
}

function telaMovel() {
  return typeof window.matchMedia === "function" && window.matchMedia("(max-width: 760px)").matches;
}

function fecharAcoesMoveis() {
  if (!acoesMoveisPainel || !acoesMoveisOverlay) return;
  acoesMoveisPainel.classList.remove("aberto");
  acoesMoveisOverlay.classList.remove("aberto");
  document.body.classList.remove("acoes-moveis-abertas");
  acoesMoveisTrigger?.setAttribute("aria-expanded", "false");
  acoesMoveisTrigger?.focus?.();
}

function abrirAcoesMoveis() {
  if (!telaMovel() || !acoesMoveisPainel || !acoesMoveisOverlay) return;
  const acoesOriginais = Array.from(document.querySelectorAll(".topbar-acoes .btn-topo"));
  const nomeUsuario = obterNomeUsuarioExibido() || "Usuário conectado";
  acoesMoveisPainel.replaceChildren();

  const cabecalho = document.createElement("div");
  cabecalho.className = "mobile-actions-header";
  const titulo = document.createElement("h2");
  titulo.id = "mobileActionsTitle";
  titulo.textContent = "Ações da tela";
  const fechar = document.createElement("button");
  fechar.type = "button";
  fechar.className = "mobile-actions-close";
  fechar.textContent = "Fechar";
  fechar.addEventListener("click", fecharAcoesMoveis);
  cabecalho.append(titulo, fechar);

  const usuario = document.createElement("p");
  usuario.className = "mobile-actions-user";
  usuario.textContent = nomeUsuario;

  const lista = document.createElement("div");
  lista.className = "mobile-actions-list";
  acoesOriginais.forEach((acaoOriginal) => {
    const acao = acaoOriginal.cloneNode(true);
    acao.removeAttribute("id");
    acao.removeAttribute("onclick");
    acao.addEventListener("click", () => {
      fecharAcoesMoveis();
      acaoOriginal.click();
    });
    lista.appendChild(acao);
  });

  acoesMoveisPainel.append(cabecalho, usuario, lista);
  acoesMoveisPainel.classList.add("aberto");
  acoesMoveisOverlay.classList.add("aberto");
  document.body.classList.add("acoes-moveis-abertas");
  acoesMoveisTrigger?.setAttribute("aria-expanded", "true");
  lista.querySelector("button")?.focus();
}

function prepararAcoesMoveis() {
  if (typeof window.matchMedia !== "function") return;
  const areaAcoes = document.querySelector(".topbar-acoes");
  const possuiAcoes = areaAcoes?.querySelector(".btn-topo");
  if (!areaAcoes || !possuiAcoes) return;

  if (!acoesMoveisTrigger) {
    acoesMoveisTrigger = document.createElement("button");
    acoesMoveisTrigger.type = "button";
    acoesMoveisTrigger.className = "mobile-actions-trigger";
    acoesMoveisTrigger.textContent = "Ações";
    acoesMoveisTrigger.setAttribute("aria-haspopup", "dialog");
    acoesMoveisTrigger.setAttribute("aria-expanded", "false");
    acoesMoveisTrigger.addEventListener("click", abrirAcoesMoveis);
    areaAcoes.appendChild(acoesMoveisTrigger);

    acoesMoveisOverlay = document.createElement("div");
    acoesMoveisOverlay.className = "mobile-actions-overlay";
    acoesMoveisOverlay.addEventListener("click", fecharAcoesMoveis);
    acoesMoveisPainel = document.createElement("section");
    acoesMoveisPainel.className = "mobile-actions-panel";
    acoesMoveisPainel.setAttribute("role", "dialog");
    acoesMoveisPainel.setAttribute("aria-modal", "true");
    acoesMoveisPainel.setAttribute("aria-labelledby", "mobileActionsTitle");
    document.body.append(acoesMoveisOverlay, acoesMoveisPainel);
    window.matchMedia("(max-width: 760px)").addEventListener("change", (evento) => {
      if (!evento.matches) fecharAcoesMoveis();
    });
  }
}

function renderizarMenuLateral(usuario) {
  const usuarioMenu = montarUsuarioParaMenu(usuario);
  const menuExistente = document.getElementById("sideNavigation");
  const overlayExistente = document.getElementById("sideMenuOverlay");
  const manterAberto = Boolean(
    menuExistente?.classList?.contains("open") ||
    overlayExistente?.classList?.contains("show") ||
    document.body.classList.contains("menu-lateral-aberto")
  );
  menuExistente?.remove?.();
  overlayExistente?.remove?.();
  document.body.classList.remove("menu-lateral-aberto");

  const modulos = MODULOS_SISTEMA.filter((modulo) =>
    usuarioTemPermissaoModulo(usuarioMenu, modulo)
  );
  const atual = detectarModuloAtual();
  const overlay = document.createElement("div");
  overlay.id = "sideMenuOverlay";
  overlay.className = "side-menu-overlay";
  overlay.addEventListener("click", fecharMenuLateral);

  const aside = document.createElement("aside");
  aside.id = "sideNavigation";
  aside.className = "side-menu";
  aside.innerHTML = `
    <div class="side-menu-header">
      <img src="assets/identidade.svg" alt="Logo da empresa">
      <div>
        <strong>OS Eventos</strong>
        <span>Central</span>
      </div>
    </div>
    <nav class="side-menu-nav">
      ${modulos.map((modulo) => `
        <a class="side-menu-item ${modulo.id === atual ? "active" : ""}" href="${modulo.rota}">
          <span class="side-menu-thumb">${renderizarIconeModulo(modulo.id)}</span>
          ${modulo.titulo}
        </a>
      `).join("")}
    </nav>
    <button type="button" class="side-menu-logout" onclick="logoutNavegacao()">Sair</button>
  `;
  document.body.append(overlay, aside);
  if (manterAberto) {
    aside.classList.add("open");
    overlay.classList.add("show");
    document.body.classList.add("menu-lateral-aberto");
  }
}

async function logoutNavegacao() {
  await fetch("/api/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/login.html";
}

async function inicializarNavegacao() {
  prepararLogoMenu();
  if (!navegacaoUsuarioPromise) navegacaoUsuarioPromise = consultarUsuarioNavegacao();
  const usuario = await navegacaoUsuarioPromise;
  if (!usuario) return null;
  navegacaoUsuarioAtual = usuario;
  definirNomeUsuario(usuario);
  prepararAcoesMoveis();
  renderizarMenuLateral(usuario);
  if (aberturaMenuPendente) {
    aberturaMenuPendente = false;
    abrirMenuLateral();
  }
  return usuario;
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    fecharMenuLateral();
    fecharAcoesMoveis();
    const closers = [
      ["modal", "fecharModal"],
      ["modalStatus", "fecharModalStatus"],
      ["modalExclusao", "fecharModalExclusao"],
      ["modalPlanilha", "fecharModalPlanilhaPersonalizada"],
      ["modalImportacaoDashboard", "fecharModalImportacaoDashboard"],
      ["modalFinanceiro", "fecharModalFinanceiro"],
      ["modalPlanilhaFinanceira", "fecharModalPlanilhaFinanceira"],
      ["modalImportacaoPrecificacao", "fecharModalImportacaoPrecificacao"],
      ["modalPagamentoAberto", "fecharModalPagamento"],
      ["modalImportacaoPagamentos", "fecharModalImportacaoPagamentos"],
      ["modalExportacaoPagamentos", "fecharModalExportacaoPagamentos"],
      ["modalDetalheContrato", "fecharDetalheContrato"],
      ["modalImportacaoContratos", "fecharModalImportacaoContratos"],
      ["modalItemEstoque", "fecharModalItemEstoque"],
      ["modalMovEstoque", "fecharModalMovEstoque"],
    ];
    closers.forEach(([id, nome]) => {
      const modal = document.getElementById(id);
      if (modal && getComputedStyle(modal).display !== "none" && typeof window[nome] === "function") {
        window[nome]();
      }
    });
  }

  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    const busca = document.querySelector(
      "#buscaGeral, #buscaFinanceira, #filtroBuscaPagamentos, #filtroBuscaContratos"
      + ", #buscaHistorico, #buscaInconsistencias"
    );
    if (busca) {
      event.preventDefault();
      busca.focus();
      busca.select?.();
    }
  }
});

window.inicializarNavegacao = inicializarNavegacao;
window.abrirMenuLateral = abrirMenuLateral;
window.fecharMenuLateral = fecharMenuLateral;
window.prepararAcoesMoveis = prepararAcoesMoveis;
window.abrirAcoesMoveis = abrirAcoesMoveis;
window.fecharAcoesMoveis = fecharAcoesMoveis;
window.renderizarMenuLateral = renderizarMenuLateral;
window.definirNomeUsuario = definirNomeUsuario;
window.obterUsuarioNavegacao = () => navegacaoUsuarioAtual;
window.logoutNavegacao = logoutNavegacao;
window.mostrarAvisoSistema = mostrarAvisoSistema;
window.MODULOS_SISTEMA = MODULOS_SISTEMA;
window.usuarioTemPermissaoModulo = usuarioTemPermissaoModulo;

function iniciarNavegacaoDaPagina() {
  if (document.body.classList.contains("login-body")) return;
  prepararLogoMenu();
  prepararAcoesMoveis();
  void inicializarNavegacao();
}

if (document.readyState === "loading") {
  window.addEventListener("DOMContentLoaded", iniciarNavegacaoDaPagina);
} else {
  iniciarNavegacaoDaPagina();
}
