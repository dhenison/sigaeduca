# PRD — SIGA EDUCA

**Tipo:** especificação as-built (o que o sistema faz hoje)  
**Data:** 21 set 2026  
**Produto:** SIGA EDUCA  
**Stack:** HTML/CSS/JS estático, Supabase (`digjzihjboflcuftmokj` / `sigaeduca`), Vercel  
**Tenant:** `school_id` → `public.schools`  
**Ano letivo corrente no cadastro:** 2026  
**Produção:** `https://sigaeduca.com`

Este documento lista regras, campos, fluxos, status e persistência. Não descreve visão, personas nem roadmap.

---

## 1. Superfícies

| Superfície | Entrada | Quem usa |
|---|---|---|
| Login único | `login.html` | Servidor, aluno, admin do sistema |
| Painel Admin | `paineladmin.html` | Só `is_system_admin` |
| Painel da escola | `painelprincipal.html` + menus | Servidores com escola ativa |
| Portal do aluno | `portal-aluno.html` + `/app/*` | Aluno (`@aluno.seduc.pa.gov.br`) |
| Validação pública | `validar-documento.html` | Qualquer pessoa com protocolo |
| Gestão de Lotação | `Gestão de Lotação/lotacao.html` | Servidor com permissão de Lotação |
| Reconhecimento facial | Flask `:5001` (PC da portaria) | Operador local; sync na Frequência |

Logout do painel redireciona para `login.html`.

---

## 2. Autenticação

### 2.1 Domínios e contas

| Tipo | E-mail | Destino pós-login |
|---|---|---|
| Aluno | `*@aluno.seduc.pa.gov.br` | `portal-aluno.html` |
| Servidor | `*@escola.seduc.pa.gov.br` | `painelprincipal.html` |
| Admin do sistema | `sigaeduca@escola.seduc.pa.gov.br` | `/paineladmin.html` (sempre; limpa escola ativa) |

E-mail fora desses padrões é rejeitado. Senha mínima no cadastro de servidor: 6 caracteres. Hash no cliente (`SigaSecurity`); senha em claro não vai para Postgres (`password_hash`).

Cadeia de login do servidor: Auth Supabase → RPC `staff_login_by_hash()` / `school_staff` → fallback `localStorage` (`siga_users`).

Cadeia de login do aluno: RPC cloud (`students`) → fallback `siga_students`. Aluno com status `Transferido` não entra no portal.

Sessão local: `siga_session` (`tipo`, `id`, `nome`, `email`, `role`, `schoolId`).

### 2.2 Recuperar acesso

Dois fluxos em `login.html`: **servidor** e **aluno**. Servidor: CPF + data de nascimento + matrícula sem vínculo. Aluno: dados do cadastro. Permite definir senha quando `precisaDefinirSenha` / `needs_password_set`.

### 2.3 Papéis de servidor (`school_staff.role` / `cargo`)

Usados em Permissões (`js/permissoes.js`):

- Administrador do Sistema / Diretor — todas as ações em todos os módulos
- Vice-diretor Administrativo
- Vice-diretor Pedagógico
- Coordenador
- Secretário / Secretaria
- Professor — sem Documentos Secretaria, Usuários, Lotação, Dados da Escola, Permissões, Painel Admin
- Demais (servidor genérico) — ver painel + perfil; demais módulos só `ver`

**Gestão Escolar** (Documentos Administrativos e Informativos): somente Diretor, Vice-diretor Administrativo, Vice-diretor Pedagógico e Administrador (não Vice).

Ações por módulo: `menu`, `ver`, `criar`, `editar`, `excluir`. Quem tem `ver` ganha `menu` por padrão (pode desmarcar depois).

### 2.4 Admin do sistema

`profiles.is_system_admin = true`. Não precisa de `school_memberships`. Cria/edita escolas. Botão **Acessar Painel** grava `profiles.school_id` + `siga_active_school` e abre o painel daquela unidade.

