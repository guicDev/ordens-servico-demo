# Validação da demonstração

- 18 testes automatizados aprovados, incluindo status, dinheiro em centavos, pagamentos, limites de estoque, contratos, entrada de dados, restauração e isolamento.
- Fluxos conferidos em navegador nos tamanhos de desktop e celular: 6 telas, cadastro e edição de OS, lista e kanban, filtros, contratos, saída e devolução de estoque, pagamento e histórico.
- Persistência após recarregar, restauração, temas claro e escuro e formulário em celular verificados.
- Nenhuma requisição externa observada nos fluxos testados. A política de conteúdo bloqueia conexões de dados.
- Fonte e build revisados por lista de arquivos; sem bancos, anexos reais, credenciais ou configurações operacionais.

Os testes do núcleo podem ser repetidos com `npm test`. O pacote de hospedagem é criado com `npm run build`.

O ambiente é demonstrativo: dados locais, entrada sem senha e documentos sem validade. As limitações estão descritas no README.
