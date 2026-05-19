<h1 align="center">API Mercado Livre — Backend</h1>

<p align="center">
  <strong>API REST para gestão de anúncios integrada ao Mercado Livre</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white" alt="TypeScript" />
  <img src="https://img.shields.io/badge/NestJS-11-E0234E?logo=nestjs&logoColor=white" alt="NestJS" />
  <img src="https://img.shields.io/badge/Prisma-ORM-2D3748?logo=prisma&logoColor=white" alt="Prisma" />
  <img src="https://img.shields.io/badge/MongoDB-Atlas-47A248?logo=mongodb&logoColor=white" alt="MongoDB" />
  <img src="https://img.shields.io/badge/Mercado_Livre-API-FFE600?logo=mercadopago&logoColor=black" alt="Mercado Livre" />
</p>

---

## Sobre o backend

- Expõe endpoints protegidos por JWT (cookie HttpOnly `access_token`)
- Encapsula chamadas à API `api.mercadolibre.com` com tratamento de falhas de rede e erros HTTP do ML
- Mantém espelho local dos anúncios (`Item`) vinculados ao usuário (`User`)
- Sincroniza dados via webhooks (`POST /webhooks/mercadolivre`) e importação manual

## Pré-requisitos

- Node.js 18+
- MongoDB (Atlas recomendado)
- App no [Mercado Livre Developers](https://developers.mercadolivre.com.br/) com `Client ID` e `Client Secret`

## Configuração do ambiente (`.env`)

Copie o exemplo e preencha as variáveis:

```bash
cp .env.example .env
```

| Variável | Obrigatória | Descrição |
|----------|-------------|-----------|
| `PORT` | Não | Porta HTTP (padrão: `3000`) |
| `NODE_ENV` | Não | `development` ou `production` |
| `JWT_SECRET` | **Sim** | Chave secreta para assinar o JWT (string longa e aleatória) |
| `CORS_ORIGIN` | **Sim** | URL do front, sem barra no final. Ex.: `http://localhost:5173`. Vários domínios: separar por vírgula |
| `DATABASE_URL` | **Sim** | Connection string MongoDB. Ex.: `mongodb+srv://user:pass@cluster.mongodb.net/mercadolivre?retryWrites=true&w=majority` |
| `ML_CLIENT_ID` | **Sim** | Client ID do app no Mercado Livre |
| `ML_CLIENT_SECRET` | **Sim** | Client Secret do app |
| `ML_REDIRECT_URI` | **Sim** | URL de callback OAuth no **front**. Ex.: `http://localhost:5173/auth/ml/callback` |
| `ML_AUTH_URL` | Não | URL de autorização (padrão: `https://auth.mercadolivre.com.br/authorization`) |
| `COOKIE_CROSS_SITE` | Não | `true` em produção com front e API em domínios diferentes (cookie `SameSite=None; Secure`) |
| `ML_WEBHOOK_PUBLIC_URL` | Não | Apenas documentação/local — URL pública cadastrada no painel ML |

Exemplo mínimo para desenvolvimento:

```env
PORT=3000
NODE_ENV=development
JWT_SECRET=sua-chave-secreta-muito-longa
CORS_ORIGIN=http://localhost:5173
DATABASE_URL=mongodb+srv://...
ML_CLIENT_ID=seu-client-id
ML_CLIENT_SECRET=seu-client-secret
ML_REDIRECT_URI=http://localhost:5173/auth/ml/callback
```

## Banco de dados (Prisma + MongoDB)

Após configurar `DATABASE_URL`:

```bash
npm install
npm run prisma:generate
npm run prisma:push
```

- `prisma:generate` — gera o cliente Prisma
- `prisma:push` — aplica o schema (`User`, `Item`) no cluster MongoDB

Modelos principais:

- **User** — credenciais, tokens ML (`mlAccessToken`, `mlRefreshToken`, `mlUserId`)
- **Item** — anúncio local espelhado (`mlItemId` único, `active`, `status`, etc.)

## Executar em desenvolvimento

```bash
npm run start:dev
```

A API reinicia automaticamente ao salvar arquivos. Acesse `http://localhost:3000`.

Outros scripts úteis:

| Comando | Descrição |
|---------|-----------|
| `npm run build` | Compila para `dist/` |
| `npm run start:prod` | Roda build de produção |
| `npm run lint` | ESLint |
| `npm test` | Testes unitários |

## Principais rotas

| Método | Rota | Descrição |
|--------|------|-----------|
| `POST` | `/auth/register` | Cadastro |
| `POST` | `/auth/login` | Login (define cookie JWT) |
| `GET` | `/auth/me` | Usuário logado |
| `POST` | `/auth/logout` | Logout |
| `GET` | `/auth/ml/connect` | URL para conectar conta ML |
| `POST` | `/auth/ml/complete` | Finaliza OAuth (SPA envia `code` + `state`) |
| `GET` | `/items` | Lista anúncios (filtros: `q`, `visibility`, `status`, `stock`, `sort`) |
| `POST` | `/items` | Cria anúncio no ML e no Mongo |
| `PATCH` | `/items/:id` | Atualiza anúncio |
| `DELETE` | `/items/:id` | Inativa no ML |
| `POST` | `/items/:id/reactivate` | Reativa no ML |
| `DELETE` | `/items/:id/permanent` | Exclui (após encerrar no ML) |
| `POST` | `/items/import` | Importa todos os anúncios do vendedor |
| `POST` | `/webhooks/mercadolivre` | Webhook do Mercado Livre (público) |

## Webhooks

Cadastre no app ML a URL pública:

```text
https://SEU_DOMINIO/webhooks/mercadolivre
```

Tópicos recomendados: `items`, `items_prices`, `orders_v2`.

A rota responde `200` rapidamente e processa a sincronização em segundo plano.

## Tratamento de erros com o Mercado Livre

Chamadas externas passam por `src/common/mercadolivre-http.ts`:

- Falha de rede / timeout → `502` / `504` com mensagem amigável
- ML indisponível (5xx) → `BadGatewayException` ou `ServiceUnavailableException`
- Erros de validação do ML (400/422) → `BadRequestException` com texto do ML
- Token inválido (401) → `UnauthorizedException`

O frontend exibe a propriedade `message` da resposta JSON.

## Estrutura de pastas

```text
src/
├── auth/           # Login, registro, OAuth ML, renovação de token
├── items/          # CRUD, importação, API ML
├── webhooks/       # Controller e service de notificações
├── prisma/         # PrismaService
└── common/         # Utilitários HTTP (resiliência)
prisma/
└── schema.prisma
```

## Produção

- `NODE_ENV=production`
- `CORS_ORIGIN` = URL exata do front (HTTPS)
- `COOKIE_CROSS_SITE=true` se front e API em hosts diferentes
- `trust proxy` já habilitado em `main.ts` (Railway, Render, etc.)
- Evite cold start em hosts gratuitos para webhooks funcionarem de forma confiável