---

## 3. Multi-escola

Tabela `public.schools`:

| Campo | Regra |
|---|---|
| `nome` | Obrigatório |
| `inep` | Único, 8–12 dígitos (normalizado no trigger) |
| `status` | `Ativa` \| `Inativa` |
| `menu_permissions` | JSON das abas liberadas |
| `logo_url` | URL; data URL grande é descartada no cliente |
| extras | `cnpj`, `cep`, `bairro`, `municipio`, `uf` (2 letras), endereço, e-mail, telefone, diretor (nome/contato/e-mail), observações |

RLS: SELECT admin ou membro ativo; INSERT/UPDATE/DELETE de escolas só admin (gestor da unidade pode UPDATE da própria escola se membership `diretor` / `admin_escola` / `secretario` / `secretaria` / `gestor`).

Helper: `user_can_access_school(school_id)`. Toda tabela de negócio leva `school_id` + RLS nesse helper.

Escola ativa na UI: `localStorage.siga_active_school`. Cache de nome: `siga_school_name`.

`academic_years`: um ano por escola (`label`, `year_number`, `starts_on`, `ends_on`, `is_current`). Unidades já cadastradas recebem 2026 como corrente.

---

## 4. Menu do painel da escola

Sidebar em `painelprincipal.html`. Estado colapsado: `localStorage` + classe `sidebar-collapsed` (260px ↔ 72px). Dropdowns em acordeão (um grupo aberto por vez). `prefers-reduced-motion` zera transições.

| Grupo | Página | Módulo de permissão |
|---|---|---|
| (topo) | `painelprincipal.html` | `painelprincipal` |
| Administrativo | `calendarioletivo.html` | `calendarioletivo` |
| | `turmas.html` / `turmadetalhe.html` | `turmas` |
| | `alunos.html` | `alunos` |
| | `fichadoaluno.html` | `fichadoaluno` |
| | `frequencia.html` | `frequencia` |
| | `horariodeaula.html` | `horariodeaula` |
| | `agenda.html` | `agenda` |
| | `ocorrencias.html` | `ocorrencias` |
| | `documentossecretaria.html` | `documentossecretaria` |
| | `usuarios.html` | `usuarios` |
| | `Gestão de Lotação/lotacao.html` | `lotacao` |
| Gestão Escolar | `documentosadministrativos.html` | `documentosadministrativos` |
| | `informativos.html` | `informativos` |
| Pedagógico | `topodosaber.html` | `topodosaber` |
| | `solicitacoespedagogicas.html` | `solicitacoespedagogicas` |
| | `planejamento.html` | `planejamento` |
| | `boletins.html` | `boletins` |
| | `conselho.html` | `conselho` |
| | `controlelivros.html` | `controlelivros` |
| | `relatorios.html` | `relatorios` |
| Sistema | `meuperfil.html` | `meuperfil` |
| | `permissões.html` | `permissoes` |

`escola.html` (Dados da Escola) existe no catálogo de permissões, fora do grupo da sidebar listado acima; acesso pelo dashboard / dados da unidade.

---

## 5. Minha Escola (`painelprincipal.html` + `escola.html`)

Dashboard agrega dados locais da escola ativa:

- KPI alunos ativos (status ≠ Inativo)
- KPI turmas ativas
- Frequência média
- Ocorrências
- Documentos da secretaria
- Agenda (próximos eventos)
- Projeto Olímpico (olimpíadas + inscrições)

Buckets de modalidade no dashboard: Ensino Médio, EJA, Fluxo, Educação Especial.

`escola.html` edita o perfil da unidade (campos de `schools` + ano letivo).

Persistência: `schools`, `academic_years`; KPIs ainda leem `localStorage` (`siga_students`, `siga_classes`, `siga_occurrences`, `siga_agenda_events`, `siga_documentos_secretaria`, `siga_olimpiadas`, `siga_olimpiada_inscricoes`) com hidratação Supabase quando há sessão.

