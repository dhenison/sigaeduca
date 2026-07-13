# SECURITY_AUDIT.md — SIGA EDUCA

**Data:** 2026-07-13  
**Branch:** `security-audit`  
**Escopo:** projeto local em `Siga Educa` (exceto alteração de dados em `Gestão de Lotação/`)  
**Modo:** auditoria defensiva pré-repositório / pré-deploy  

---

## 1. Resumo executivo

O SIGA EDUCA é uma aplicação **web estática** (HTML + JS) com persistência em **localStorage**. Não há backend, Supabase, PostgreSQL, Edge Functions, Docker nem CI neste momento.

A auditoria removeu credenciais hardcoded, endureceu autenticação no cliente, introduziu hash de senhas locais, gate de rotas, `.gitignore`, `.env.example` e cabeçalhos básicos para Vercel. **Riscos estruturais** (ausência de Auth/RLS no servidor, dados no browser, multi-tenant só no cliente) **permanecem** até a integração com Supabase e deploy controlado.

| Severidade   | Qtde | Corrigidos (mitigação local) | Pendentes (requer backend) |
|--------------|------|-----------------------------|----------------------------|
| Crítico      | 1    | 1                           | 0*                         |
| Alto         | 5    | 3                           | 2                          |
| Médio        | 6    | 3                           | 3                          |
| Baixo        | 4    | 2                           | 2                          |
| Informativo  | 3    | —                           | 3                          |

\*O “crítico” era senha compartilhada no código; corrigido. Em produção sem servidor, o modelo localStorage em si continua **inadequado para dados reais de menores**.

---

## 2. Arquitetura analisada

| Camada            | Tecnologia                         | Observação                          |
|-------------------|------------------------------------|-------------------------------------|
| Frontend          | HTML, Tailwind CDN, JS vanilla     | Multi-página                        |
| Persistência      | `localStorage` / IndexedDB (boletim)| Dados no dispositivo do usuário    |
| Auth              | `js/login.js` + `siga_session`     | Cliente apenas                      |
| Segurança shared  | `js/siga-security.js`              | Hash SHA-256, escape, gate          |
| Multi-escola      | `siga_schools`                     | Isolamento só no UI                 |
| Lotação           | pasta `Gestão de Lotação/`         | Preservada; `tmp/` no `.gitignore`  |
| Supabase / API    | Ausente                            | Próxima etapa (admin Auth)          |

---

## 3. Escopo da auditoria

Incluído: código SIGA, configs, scripts, HTML, JS, docs locais, preparação Git/Vercel.  
Excluído de edição: conteúdo operacional de `Gestão de Lotação/` (apenas ignore de `tmp/`).  
Não executado: deploy, conexão a serviços externos, alteração de dados no Supabase, rotação automática de chaves, push/commit sem autorização.

---

## 4. Problemas encontrados

### C-01 — Senha hardcoded de desbloqueio de frequência  
- **Severidade:** Crítico  
- **Arquivo:** `frequencia.html` (handler do modal de unlock)  
- **Descrição:** Comparação com senha fixa no código-fonte.  
- **Risco:** Qualquer pessoa com o HTML desbloqueava chamadas consolidadas.  
- **Cenário:** Abrir fonte / DevTools e reutilizar a senha.  
- **Exposto:** senha administrativa compartilhada (últimos 4: `****`).  
- **Correção aplicada:** Validação via `SigaSecurity.verifyUnlockPassword` (senha do usuário logado gestor/admin).  
- **Testes:** grep `admin123` = 0 ocorrências no SIGA.  
- **Manual:** gestores precisam ter senha definida.

### A-01 — Senhas em claro no localStorage  
- **Severidade:** Alto  
- **Arquivo:** `js/login.js`, `js/siga-db.js`, chaves `siga_users` / `siga_students`  
- **Descrição:** Senhas armazenadas em texto.  
- **Correção aplicada:** Hash `sha256:` com salt de aplicação; upgrade no login; recuperação passa a definir senha (aluno não recebe senha derivada de CPF).  
- **Pendente:** Migrar para **Supabase Auth** (hash servidor / Argon2). Hash no browser **não** é equivalente a Auth real.

### A-02 — Sessão e PII no localStorage  
- **Severidade:** Alto  
- **Descrição:** Sessão, CPF, nomes, fotos (data URL) no browser.  
- **Correção aplicada:** Mitigações parciais (máscara de senha na ficha, não exibir hash/senha em formulários).  
- **Pendente:** Cookies HttpOnly + Auth servidor; minimizar PII no cliente.

### A-03 — Autorização apenas no cliente  
- **Severidade:** Alto  
- **Arquivo:** `js/siga-db.js` (`requireAuth`), `js/painel-admin.js`  
- **Correção aplicada:** Redirect se sem sessão; aluno restrito ao portal.  
- **Pendente:** RLS + JWT no servidor.

### A-04 — XSS via `innerHTML` com dados de usuário  
- **Severidade:** Alto  
- **Arquivos:** `js/siga-db.js` (ficha/aluno), outros módulos  
- **Correção aplicada:** `escapeHtml` em ficha (contato) e modal de edição de aluno; helper global.  
- **Pendente:** Varredura completa de todos os `innerHTML` (agenda, ocorrências, lotação).

### A-05 — Modelo multi-tenant sem enforcement  
- **Severidade:** Alto  
- **Descrição:** Escola ativa no cliente; sem filtro servidor.  
- **Correção aplicada:** Documentado; sem falsa RLS.  
- **Pendente:** `school_id` + RLS em todas as tabelas.

