# Via CommandDesk V4.1 Pilot — UI Master

Esta é a versão publicável do Via CommandDesk usando a interface visual aprovada como UI Master.

## Incluído

- Interface oficial Via Networks (Dashboard, Kanban, Projetos, Comunicações e Carga do Time)
- Centro Executivo V4
- PostgreSQL compartilhado
- APIs Next.js:
  - `/api/health`
  - `/api/me`
  - `/api/snapshot`
  - `/api/tasks`
  - `/api/tasks/[id]`
  - `/api/outlook/sync`
  - `/api/auth/login`
  - `/api/auth/callback`
  - `/api/auth/logout`
- Microsoft Entra / Microsoft Graph preparados
- Pilot Demo para validar a operação sem login Microsoft real

## Vercel

O projeto deve ser publicado a partir deste repositório completo. Um redeploy de um deployment antigo/incompleto não adiciona rotas que não estavam naquela versão.

Depois do deploy com `DATABASE_URL` configurada, teste:

`/api/health`

Resultado esperado:
`{"ok":true,"version":"4.1.0","db":"ok"}`

## UI Master

A interface aprovada passa a ser a referência visual canônica do Via CommandDesk. Evoluções funcionais devem ser incorporadas a esta linguagem visual, sem substituir o design-base sem aprovação explícita.