---

## 6. Calendário Letivo

Tabela `calendar_days`. Único por escola + data.

Tipos: `letivo`, `feriado_recesso`, `domingo`, `sabado_nao_letivo`, `evento`, `sabado` / `sabado_letivo`.

Regras:

- Domingo nunca é letivo nem editável.
- Sábados começam como não letivos; o usuário marca sábado letivo se quiser.
- Seed: maio/2026 dias úteis letivos; julho/2026 férias (`feriado_recesso`), com exceção `2026-07-24` forçada como letivo.

App: `siga_calendar_days` + sync `public.calendar_days`. Relatório de frequência só conta dia `letivo` ou `sabado_letivo`; sem calendário, usa segunda–sexta.

---

## 7. Turmas

Tabela `classes`. Único: `(school_id, code, year_label)`.

| Campo | Valores / regra |
|---|---|
| `code` | Ex.: `M1MNM01` |
| `serie` | Texto (PRIMEIRA, SEGUNDA, TERCEIRA, AEE, etc.) |
| `turno` | `Manhã` \| `Tarde` \| `Noite` \| `Integral` |
| `modalidade` | Livre; AEE quando código `EEMAE01` / `EETAE01` |
| `status` | `Ativo` \| `Inativo` |
| `year_label` | Padrão `2026` |
| `capacity` | Padrão 35; 1–200 |

Importação CSV/XLSX: `codigo;serie;turno;modalidade;status;anoLetivo`. Grava local **e** `public.classes` se houver sessão + escola ativa.

Turmas AEE não substituem a turma regular do aluno. Capacidade usada no painel para % de ocupação.

Detalhe (`turmadetalhe.html`): lista alunos da turma; professores da turma via RPC `turma_lotacao_rows` (disciplina + CH + professor; vaga = `SEM LOTAÇÃO`).

---

## 8. Alunos

Tabela `students`. Status: `Ativo` \| `Inativo` \| `Transferido`.

| Campo app | Coluna |
|---|---|
| `codigoInep` | `codigo_inep` (único por escola se preenchido) |
| `nome` | `full_name` |
| `cpf` | `cpf` (único por escola se preenchido) |
| `serie` / `turma` / `turno` | `serie`, `class_code` / `class_id`, `turno` |
| `dataNascimento` / `idade` | `birth_date`, `age` (0–120) |
| `email` | `email` (único por escola se preenchido; portal espera `@aluno.seduc.pa.gov.br`) |
| `senha` | `password_hash` |
| `precisaDefinirSenha` | `needs_password_set` |
| `responsavel` / `contato` | `guardian_name` / `guardian_contact` |
| `rotaEscolar` | `school_route` |
| `frequencia` | `attendance_pct` (0–100) |
| `avatar` | `avatar_url` |
| `classHistory` | `class_history` JSON |
| `aeeTurmas` | `aee_class_codes` + `student_aee_enrollments` |

Trigger `sync_student_class_fields`: ao setar `class_id`/`class_code`, alinha série/turno e valida a mesma escola.

**AEE:** catálogo `EEMAE01`, `EETAE01`. Vínculo paralelo; não apaga turma regular. Importação mescla linha regular + linha AEE do mesmo aluno num único registro.

**Troca de turma:** exige justificativa; grava histórico (`turmaAnterior`, justificativa, data).

**Transferência:** status `Transferido`, justificativa obrigatória, turma alvo de transferência / Integral conforme fluxo da UI; bloqueia portal.

Importação: preferir Turmas antes. Sync `public.students` + `student_aee_enrollments`.

Filtros na lista: turno, turma, busca. Ficha: `fichadoaluno.html` (mesmo cadastro + histórico + documentos vinculados).

---

## 9. Frequência

Uma chamada por `(school_id, class_code, day_date)` → `attendance_calls`.

