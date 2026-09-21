# SIGA EDUCA — Aplicativo do Aluno

Prévia em Ionic + React + TypeScript. Interface móvel conforme referência, com navegação inferior e apresentação limitada ao formato do aplicativo também no computador.

## Acessar

Na pasta do projeto, execute `npm install` e `npm run dev`. Abra http://127.0.0.1:5173 e toque em **Explorar demonstração**. Para compilar: `npm run build`. Para conferir a versão PWA compilada: `npm run preview`.

## Disponível na prévia

Login com validação, mostrar senha e fluxo de recuperação; início; calendário com detalhes; frequência e histórico; estados de boletim; ocorrências; informes com leitura; horários por dia; agenda filtrável; perfil; notificações; tema claro, escuro e do sistema; menu Mais; saída. PWA com manifesto, ícones e cache de recursos estáticos.

## Integração pendente

A demonstração é explicitamente identificada e usa dados ilustrativos do protótipo. Não é acesso a uma escola real. Login institucional, SSO SEDUC, dados acadêmicos, foto, documentos oficiais, olimpíadas, inscrições e notificações do servidor dependem do backend existente. Não foram criadas tabelas, regras acadêmicas ou políticas RLS. O adaptador Auth aceita VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY, mas a sessão real não abre os dados de demonstração como se fossem reais. A integração precisa do contrato de dados do SIGA EDUCA. Nunca usar chave service_role no cliente.

A instalação no celular requer hospedagem HTTPS acessível pelo dispositivo. O endereço local fornecido funciona somente no computador que executa a prévia. Publicação e teste em dispositivo físico ainda não realizados.

## Referências visuais

Interface construída com componentes reais. Iniciais no perfil na ausência de foto. Fotografia de fundo ilustrativa gerada com Image Gen, salva em public/school.png. Prompt: fotografia vertical de escola pública brasileira, fachada branca de dois andares, janelas azuis, árvores tropicais e céu azul, sem pessoas, textos, logotipos ou interface. A imagem não representa a escola do aluno.
