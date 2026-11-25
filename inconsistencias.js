let inconsistenciasOriginais = [];
let inconsistenciasFiltradas = [];
let inconsistenciasResumoOriginal = {};
let inconsistenciasGeradoEm = "";
let inconsistenciasAnos = [];

const TIPOS_INCONSISTENCIA_UI = [
  "numero_pulado",
  "ano_suspeito",
  "numero_invalido",
  "sem_materiais",
  "materiais_sem_itens",
  "duplicada",
  "sem_precificacao",
  "dados_essenciais",
];

const ROTULOS_TIPO_INCONSISTENCIA = {
  numero_pulado: "N&uacute;meros pulados",
  ano_suspeito: "OS com ano suspeito",
  numero_invalido: "OS com n&uacute;mero inv&aacute;lido",
  sem_materiais: "OS sem materiais",
  materiais_sem_itens: "Materiais sem itens de precifica&ccedil;&atilde;o",
  duplicada: "OS duplicadas",
  sem_precificacao: "OS sem precifica&ccedil;&atilde;o",
  dados_essenciais: "Dados essenciais faltando",
};

const ROTULOS_STATUS_OS = {
  pendente: "Pendente",
  autorizado: "Autorizado",
  em_execucao: "Em execu\u00e7\u00e3o",
  executado: "Executado",
  recusado: "Recusado",
};

