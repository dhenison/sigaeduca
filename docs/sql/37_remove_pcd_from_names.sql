-- Remove o termo (PcD) do nome dos alunos. O aplicativo lê public.students.full_name.
UPDATE public.students
SET full_name = btrim(regexp_replace(regexp_replace(full_name, '\s*\([Pp][Cc][Dd]\)', '', 'g'), '\s+', ' ', 'g'))
WHERE full_name ~* '\(pcd\)';

UPDATE public.report_cards
SET student_name = btrim(regexp_replace(regexp_replace(student_name, '\s*\([Pp][Cc][Dd]\)', '', 'g'), '\s+', ' ', 'g')),
    file_name = btrim(regexp_replace(regexp_replace(file_name, '\s*\([Pp][Cc][Dd]\)', '', 'g'), '\s+', ' ', 'g'))
WHERE student_name ~* '\(pcd\)' OR file_name ~* '\(pcd\)';
