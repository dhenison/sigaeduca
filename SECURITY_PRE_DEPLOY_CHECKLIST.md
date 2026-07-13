# SECURITY_PRE_DEPLOY_CHECKLIST.md — SIGA EDUCA

Use este checklist **antes** do primeiro deploy público (Vercel) e após integrar Supabase.

Marque `[x]` somente após evidência.

---

## Ambiente e repositório

- [ ] Repositório GitHub privado (recomendado até estabilizar Auth/RLS)
- [ ] Branch de produção protegida (`main`)
- [ ] `.gitignore` impede `.env`, `node_modules`, `Gestão de Lotação/tmp/`
- [ ] Nenhum secret em commits (`git log -p` / scanner de secrets)
- [ ] `SECURITY_AUDIT.md` revisado pela equipe

## Variáveis de ambiente

- [ ] `.env.example` atualizado (sem valores reais)
- [ ] Variáveis configuradas no Vercel / Supabase Dashboard
- [ ] `NEXT_PUBLIC_SUPABASE_URL` / anon key apenas se necessárias no cliente
- [ ] **Service role NÃO** está em variável `NEXT_PUBLIC_*`
- [ ] Service role **não** aparece no bundle do frontend
- [ ] Origens permitidas (`SIGA_ALLOWED_ORIGINS` / CORS) listadas

## Secrets rotacionados

- [ ] Qualquer chave que tenha vazado foi revogada
- [ ] Senhas de administradores redefinidas após auditoria
- [ ] JWT secret / service role regenerados se necessário
- [ ] Tokens de webhooks regenerados

## Service role protegida

- [ ] Uso apenas em Edge Functions / backend / CI com escopo mínimo
- [ ] Sem commits, sem issues, sem prints, sem logs
- [ ] Políticas de acesso ao dashboard Supabase (2FA nos owners)

## Banco e RLS (quando Supabase existir)

- [ ] RLS **ativado** em todas as tabelas com PII
- [ ] Nenhuma política `USING (true)` / `WITH CHECK (true)` em dados sensíveis
- [ ] Políticas testadas por papel: anônimo, aluno, professor, gestor, admin
- [ ] Isolamento por `school_id` / tenant validado
- [ ] Views e funções `SECURITY DEFINER` revisadas
- [ ] Seeds de produção **sem** CPF/senha reais

## Storage

- [ ] Buckets privados por padrão
- [ ] Upload com validação de tipo/tamanho
- [ ] URLs assinadas (expiração) para documentos escolares
- [ ] Paths isolados por escola (`/{school_id}/...`)

## Autenticação e sessão

- [ ] Login admin via Supabase Auth testado
- [ ] Recuperação de senha segura (e-mail oficial, sem expor existência indevida)
- [ ] Sessão expirada tratada
- [ ] Usuário desativado não autentica
- [ ] Portal do aluno separado do painel administrativo
- [ ] Painel admin restrito a `sistemaAdmin` / claim no JWT

## Isolamento entre escolas

- [ ] Gestor da escola A não lê dados da escola B
- [ ] Manipulação de IDs no frontend não concede acesso (IDOR bloqueado no RLS)
- [ ] Relatórios filtrados por tenant
- [ ] Lotação respeita a mesma escola da sessão

## Logs e privacidade

- [ ] Logs sem CPF, senha, token, endereço completo
- [ ] Erros de produção sem stack trace ao usuário
- [ ] Debug desligado em produção
- [ ] Política de retenção / exclusão (LGPD)

## Dependências e build

- [ ] Dependências auditadas (`npm audit` / equivalente) quando houver package.json
- [ ] CDNs com SRI ou self-host
- [ ] Build de produção validado
- [ ] Bundle inspecionado: zero service role / zero senhas
- [ ] Headers de segurança ativos (`vercel.json` ou equivalente)

## Rede e domínio

- [ ] CORS restrito aos domínios oficiais
- [ ] Domínio Vercel / DNS autorizados no Supabase Auth
- [ ] HTTPS obrigatório
- [ ] Redirects abertos verificados (sem open redirect)

## Operação

- [ ] Backups do banco configurados e testados (restore dry-run)
- [ ] Monitoramento / alertas (Auth falhas, 5xx, abuse)
- [ ] Ambiente **produção** separado de **desenvolvimento** / **staging**
- [ ] Plano de resposta a incidente (rotação de chaves em &lt; 1h)

## Dados e conformidade

- [ ] Base legal / aviso de privacidade publicados
- [ ] Tratamento de dados de menores revisado
- [ ] Exportação/exclusão de dados possível sob solicitação
- [ ] Sem dados reais de alunos em ambientes de teste públicos

## Smoke pós-deploy

- [ ] `/` redireciona para login
- [ ] Usuário não autenticado bloqueado
- [ ] Admin autentica e acessa apenas painel admin
- [ ] Professor não acessa painel admin
- [ ] Cross-school access falha
- [ ] Upload inválido rejeitado
- [ ] Documento privado não é público por URL permanente

---

## Bloqueadores atuais (hoje, pré-Supabase)

Enquanto o app usar **somente localStorage**, **não** marque o deploy público como seguro para dados reais. Use o checklist completo apenas após Auth + RLS.

Estado local atual (2026-07-13):

- [x] Senha hardcoded removida
- [x] `.gitignore` / `.env.example`
- [x] Hash local de senhas (mitigação)
- [x] Gate de rotas no cliente
- [x] Headers básicos no `vercel.json`
- [ ] Supabase Auth admin
- [ ] RLS multi-escola
- [ ] Remoção de PII do localStorage em produção
