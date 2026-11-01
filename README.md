# Oficina Inteligente

Aplicativo multiplataforma em React Native e TypeScript, com alvos Android, iOS e Windows. O projeto inclui a base nativa, login, recuperação de senha, armazenamento de sessão por plataforma, isolamento multi-tenant e módulos conectados de clientes, veículos, ordens de serviço, estoque, orçamentos, compras, pós-venda, funcionários e administração da plataforma.

## Requisitos

- Node.js 22.11 ou superior e pnpm.
- Android: Android Studio, Android SDK e dispositivo/emulador configurado.
- iOS: macOS com Xcode para compilar e assinar o aplicativo nativo. O desenvolvimento do restante do código pode ser feito no Windows.
- Windows: Windows 10/11, Visual Studio 2022 com as cargas de trabalho .NET Desktop, C++ para desktop e UWP, Windows SDK e .NET SDK, conforme o [guia oficial React Native Windows 0.85](https://microsoft.github.io/react-native-windows/docs/rnw-dependencies/). O comando nativo `pnpm windows` ainda precisa ser validado neste ambiente: o Visual Studio detectado é 17.14.42 e o .NET não está no PATH; a CLI RNW 0.85 solicitou MSBuild com VCTools 18.6.0 ou superior. A versão web/PWA pode ser executada no Windows enquanto essa configuração nativa não for resolvida.

## Instalação

No PowerShell, na pasta do projeto:

```powershell
pnpm install
pnpm start
```

Em outro terminal, execute a plataforma desejada:

```powershell
pnpm android
pnpm windows
```

Para executar a versão web/PWA em desenvolvimento, use `pnpm web`. Gere o pacote de produção com `pnpm build:web`; o resultado fica em `dist/` e pode ser conferido com `pnpm preview:web`. Hospede sob HTTPS para permitir instalação pelo navegador. A PWA armazena a sessão no `localStorage` do navegador e pré-armazena somente o app shell; login, dados da oficina e todas as operações continuam exigindo conexão com o Supabase.

A instalação para Android, iPhone/iPad e Windows é feita pelo navegador. A faixa **Como instalar** do aplicativo mostra instruções conforme o aparelho. No Chrome/Edge, o botão **Instalar app** abre a confirmação do navegador quando disponível. No Android também é possível usar o menu do Chrome; no iPhone/iPad, abra no Safari e escolha **Compartilhar > Adicionar à Tela de Início** (com **Abrir como App Web** ativado, quando essa opção aparecer). No Windows, use o Chrome ou Edge. A faixa fica oculta quando o app é aberto em sua própria janela. A instalação não exige lojas, APK, Xcode ou conta de desenvolvedor Apple. As instruções só aparecem em um contexto seguro (HTTPS ou localhost).

Para iOS, em um Mac com Xcode:

```sh
pnpm install
cd ios && bundle install && bundle exec pod install && cd ..
pnpm ios
```

`pnpm test` executa os testes unitários, `pnpm lint` valida estilo e `pnpm typecheck` verifica os tipos TypeScript.

## Banco local e migrations

`supabase/config.toml` mantém a API local limitada aos schemas `public` e `graphql_public`; o schema `private` usado pelas funções privilegiadas fica fora da API. As migrations incluem perfis, oficinas, permissões, auditoria, clientes, veículos, OS com checklist/laudo, autorizações e fotos privadas, orçamentos, estoque, compras, financeiro, estornos auditáveis, garantias, lembretes, cronômetro, comissões e logotipos privados. Totais, saldo de estoque e métricas são calculados no banco. As listagens percorrem as páginas do PostgREST para não truncar registros em um limite fixo. O projeto remoto Supabase já recebeu as migrations e a migração base foi reconciliada com o histórico remoto.

Com Supabase CLI e Docker instalados, inicie uma instância local e execute as migrations/testes com:

```powershell
supabase start
supabase db reset
supabase test db
```

Sem Docker, `pnpm test:db-local` executa as migrations em PostgreSQL PGlite temporário e verifica isolamento por oficina, permissões, estoque, compras, orçamentos, financeiro, estornos, garantias, lembretes, fotos, logotipos, auditoria, cronômetro, comissão e produtividade. Esse teste isolado não substitui `supabase test db`, que executa `supabase/tests/tenant_isolation.sql` com pgTAP no ambiente Supabase.

## Supabase

Copie `.env.example` para `.env` e preencha a URL e a chave pública do projeto Supabase para desenvolvimento local. O cliente só é criado quando ambos estão presentes. Uma conta vinculada a mais de uma oficina pode trocar o contexto pela opção no cabeçalho, e as telas voltam a carregar permissões e dados para a oficina selecionada. O workflow de produção recebe `SUPABASE_URL` e `SUPABASE_ANON_KEY` pelos segredos do GitHub Actions. Use apenas a chave pública `anon` no aplicativo; nunca inclua `service_role` ou outra chave secreta no app. As sessões usam Keychain/Keystore no Android e iOS. No Windows, a sessão permanece em memória e é perdida ao fechar o app até que um adaptador seguro para o Windows App SDK seja implementado e validado.

## Segurança e estágio atual

As 30 tabelas públicas têm RLS ativo; o cadastro público está desativado e os RPCs que leem métricas globais exigem um administrador da plataforma. As funções privilegiadas ficam no schema `private`, fora da API pública. O app recebe apenas a chave pública do Supabase; chaves de serviço permanecem no servidor.

## Administração e convites

As funções Edge `manage-workshop` e `manage-private-files` estão publicadas no Supabase. Elas usam `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` somente no servidor; a chave de serviço nunca deve ser colocada no aplicativo. A função de oficinas usa por padrão `https://joaokeven14.github.io/oficina-inteligente/` para convites; `APP_WEB_URL` pode sobrescrever o destino em outro ambiente. Fotos e logotipos ficam em buckets privados criados sob demanda. O servidor valida sessão e permissão e devolve URLs assinadas temporárias para upload e leitura.

## Publicação da PWA no GitHub Pages

O workflow `.github/workflows/pages.yml` compila e publica a PWA em [https://joaokeven14.github.io/oficina-inteligente/](https://joaokeven14.github.io/oficina-inteligente/). Os segredos `SUPABASE_URL` e `SUPABASE_ANON_KEY` já estão cadastrados no GitHub Actions. O GitHub Pages usa **GitHub Actions** como origem de publicação. No Android, instale pelo Chrome; no iPhone/iPad, abra no Safari e escolha **Compartilhar → Adicionar à Tela de Início**; no Windows, use Chrome ou Edge.

Em **Authentication → URL Configuration**, defina **Site URL** como `https://joaokeven14.github.io/oficina-inteligente/` e adicione `https://joaokeven14.github.io/oficina-inteligente/**` em **Redirect URLs**. A recuperação de senha pela web preserva o caminho do GitHub Pages. Ao abrir um convite válido, o usuário define a senha antes de entrar. Links de recuperação abrem a troca de senha; tokens são retirados da barra de endereço após a confirmação da sessão. Para testar recuperação local, adicione separadamente a URL local exata que estiver usando; não substitua a URL de produção por localhost.

O cadastro público está desativado e o primeiro administrador da plataforma já foi provisionado no projeto remoto. Para adicionar outros administradores, crie a conta em **Authentication → Users → Add user** e execute no SQL Editor com o e-mail dessa conta: `insert into public.platform_admins(user_id) select id from auth.users where lower(email) = lower('SEU_EMAIL') on conflict (user_id) do update set active = true;`. O módulo Admin cria oficinas, convida proprietários, pesquisa cadastros e bloqueia, reativa ou exclui oficinas. Proprietários podem convidar funcionários e configurar permissões por módulo.

## Guias ilustrados por função

Os oito guias em `output/pdf/` têm formato horizontal de apresentação, com uma página para cada etapa, capturas das telas reais do app, setas numeradas e legendas passo a passo. Há arquivos separados para administrador da plataforma, proprietário, mecânico/OS, área comercial, estoque/compras, financeiro, pós-venda e relatórios. As capturas usam dados fictícios apenas para treinamento; o login, os registros e a persistência reais dependem da configuração do Supabase. Para regenerar os PDFs depois de atualizar as capturas, execute `python scripts/generate_screenshot_guides.py` (requer `reportlab` e `pillow`). O plano das telas e as capturas usadas ficam em `tmp/guide-screen-plan.json` e `output/guide-assets/`.


O projeto Supabase remoto recebeu as migrations e tem as funções Edge publicadas. O primeiro administrador e uma oficina de teste já estão provisionados. A OS permite atribuição, status, diagnóstico, mão de obra/peças, cronômetro individual, checklist e laudo para 25 áreas, notas técnicas, fotos e autorizações desenhadas de orçamento, serviço ou entrega. Autorizações são registros operacionais imutáveis, não assinaturas certificadas. Fotos e logotipos ficam em buckets privados e o servidor emite URLs assinadas temporárias; Windows usa web/PWA para envio. Peças vinculadas à OS baixam uma única vez e remoção/cancelamento/reabertura reconcilia o saldo. Orçamentos suportam vários itens, validade, aprovação/rejeição, histórico e conversão sem duplicação. Compras recebidas atualizam estoque/custo e criam conta a pagar em uma operação atômica. Pós-venda inclui histórico por veículo, garantias e lembretes. O financeiro inclui contas a receber, despesas, liquidação e estorno auditado com motivo tanto para lançamentos quanto para pagamentos ao fornecedor. Os relatórios mostram valores por período, categorias e gráficos mensais; o proprietário pode carregar produtividade com OS entregues, mão de obra, minutos registrados e comissão estimada. Comissões são configuradas individualmente e não são pagas automaticamente. O logotipo privado da oficina aparece nos documentos impressos pela web. O resultado financeiro é visão operacional de caixa, não cálculo contábil/fiscal. Na web/PWA, documentos e relatórios podem ser impressos/salvos como PDF e o resumo exportado em CSV; apps nativos compartilham texto, e exportação CSV nativa do Windows não está integrada. O comprovante de entrega exige autorização assinada do tipo Entrega. O estorno de pagamento ao fornecedor não cancela a compra nem altera o estoque.

O GitHub Pages publica a versão web instalável. Os projetos nativos Android, iOS e Windows estão no repositório, mas instaladores assinados não foram criados; para uso nos aparelhos, o caminho publicado é a PWA pelo navegador, sem lojas de aplicativos. As URLs de autenticação do Supabase precisam apontar para o endereço público do GitHub Pages para convites e recuperação de senha retornarem ao site.



