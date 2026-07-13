-- Promover Administrador do Sistema
-- 1) Crie o usuário em Authentication → Users → Add user (e-mail confirmado)
-- 2) Rode este SQL no projeto sigaeduca

UPDATE public.profiles
SET is_system_admin = true,
    role = 'Administrador do Sistema',
    full_name = COALESCE(NULLIF(full_name, ''), 'Administrador do Sistema'),
    updated_at = now()
WHERE lower(email) = lower('sigaeduca@escola.seduc.pa.gov.br');

-- Se o profile ainda não existir (rode após criar o Auth user):
INSERT INTO public.profiles (id, email, full_name, role, is_system_admin)
SELECT u.id, u.email, 'Administrador do Sistema', 'Administrador do Sistema', true
FROM auth.users u
WHERE lower(u.email) = lower('sigaeduca@escola.seduc.pa.gov.br')
ON CONFLICT (id) DO UPDATE
SET is_system_admin = true,
    role = 'Administrador do Sistema',
    updated_at = now();

-- Conferência
SELECT id, email, role, is_system_admin
FROM public.profiles
WHERE lower(email) = lower('sigaeduca@escola.seduc.pa.gov.br');
