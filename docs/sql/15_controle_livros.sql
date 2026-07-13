-- SIGA EDUCA — Menu 15: Controle de Livros
-- Projeto: digjzihjboflcuftmokj (sigaeduca)
-- Execute no SQL Editor do Supabase
-- Pré-requisitos: schools, students, user_can_access_school()
-- App hoje: siga_books (com loan embutido) + siga_book_returns

-- =========================================================
-- 1) Acervo  →  public.books
-- =========================================================

CREATE TABLE IF NOT EXISTS public.books (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  title text NOT NULL,
  author text NOT NULL,
  category text,
  isbn text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT books_title_not_blank CHECK (length(btrim(title)) > 0),
  CONSTRAINT books_author_not_blank CHECK (length(btrim(author)) > 0)
);

COMMENT ON TABLE public.books IS 'Acervo da biblioteca escolar';
COMMENT ON COLUMN public.books.title IS 'titulo no app';
COMMENT ON COLUMN public.books.author IS 'autor no app';
COMMENT ON COLUMN public.books.category IS 'categoria no app';

CREATE INDEX IF NOT EXISTS books_school_idx ON public.books (school_id);
CREATE INDEX IF NOT EXISTS books_title_idx ON public.books (school_id, lower(title));
CREATE INDEX IF NOT EXISTS books_isbn_idx ON public.books (school_id, isbn);

CREATE UNIQUE INDEX IF NOT EXISTS books_school_isbn_unique
  ON public.books (school_id, isbn)
  WHERE isbn IS NOT NULL AND btrim(isbn) <> '';

DROP TRIGGER IF EXISTS trg_books_updated ON public.books;
CREATE TRIGGER trg_books_updated
  BEFORE UPDATE ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_book_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.title := btrim(NEW.title);
  NEW.author := btrim(NEW.author);
  NEW.category := NULLIF(btrim(COALESCE(NEW.category, '')), '');
  NEW.isbn := NULLIF(btrim(COALESCE(NEW.isbn, '')), '');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_books_sync ON public.books;
CREATE TRIGGER trg_books_sync
  BEFORE INSERT OR UPDATE ON public.books
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_book_fields();

ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS books_select ON public.books;
DROP POLICY IF EXISTS books_insert ON public.books;
DROP POLICY IF EXISTS books_update ON public.books;
DROP POLICY IF EXISTS books_delete ON public.books;

CREATE POLICY books_select ON public.books
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY books_insert ON public.books
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY books_update ON public.books
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY books_delete ON public.books
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.books TO authenticated;

-- =========================================================
-- 2) Empréstimos  →  public.book_loans
-- (no app o loan fica dentro do livro; aqui é tabela própria)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.book_loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  student_name text NOT NULL,
  student_class_code text,
  borrowed_on date NOT NULL DEFAULT CURRENT_DATE,
  due_on date NOT NULL,
  returned_on date,
  status text NOT NULL DEFAULT 'ativo',
  renewed_count integer NOT NULL DEFAULT 0,
  notes text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_loans_name_not_blank CHECK (length(btrim(student_name)) > 0),
  CONSTRAINT book_loans_dates_chk CHECK (due_on >= borrowed_on),
  CONSTRAINT book_loans_return_chk CHECK (returned_on IS NULL OR returned_on >= borrowed_on),
  CONSTRAINT book_loans_status_chk CHECK (
    status = ANY (ARRAY['ativo'::text, 'devolvido'::text, 'atrasado'::text, 'cancelado'::text])
  ),
  CONSTRAINT book_loans_renewed_chk CHECK (renewed_count >= 0)
);

COMMENT ON TABLE public.book_loans IS 'Empréstimos de livros (loan do app)';
COMMENT ON COLUMN public.book_loans.borrowed_on IS 'dataEmprestimo / dataPedido';
COMMENT ON COLUMN public.book_loans.due_on IS 'dataLimite';
COMMENT ON COLUMN public.book_loans.returned_on IS 'data de devolução';

-- No máximo um empréstimo ativo por livro
CREATE UNIQUE INDEX IF NOT EXISTS book_loans_one_active_per_book
  ON public.book_loans (book_id)
  WHERE status = 'ativo' AND returned_on IS NULL;