Marcas → `attendance_marks`: único `(call_id, student_id, phase)`.

| Fase | Campo |
|---|---|
| `entrada` | `entrada_consolidada` |
| `saida` | `saida_consolidada` |

Status da marca: `P` (presente), `F` (falta), `FJ` (falta justificada). `FJ` exige `justification`.

Regras da tela:

- Colunas Entrada, Saída, Consolidado.
- Com reconhecimento facial: cada entrada consolida o aluno (P fechado); a saída daquele aluno só libera depois da entrada consolidada.
- Consolidação de fase trava edição; desbloqueio via `solicitarDesbloqueio(fase)` (lock individual: `sql/05b_frequencia_lock_individual.sql`).
- Consolidado final: presentes finais / ausentes finais.

Local: chave `siga_attendance_YYYY-MM-DD_CLASSCODE`.

Origem facial: batida na portaria cria/atualiza marca `P` (ver §18).

---

## 10. Horário de Aula

Página `horariodeaula.html`: grade horária e distribuição de aulas semanais por turma. Tabela SQL `class_schedules` prevista; persistência cloud ainda pendente no mapa de banco. Portal do aluno lê a grade em `app/apphorarios.html`.

Horários de **portaria** (entrada, limite sem atraso, saída) não ficam nesta tela: ficam no módulo facial (horário geral por turno + exceção por turma/data).

---

## 11. Agenda

`agenda_events` + `agenda_event_classes`.

| Campo | Valores |
|---|---|
| `event_type` | Provas & Testes; Entrega de Trabalho; Reunião de Pais; Evento Escolar; Feriado / Recesso |
| `scope` | `geral` (todas as turmas) ou `turmas` (lista `class_codes`) |
| `event_date` | Data |
| `description` | Texto |

Calendário UI preferencialmente 2026. Atividade global aparece para qualquer turma filtrada. Portal: `app/appagenda.html` mostra só o que cabe ao aluno (geral ou turma dele).

Local: `siga_agenda_events`.

---

## 12. Ocorrências

`occurrences`.

Tipos usados na UI: Indisciplina, Atraso, Evasão, Bullying, Suspensão, Agressão Física (e texto livre no cadastro).

Status: `Em Análise` (aceita `Em Analise`), `Tratado`, `Resolvida`.

Fonte (`source`): `manual` \| `frequencia` (evasão automática) \| `sistema`.

Campos: aluno (`student_id` / nome), turma, data, hora, descrição, envolvidos (JSON), `return_date` (suspensão), notas de tratamento, quem registrou.

Dashboard agrupa: Disciplinares, Atrasos, Justificadas, Outras.

Local: `siga_occurrences` + espelho `siga_student_occurrences`. Portal: `app/appocorrencias.html` (visão do aluno).

---

## 13. Documentos da Secretaria

`secretary_documents`. Protocolo único por escola. Função `next_secretary_protocol(school_id, doc_type, year)` → `SEC-{DEC|REQ}-{ano}-{12 chars}`.

Validade das declarações: **30 dias**. Requerimentos não expiram (`valid_until` nulo).

### Declarações (status inicial `concluido`)

| Tipo | Extra |
|---|---|
| Declaração de Matrícula | Aluno obrigatório; cidade/UF nascimento |
| Declaração de Frequência (Bolsa Família) | % frequência obrigatória |
| Declaração de Escolaridade | Aluno + nascimento |
| Declaração de Vaga | Sem aluno; exige etapa e turno da vaga |
| Declaração de Transferência | Aluno; gera também Requerimento de Transferência |
| Atestado de Conclusão | Nome pode ser digitado sem `student_id`; mãe/pai; ano letivo |

### Requerimentos (status inicial `pendente`)

- Requerimento de 2ª Via de Diploma
- Requerimento de 2ª Via de Histórico Escolar
- Requerimento de Transferência (serviço impresso: Histórico Escolar)
- Requerimento de Histórico e Diploma

