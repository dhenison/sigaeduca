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

## Secrets no Supabase

Dashboard → Edge Functions → Secrets (ou CLI):

| Secret | Valor |
|--------|--------|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | **Arquivo JSON inteiro** da conta `siga-drive@siga-educa-drive.iam.gserviceaccount.com` (não só o e-mail) |
| `GOOGLE_DRIVE_ROOT_FOLDER_ID` | ID da pasta `SIGAEDUCA` (URL `.../folders/ID`) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` (opcional) | Confirma o e-mail esperado: `siga-drive@siga-educa-drive.iam.gserviceaccount.com` |

Esse JSON é **único do sistema** (secret no servidor). Nenhum usuário do SIGA precisa ter JSON nem login Google: basta estar logado no SIGA (Supabase Auth).

## Passos Google

1. Google Cloud → Conta de serviço → criar chave JSON
2. Ativar **Google Drive API**
3. Compartilhar a pasta `SIGAEDUCA` com o e-mail `...@....iam.gserviceaccount.com` como **Editor**
4. Colar o JSON e o folder ID nos secrets
5. Deploy: `supabase functions deploy drive-upload-file`

Sem esses secrets, o frontend mostra que o Drive institucional não está configurado.

## Acesso sem login Google pessoal

Cada arquivo enviado recebe permissão **qualquer pessoa com o link** (somente leitura). Assim, usuários do SIGA abrem/imprimem pelo link sem conectar a conta Google deles.

A pasta `SIGAEDUCA` continua privada (só a conta de serviço + quem você compartilhou no Drive). Os links não entram em busca pública (`allowFileDiscovery: false`).
