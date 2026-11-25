# OS Eventos — Demonstração

Demonstração interativa do sistema de ordens de serviço para eventos, com suas telas, estilos, menus, formulários e modais completos. Todos os registros iniciais são novos e fictícios. Nenhuma conexão com uma operação real é necessária.

## Explorar o sistema

As nove páginas incluem acesso demonstrativo, dashboard de OS, precificação e cobrança, pagamentos em aberto, contratos, histórico, estoque, inconsistências e dashboard temporário. Os gráficos, filtros, seleção em massa, lixeira, anexos e formulários mantêm os fluxos da interface.

O acesso é público: **admin**, senha de exemplo **demo**. O controle discreto “Demonstração · dados fictícios” permite escolher outros perfis fictícios e restaurar os registros. Os perfis reproduzem acessos administrativos, operacionais, financeiros, de consulta temporária e de contratos somente leitura. Eles demonstram permissões; não constituem autenticação ou proteção de dados reais.

Não informe credenciais, dados pessoais, documentos ou valores comerciais reais.

## Executar localmente

Requer Node.js 20 ou superior. Bibliotecas de planilhas e PDF estão incluídas localmente; não é necessário instalar dependências.

```sh
npm run check
npm test
npm start
```

Abra `http://127.0.0.1:4174`. A prévia aceita apenas conexões locais. A variável `PORT` permite escolher outra porta.

## Publicar no GitHub e na Vercel

```sh
npm run build
```

O build copia somente os arquivos listados em `scripts/public-files.json` para `dist/`: nove páginas, scripts e estilos, identidade neutra e bibliotecas locais com seus avisos de licença. Arquivos adicionais, testes e documentação não entram nessa saída.

Envie este projeto a um repositório novo no GitHub e importe-o na Vercel. Use o preset **Other**, comando `npm run build`, diretório de saída `dist` e nenhuma variável de ambiente. O arquivo `vercel.json` contém essas opções, os aliases de navegação e os cabeçalhos de segurança. A demonstração não precisa de Functions, banco, conta de serviço ou segredo.

## Funcionamento dos dados

O conjunto inicial cobre todos os status de OS, clientes fictícios, contratos, cobranças com retenções e equipamentos de exemplo. As datas são relativas ao dia em que um cenário novo é criado. O estado é salvo apenas em `localStorage`, na chave `demonstracao.os.fiel.v2`. Preferências de interface usam o prefixo `demonstracao.os.ui.`.

Recarregar a página preserva as alterações. Outro navegador ou perfil recebe seu próprio cenário. Abas na mesma origem compartilham armazenamento; a última gravação prevalece. Não há colaboração simultânea, conta ou sincronização em nuvem. Se o armazenamento falhar ou estiver bloqueado, o estado permanece na memória da aba e um aviso informa a limitação. Restaurar remove somente o estado desta demonstração e suas preferências.

Mudanças de status movimentam reservas de estoque conforme quantidade e diárias; a conclusão libera a reserva e cria a entrada de precificação. Saídas manuais diminuem a quantidade total. Quantidades de estoque mantêm três casas decimais. Valores de precificação usam reais; pagamentos, retenções e contratos usam centavos. Consumos vinculados aos pagamentos atualizam os saldos dos contratos.

## Relatórios e importações

As exportações XLSX usam os geradores e estilos das respectivas telas. Os arquivos são planilhas reais, reabertas nos testes. O PDF da OS mantém os dados, caixas e áreas do documento. A exportação CSV permanece disponível no dashboard. Esses arquivos contêm apenas o estado local e dados fictícios, inclusive qualquer alteração feita pelo visitante.

As importações de OS, contratos, precificação e pagamentos usam seus formatos próprios. O relatório exportado e o formato de importação de contratos/OS podem ter colunas diferentes. A prévia mostra o que será aplicado antes da confirmação. Em contratos, o layout de entrada tem doze colunas: Item, Órgão, Contrato, Descrição, Valor original, Aditivos, Valor global, Vigência, Início, Fim, Status e Atestado. O modelo de pagamentos é gerado com exemplos fictícios. As importações ficam limitadas a 3 MB e são processadas na própria aba; planilhas excessivamente complexas podem tornar o navegador lento.

Anexos de exemplo ficam limitados a 1 MB, com PDF, PNG, JPEG ou DOCX. O nome e conteúdo permanecem apenas no navegador e podem consumir sua cota de armazenamento. Links de anexos são resolvidos pelo adaptador local, sem upload.

Mapas de empenhos e relatórios fotográficos preservam a ação e sua localização na interface, mas usam conteúdo explicitamente fictício. O mapa gera XLSX sem consultar portais; o relatório fotográfico gera um exemplo PDF sem fotografias reais. Essas diferenças são informadas no contexto da ação.

## Código e bibliotecas

`demo-adapter.js` substitui as chamadas de dados e os downloads por respostas locais. Conexões externas são bloqueadas; contratos desconhecidos devolvem erro explícito. `demo-engine.js` mantém os registros e as mutações. Regras puras de status, retenções, inconsistências e relatórios são compartilhadas com a interface preservada. A política de conteúdo permite os scripts e eventos locais da interface e bloqueia conexões de dados.

Os avisos de terceiros são mantidos em `vendor/exceljs-LICENSE.txt` e `vendor/pdfkit-LICENSE.txt`. O projeto não atribui uma licença aberta ao restante do código. Antes de redistribuí-lo ou definir uma licença, confirme os direitos correspondentes.
