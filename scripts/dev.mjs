// One command to run the whole portal locally: `npm run dev` in the project root.
//  1. installs backend/frontend dependencies on the first run;
//  2. starts the embedded demo database + backend (backend/scripts/demo.mjs);
//  3. starts the frontend (Vite);
//  4. opens the browser when the API is ready.
// Ctrl+C stops everything, including the database.
// Env: NO_OPEN=1 to skip opening the browser.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKEND = join(ROOT, 'backend');
const FRONTEND = join(ROOT, 'frontend');
const WEB_URL = 'http://localhost:5173';
const API_URL = 'http://localhost:3000/api/auth/me';
const isWin = process.platform === 'win32';

const [major] = process.versions.node.split('.').map(Number);
if (major < 22) {
  console.error(`Node.js 22 or newer is required (you have ${process.versions.node}). Download: https://nodejs.org`);
  process.exit(1);
}

function npmInstall(dir) {
  return new Promise((ok, fail) => {
    // npm is a .cmd file on Windows, so a shell is needed here (only during install)
    const ch = spawn('npm install --no-audit --no-fund', { cwd: dir, stdio: 'inherit', shell: true });
    ch.on('exit', (code) => (code === 0 ? ok() : fail(new Error(`npm install failed in ${dir}`))));
  });
}

// Noisy NestJS startup lines that are not useful in a demo
const NOISE = /RouterExplorer|RoutesResolver|InstanceLoader|SYNCHRONOUS TERMINATION NOTICE/;

function startProcess(name, script, args, cwd) {
  const child = spawn(process.execPath, [script, ...args], {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  const forward = (stream, out) => {
    let buf = '';
    stream.on('data', (chunk) => {
      buf += chunk.toString();
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? '';
      for (const line of lines) if (line.trim() && !NOISE.test(line)) out.write(`[${name}] ${line}\n`);
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);
  return child;
}

function openBrowser(url) {
  if (process.env.NO_OPEN === '1') return;
  const [cmd, args] = isWin ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
  } catch {
    /* no browser available */
  }
}

async function waitForApi(timeoutMs = 10 * 60 * 1000) {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      await fetch(API_URL); // any HTTP answer (even 401) means the API is up
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  return false;
}

const children = [];
let stopping = false;

async function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log('\nStopping the portal...');
  // On Windows Ctrl+C reaches every process in the console by itself.
  // Elsewhere (or when stopping because a process crashed) send SIGINT explicitly.
  for (const ch of children) if (ch.exitCode === null) ch.kill('SIGINT');
  await Promise.all(children.map((ch) => (ch.exitCode !== null ? null : new Promise((r) => ch.on('exit', r)))));
  process.exit(code);
}
process.on('SIGINT', () => void stopAll(0));
process.on('SIGTERM', () => void stopAll(0));

try {
  for (const dir of [BACKEND, FRONTEND]) {
    if (!existsSync(join(dir, 'node_modules'))) {
      console.log(`\nFirst run: installing dependencies in ${dir} (a few minutes)...\n`);
      await npmInstall(dir);
    }
  }

  console.log('\nStarting database, backend and frontend...\n');
  const api = startProcess('api', join(BACKEND, 'scripts', 'demo.mjs'), [], BACKEND);
  const web = startProcess('web', join(FRONTEND, 'node_modules', 'vite', 'bin', 'vite.js'), [], FRONTEND);
  children.push(api, web);
  for (const ch of children) {
    ch.on('exit', (code) => {
      if (!stopping) {
        console.error(`\nA process stopped unexpectedly (code ${code}). See the messages above.`);
        void stopAll(1);
      }
    });
  }

  if (await waitForApi()) {
    console.log(
      [
        '',
        '============================================================',
        `  Portal is ready: ${WEB_URL}`,
        '  Password for all demo users: Demo-Portal-2026',
        '    officer@univ.edu.ua      compliance officer',
        '    rector@univ.edu.ua       rectorate',
        '    director@univ.edu.ua     institute director',
        '    responsible@univ.edu.ua  responsible person',
        '    admin@univ.edu.ua        administrator',
        '  Stop everything: Ctrl+C',
        '============================================================',
        '',
      ].join('\n'),
    );
    openBrowser(WEB_URL);
  }
} catch (e) {
  console.error('\nError:', e instanceof Error ? e.message : String(e));
  await stopAll(1);
}