Status: `pendente` \| `concluido` \| `cancelado`. Secretaria altera status na lista de requerimentos.

Impressão/comprovante na própria tela. QR / link público: `validar-documento.html?protocolo=...` (consulta por protocolo, sem login).

Atestado de Conclusão e Declaração de Vaga não exigem aluno do cadastro.

Não usa Google Drive. Persistência: Supabase (+ cache `siga_documentos_secretaria`).

---

## 14. Usuários (servidores)

`school_staff`.

| Campo | Regra |
|---|---|
| `email` | `@escola.seduc.pa.gov.br` |
| `role` | cargo/função (ver §2.3) |
| `employee_id` | matrícula sem vínculo |
| `subject` | disciplina principal |
| `phone`, `social`, `lattes_url`, `bio` | opcionais |
| `avatar_url` | JPEG redimensionado ~512px, ≤ ~180 KB; upload ou câmera |
| `status` | `Ativo` \| `Inativo` |
| `user_id` | vínculo Auth opcional |
| `password_hash` / `needs_password_set` | senha no cadastro; edição de senha opcional |

RPCs: `staff_login_by_hash()`, `link_staff_auth_user()`, `map_staff_role_to_membership()`.

Local: `siga_users`. Foto única sincronizada com `profiles.avatar_url` (Meu Perfil).

---

## 15. Gestão de Lotação

Módulo separado (`Gestão de Lotação/`). Voltar: `painelprincipal.html`.

Views internas:

1. Dashboard — total de turmas, disciplinas sem professor, CH loteada
2. Mapa de Lotações — turma × disciplina × CH × professor (vaga vazia permitida)
3. Cadastro de Professores
4. Professores (consulta)
5. Disciplinas
6. Ficha de Lotação
7. Ficha de Desistência
8. Relatórios (export XLSX/PDF)

Cadastro professor: `nome`, `matricula` (única por escola), `matricula_dv`, `cargo` `PROFESSOR`/`PROFESSORA`, `vinculo` `EFETIVO`/`TEMPORÁRIO`, `setor`, `ch_referencia` 0–80, status Ativo/Inativo. `staff_id` opcional para ligar a Usuários.

Alocação: `lotacao_alocacoes` (turma, disciplina, CH, professor nullable). RPC `turma_lotacao_rows` alimenta o detalhe da turma no SIGA.

Local legado: `lotacao_data`, `professores_cadastro`. SQL: `19_lotacao.sql`, `19b_minha_lotacao.sql`, `19c_turma_lotacao.sql`, `19d_lotacao_replace_mapa.sql`.

Cabeçalho fixo da unidade de referência no HTML: EE Dr Romildo Veloso e Silva · URE 22A Xinguara · Ourilândia do Norte · 2026.

---

## 16. Documentos Administrativos (Gestão Escolar)

`admin_school_documents`. Acesso só gestor (§2.3). Não usa Drive.

### Implementados

| Tipo | Numeração |
|---|---|
| Requerimento Padrão | Pedidos oficiais (lista abaixo) |
| Ofício | Sequência a partir de 35 |
| Memorando | Sequência a partir de 47 |

Remetente padrão do ofício/memorando: Escola Estadual Dr Romildo Veloso e Silva.

Pedidos do Requerimento Padrão (grupos):

- Cadastro e vínculos: atualização cadastral, averbação, cópia de contrato, cópia de processo (nº), distrato, declaração de tempo de serviço, gratificação de titularidade, portaria de estágio probatório, revisão de pagamento, verbas rescisórias, remoção, lotação, auxílio funeral
- Licenças e afastamentos: férias (período), licença especial/sem vencimento/aprimoramento (período), licença saúde, perícia médica, redução de jornada (Lei 9.313/2021)
- Outros: pecúnia, readaptação, exoneração (data), acompanhante PCD (Lei 13.146/2015), outro (texto)

