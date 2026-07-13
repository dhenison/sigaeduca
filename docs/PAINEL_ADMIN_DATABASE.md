# Banco de dados — Painel Admin (cadastro de escolas)

Projeto Supabase: **sigaeduca** (`digjzihjboflcuftmokj`)

## Fluxo liberado

1. Login com `sigaeduca@escola.seduc.pa.gov.br` → `paineladmin.html`
2. Aba **Escolas** → **Nova Escola** (grava em `public.schools`)
3. Botão verde **Acessar Painel** → `painelprincipal.html` da escola escolhida

URL produção: https://sigaeduca.com/paineladmin.html  
URL local: `paineladmin.html`

---

## Tabela principal: `public.schools`

| Coluna | Tipo | Obrigatório | Descrição |
|--------|------|-------------|-----------|
| `id` | `uuid` | sim (auto) | PK da escola |
| `nome` | `text` | sim | Nome da unidade |
| `inep` | `text` | sim | Código INEP (único) |
| `endereco` | `text` | não | Endereço |
| `email` | `text` | não | E-mail da escola |
| `telefone` | `text` | não | Telefone |
| `diretor_nome` | `text` | não | Nome do diretor |
| `diretor_contato` | `text` | não | Telefone do diretor |
| `diretor_email` | `text` | não | E-mail do diretor |
| `logo_url` | `text` | não | URL da logo |
| `status` | `text` | sim | `Ativa` ou `Inativa` |
| `menu_permissions` | `jsonb` | sim | Abas liberadas no menu |
| `created_at` | `timestamptz` | auto | Criação |
| `updated_at` | `timestamptz` | auto | Atualização |

---

## Tabelas de apoio

### `public.profiles`
- `is_system_admin = true` → acesso ao Painel Admin  
- Admin: `sigaeduca@escola.seduc.pa.gov.br`

### `public.school_memberships`
- Vínculo futuro usuário ↔ escola  
- Admin do sistema **não precisa** de membership para cadastrar escolas

---

## RLS

- **Inserir / editar / excluir escolas:** somente administrador do sistema  
- **Ler escolas:** admin ou membro ativo da escola

---

## Cadastro de escola

### Pelo sistema
1. Login com `sigaeduca@escola.seduc.pa.gov.br`
2. Painel Admin → **Nova Escola**
3. Salvar → `public.schools`

### SQL (opcional)

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
