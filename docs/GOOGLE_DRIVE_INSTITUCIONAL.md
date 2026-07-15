# Google Drive institucional (SIGA EDUCA)

O upload de **Documentos Secretaria** e **Solicitações Pedagógicas** usa a Edge Function `drive-upload-file` com Conta de Serviço.

## Estrutura

```
SIGAEDUCA/                          ← GOOGLE_DRIVE_ROOT_FOLDER_ID
├── Documentos Secretaria/
│   └── {Tipo}/
└── SOLICITAÇÕES PEDAGÓGICAS/
    └── {Nome do usuário}/
        └── {Tipo}/
```

## Importante: cota da Conta de Serviço

Contas de serviço **não têm espaço no Meu Drive**.  
Se `SIGAEDUCA` estiver só no **Meu Drive** (Gmail pessoal), o Google responde:

> Service Accounts do not have storage quota…

### Solução recomendada — Drive compartilhado (Shared Drive)

1. No Google Drive (conta da escola / Workspace), crie um **Drive compartilhado** (ex.: `SIGA EDUCA Arquivos`)
2. Mova ou recrie a pasta `SIGAEDUCA` **dentro** desse Drive compartilhado
3. Em Gerenciar membros do Drive compartilhado, adicione:
   - `siga-drive@siga-educa-drive.iam.gserviceaccount.com`
   - Função: **Gerenciador de conteúdo** (Content manager) ou superior
4. Abra a pasta `SIGAEDUCA` e atualize o secret `GOOGLE_DRIVE_ROOT_FOLDER_ID` com o **novo** ID da URL (`.../folders/ID`)

Com isso, os arquivos usam a cota do Drive compartilhado, não da Conta de Serviço.

### Alternativa — Workspace (impersonação)

Se a escola tiver Google Workspace com admin:

1. Ative **Domain-Wide Delegation** na Conta de Serviço (escopo `https://www.googleapis.com/auth/drive`)
2. Secret opcional: `GOOGLE_DRIVE_IMPERSONATE_EMAIL` = e-mail de um usuário da escola com cota (ex. `secretaria@escola...`)

## Secrets no Supabase

| Secret | Valor |
|--------|--------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Arquivo JSON inteiro da conta `siga-drive@siga-educa-drive.iam.gserviceaccount.com` |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | ID da pasta `SIGAEDUCA` (de preferência **dentro de Shared Drive**) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` (opcional) | `siga-drive@siga-educa-drive.iam.gserviceaccount.com` |
| `GOOGLE_DRIVE_IMPERSONATE_EMAIL` (opcional) | Usuário Workspace para impersonar |

Esse JSON é **único do sistema**. Usuários do SIGA só fazem login no SIGA (sem Google pessoal).

## Passos Google (resumo)

1. Google Cloud → Conta de serviço → chave JSON + Drive API ativa
2. Colocar `SIGAEDUCA` em **Drive compartilhado** e adicionar a SA como Gerenciador de conteúdo
3. Colar JSON + folder ID nos secrets
4. Deploy: `supabase functions deploy drive-upload-file`

## Acesso sem login Google pessoal

Cada arquivo tenta receber permissão **qualquer pessoa com o link** (leitura).  
Se a política do Shared Drive bloquear isso, o arquivo ainda fica salvo; abra pelo SIGA quando houver cópia local.
