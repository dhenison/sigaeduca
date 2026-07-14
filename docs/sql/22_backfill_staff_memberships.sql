-- SIGA EDUCA — Backfill school_memberships + profiles.school_id
-- Quando Auth foi criado via service_role sem link_staff_auth_user (auth.uid nulo),
-- school_staff.user_id fica preenchido mas o RLS (user_can_access_school) bloqueia dados.
--
-- Rodar no SQL Editor se necessário (já aplicado no projeto digjzihjboflcuftmokj).

WITH missing AS (
  SELECT s.id AS staff_id, s.user_id, s.school_id, s.email, s.full_name, s.role,
         public.map_staff_role_to_membership(s.role) AS membership_role
  FROM public.school_staff s
  WHERE s.user_id IS NOT NULL
    AND s.school_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.school_memberships m
      WHERE m.user_id = s.user_id AND m.school_id = s.school_id
    )
),
ins_m AS (
  INSERT INTO public.school_memberships (school_id, user_id, role, is_active, staff_id, status)
  SELECT school_id, user_id, membership_role, true, staff_id, 'Ativo'
  FROM missing
  RETURNING user_id
),
upd_p AS (
  INSERT INTO public.profiles (id, email, full_name, role, school_id, is_system_admin)
  SELECT user_id, email, full_name, role, school_id, false
  FROM missing
  ON CONFLICT (id) DO UPDATE
  SET
    email = COALESCE(EXCLUDED.email, public.profiles.email),
    full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
    role = COALESCE(EXCLUDED.role, public.profiles.role),
    school_id = COALESCE(public.profiles.school_id, EXCLUDED.school_id)
  RETURNING id
)
SELECT
  (SELECT count(*) FROM missing) AS missing_before,
  (SELECT count(*) FROM ins_m) AS memberships_created,
  (SELECT count(*) FROM upd_p) AS profiles_upserted;
