import assert from 'node:assert/strict';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { _electron: electron } = require('playwright');
const dir = await mkdtemp(path.join(tmpdir(), 'corte-header-'));
let app;
try {
 app = await electron.launch({ executablePath: require('electron'), args: [path.resolve(import.meta.dirname, '..'), `--user-data-dir=${dir}`], env: { ...process.env, ELECTRON_RUN_AS_NODE: '' } });
 const page = await app.firstWindow();
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 await page.locator('#preview-add').waitFor();
 assert.equal(await page.getByRole('button', { name: 'Abrir projeto', exact: true }).count(), 0, 'Abrir must not appear in the header');
 await page.getByRole('button', { name: 'Histórico de alterações', exact: true }).click();
 assert.equal(await page.locator('#history-panel').isVisible(), true);
 assert.deepEqual(errors, []);
 console.log('PASS header without Abrir and editor initialization');
} finally {
 if (app) await app.close();
 await rm(dir, { recursive: true, force: true });
}
