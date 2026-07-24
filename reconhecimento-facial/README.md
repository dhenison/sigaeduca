# Reconhecimento Facial — Portaria SIGA EDUCA

Estação local de ponto por face (Flask + dlib).  
**Alunos já existem no SIGA** — aqui só se salva a foto facial e a batida sobe
automaticamente como Presença (P) na Frequência (`attendance_marks`).

## Estrutura

```
main.py                 # App Flask (entrada) + worker de sync
app/
  models.py             # User (face local), Ponto (+ sync)
  admin/                # Login, dashboard, enroll (busca aluno SIGA)
  punch/                # API /punch + telas push2/stations
  sync/                 # Sync automático → attendance_marks
static/
  js/                   # admin-dashboard.js, push2-punch.js
  uploads/              # Fotos de cadastro (local)
templates/
  admin/                # login.html, dashboard.html
  push2.html            # Monitor de reconhecimento
  stations.html         # Atalhos Estações 1–4
tests/
.env.example
INTEGRACAO.md
```

## Telas em uso

| URL | Função |
|-----|--------|
| `/admin/login` | Login admin |
| `/admin/dashboard` | Buscar aluno SIGA + salvar foto facial |
| `/admin/turmas` | Acompanhar entradas, ausentes e liberar saída antecipada |
| `/admin/horarios` | Configurar horários gerais e exceções por turma/data |
| `/stations` | Abrir 4 estações (PC central / cliente) |
| `/punch2?station=N` | Monitor por webcam (N = 1…4) |
| `POST /punch` | API de batida (sync automático em background) |

## PC central vs cliente

1. **PC central:** rode `iniciar.bat` (pasta do projeto + `.env`).
2. **PC cliente:** só navegador → `http://IP-DO-CENTRAL:5001/punch2?station=3` (e `4`).
3. Anti-duplicação: `PUNCH_DEDUP_SECONDS`.
4. Sync automático na batida + worker periódico (admin = retry).

## Configuração

Copie `.env.example` → `.env` (detalhes em `INTEGRACAO.md`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (só no PC central)
- `SUPABASE_SCHOOL_ID`
- `PUNCH_DEDUP_SECONDS` (opcional)

Matrícula facial = `codigo_inep` do aluno **já cadastrado** no SIGA.

## Horários das turmas

A aba **Horários** trabalha com duas regras:

1. **Horário geral por turno:** Manhã, Tarde e Noite. Ele é aplicado automaticamente a todas as turmas daquele turno.
2. **Horário diferente em um dia:** informe a data, escolha a turma e defina os horários. Essa exceção vale somente para a turma e data selecionadas; nos demais dias, volta a valer o horário geral do turno.

Cada regra possui horário de entrada, limite para entrada sem atraso e horário de saída. Entradas posteriores ao limite são marcadas como atrasadas; saídas anteriores ao horário são identificadas como antecipadas.

## Rodar local

No Windows, de dois cliques em `iniciar.bat`. O inicializador:

- inicia o servidor em segundo plano;
- aguarda o reconhecimento facial ficar realmente pronto;
- abre `http://127.0.0.1:5001/` no navegador;
- apenas abre a pagina quando o servidor ja estiver em execucao.

Para encerrar o servidor iniciado dessa forma, execute `parar.bat`.

### Deixar iniciado junto com o Windows

Execute uma unica vez `instalar-inicializacao-automatica.bat`. Nos proximos acessos ao Windows, o servidor sera iniciado automaticamente e bastara abrir `http://127.0.0.1:5001/`.

Para desfazer essa configuracao, execute `remover-inicializacao-automatica.bat`.

> Uma pagina do navegador nao pode iniciar um arquivo `.bat` por seguranca do proprio navegador. A inicializacao junto com o Windows permite que a pagina seja aberta diretamente, pois o servidor ja estara ativo.

### Execucao manual

```powershell
.\iniciar.bat
```
