// Demo mode: embedded PostgreSQL 16 in backend/.demo-db, no system install.
// Started via pg_ctl, which drops admin rights on Windows. Ctrl+C stops everything.
import EmbeddedPostgres from 'embedded-postgres';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import pg from 'pg';

const PORT = Number(process.env.DEMO_DB_PORT ?? 5433);
const DATA_DIR = resolve('.demo-db');
const LOG_FILE = resolve('.demo-db.log');
const SEEDED_MARK = resolve('.demo-db-seeded');
const firstRun = !existsSync(join(DATA_DIR, 'PG_VERSION'));
const OS = { win32: 'windows', darwin: 'darwin', linux: 'linux' }[process.platform];
const { pg_ctl: PG_CTL } = await import(`@embedded-postgres/${OS}-${process.arch}`);

process.env.DATABASE_URL = `postgresql://portal:portal@localhost:${PORT}/portal`;
process.env.JWT_ACCESS_SECRET ??= 'demo-access-secret-demo-access-secret-0000';
process.env.JWT_REFRESH_SECRET ??= 'demo-refresh-secret-demo-refresh-secret-00';

// stdio 'ignore' + 'exit' event: on Windows the postgres child inherits pipes, so waiting for them would hang forever
function pgCtl(args) {
  return new Promise((ok, fail) => {
    const ch = spawn(PG_CTL, ['-D', DATA_DIR, ...args], { stdio: 'ignore', windowsHide: true });
    ch.on('error', fail);
    ch.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`pg_ctl ${args.at(-1)} exited with code ${code}`))));
  });
}

async function startDb() {
  try {
    await pgCtl(['-l', LOG_FILE, '-o', `-p ${PORT}`, '-w', '-t', '60', 'start']);
  } catch (e) {
    const log = existsSync(LOG_FILE) ? readFileSync(LOG_FILE, 'utf8').split('\n').slice(-15).join('\n') : '';
    throw new Error(`PostgreSQL failed to start (${e.message}).\n${log}`);
  }
}
async function stopDb() {
  try { await pgCtl(['-m', 'fast', '-w', 'stop']); } catch { /* not running */ }
}
async function ensureDatabase() {
  const c = new pg.Client({ host: 'localhost', port: PORT, user: 'portal', password: 'portal', database: 'postgres' });
  await c.connect();
  const { rowCount } = await c.query("SELECT 1 FROM pg_database WHERE datname = 'portal'");
  if (!rowCount) await c.query('CREATE DATABASE portal OWNER portal');
  await c.end();
}
// CLIs are started with node directly (no npx/npm .cmd wrappers), so Ctrl+C on Windows
// does not show "Terminate batch job (Y/N)?"
const bin = {
  prisma: resolve('node_modules/prisma/build/index.js'),
  tsx: resolve('node_modules/tsx/dist/cli.mjs'),
  nest: resolve('node_modules/@nestjs/cli/bin/nest.js'),
};
function node(script, args) {
  return spawn(process.execPath, [script, ...args], { stdio: 'inherit', env: process.env });
}
function run(script, args) {
  return new Promise((ok, fail) => {
    const ch = node(script, args);
    ch.on('error', fail);
    ch.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`${args.join(' ')} exited with code ${code}`))));
  });
}

let backend;
let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping backend and demo database...');
  backend?.kill();
  await stopDb();
  process.exit(code);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

try {
  if (firstRun) {
    console.log('First run: creating demo database in .demo-db ...');
    rmSync(DATA_DIR, { recursive: true, force: true });
    await new EmbeddedPostgres({ databaseDir: DATA_DIR, user: 'portal', password: 'portal', port: PORT, persistent: true, onLog: () => {} }).initialise();
  }
  console.log('Starting demo database...');
  await stopDb();
  await startDb();
  await ensureDatabase();
  console.log(`Demo database is running on port ${PORT}`);
  if (process.env.DEMO_SKIP_MIGRATE !== '1') await run(bin.prisma, ['migrate', 'deploy']);
  if (!existsSync(SEEDED_MARK)) {
    await run(bin.tsx, ['prisma/seed.ts']);
    writeFileSync(SEEDED_MARK, new Date().toISOString());
  }
  console.log('\nStarting backend. Stop everything with Ctrl+C\n');
  backend = node(bin.nest, ['start', '--watch']);
  backend.on('exit', () => void shutdown());
} catch (e) {
  const msg = e instanceof Error ? e.message : String(e ?? 'unknown error');
  console.error('\nDemo mode error:', msg);
  if (msg.includes('could not bind') || msg.includes('already in use')) {
    console.error(`Port ${PORT} is busy. Try: $env:DEMO_DB_PORT=5434; npm run demo`);
  }
  await shutdown(1);
}
