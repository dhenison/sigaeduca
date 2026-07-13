# Documento de Requisitos do Produto (PRD) — Modernização e Colapso do Menu Lateral

**Status:** Concluído / Implementado  
**Versão:** 1.0  
**Data:** 11 de Julho de 2026  
**Sistema:** SIGA EDUCA  
**Arquivo Modificado:** [painelprincipal.html](file:///C:/Users/USER/Documents/Siga%20Educa/painelprincipal.html)

---

## 1. Visão Geral e Objetivo

Este documento define e formaliza os requisitos funcionais, visuais e técnicos das modificações realizadas no menu lateral (Sidebar) do **SIGA EDUCA**. 

O objetivo do redesenho foi introduzir recursos de **colapso lateral responsivo** (para otimização de espaço em tela) e **agrupamento de itens por dropdowns acordeonados**, sem alterar nenhuma regra de negócio, links de destino ou informações do menu original.

---

## 2. Requisitos Estruturais e de Negócio

> [!IMPORTANT]
> **Garantia de Integridade dos Dados:** Nenhuma aba, link de redirecionamento, ícone ou texto foi adicionado, excluído ou modificado. Apenas a disposição estrutural e interativa foi aprimorada.

### 2.1 Estrutura do Menu
O menu original plano foi dividido e reorganizado sob uma hierarquia dinâmica:
*   **Item Principal Independente:** `Minha Escola` (Dashboard) — Mantido fixo no topo do menu.
*   **Grupo Dropdown "Administrativo":**
    *   *Gatilho:* Botão de Dropdown com ícone `admin_panel_settings`.
    *   *Conteúdo:* Calendário Letivo, Turmas, Alunos, Frequência, Horário de Aula, Agenda, Ocorrências.
*   **Grupo Dropdown "Pedagógico":**
    *   *Gatilho:* Botão de Dropdown com ícone `school`.
    *   *Conteúdo:* Projeto Olímpico, Solicitações Pedagógicas, Boletins, Conselho de Classe, Diagnóstico de Ocorrências, Controle de Livros, Relatórios.
*   **Grupo Dropdown "Sistema":**
    *   *Gatilho:* Botão de Dropdown com ícone `settings`.
    *   *Conteúdo:* Meu Perfil.

---

## 3. Especificações de Comportamento e Estados (UX)

O menu lateral agora possui estados interativos claros controlados por classes de estado CSS e funções JavaScript:

### 3.1 Comportamento da Sidebar (Expandida vs. Recolhida)

| Elemento/Propriedade | Estado Expandido (Padrão) | Estado Recolhido (`.sidebar-collapsed`) |
| :--- | :--- | :--- |
| **Largura da Sidebar** | `260px` | `72px` |
| **Padding Esquerdo do Conteúdo (`main`)** | `260px` | `72px` |
| **Logotipo e Títulos** | Visíveis | Ocultados (`display: none`) |
| **Textos dos Itens (`.text-label-md`)** | Visíveis | Ocultados (`display: none`) |
| **Rótulos dos Dropdowns e Chevrons** | Visíveis | Ocultados (`display: none`) |
| **Alinhamento Geral** | Alinhado à esquerda com espaçamentos padrão | Ícones centralizados, paddings reduzidos a zero nas laterais |
| **Menu Dropdown Interno** | Exibido sob indentação à esquerda | Totalmente ocultado |

### 3.2 Comportamento dos Dropdowns (Acordeão)
*   **Abertura Exclusiva (Auto-collapse):** Ao clicar em um dropdown (ex: *Pedagógico*), qualquer outro dropdown aberto anteriormente é automaticamente recolhido para evitar que o menu ultrapasse a altura útil da tela.
*   **Indicador de Estado (Chevron):** Uma seta à direita rotaciona `180 graus` indicando visualmente se o grupo está aberto ou fechado.

---

## 4. Especificações de Movimento e Animações (Transitions)

As animações seguem curvas e tempos de resposta que otimizam a percepção de performance do sistema, utilizando acelerações baseadas em físicas naturais:

### 4.1 Tabela de Parâmetros Técnicos de Transição

| Interação | Propriedade Animada | Duração | Curva de Aceleração (Timing) | Efeito Visual |
| :--- | :--- | :--- | :--- | :--- |
| **Colapso/Expansão do Menu** | `width` | `0.3s` | `cubic-bezier(0.4, 0, 0.2, 1)` | Deslizamento suave e natural da barra |
| **Deslocamento do Conteúdo (`main`)**| `padding-left` | `0.3s` | `cubic-bezier(0.4, 0, 0.2, 1)` | Painel de conteúdo acompanha a sidebar em sincronia |
| **Giro da Seta do Dropdown** | `transform (rotate)` | `0.2s` | `ease` | Chevron gira suavemente ao expandir/recolher |
| **Hover nos Itens de Menu** | `background-color`, `color` | `0.2s` | `ease` | Efeito sutil de feedback ao passar o mouse |
| **Micro-interação do Toggle Button** | `transform (scale)`, `bg` | `0.2s` | `ease` | Botão pulsa levemente para `1.1x` de tamanho ao sofrer hover |

---

## 5. Interface do Botão de Alternância (Toggle Button)

Como solicitado na referência do usuário, o botão flutuante de colapso possui a seguinte especificação visual de alta fidelidade:

*   **Posicionamento Fixo:** Localizado na extremidade inferior direita da sidebar (`bottom: 40px`, `right: -14px`), posicionado centralizado sobre a linha que divide o menu e o painel de conteúdo.
*   **Cores de Destaque (Tema da Captura):** 
    *   *Fundo Padrão:* Azul/Índigo vibrante (`#5c56e0`).
    *   *Fundo Hover:* Azul escuro (`#4943c7`).
    *   *Borda:* Branca com `2px solid #ffffff` para saltar sobre superfícies claras e escuras.
    *   *Sombra:* Baixa elevação com desfoque (`box-shadow: 0 4px 6px -1px rgba(0,0,0,0.15)`).
*   **Simbologia Dinâmica:**
    *   Apresenta uma seta apontando para a esquerda (`chevron_left`) no modo expandido.
    *   Muda para uma seta apontando para a direita (`chevron_right`) no modo recolhido, indicando o sentido de abertura.

---

## 6. Acessibilidade (a11y) e Desempenho

*   **Redução de Movimento:** Adicionada compatibilidade com a diretiva `@media (prefers-reduced-motion: reduce)`. Caso o usuário configure o sistema operacional para reduzir movimentos, todas as transições de colapso, rotações e hovers são instantaneamente desligadas (`0.01ms`), garantindo acessibilidade para pessoas propensas a vestibulopatias.
*   **Aria Roles:** Os botões dos dropdowns possuem o atributo `aria-expanded` dinâmico (alternando entre `true` e `false`), permitindo que leitores de tela identifiquem corretamente o estado de visibilidade dos submenus.

---

## 7. Mapeamento Técnico de Código

### 7.1 Classes CSS Criadas
*   `.sidebar-collapsed`: Aplicada no elemento `body` para disparar o estado de recuo em todos os seletores filhos.
*   `.nav-dropdown`: Wrapper do grupo acordeão.
*   `.nav-dropdown-toggle`: Botão de cabeçalho do acordeão.
*   `.nav-dropdown-menu`: Bloco interno que encapsula os links.
*   `.sidebar-toggle-btn`: Estilização e posicionamento do botão flutuante no canto inferior direito.
*   `.sidebar-logo-text`, `.user-meta`, `.logout-btn-text`: Classes marcadoras usadas para ocultação limpa e performática sob o estado `.sidebar-collapsed`.

### 7.2 Funções JavaScript Integradas
*   `toggleSidebarCollapse()`: Realiza o toggle de classes, altera o texto do ícone do botão e salva o estado de preferência atual no `localStorage` do navegador.
*   `toggleNavGroup(button)`: Realiza a animação de acordeão do grupo clicado e força o fechamento dos outros grupos ativos de forma assíncrona.
*   *Restauração Automática:* Uma IIFE (Expressão de Função Imediatamente Invocada) analisa o `localStorage` durante a fase de parse do documento e adiciona a classe `.sidebar-collapsed` antes da renderização completa da página para evitar oscilações visuais na tela (*Flickering*).
