# PM Board

A read-only planning dashboard on top of Jira for the **IGD**, **ISR** and **IC** projects.
Jira stays the place where work is created and moved; PM Board never writes to Jira.

## Views

- **Dashboard** – current sprint (or all open work): progress, open bugs, work past its deployment date, unassigned work, per-project table, charts by priority, Product Owner and assignee, and a "needs attention" list.
- **Deployments** – what deploys today, this week and next, cards past their Deployment Date, QA ending after deployment, cards with no deployment date, and release dates that moved.
- **People & Capacity** – per person and per role (back-end, front-end, QA): capacity for the sprint, bug buffer, planned hours, utilisation, free hours in the next 7 days and when they free up. "From today" counts only work still owed.
- **Timeline** – back-end, front-end and QA windows per card with deployment markers, grouped by project or by person.
- **Board** – the Jira scrum boards' own columns, read-only.
- **Backlog** – sortable, filterable issue list.
- **Data checklist** – missing Jira data (dates, estimates, developers, sign-offs) grouped by Product Owner.
- **Team setup** – roles, hours per day, working calendar (Sundays and chosen Saturdays off), company holidays, leave, bug buffer. QA assignment per card is done from the issue panel.

Deadlines use the **Deployment Date** field (falling back to Jira's due date). Estimates are the Jira
Back-End / Front-End / QA estimate fields, in hours, spread evenly across each phase's start and end dates.

## Data PM Board stores itself

Jira has no place for these, so they live in PM Board's database: users, team roles and hours,
holidays, leave, QA assignments, and calendar/bug-buffer settings.

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
7. On **Team setup**, add the people whose time should be planned, with their roles.

Changing `NEXTAUTH_SECRET` makes saved Jira tokens unreadable; users would need to re-enter them.
