-- Promover Administrador do Sistema (dhenison@gmail.com)
-- 1) Crie o usuário em Authentication → Users → Add user (e-mail confirmado)
-- 2) Rode este SQL no projeto sigaeduca

UPDATE public.profiles
SET is_system_admin = true,
    role = 'Administrador do Sistema',
    full_name = COALESCE(NULLIF(full_name, ''), 'Administrador do Sistema'),
    updated_at = now()
WHERE lower(email) = lower('dhenison@gmail.com');

-- Conferência
SELECT id, email, role, is_system_admin
FROM public.profiles
WHERE lower(email) = lower('dhenison@gmail.com');
