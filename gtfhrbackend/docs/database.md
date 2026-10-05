# Database setup and verification

The standalone backend uses the multi-file Prisma schema in `prisma/schema/`. Versioned migrations live in
`prisma/schema/migrations/`. The initial migration creates every module table, index and relationship, plus the
append-only audit, notification, payroll immutability and domain integrity constraints from `prisma/sql/`.

## Deploy an empty database

Set the backend `DATABASE_URL` to the intended PostgreSQL database, then run:

```sh
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:deploy
pnpm build
pnpm start
```

`db:deploy` is repeatable and only applies unapplied migrations. It does not seed development employees. Copy and
edit `config-examples/organization.json`, including the initial attendance shift, then run
`pnpm bootstrap:organization path/to/organization.json`. This creates organization configuration with no employees,
sites or leave entitlements; overtime and late deductions start disabled. Use `pnpm bootstrap:hr` to create the first
operator according to the bootstrap script's required environment variables. HR bootstrap creates an enabled account,
serializes concurrent attempts and refuses to replace an existing HR operator. The operator still completes MFA
enrollment before accessing privileged APIs.
For an existing populated database, inspect and reconcile its schema and create a backup before baselining; do not
mark the initial migration applied unless the database already matches it, including custom SQL constraints.

## Integration tests

Use a development PostgreSQL login that can create databases. `pnpm test:integration` creates a separate
`gtf_hr_sb_test_<suite hash>` database for each test file, resets that database's public schema, deploys the actual
migration, seeds synthetic fixture accounts, and executes the suite. The bootstrap suite intentionally receives no
seed data and verifies the production initialization flow. The database named in `DATABASE_URL` is used
only to create these databases. Its tables are never reset. Background jobs are disabled for test suites. A temporary
fixture password is generated if `DEV_SEED_PASSWORD` is absent.

```sh
pnpm test:integration
pnpm db:sandbox time --reset --migrate --seed -- tsx --test tests/integration/time.test.ts
```

The sandbox command accepts trailing commands both with and without the `--` separator, including package managers
that consume that separator. A failed migration, seed or test exits unsuccessfully. Test databases remain available
for inspection and are reset on the next run.

During feature development, omit `--migrate` to build a sandbox directly from the current schema and apply the
idempotent SQL files. Deployment and integration verification use migrations. Future changes to custom SQL require
a new migration as well as an update to the sandbox SQL; never edit an already deployed migration.