### M-01 — Sem `.gitignore` / Git  
- **Severidade:** Médio → **Corrigido** (repo init + `.gitignore` + branch `security-audit`).

### M-02 — Senha padrão de importação `123456`  
- **Severidade:** Médio → **Corrigido** (sem default fraco; `DEFINIR_SENHA` no CSV modelo).

### M-03 — Recuperação de aluno gerava senha a partir do CPF  
- **Severidade:** Médio → **Corrigido** (fluxo define nova senha).

### M-04 — QR via serviço externo  
- **Severidade:** Médio  
- **Arquivo:** `js/documentos-secretaria.js` (`api.qrserver.com`)  
- **Risco:** URL de validação enviada a terceiro.  
- **Pendente:** Gerar QR localmente (lib offline) antes de produção.

### M-05 — CDNs (Tailwind, fonts) sem SRI  
- **Severidade:** Médio  
- **Pendente:** Pin + SRI ou self-host no build.

### M-06 — Alteração de senha no perfil não validava senha real  
- **Severidade:** Médio → **Corrigido** (verifica e grava hash em `siga_users`).

### B-01 — Placeholders “João Silva” em HTML  
- **Severidade:** Baixo — informativo; sobrescritos por `syncProfile`.

### B-02 — Sem lint/typecheck/npm  
- **Severidade:** Baixo — N/A até toolchain.

### B-03 — Headers de segurança ausentes  
- **Severidade:** Baixo → **Corrigido** parcialmente via `vercel.json`.

### B-04 — `tmp/node_modules` na Lotação  
- **Severidade:** Baixo — **não apagado** (preservar pasta); **ignorado no Git**.

### I-01 — Ausência de Supabase/RLS/Storage  
### I-02 — Pronto para integração Auth admin + Vercel  
### I-03 — Dados de exemplo limpos em runtime (`siga_exemplo_removido`)

---

## 5. Correções aplicadas (arquivos)

| Arquivo | Mudança |
|---------|---------|
| `js/siga-security.js` | **Novo** — hash, verify, escape, auth gate, unlock |
| `js/login.js` | Login/recuperação com hash; aluno define senha |
| `js/siga-db.js` | Gate auth, hash import/cadastro, escape, senha perfil |
| `js/boletins.js` | Máscara de senha na ficha |
| `frequencia.html` | Removida senha hardcoded |
| `*.html` (SIGA) | Inclusão de `siga-security.js` |
| `.gitignore` | Secrets, node_modules, Lotação/tmp |
| `.env.example` | Template futuro Supabase |
| `vercel.json` | Headers + rewrite `/` → login |
| `README.md` | Orientação repo/deploy |
| `SECURITY_AUDIT.md` | Este relatório |
| `SECURITY_PRE_DEPLOY_CHECKLIST.md` | Checklist |

**Não alterado:** conteúdo de `Gestão de Lotação/` (apenas ignore de `tmp/`).

---

## 6. Testes executados

| Teste | Resultado |
|-------|-----------|
| Busca `admin123` no SIGA | Ausente |
| Inclusão `siga-security.js` nas páginas | OK |
| Git init + branch `security-audit` | OK |
| Lint / typecheck / npm test / build | **N/A** (sem `package.json`) |
| Bundle produção | N/A — estático; sem service role no código |
| `.env` versionado | Nenhum `.env` real presente; ignore ativo |

### Testes manuais recomendados (navegador)

1. Sem sessão → abrir `painelprincipal.html` → redireciona para `login.html`.  
2. Aluno logado → não acessa painel admin.  
3. Desbloqueio de frequência com senha do gestor logado (não senha fixa).  
4. Recuperação aluno/servidor → define senha ≥ 6 → login OK.  
5. Editar aluno → campo senha vazio não sobrescreve; não exibe hash.

---

## 7. Credenciais a rotacionar

| Item | Ação |
|------|------|
| Senha compartilhada `admin****` (antiga) | Considerar **comprometida** se o HTML já foi compartilhado; não há mais no código. Redefinir senhas de gestores. |
| Qualquer chave Supabase futura | Criar novas; nunca commit; service role só no servidor. |
| Senhas locais em claro (dados antigos no browser) | Usuários devem redefinir; login migra para hash automaticamente. |

**Não rotacionamos automaticamente** nenhuma chave (nenhuma Supabase ativa no projeto).

---

## 8. Ações manuais obrigatórias antes do 1º deploy

1. Autorizar **commit** e **push** desta branch (quando solicitar).  
2. Integrar **Supabase Auth** para Administrador do Sistema.  
3. Modelar schemas com `school_id` + **RLS** em todas as tabelas sensíveis.  
4. Remover dependência de localStorage para PII em produção.  
5. Configurar variáveis no Vercel (apenas `anon` pública; service role privada).  
6. Substituir QR externo por geração local.  
7. Revisar LGPD / consentimento / menores.  
8. Ambiente prod separado de desenvolvimento.

---

## 9. Riscos restantes

- Auth e autorização **só no cliente**.  
- XSS residual em módulos não varridos.  
- Multi-tenant sem banco.  
- Dados sensíveis no dispositivo.  
- Hash client-side é **mitigação**, não substituição de Auth.  
- Lotação ainda fora do mesmo modelo de segurança do SIGA (não auditada em profundidade nesta rodada por regra de preservação).

---

## 10. Próximo passo sugerido (após push)

1. Criar projeto Supabase.  
2. Auth e-mail institucional para admin.  
3. Edge Function ou API route (Vercel) **nunca** expondo service role.  
4. Migrar escolas/usuários.  
5. Reexecutar checklist `SECURITY_PRE_DEPLOY_CHECKLIST.md`.
