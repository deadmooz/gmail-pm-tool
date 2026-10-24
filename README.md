# PM Board

A simple Jira board for the **IGD**, **ISR** and **IC** projects.

- **Dashboard** – open work, bugs, overdue and unassigned issues, sprint progress per project, workload by person, and a "needs attention" list.
- **Board** – the active sprint (or all open issues) as columns by status. Drag a card to another column to move it in Jira.
- **Backlog** – every issue in a sortable, filterable table.
- **Issue panel** – click any issue to change its status, assignee or priority and to read or add comments.
- **My Settings** – each user connects their own Jira email and API token (stored encrypted) and can change their password.
- **Admin** – set the Jira site address and add, edit, suspend or delete users.

All Jira reads and writes use the signed-in user's own API token, so people only see and change what Jira already allows them to.

## Setup

1. `npm install`
2. Create `.env` with:
   ```
   NEXTAUTH_SECRET=<long random string>   # also encrypts stored Jira tokens
   NEXTAUTH_URL=http://localhost:3000
   ADMIN_USERNAME=admin                    # break-glass admin login
   ADMIN_PASSWORD=<strong password>
   ```
3. `npx prisma db push`
4. `npm run dev`, open http://localhost:3000 and sign in with `ADMIN_USERNAME` / `ADMIN_PASSWORD`.
5. On **Admin**, set the Jira site (e.g. `your-company.atlassian.net`) and add users.
6. Each user opens **My Settings** and adds their Jira API token from
   https://id.atlassian.com/manage-profile/security/api-tokens.

Changing `NEXTAUTH_SECRET` makes saved Jira tokens unreadable; users would need to re-enter them.