### Placeholder na UI (`ready: false`)

ATA Conselho, ATA Administrativa, ATA de Conselho Escolar, PAF, Termo de Autorização, Frequência Guardas, Frequência SEMED, Frequência Professores, Folha de Ponto.

Histórico filtrável: tipo, usuário, data, requerente. Impressão na tela.

Local: `siga_documentos_administrativos`, `siga_adm_doc_counters`.

---

## 17. Informativos (Gestão Escolar)

`portal_informativos`. Só gestores criam/editam. Aluno lê no portal via RPC (anon/authenticated definer).

| Campo | Valores |
|---|---|
| `layout` | `texto` \| `imagem` \| `texto_imagem` \| `imagem_texto` |
| `audience` | `todos` \| `turmas` (`class_codes`) |
| `status` | `rascunho` \| `publicado` \| `arquivado` |
| `image_data` | Data URL JPEG/PNG; máximo ~900 KB no cliente |
| `expires_at` | Opcional |

Obrigatório ter texto **ou** imagem. Portal: `app/appinformativos.html`. Local: `siga_portal_informativos`.

---

## 18. Projeto Olímpico

`olympiads` + `olympiad_entries`.

Olimpíada: nome, site, `starts_on`, `registration_deadline` (≥ início), extras, logo, ícone.

Status: `Inscrições` \| `Em andamento` \| `Encerrada` \| `Resultados`.

Inscrição: aluno, turma, origem `admin` ou `portal`, medalha ouro/prata/bronze.

Telas: `topodosaber.html` (gestão), `app/topodosaber.html` e `app/detalheolimpiada.html` (aluno).

Local: `siga_olimpiadas`, `siga_olimpiada_inscricoes`.

---

## 19. Solicitações Pedagógicas

Tipos:

- Impressão de Atividade
- Impressão de Teste
- Agendar Chromebooks
- Agendar Auditório

Arquivo sobe pela Edge Function `drive-upload-file` para o Drive da conta dona da pasta `SIGAEDUCA`:

```
SIGAEDUCA/SOLICITAÇÕES PEDAGÓGICAS/{NOME DO PROFESSOR}/{tipo}/arquivo
```

Pastas reutilizadas. Arquivo tentado como “qualquer pessoa com o link”. Professor **não** faz login Google.

Metadados ficam no app (local). Secretaria/Documentos Admin **não** usam Drive.

---

## 20. Planejamento

Dois fluxos → Drive (`PLANO DE AULA` / `PLANEJAMENTO BIMESTRAL`).

Áreas BNCC no formulário:

| Área | Componentes | Eixos (exemplos) |
|---|---|---|
| Linguagens | Língua Portuguesa, Arte, Educação Física, Inglês, Espanhol | Leitura, Produção, Oralidade, Análise linguística |
| Matemática | Matemática | Números e Álgebra, Geometria, Probabilidade |
| Ciências da Natureza | Biologia, Física, Química, Ciências | Matéria e energia, Vida e evolução, Terra e Universo |
| Ciências Humanas | História, Geografia, Filosofia, Sociologia | Tempo e espaço, Território e poder, Indivíduo/sociedade |

Plano de aula (campos): DRE (padrão “DRE — Pará”), município, escola, localidade, professor, ano, duração (padrão 2 aulas), área, componente, turma, data, princípios, eixos, competências, habilidades, objeto, expectativas, estratégias.

Apoio local (PDF/DOCX): Coerência Pedagógica, Documento Curricular, template Plano de Aula, ementas por área.

Local: `siga_planejamento_docs`.

---

## 21. Boletins

`report_card_batches` (turma + ano + bimestre) + `report_cards` (PDF por aluno).

Status do lote: `Rascunho` \| `Publicado` \| `Arquivado`. Único `(school_id, class_code, year_label, term_label)`.