function escaparHtmlInconsistencias(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function normalizarBuscaInconsistencias(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function rotuloTipoInconsistencia(tipo) {
  return ROTULOS_TIPO_INCONSISTENCIA[tipo] || escaparHtmlInconsistencias(tipo || "Inconsist\u00eancia");
}

function rotuloStatusOS(status) {
  return ROTULOS_STATUS_OS[status] || status || "-";
}

function formatarDataHoraInconsistencias(iso) {
  if (!iso) return "";
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return iso;
  return data.toLocaleString("pt-BR");
}

function obterTextoBuscaInconsistencias(item, campo) {
  if (campo === "numeroOS") return item.numeroOS || "";
  if (campo === "evento") return item.evento || "";
  if (campo === "solicitante") return item.solicitante || "";
  if (campo === "motivo") return `${item.motivo || ""} ${item.sugestao || ""}`;
  return [
    item.numeroOS,
    item.ano,
    item.evento,
    item.solicitante,
    item.status,
    item.problema,
    item.motivo,
    item.sugestao,
  ].join(" ");
}

function preencherFiltrosInconsistencias(dados) {
  const anoSelect = document.getElementById("filtroAnoInconsistencias");
  const tipoSelect = document.getElementById("filtroTipoInconsistencias");
  const statusSelect = document.getElementById("filtroStatusInconsistencias");
  if (!anoSelect || !tipoSelect || !statusSelect) return;

  const anoAtual = anoSelect.value;
  const tipoAtual = tipoSelect.value;
  const statusAtual = statusSelect.value;
  const anos = new Set([...(dados.anos || []), ...inconsistenciasOriginais.map((item) => item.ano).filter(Boolean)]);
  inconsistenciasAnos = [...anos].sort((a, b) => String(b).localeCompare(String(a)));
  const status = [...new Set(inconsistenciasOriginais.map((item) => item.status).filter(Boolean))]
    .sort((a, b) => rotuloStatusOS(a).localeCompare(rotuloStatusOS(b), "pt-BR"));

  anoSelect.innerHTML = '<option value="">Todos os anos</option>' +
    inconsistenciasAnos.map((ano) => `<option value="${escaparHtmlInconsistencias(ano)}">${escaparHtmlInconsistencias(ano)}</option>`).join("");
  tipoSelect.innerHTML = '<option value="">Todos os tipos</option>' +
    TIPOS_INCONSISTENCIA_UI.map((tipo) => `<option value="${tipo}">${rotuloTipoInconsistencia(tipo)}</option>`).join("");
  statusSelect.innerHTML = '<option value="">Todos os status</option>' +
    status.map((item) => `<option value="${escaparHtmlInconsistencias(item)}">${escaparHtmlInconsistencias(rotuloStatusOS(item))}</option>`).join("");

  anoSelect.value = inconsistenciasAnos.includes(anoAtual) ? anoAtual : "";
  tipoSelect.value = TIPOS_INCONSISTENCIA_UI.includes(tipoAtual) ? tipoAtual : "";
  statusSelect.value = status.includes(statusAtual) ? statusAtual : "";
}

function obterResumoFiltradoInconsistencias(lista) {
  return lista.reduce((resumo, item) => {
    const quantidade = Number(item.quantidade || 1);
    resumo.total += quantidade;
    if (item.tipo === "numero_pulado") resumo.numerosPulados += quantidade;
    if (item.tipo === "ano_suspeito") resumo.anoSuspeito += quantidade;
    if (item.tipo === "numero_invalido") resumo.numeroInvalido += quantidade;
    if (item.tipo === "sem_precificacao") resumo.semPrecificacao += quantidade;
    if (item.tipo === "materiais_sem_itens") resumo.materiaisSemItens += quantidade;
    return resumo;
  }, {
    total: 0,
    numerosPulados: 0,
    anoSuspeito: 0,
    numeroInvalido: 0,
    semPrecificacao: 0,
    materiaisSemItens: 0,
  });
}

function atualizarResumoInconsistencias() {
  const resumo = obterResumoFiltradoInconsistencias(inconsistenciasFiltradas);
  document.getElementById("incResumoTotal").textContent = resumo.total;
  document.getElementById("incResumoPulados").textContent = resumo.numerosPulados;
  document.getElementById("incResumoAno").textContent = resumo.anoSuspeito;
  document.getElementById("incResumoNumero").textContent = resumo.numeroInvalido;
  document.getElementById("incResumoSemPrecificacao").textContent = resumo.semPrecificacao;
  document.getElementById("incResumoMateriaisItens").textContent = resumo.materiaisSemItens;
  document.getElementById("contadorInconsistencias").textContent = inconsistenciasFiltradas.length;

  const meta = document.getElementById("inconsistenciasMeta");
  if (meta) {
    const totalOriginal = Number(inconsistenciasResumoOriginal.total || 0);
    meta.textContent = inconsistenciasGeradoEm
      ? `Gerado em ${formatarDataHoraInconsistencias(inconsistenciasGeradoEm)}. ${totalOriginal} ocorr\u00eancias no banco.`
      : `${totalOriginal} ocorr\u00eancias no banco.`;
  }
}

function linhaTabelaInconsistencia(item) {
  const numero = item.numeroOS || "-";
  const ano = item.ano || "-";
  const evento = item.evento || (item.tipo === "numero_pulado" ? "Registro ausente" : "-");
  const solicitante = item.solicitante || "-";
  const status = item.status ? rotuloStatusOS(item.status) : "-";
  return `
    <tr>
      <td><strong>${escaparHtmlInconsistencias(numero)}</strong></td>
      <td>${escaparHtmlInconsistencias(ano)}</td>
      <td>${escaparHtmlInconsistencias(evento)}</td>
      <td>${escaparHtmlInconsistencias(solicitante)}</td>
      <td><span class="inconsistencias-status">${escaparHtmlInconsistencias(status)}</span></td>
      <td>${escaparHtmlInconsistencias(item.problema || "-")}</td>
      <td class="historico-texto-longo">${escaparHtmlInconsistencias(item.motivo || "-")}</td>
      <td class="historico-texto-longo">${escaparHtmlInconsistencias(item.sugestao || "-")}</td>
    </tr>
  `;
}

function renderizarGrupoInconsistencias(tipo, lista) {
  return `
    <section class="financeiro-lista-box inconsistencias-grupo">
      <div class="financeiro-lista-topo">
        <div>
          <h2>${rotuloTipoInconsistencia(tipo)}</h2>
          <p>${lista.length} registro(s) no filtro atual.</p>
        </div>
        <span class="financeiro-contador">${lista.reduce((total, item) => total + Number(item.quantidade || 1), 0)}</span>
      </div>
      <div class="tabela-preview-planilha pagamentos-tabela-wrap inconsistencias-tabela-wrap">
        <table class="tabela-pagamentos tabela-inconsistencias">
          <thead>
            <tr>
              <th>OS</th>
              <th>Ano</th>
              <th>Evento</th>
              <th>Solicitante</th>
              <th>Status</th>
              <th>Problema</th>
              <th>Motivo</th>
              <th>Sugest&atilde;o</th>
            </tr>
          </thead>
          <tbody>${lista.map(linhaTabelaInconsistencia).join("")}</tbody>
        </table>
      </div>
    </section>
  `;
}

function renderizarInconsistencias() {
  const container = document.getElementById("listaInconsistencias");
  if (!container) return;
  if (!inconsistenciasFiltradas.length) {
    container.innerHTML = `
      <section class="financeiro-lista-box">
        <div class="financeiro-vazio">Nenhuma inconsist&ecirc;ncia encontrada para os filtros atuais.</div>
      </section>
    `;
    return;
  }

  const grupos = new Map();
  TIPOS_INCONSISTENCIA_UI.forEach((tipo) => grupos.set(tipo, []));
  inconsistenciasFiltradas.forEach((item) => {
    if (!grupos.has(item.tipo)) grupos.set(item.tipo, []);
    grupos.get(item.tipo).push(item);
  });

  container.innerHTML = [...grupos.entries()]
    .filter(([, lista]) => lista.length)
    .map(([tipo, lista]) => renderizarGrupoInconsistencias(tipo, lista))
    .join("");
}

function filtrarInconsistencias() {
  const busca = normalizarBuscaInconsistencias(document.getElementById("buscaInconsistencias")?.value || "");
  const campoBusca = document.getElementById("campoBuscaInconsistencias")?.value || "todos";
  const ano = document.getElementById("filtroAnoInconsistencias")?.value || "";
  const tipo = document.getElementById("filtroTipoInconsistencias")?.value || "";
  const status = document.getElementById("filtroStatusInconsistencias")?.value || "";

  inconsistenciasFiltradas = inconsistenciasOriginais.filter((item) => {
    if (ano && item.ano !== ano) return false;
    if (tipo && item.tipo !== tipo) return false;
    if (status && item.status !== status) return false;
    if (!busca) return true;
    return normalizarBuscaInconsistencias(obterTextoBuscaInconsistencias(item, campoBusca)).includes(busca);
  });

  atualizarResumoInconsistencias();
  renderizarInconsistencias();
}

function limparFiltrosInconsistencias() {
  document.getElementById("buscaInconsistencias").value = "";
  document.getElementById("campoBuscaInconsistencias").value = "todos";
  document.getElementById("filtroAnoInconsistencias").value = "";
  document.getElementById("filtroTipoInconsistencias").value = "";
  document.getElementById("filtroStatusInconsistencias").value = "";
  filtrarInconsistencias();
}

async function carregarInconsistencias() {
  const container = document.getElementById("listaInconsistencias");
  if (container) {
    container.innerHTML = `
      <section class="financeiro-lista-box">
        <div class="financeiro-vazio">Carregando inconsist&ecirc;ncias...</div>
      </section>
    `;
  }

  try {
    const resposta = await fetch(`/api/inconsistencias?_=${Date.now()}`, { cache: "no-store" });
    if (!resposta.ok) {
      if (resposta.status === 401) {
        window.location.href = "/login.html";
        return;
      }
      throw new Error("Falha ao carregar inconsistencias");
    }
    const dados = await resposta.json();
    inconsistenciasOriginais = Array.isArray(dados.itens) ? dados.itens : [];
    inconsistenciasResumoOriginal = dados.resumo || {};
    inconsistenciasGeradoEm = dados.geradoEm || "";
    preencherFiltrosInconsistencias(dados);
    filtrarInconsistencias();
  } catch (erro) {
    console.error(erro);
    if (typeof mostrarAvisoSistema === "function") {
      mostrarAvisoSistema("N\u00e3o foi poss\u00edvel carregar as inconsist\u00eancias.", "erro");
    }
    if (container) {
      container.innerHTML = `
        <section class="financeiro-lista-box">
          <div class="financeiro-vazio">Erro ao carregar inconsist&ecirc;ncias.</div>
        </section>
      `;
    }
  }
}

window.carregarInconsistencias = carregarInconsistencias;
window.filtrarInconsistencias = filtrarInconsistencias;
window.limparFiltrosInconsistencias = limparFiltrosInconsistencias;

document.addEventListener("DOMContentLoaded", carregarInconsistencias);
