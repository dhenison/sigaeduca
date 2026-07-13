# Banco de dados — Painel Admin (cadastro de escolas)

Projeto Supabase: **sigaeduca** (`digjzihjboflcuftmokj`)

SQL versionado: [`docs/sql/schools_creation.sql`](./sql/schools_creation.sql)

## Fluxo

1. Login com `sigaeduca@escola.seduc.pa.gov.br` → Auth Supabase  
2. `paineladmin.html` → aba **Escolas** → **Nova Escola**  
3. Salvar → `INSERT` / `UPDATE` em `public.schools` (exige sessão + `is_system_admin`)  
4. Botão verde **Acessar Painel** → grava `profiles.school_id` + contexto local → `painelprincipal.html`

URL produção: https://sigaeduca.com/paineladmin.html

---

## Tabela principal: `public.schools`

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| `id` | `uuid` | auto | PK da escola (tenant) |
| `nome` | `text` | sim | Nome da unidade (não vazio) |
| `inep` | `text` | sim | Código INEP único (8–12 dígitos) |
| `endereco` | `text` | não | Endereço completo |
| `email` | `text` | não | E-mail institucional |
| `telefone` | `text` | não | Telefone |
| `diretor_nome` | `text` | não | Nome do diretor |
| `diretor_contato` | `text` | não | Telefone do diretor |
| `diretor_email` | `text` | não | E-mail do diretor |
| `logo_url` | `text` | não | URL da logo (data URL grande é descartada no cliente) |
| `status` | `text` | sim | `Ativa` ou `Inativa` |
| `menu_permissions` | `jsonb` | sim | Abas liberadas no menu |
| `created_by` | `uuid` | auto | `auth.users` que criou |
| `updated_by` | `uuid` | auto | Último editor |
| `observacoes` | `text` | não | Notas internas |
| `created_at` | `timestamptz` | auto | Criação |
| `updated_at` | `timestamptz` | auto | Atualização (trigger) |

Trigger `trg_schools_audit`: normaliza INEP (só dígitos), preenche `created_by` / `updated_by` e `updated_at`.

---

## Tabelas de apoio

### `public.profiles`
- `is_system_admin = true` → acesso ao Painel Admin e escrita em `schools`
- Admin atual: `sigaeduca@escola.seduc.pa.gov.br`
- `school_id` → última escola selecionada

### `public.school_memberships`
- Vínculo futuro usuário ↔ escola  
- Admin do sistema **não precisa** de membership para cadastrar escolas

---

## RLS

| Ação | Quem |
|------|------|
| SELECT | Admin do sistema **ou** membro ativo |
| INSERT / UPDATE / DELETE | Somente admin do sistema (`is_system_admin()`) |

Função: `public.is_system_admin()`.

---

## Cadastro pela UI

O formulário **Nova Escola** exige sessão Supabase autenticada.  
Se a sessão expirar ou o Supabase não estiver configurado, o salvamento **falha** (não grava só no `localStorage`).

Campos do formulário → colunas:

| Formulário | Coluna |
|------------|--------|
| Nome | `nome` |
| INEP | `inep` |
| Telefone | `telefone` |
| Endereço | `endereco` |
| E-mail | `email` |
| Diretor (nome/contato/e-mail) | `diretor_*` |
| Logo | `logo_url` |
| Permissões (aba) | `menu_permissions` |

---

## SQL de exemplo

```sql
INSERT INTO public.schools (
  nome, inep, endereco, email, telefone,
  diretor_nome, diretor_contato, diretor_email,
  status, menu_permissions
) VALUES (
  'Escola Exemplo',
  '12345678',
  'Rua Exemplo, 100',
  'contato@escola.seduc.pa.gov.br',
  '(91) 99999-0000',
  'Nome do Diretor',
  '(91) 98888-0000',
  'diretor@escola.seduc.pa.gov.br',
  'Ativa',
  '{}'::jsonb
);
```

Documentação geral: [DATABASE_SCHEMA.md](./DATABASE_SCHEMA.md)
