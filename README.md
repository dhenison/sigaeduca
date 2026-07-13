# SIGA EDUCA

Sistema escolar em desenvolvimento (HTML/CSS/JS estático + início de Supabase Auth).

## Status atual

- Persistência principal ainda em **localStorage** (exceto Auth do admin via Supabase).
- Projeto Supabase: `digjzihjboflcuftmokj` (`sigaeduca`).
- Módulo `Gestão de Lotação/` é parte do produto; pastas `tmp/` internas são ignoradas no Git.

## Como abrir localmente

1. Abra a pasta do projeto no VS Code / Cursor.
2. Confirme que existe `js/siga-config.local.js` (copie de `js/siga-config.example.js` se necessário).
3. Sirva os arquivos com um servidor estático (ex.: Live Server) e abra `login.html`.

## Integração Supabase (fase 1 — Auth admin + escolas)

Fluxo do administrador:

1. Login → `paineladmin.html`
2. Cadastrar / escolher escola
3. Botão verde **Acessar Painel** → `painelprincipal.html` daquela escola

Estrutura do banco: [docs/DATABASE_SCHEMA.md](./docs/DATABASE_SCHEMA.md)

1. Config local: `js/siga-config.local.js` (**não versionado**).
2. Auth user no projeto `sigaeduca` + `is_system_admin` em `profiles`.
3. Escolas em `public.schools` (RLS).

## Segurança

- [SECURITY_AUDIT.md](./SECURITY_AUDIT.md)
- [SECURITY_PRE_DEPLOY_CHECKLIST.md](./SECURITY_PRE_DEPLOY_CHECKLIST.md)

## Próximos passos (deploy)

1. RLS e isolamento por escola antes de dados reais.
2. Migrar PII para Postgres.
3. Deploy no **Vercel** (`vercel.json`); variáveis só no painel (nunca service role no front).

## Aviso LGPD

O app trata dados pessoais e de menores. Não publique em produção sem Auth servidor, RLS, política de privacidade e base legal adequados.
