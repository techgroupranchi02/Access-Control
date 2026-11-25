# Archived migrations

`001`–`004` are the first schema scripts, from before Access-Control moved into the shared Freecomers
database. They are **not** in `run_all_migrations.js` (the runner starts at `005`), and they must never run
again: `003` drops `scopes`, and `004` drops `roles` (used by the Freecomers Laravel Role model), `festivals`,
`features` and other tables with foreign key checks off.

Each file now exits as soon as it starts. They are kept only to show how the schema began (API review D3).
