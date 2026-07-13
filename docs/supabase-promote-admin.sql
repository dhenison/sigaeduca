-- Promover Administrador do Sistema (rode no SQL Editor do Supabase)
-- Substitua o e-mail pelo usuário criado em Authentication → Users

UPDATE public.profiles
SET is_system_admin = true,
    role = 'Administrador do Sistema',
    full_name = 'Administrador do Sistema',
    updated_at = now()
WHERE lower(email) = lower('admin@escola.seduc.pa.gov.br');

-- Conferência (não retorna a senha):
SELECT id, email, role, is_system_admin, created_at
FROM public.profiles
WHERE is_system_admin = true;
