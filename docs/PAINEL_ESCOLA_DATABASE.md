# Banco do painel da escola — ordem dos menus

Projeto: `digjzihjboflcuftmokj` · Tenant: `school_id` → `public.schools`

## Ordem (sidebar)

| # | Menu | Página | Tabelas (planejado) | Status |
|---|------|--------|---------------------|--------|
| 0 | Cadastro de escolas (Admin) | `paineladmin.html` | `schools`, `school_memberships`, `profiles` | Feito |
| 1 | Minha Escola | `painelprincipal.html` + `escola.html` | campos extras em `schools` + `academic_years` + helper `user_can_access_school` | Feito |
| 2 | Calendário Letivo | `calendarioletivo.html` | `calendar_days` | Feito (`sql/02_calendario_letivo.sql`) |
| 3 | Turmas | `turmas.html` | `classes` | **SQL pronto** (`sql/03_turmas.sql`) |
| 4 | Alunos | `alunos.html` / ficha | `students` | **SQL pronto** (`sql/04_alunos.sql`) |
| 5 | Frequência | `frequencia.html` | `attendance_calls`, `attendance_marks` | **SQL pronto** (`sql/05_frequencia.sql`) |
| 6 | Horário de Aula | `horariodeaula.html` | `class_schedules` | Pendente |
| 7 | Agenda | `agenda.html` | `agenda_events`, `agenda_event_classes` | **SQL pronto** (`sql/07_agenda.sql`) |
| 8 | Ocorrências | `ocorrencias.html` | `occurrences` | **SQL pronto** (`sql/08_ocorrencias.sql`) |
| 9 | Documentos Secretaria | `documentossecretaria.html` | `secretary_documents` | **SQL pronto** (`sql/09_documentos_secretaria.sql`) |
| 10 | Usuários | `usuarios.html` | `school_staff` (+ `profiles` / `school_memberships`) | **SQL pronto** (`sql/10_usuarios.sql`) |
| 11 | Lotação | `Gestão de Lotação/` | **não migrar/alterar dados** (módulo separado) | Fora |
| 12 | Projeto Olímpico | `topodosaber.html` | `olympiads`, `olympiad_entries` | **SQL pronto** (`sql/12_projeto_olimpico.sql`) |
| 13 | Boletins | `boletins.html` | `report_card_batches`, `report_cards` | **SQL pronto** (`sql/13_boletins.sql`) |
| 14 | Conselho de Classe | `conselho.html` | `class_councils` | Pendente |
| 15 | Controle de Livros | `controlelivros.html` | `books`, `book_loans`, `book_returns` | **SQL pronto** (`sql/15_controle_livros.sql`) |
| 16 | Relatórios | `relatorios.html` | (views / consultas) | Pendente |
| 17 | Meu Perfil | `meuperfil.html` | `profiles` (+ segurança) + `user_sessions` | **SQL pronto** (`sql/17_meu_perfil.sql`) |
| 18 | Permissões | `permissões.html` | `permission_modules`, `role_permission_defaults`, `staff_permissions` | **SQL pronto** (`sql/18_permissoes.sql`) |

## Padrão RLS (todas as tabelas de negócio)

```sql
school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE

USING (public.user_can_access_school(school_id))
WITH CHECK (public.user_can_access_school(school_id))
```

Admin do sistema (`is_system_admin`) acessa todas as escolas.

## Menu 1 — Minha Escola

SQL: [`sql/01_minha_escola.sql`](./sql/01_minha_escola.sql)

- Dados da unidade: colunas em `schools` (`cnpj`, `cep`, `bairro`, `municipio`, `uf`, …)
- Dashboard: agrega dados das próximas tabelas (ainda localStorage até migrarmos)
- Fundação: `academic_years` (ano letivo por escola)

## Menu 2 — Calendário Letivo

SQL: [`sql/02_calendario_letivo.sql`](./sql/02_calendario_letivo.sql)

Tabela `public.calendar_days`:

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | uuid | PK |
| `school_id` | uuid | Escola (tenant) |
| `academic_year_id` | uuid | Ano letivo (opcional) |
| `day_date` | date | Dia (único por escola) |
| `day_type` | text | `letivo`, `feriado_recesso`, `domingo`, `sabado_nao_letivo`, `evento`, … |
| `label` | text | Texto exibido na UI |
| `notes` | text | Observação opcional |

Inclui seed de **maio/2026** (dias úteis letivos) e **julho/2026** (férias) para as escolas já cadastradas.

