# Verificação da demonstração

Execute `npm run check`, `npm test` e `npm run build` com Node.js 20 ou superior. Os testes usam apenas memória e nunca abrem bancos ou serviços externos.

Os testes de domínio verificam transições de status, persistência e restauração, independência de armazenamento, pagamentos sem duplicidade, dinheiro em centavos, entrada/saída/devolução de estoque, quantidade indisponível, contratos, datas inválidas, conteúdo HTML tratado como texto, CSV sem execução de fórmulas e falhas de armazenamento.

Para verificar a interface, execute `npm start` e abra a prévia local:

1. Confirme os indicadores e navegue por todas as seis seções.
2. Cadastre e edite uma OS. Alterne o status e confira a posição no kanban, a lista e os indicadores.
3. Busque por evento e filtre por data/status. Limpe os filtros.
4. Cadastre um contrato, altere a vigência e abra o documento fictício.
5. Faça uma saída de estoque, tente exceder o disponível e registre uma devolução.
6. Cadastre um lançamento e registre um pagamento; confirme que o botão não permite repetição.
7. Confira o histórico, exporte um CSV e visualize uma impressão de exemplo.
8. Recarregue a página para verificar persistência, depois restaure a demonstração.
9. Repita a navegação em 390 px e em tela larga. Tabelas e kanban têm rolagem própria; a página deve permanecer dentro da janela.
10. No painel de rede do navegador, confirme que apenas os arquivos estáticos locais são carregados. Não deve haver chamadas a APIs, fontes ou serviços externos.

A política de conteúdo bloqueia conexões de dados e scripts externos. A prévia local serve apenas os cinco arquivos públicos previstos. O build deve conter exatamente esses arquivos.
