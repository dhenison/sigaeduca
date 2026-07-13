-- SIGA EDUCA — Ajuste de mapeamento de cargo Secretaria → membership
-- Execute se 10_usuarios.sql já tiver sido aplicado.

CREATE OR REPLACE FUNCTION public.map_staff_role_to_membership(p_role text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_role ILIKE 'Diretor%' THEN 'diretor'
    WHEN p_role ILIKE 'Vice-diretor%' THEN 'gestor'
    WHEN p_role ILIKE 'Coordenador%' THEN 'coordenador'
    WHEN p_role ILIKE 'Secretario%' OR p_role ILIKE 'secretaria%' THEN 'secretario'
    WHEN p_role ILIKE 'Professor%' THEN 'professor'
    ELSE 'servidor'
  END;
$$;
