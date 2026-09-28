// Switches only the known UML site from Vite files to the Next.js web process.
import { execFileSync } from 'node:child_process';
import { accessSync, constants, existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const oldRoot = '/current/apps/web/dist';
const nextRoot = '/current/apps/web/.next/standalone/apps/web/public';
const nextLocation = `location / {
        proxy_pass http://127.0.0.1:4003;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 3600s;
    }`;

export function migrateNextRouting(config, deployPath) {
  const oldWebRoot = `${deployPath}${oldRoot}`;
  const newWebRoot = `${deployPath}${nextRoot}`;
  if (config.includes(newWebRoot) && config.includes(nextLocation)) return config;
  if (!config.includes(`root ${oldWebRoot};`) || !config.includes('location /api/ {')) {
    throw new Error('Unknown site root or API proxy; refusing to change Nginx routing.');
  }
  const staticLocations = [
    'location = /index.html', 'location = /',
    'location ~ ^/(features|workflow|cases|pricing)/?$',
    'location ~ ^/(login|register|verify-email|forgot-password|reset-password|workspace|exam|tutorial|invitations/accept|billing/alipay/return|account|account/security|settings/models|account/billing)$',
    'location ~ ^/projects(?:/.*)?$', 'location = /app.html',
    'location = /404.html', 'location /assets/', 'location /',
  ];
  let result = config;
  for (const prefix of staticLocations) {
    const escaped = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = [...result.matchAll(new RegExp(`^\\s*${escaped}\\s*\\{`, 'gm'))];
    if (matches.length !== 1) {
      throw new Error(`Expected one known Nginx block: ${prefix}`);
    }
    const locationStart = matches[0].index;
    const open = result.indexOf('{', locationStart + matches[0][0].length - 1);
    const close = result.indexOf('}', open + 1);
    if (open < 0 || close < 0 || result.slice(open + 1, close).includes('{')) {
      throw new Error(`Cannot safely parse Nginx block: ${prefix}`);
    }
    result = result.slice(0, locationStart) + (prefix === 'location /' ? nextLocation : '') + result.slice(close + 1);
  }
  return result
    .replace(`root ${oldWebRoot};`, `root ${newWebRoot};`)
    .replace(/\s*index index\.html;/, '')
    .replace(/\s*error_page 404 \/404\.html;/, '');
}

function nginx(...args) {
  return execFileSync(process.env.NGINX_BIN || 'nginx', args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}

export function checkNextRouting(deployPath, runNginx = nginx) {
  if (!deployPath?.startsWith('/') || deployPath === '/') throw new Error('An absolute deployment path is required.');
  const dump = runNginx('-T');
  const configFiles = [...dump.matchAll(/^# configuration file (.+):\r?$/gm)]
    .map((match) => realpathSync(match[1]))
    .filter((file, index, files) => files.indexOf(file) === index)
    .filter((file) => {
      const contents = readFileSync(file, 'utf8');
      return contents.includes(`root ${deployPath}${oldRoot};`) || contents.includes(`root ${deployPath}${nextRoot};`);
    });
  if (configFiles.length !== 1) throw new Error(`Expected one UML site config, found ${configFiles.length}.`);
  const configPath = configFiles[0];
  const original = readFileSync(configPath, 'utf8');
  const migrated = migrateNextRouting(original, deployPath);
  if (original !== migrated) accessSync(configPath, constants.W_OK);
  return { configPath, original, migrated };
}

export function applyNextRouting(backupPath, deployPath, runNginx = nginx) {
  const { configPath, original, migrated } = checkNextRouting(deployPath, runNginx);
  if (original === migrated) return;
  writeFileSync(backupPath, JSON.stringify({ configPath, original, migrated }), { flag: 'wx', mode: 0o600 });
  try {
    writeFileSync(configPath, migrated);
    runNginx('-t');
    runNginx('-s', 'reload');
  } catch (error) {
    writeFileSync(configPath, original);
    runNginx('-t');
    runNginx('-s', 'reload');
    throw error;
  }
}

export function restoreNextRouting(backupPath, runNginx = nginx) {
  if (!existsSync(backupPath)) return;
  const { configPath, original, migrated } = JSON.parse(readFileSync(backupPath, 'utf8'));
  const current = readFileSync(configPath, 'utf8');
  if (current !== original && current !== migrated) throw new Error('Nginx changed since deployment; refusing to overwrite it.');
  writeFileSync(configPath, original);
  runNginx('-t');
  runNginx('-s', 'reload');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.at(-2) === '--nginx-bin') {
    process.env.NGINX_BIN = args.pop();
    args.pop();
  }
  const [command, argument, deployPath] = args;
  if (command === 'check') checkNextRouting(argument);
  else if (command === 'apply') applyNextRouting(argument, deployPath);
  else if (command === 'restore') restoreNextRouting(argument);
  else throw new Error('Expected check, apply, or restore.');
}