CREATE INDEX IF NOT EXISTS book_loans_school_idx ON public.book_loans (school_id);
CREATE INDEX IF NOT EXISTS book_loans_book_idx ON public.book_loans (book_id);
CREATE INDEX IF NOT EXISTS book_loans_student_idx ON public.book_loans (student_id);
CREATE INDEX IF NOT EXISTS book_loans_status_idx ON public.book_loans (school_id, status);
CREATE INDEX IF NOT EXISTS book_loans_due_idx ON public.book_loans (school_id, due_on);

DROP TRIGGER IF EXISTS trg_book_loans_updated ON public.book_loans;
CREATE TRIGGER trg_book_loans_updated
  BEFORE UPDATE ON public.book_loans
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_book_loan_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  bk public.books%ROWTYPE;
  st public.students%ROWTYPE;
BEGIN
  SELECT * INTO bk FROM public.books WHERE id = NEW.book_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Livro % não encontrado', NEW.book_id;
  END IF;
  NEW.school_id := bk.school_id;
  NEW.student_name := btrim(NEW.student_name);

  IF NEW.student_id IS NOT NULL THEN
    SELECT * INTO st FROM public.students WHERE id = NEW.student_id;
    IF FOUND THEN
      IF st.school_id <> NEW.school_id THEN
        RAISE EXCEPTION 'Aluno e livro de escolas diferentes';
      END IF;
      NEW.student_name := COALESCE(NULLIF(NEW.student_name, ''), st.full_name);
      NEW.student_class_code := COALESCE(
        NULLIF(btrim(COALESCE(NEW.student_class_code, '')), ''),
        st.class_code
      );
    END IF;
  END IF;

  -- Status derivado
  IF NEW.returned_on IS NOT NULL THEN
    NEW.status := 'devolvido';
  ELSIF NEW.status = 'ativo' AND NEW.due_on < CURRENT_DATE THEN
    NEW.status := 'atrasado';
  END IF;

  IF TG_OP = 'INSERT' THEN
    NEW.created_by := COALESCE(NEW.created_by, auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_book_loans_sync ON public.book_loans;
CREATE TRIGGER trg_book_loans_sync
  BEFORE INSERT OR UPDATE ON public.book_loans
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_book_loan_fields();

ALTER TABLE public.book_loans ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS book_loans_select ON public.book_loans;
DROP POLICY IF EXISTS book_loans_insert ON public.book_loans;
DROP POLICY IF EXISTS book_loans_update ON public.book_loans;
DROP POLICY IF EXISTS book_loans_delete ON public.book_loans;

CREATE POLICY book_loans_select ON public.book_loans
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY book_loans_insert ON public.book_loans
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY book_loans_update ON public.book_loans
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY book_loans_delete ON public.book_loans
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.book_loans TO authenticated;

-- =========================================================
-- 3) Histórico rápido de devoluções  →  public.book_returns
-- (espelha siga_book_returns; opcional — book_loans.returned_on já cobre)
-- =========================================================

CREATE TABLE IF NOT EXISTS public.book_returns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  loan_id uuid REFERENCES public.book_loans(id) ON DELETE SET NULL,
  book_title text NOT NULL,
  student_name text,
  returned_on date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_returns_title_not_blank CHECK (length(btrim(book_title)) > 0)
);

COMMENT ON TABLE public.book_returns IS 'Log rápido das últimas devoluções (siga_book_returns)';

CREATE INDEX IF NOT EXISTS book_returns_school_idx
  ON public.book_returns (school_id, returned_on DESC);

ALTER TABLE public.book_returns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS book_returns_select ON public.book_returns;
DROP POLICY IF EXISTS book_returns_insert ON public.book_returns;
DROP POLICY IF EXISTS book_returns_update ON public.book_returns;
DROP POLICY IF EXISTS book_returns_delete ON public.book_returns;

CREATE POLICY book_returns_select ON public.book_returns
  FOR SELECT TO authenticated
  USING (public.user_can_access_school(school_id));

CREATE POLICY book_returns_insert ON public.book_returns
  FOR INSERT TO authenticated
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY book_returns_update ON public.book_returns
  FOR UPDATE TO authenticated
  USING (public.user_can_access_school(school_id))
  WITH CHECK (public.user_can_access_school(school_id));

CREATE POLICY book_returns_delete ON public.book_returns
  FOR DELETE TO authenticated
  USING (public.user_can_access_school(school_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.book_returns TO authenticated;

-- Conferência:
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('books', 'book_loans', 'book_returns');
