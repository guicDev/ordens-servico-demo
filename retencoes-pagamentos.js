(function (root) {
  "use strict";

  const IMPOSTOS = ["iss", "ir", "csll", "inss"];
  const UNIDADES_POR_CENTO = 10000;
  const UNIDADES_POR_INTEIRO = 1000000;

  function validarAliquota(valor) {
    if (valor === null || valor === undefined) return null;
    if (!Number.isInteger(valor) || valor < 0 || valor > UNIDADES_POR_INTEIRO) {
      throw new Error("ALIQUOTA_INVALIDA");
    }
    return valor;
  }

  function parsePercentual(valor) {
    const texto = String(valor ?? "").trim();
    if (!texto) return null;
    const partes = texto.match(/^(\d{1,3})(?:[,.](\d{1,4}))?$/);
    if (!partes) throw new Error("ALIQUOTA_INVALIDA");
    const unidades = Number(partes[1]) * UNIDADES_POR_CENTO
      + Number((partes[2] || "").padEnd(4, "0") || 0);
    return validarAliquota(unidades);
  }

  function formatarPercentual(unidades) {
    if (unidades === null || unidades === undefined) return "";
    validarAliquota(unidades);
    const inteiro = Math.floor(unidades / UNIDADES_POR_CENTO);
    const fracao = String(unidades % UNIDADES_POR_CENTO).padStart(4, "0").replace(/0+$/, "");
    return fracao ? `${inteiro},${fracao}` : String(inteiro);
  }

  function calcularRetencoes(valorContaCentavos, aliquotas = {}) {
    if (!Number.isSafeInteger(valorContaCentavos) || valorContaCentavos < 0) {
      throw new Error("VALOR_CONTA_INVALIDO");
    }
    const valores = {};
    let totalCentavos = 0;
    for (const imposto of IMPOSTOS) {
      const aliquota = validarAliquota(aliquotas[imposto]);
      const centavos = aliquota === null ? 0 : Number(
        (BigInt(valorContaCentavos) * BigInt(aliquota) + 500000n) / 1000000n
      );
      valores[imposto] = centavos;
      totalCentavos += centavos;
    }
    if (totalCentavos > valorContaCentavos) throw new Error("RETENCOES_SUPERAM_CONTA");
    return { valores, totalCentavos, liquidoCentavos: valorContaCentavos - totalCentavos };
  }

  const api = { IMPOSTOS, validarAliquota, parsePercentual, formatarPercentual, calcularRetencoes };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CalculoRetencoesPagamento = api;
})(typeof window !== "undefined" ? window : globalThis);
