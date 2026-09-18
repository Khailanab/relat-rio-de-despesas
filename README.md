# Controle de Despesas

Sistema interno para prestação de contas de deslocamentos.

## Estrutura

- `index.html` — interface.
- `styles.css` — visual.
- `app.js` — regras do sistema.
- `config.js` — URL e chave pública do Supabase.
- `supabase/supabase.sql` — banco, RLS e Storage.
- `assets/KM SC Direta 1a Quinzena de setembro.xlsx` — modelo oficial recebido.

## Regras já implementadas

- Login visual por MZ + senha.
- Supervisor vê somente seus próprios relatórios.
- Coordenadora vê todos.
- KM = KM final - KM inicial.
- Reembolso de KM = KM × R$ 1,23.
- Pedágio, Estacionamento e Diversas como despesas separadas.
- Comprovantes e fotos em bucket privado.
- Hospedagem separada.
- Coordenadora pode editar relatórios.
- Adiantamento não é campo do formulário.
- A coluna de adiantamento deve permanecer na planilha oficial.

## Implantação

1. Criar projeto Supabase.
2. Executar `supabase/supabase.sql`.
3. Copiar `config.example.js` para `config.js` e preencher os dados do projeto.
4. Desativar confirmação de e-mail no Auth se usar o esquema de MZ com e-mail interno sintético.
5. Criar os usuários do Auth e as respectivas linhas em `profiles`.
6. Publicar estes arquivos no GitHub Pages.

## Exportação oficial

O arquivo enviado pela equipe foi mantido dentro de `assets/` como referência do modelo.

A exportação atualmente disponível no navegador gera a aba `Dados do sistema`. Antes de usar o Excel como documento oficial, a rotina de exportação deve ser ligada ao modelo oficial para preservar as abas, formatação, histórico e demais elementos da planilha.

Isso é intencional: não se deve substituir a planilha oficial por uma tabela genérica.
