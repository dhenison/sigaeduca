# Integração facial ↔ SIGA EDUCA (Frequência)

## Modelo

Os **alunos já existem** no SIGA (`students` no Supabase).

O reconhecimento facial **não cadastra aluno de novo**. Ele só:

1. Busca o aluno no SIGA (matrícula = `codigo_inep`)
2. **Salva a foto + encoding** no SQLite local
3. Usa essa face no Punch2 (ENTRADA / SAÍDA)
4. Sobe automaticamente **Presença (P)** em `attendance_marks` (`entrada` ou `saida`)

Servidores (Professor / Gestão / Portaria) ficam só no ponto local — não entram na Frequência de alunos.

## Como abrir o facial

1. Preencha o `.env` (abaixo)
2. Rode `iniciar.bat`
3. Abra http://127.0.0.1:5001/

| Tela | URL |
|------|-----|
| Hub | http://127.0.0.1:5001/ |
| Estações | http://127.0.0.1:5001/stations |
| Monitor | http://127.0.0.1:5001/punch2?station=1 |
| Admin (cadastro de face) | http://127.0.0.1:5001/admin/login |

## Configurar `.env` (PC central)

```env
SUPABASE_URL=https://digjzihjboflcuftmokj.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...   # Project Settings → API → service_role (só no servidor)
SUPABASE_SCHOOL_ID=...          # UUID da escola em public.schools
```

- `SERVICE_ROLE_KEY`: **nunca** no frontend / Git
- `SCHOOL_ID`: no painel SIGA (escola ativa) ou tabela `schools`

## Fluxo operacional

```
SIGA (aluno já cadastrado)
        │
        ▼
Admin facial → Turma → Aluno no SIGA → capturar foto
        │
        ├─► SQLite local (encoding + foto)
        └─► SIGA online (avatar_url na ficha)
        │
        ▼
Punch2 reconhece → ENTRADA ou SAÍDA (SQLite)
        │
        ▼ sync automático (+ worker a cada ~45s se offline)
        ▼
Supabase attendance_calls + attendance_marks (status P)
        │
        ▼
frequencia.html (lê Supabase) → Consolidar Entrada/Saída (regras do SIGA)
```

## Cadastro de face (admin)

1. Tipo: **Aluno**
2. Selecione a **Turma** (lista online do SIGA)
3. Selecione o **Aluno** da turma
4. Capture a foto e salve

Ao salvar:
- encoding + foto ficam no **SQLite local** (reconhecimento)
- a mesma foto atualiza o **`avatar_url`** na ficha individual do aluno no SIGA online

Se o INEP já tiver face local, a foto é **atualizada** nos dois lados.

## Frequência no SIGA

Com login Supabase, a tela Frequência carrega `attendance_marks`.  
Cada **ENTRADA** facial vira marca `phase=entrada` com status **P**.  
Cada **SAÍDA** facial vira marca `phase=saida` com status **P**.  
Consolidação Entrada/Saída/Dia continua pelos botões da Frequência.

## Independência (local + online)

- O app facial roda **só no PC local** (porta 5001)
- Batida **sempre** grava no SQLite, mesmo sem internet
- Sync dispara **na hora** da batida; se falhar, fica `pending`/`error`
- Worker periódico (~45s) reenvia sozinho ao voltar a rede
- Cadastro facial e frequência online ficam integrados; o reconhecimento em si permanece local
