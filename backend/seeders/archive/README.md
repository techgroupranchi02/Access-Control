# Archived seeders

`001_seed_data.js` and `002_canonical_freecomers_data.js` filled a stand-alone demo database before
Access-Control moved into the shared Freecomers database. Against the shared database they are unsafe: they
insert into Freecomers tables (`users` with columns it no longer has, `roles`, `events` with a fixed id 1) and
into early-schema tables that were dropped (migration 035, API review D1). Both now exit as soon as they start.

There is no demo seeder at the moment. Use a copy of the dev database for test data.
