# Google Drive institucional (SIGA EDUCA) — do zero

Upload **somente** de **Solicitações Pedagógicas** pela Edge Function `drive-upload-file`.

**Documentos da Secretaria** e **Documentos Administrativos (Gestão Escolar)** ficam no **Supabase** (banco de dados). Não usam Drive.

Professores **não** fazem login Google. Só login no SIGA.

## Estrutura no Drive

```
SIGAEDUCA/                                    ← pasta do sistema (GOOGLE_DRIVE_ROOT_FOLDER_ID)
└── SOLICITAÇÕES PEDAGÓGICAS/
    └── {NOME DO PROFESSOR}/                  ← criada 1× por usuário que envia
        ├── Impressão de Atividade/
        │   └── arquivo.pdf
        ├── Impressão de Teste/
        ├── Agendar Chromebooks/
        └── Agendar Auditório/
```

Pastas de professor e de tipo são **reutilizadas**: cada novo documento só adiciona o arquivo na pasta já existente.
## Onde cada coisa salva

| Módulo | Destino |
|--------|---------|
| Solicitações Pedagógicas | Google Drive (arquivo) + metadados locais |
| Documentos da Secretaria | Supabase `secretary_documents` |
| Documentos Administrativos | Supabase `admin_school_documents` |

## Fluxo (Meu Drive / Gmail da escola) — só pedagógicas

```
Usuário SIGA → Edge Function → OAuth da conta dona de SIGAEDUCA → pasta no Drive
```

A Conta de Serviço **não funciona** no Meu Drive (sem cota). Não use JSON de service account neste cenário.

## Secrets no Supabase (só estes 4)

Dashboard → Project → Edge Functions → Secrets:

| Secret | Valor |
|--------|--------|
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | ID da pasta (`.../folders/ID`) |
| `GOOGLE_OAUTH_CLIENT_ID` | Client ID OAuth (Aplicativo da Web) |
| `GOOGLE_OAUTH_CLIENT_SECRET` | Client Secret OAuth |
| `GOOGLE_OAUTH_REFRESH_TOKEN` | Refresh token da conta **dona** de `SIGAEDUCA` |

### Checklist (do zero)

1. [ ] Conta Google dona da pasta `SIGAEDUCA`
2. [ ] Google Cloud → ativar **Google Drive API**
3. [ ] Credenciais → OAuth Client **Aplicativo da Web** → copiar Client ID e Client Secret
4. [ ] [OAuth Playground](https://developers.google.com/oauthplayground/)
   - ⚙️ → marcar **Use your own OAuth credentials** → colar ID e Secret
   - Access type: **Offline** / Force prompt: **Consent Screen**
   - Escopo: `https://www.googleapis.com/auth/drive`
   - Authorize com a conta dona da pasta → **Exchange** → copiar **Refresh token**
5. [ ] Remover secrets antigos de Conta de Serviço (se existirem):
   - `GOOGLE_SERVICE_ACCOUNT_JSON`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`
   - `GOOGLE_DRIVE_IMPERSONATE_EMAIL`
6. [ ] Cadastrar os 4 secrets da tabela acima
7. [ ] Testar envio em Solicitações Pedagógicas (sem login Google do professor)

## Erros comuns

| Mensagem | O que fazer |
|----------|-------------|
| Falta `GOOGLE_OAUTH_*` | Cadastrar Client ID, Secret e Refresh token |
| Refresh token inválido | Gerar de novo no Playground com a conta dona da pasta |
| Pasta inacessível | Conferir `GOOGLE_DRIVE_ROOT_FOLDER_ID` e a conta usada no Authorize |
| Storage quota / service account | Você ainda está no modo Conta de Serviço — use só OAuth |

## Acesso aos arquivos

Cada upload de solicitação pedagógica tenta liberar **qualquer pessoa com o link** (leitura), para abrir sem login Google pessoal.