## Menu 3 — Turmas

SQL: [`sql/03_turmas.sql`](./sql/03_turmas.sql)

### `public.classes`

| Coluna | App (`siga_classes`) |
|--------|----------------------|
| `code` | `code` |
| `serie` | `serie` |
| `turno` | `turno` |
| `modalidade` | `modalidade` |
| `status` | `status` (`Ativo` / `Inativo`) |
| `year_label` | `anoLetivo` |
| `capacity` | capacidade (padrão 35) |

Único por escola: `(school_id, code, year_label)`.

## Menu 4 — Alunos

SQL: [`sql/04_alunos.sql`](./sql/04_alunos.sql)  
**Depende de** `03_turmas.sql` (`public.classes`).

### `public.students`

| Coluna | App (`siga_students`) |
|--------|----------------------|
| `codigo_inep` | `codigoInep` |
| `full_name` | `nome` |
| `cpf` | `cpf` |
| `serie` | `serie` |
| `class_code` / `class_id` | `turma` |
| `turno` | `turno` |
| `birth_date` | `dataNascimento` |
| `age` | `idade` |
| `email` | `email` |
| `password_hash` | `senha` (só hash) |
| `needs_password_set` | `precisaDefinirSenha` |
| `guardian_name` | `responsavel` |
| `guardian_contact` | `contato` |
| `school_route` | `rotaEscolar` |
| `status` | `status` |
| `attendance_pct` | `frequencia` |
| `avatar_url` | `avatar` |
| `class_history` | `classHistory` |

Trigger `sync_student_class_fields`: ao informar `class_id` ou `class_code`, alinha série/turno/turma e valida a mesma escola.

## Menu 5 — Frequência

SQL: [`sql/05_frequencia.sql`](./sql/05_frequencia.sql)  
**Depende de** `03_turmas.sql` e `04_alunos.sql`.

### `public.attendance_calls` (chamada do dia)

| Coluna | App (`siga_attendance_DATA_TURMA`) |
|--------|-------------------------------------|
| `class_code` + `day_date` | chave do localStorage |
| `entrada_consolidada` | `entrada.consolidado` |
| `saida_consolidada` | `saida.consolidado` |

Único por escola: `(school_id, class_code, day_date)`.

### `public.attendance_marks` (marcação por aluno)

| Coluna | App |
|--------|-----|
| `phase` | `entrada` / `saida` |
| `status` | `P` / `F` / `FJ` |
| `justification` | `justification` (obrigatório se FJ) |
| `student_id` | id do aluno |

Único: `(call_id, student_id, phase)`.

## Menu 7 — Agenda

SQL: [`sql/07_agenda.sql`](./sql/07_agenda.sql)

### `public.agenda_events`

| Coluna | App (`siga_agenda_events`) |
|--------|----------------------------|
| `title` | `title` |
| `event_type` | `type` |
| `event_date` | `date` |
| `description` | `desc` |
| `scope` | `geral` / `turmas` |
| `class_codes` | `turmas` (array de códigos) |

Tipos: `Provas & Testes`, `Entrega de Trabalho`, `Reunião de Pais`, `Evento Escolar`, `Feriado / Recesso`.

### `public.agenda_event_classes` (opcional)

Vínculo por UUID com `public.classes` (além dos códigos em `class_codes`).

## Menu 8 — Ocorrências

SQL: [`sql/08_ocorrencias.sql`](./sql/08_ocorrencias.sql)

### `public.occurrences`

| Coluna | App (`siga_occurrences`) |
|--------|--------------------------|
| `occurrence_type` | `tipo` / `type` |
| `student_name` / `student_id` | `aluno` / `student` |
| `class_code` | `turma` |
| `description` | `descricao` / `desc` |
| `occurrence_date` / `occurrence_time` | `data` / `hora` |
| `status` | `Em Análise` / `Tratado` / `Resolvida` |
| `return_date` | `dataRetorno` (suspensão) |
| `involved_people` | `envolvidos` |
| `source` | `manual` / `frequencia` |

## Menu 9 — Documentos da Secretaria

SQL: [`sql/09_documentos_secretaria.sql`](./sql/09_documentos_secretaria.sql)

### `public.secretary_documents`

| Coluna | App (`siga_documentos_secretaria`) |
|--------|-------------------------------------|
| `protocolo` | `protocolo` (único por escola) |
| `doc_type` | `tipo` |
| `status` | `pendente` / `concluido` |
| `student_*` | dados do aluno no documento |
| `issued_on` / `valid_until` | emissão + validade (30 dias nas declarações) |
| `attendance_pct` | frequência (Bolsa Família) |
| `vacancy_stage` / `vacancy_shift` | Declaração de Vaga |