PDF: Storage (`storage_path`); **não** blob no Postgres. Cliente também guarda em IndexedDB `siga_boletins_db`.

Importação: PDF SEDUC; agrupa páginas pelo código INEP da linha `ALUNO:`.

Local de status: `siga_boletim_status`, `siga_boletim_meta`. Portal do aluno consome o boletim publicado da sua turma/bimestre quando existir.

---

## 22. Conselho de Classe

Página `conselho.html` existe no menu e no catálogo de permissões. UI de atas, filtros e tabela de alunos **com dados de exemplo no HTML**, sem persistência em tabela `class_councils` (SQL ainda pendente). Tratar como tela não operacional até haver gravação real.

---

## 23. Controle de Livros

`books`, `book_loans`, `book_returns`.

Livro: título, autor, categoria, ISBN (único por escola se preenchido).

Empréstimo: aluno, data, prazo padrão **+14 dias**, status ativo / atrasado / devolvido. Devolução registra log em `book_returns`.

Local: `siga_books` (loan embutido), `siga_book_returns`.

---

## 24. Relatórios

Hub `relatorios.html`. Filtros de categoria e formato PDF/Excel no cabeçalho.

| Relatório | Estado |
|---|---|
| Frequência Consolidada | Operacional |
| Aproveitamento Acadêmico | UI “Em breve” |
| Taxa de Evasão | UI “Em breve” |
| Relatório de Ocorrências | UI “Em breve” |
| Alocação de Docentes | UI “Em breve” |

Frequência Consolidada: turno, turma, período (mês/intervalo). Só dias letivos. Colunas presença/falta/% no período. Exportar PDF (impressão) e Excel depois de gerar.

---

## 25. Meu Perfil

Só servidor. Aluno usa `app/appperfil.html`.

`profiles`: telefone, bio, avatar (sync com `school_staff`), `two_factor_enabled`, `two_factor_method` `app` \| `sms`, `password_changed_at`.

`user_sessions`: dispositivo, navegador, local, `is_current`, `revoked_at`. Helpers `mark_password_changed()`, `revoke_user_session()`.

Local também grava `siga_profile_*` (nome, e-mail, telefone, cargo, 2FA, bio, senha alterada).

---

## 26. Permissões

Banco próprio, separado do perfil.

| Tabela | Função |
|---|---|
| `permission_modules` | IDs iguais ao JS (`painelprincipal`, `turmas`, …) |
| `role_permission_defaults` | Padrão por cargo (`ver/criar/editar/excluir` + `menu`) |
| `staff_permissions` | Override por colaborador |
| `permissions_meta` | Última alteração por escola |

Helpers: `upsert_role_default()`, `apply_role_defaults_to_staff()`, `touch_permissions_meta()`.

UI: seleciona usuário, matriz módulo × ação, busca. Local: `siga_user_permissions`, `siga_permissions_meta`. Sidebar esconde hrefs sem `menu`.

---

## 27. Portal do aluno

Nav inferior: Início, Frequência, Horários, Perfil.

Cards no início: Informativos, Frequência, Horários, Agenda, Ocorrências.

Telas extras: `app/appinformativos.html`, `app/appagenda.html`, `app/appocorrencias.html`, `app/topodosaber.html`, `app/detalheolimpiada.html`.

Tema claro/escuro e cor de destaque persistidos em `siga_portal_prefs`. Frase motivacional sorteada por dia.

E-mail de sessão sempre normalizado para `@aluno.seduc.pa.gov.br`.

---

## 28. Reconhecimento facial (portaria)

App Flask + dlib no PC central (porta 5001). Aluno **já existe** no SIGA; aqui só foto facial. Matrícula facial = `codigo_inep`.

| URL | Função |
|---|---|
| `/admin/login` | Login admin local |
| `/admin/dashboard` | Buscar aluno SIGA + salvar foto |
| `/admin/turmas` | Entradas, ausentes, liberar saída antecipada |
| `/admin/horarios` | Horário geral por turno + exceção turma/data |
| `/stations` | Atalhos estações 1–4 |
| `/punch2?station=N` | Webcam da estação |
| `POST /punch` | Batida; sync em background |

