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

## Rodar local

```powershell
.\iniciar.bat
```