Também cria `secretary_protocol_counters` + função `next_secretary_protocol(school_id, doc_type, year)`.

## Menu 10 — Usuários

SQL: [`sql/10_usuarios.sql`](./sql/10_usuarios.sql)

### `public.school_staff` (cadastro da tela Usuários)

| Coluna | App (`siga_users`) |
|--------|---------------------|
| `full_name` | `nome` |
| `email` | `email` (`@escola.seduc.pa.gov.br`) |
| `role` | `cargo` / `funcao` |
| `employee_id` | `matriculaSemVinculo` |
| `subject` | `disciplinaPrincipal` |
| `phone` | `telefone` |
| `social` | `redes` |
| `lattes_url` | `lattes` |
| `bio` | `bio` |
| `avatar_url` | `avatar` (JPEG otimizado ≤ ~180KB; upload ou câmera) |
| `status` | `Ativo` / `Inativo` |
| `user_id` | vínculo opcional com Auth |
| `password_hash` | senha definida no cadastro (hash) |
| `needs_password_set` | `false` quando a senha já foi definida |

Também enriquece `profiles` e `school_memberships`, e cria `map_staff_role_to_membership()`.

Na UI (`usuarios.html` / `js/usuarios.js`):
- **Senha + confirmação** obrigatórias no novo cadastro (mín. 6 caracteres); na edição, trocar senha é opcional.
- **Foto** por upload ou câmera: redimensionada (~512px) e comprimida em JPEG antes de salvar no banco (`avatar` / `avatar_url`).

## Menu 12 — Projeto Olímpico

SQL: [`sql/12_projeto_olimpico.sql`](./sql/12_projeto_olimpico.sql)

- `olympiads` — olimpíada (nome, site, datas, status, logo)
- `olympiad_entries` — inscrição (aluno, turma, origem admin/portal, medalha ouro/prata/bronze)

## Menu 13 — Boletins

SQL: [`sql/13_boletins.sql`](./sql/13_boletins.sql)

- `report_card_batches` — publicação por turma/ano/bimestre
- `report_cards` — metadados do PDF por aluno (`storage_path` no Storage; sem blob no Postgres)

## Menu 15 — Controle de Livros

SQL: [`sql/15_controle_livros.sql`](./sql/15_controle_livros.sql)

- `books` — acervo
- `book_loans` — empréstimos (ativo/atrasado/devolvido)
- `book_returns` — log rápido de devoluções

## Menu 17 — Meu Perfil

SQL: [`sql/17_meu_perfil.sql`](./sql/17_meu_perfil.sql)  
**Separado de Permissões.** Somente usuários/servidores (alunos não usam esta tela).

### Extensões em `public.profiles`

| Coluna | App |
|--------|-----|
| `phone` | telefone |
| `bio` | resumo profissional |
| `avatar_url` | foto única (sync com `school_staff.avatar_url`) |
| `two_factor_enabled` | 2FA on/off |
| `two_factor_method` | `app` \| `sms` |
| `password_changed_at` | hint “senha alterada há X dias” |

### `public.user_sessions`

Sessões ativas (dispositivo, navegador, local, `is_current`, `revoked_at`).  
Helpers: `mark_password_changed()`, `revoke_user_session()`.

Triggers mantêm **uma foto padrão** entre perfil e cadastro em Usuários.

## Menu 18 — Permissões

SQL: [`sql/18_permissoes.sql`](./sql/18_permissoes.sql)  
**Banco próprio**, independente do Meu Perfil. App hoje: `siga_user_permissions`.

| Tabela | Função |
|--------|--------|
| `permission_modules` | Catálogo dos menus (ids iguais ao JS) |
| `role_permission_defaults` | Padrão por cargo (`ver/criar/editar/excluir`) |
| `staff_permissions` | Override por colaborador (`school_staff`) |
| `permissions_meta` | Última alteração por escola |

Helpers: `upsert_role_default()`, `apply_role_defaults_to_staff()`, `touch_permissions_meta()`.

Seed global dos cargos (Diretor, Vices, Coordenador, Secretário, Professor, servidor) alinhado a `js/permissoes.js`.

## Escolas atuais

As 3 unidades já cadastradas em `public.schools` recebem automaticamente o ano letivo **2026** corrente.