Horário geral: Manhã, Tarde, Noite — entrada, limite sem atraso, saída. Entrada após o limite = atraso. Saída antes do horário = antecipada. Exceção vale só na data/turma.

Anti-duplicação: `PUNCH_DEDUP_SECONDS`. Sync → `attendance_marks` (P). `.env` no PC central: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_SCHOOL_ID`. PC cliente só abre o monitor no IP do central.

Windows: `iniciar.bat` / `parar.bat`; opcional inicialização automática.

---

## 29. Persistência (mapa)

| Chave local | Tabela / destino |
|---|---|
| `siga_active_school` | contexto UI |
| `siga_session` | sessão |
| `siga_users` | `school_staff` |
| `siga_students` | `students` |
| `siga_classes` | `classes` |
| `siga_calendar_days` | `calendar_days` |
| `siga_attendance_*` | `attendance_calls` / `attendance_marks` |
| `siga_agenda_events` | `agenda_events` |
| `siga_occurrences` | `occurrences` |
| `siga_documentos_secretaria` | `secretary_documents` |
| `siga_documentos_administrativos` | `admin_school_documents` |
| `siga_portal_informativos` | `portal_informativos` |
| `siga_olimpiadas` / `siga_olimpiada_inscricoes` | `olympiads` / `olympiad_entries` |
| `siga_books` / `siga_book_returns` | `books` / `book_loans` / `book_returns` |
| `siga_boletim_*` + IndexedDB | `report_card_batches` / `report_cards` + Storage |
| `siga_user_permissions` | `staff_permissions` |
| `siga_planejamento_docs` | Drive + metadados locais |
| Solicitações pedagógicas | Drive + metadados locais |
| Lotação (`lotacao_data`, `professores_cadastro`) | `lotacao_professores` / `lotacao_alocacoes` |

Padrão atual: UI ainda usa localStorage como cache; módulos com SQL pronto sincronizam quando há sessão Supabase e escola ativa. Salvamento de escola no Painel Admin **não** cai só no localStorage se a sessão falhar.

Config local não versionada: `js/siga-config.local.js`.

---

## 30. Integrações

| Integração | Uso |
|---|---|
| Supabase Auth | Login servidor/admin; RLS |
| Supabase Postgres | Dados por escola |
| Supabase Storage | PDFs de boletim; assets |
| Edge Function `drive-upload-file` | Solicitações pedagógicas e planejamento (OAuth da conta dona de `SIGAEDUCA`) |
| Flask portaria | Face → frequência |
| Vercel | Host estático (`vercel.json`) |

Secrets Drive (somente estes): `GOOGLE_DRIVE_ROOT_FOLDER_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN`. Sem service account no Meu Drive.

Service role **nunca** no front; só no PC da portaria e no backend.

---

## 31. Telas / relatórios sem implementação completa

- Conselho de Classe: HTML estático com alunos fictícios
- Relatórios: só Frequência Consolidada gera dado
- Documentos administrativos: 9 tipos `ready: false` (§16)
- Horário de Aula: página no menu; `class_schedules` ainda pendente no mapa SQL da escola
- Storage de logo por tenant (`school-assets/{school_id}/logo.png`) descrito como futuro

---

## 32. Restrições

- Dados de menores: LGPD; não publicar sem Auth, RLS, política de privacidade e base legal.
- Isolamento por `school_id` em toda entidade de negócio.
- Senha de aluno/servidor: hash; portal do aluno não usa `meuperfil.html`.
- Admin do sistema sempre escolhe escola no Painel Admin antes de operar.
- Gestão de Lotação é parte do produto; não misturar cadastro de professor da lotação com `school_staff`, salvo `staff_id` opcional.
