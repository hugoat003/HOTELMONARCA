// Genera el PDF de un manual con el Chrome del sistema (el mismo que usan las pruebas).
//   node docs/manuales/pdf.mjs docs/manuales/5-eventos.html "salida.pdf" "Manual de eventos"
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(resolve('frontend/package.json'));
const { chromium } = require('playwright-core');

const [src, out, title] = process.argv.slice(2);
const version = execFileSync('git', ['rev-parse', '--short', 'HEAD']).toString().trim();
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage();
await page.goto(pathToFileURL(resolve(src)).href);
await page.evaluate((v) => {
  document.body.innerHTML = document.body.innerHTML.replace('__VERSION__', v);
}, version);
await page.evaluate(() => document.fonts.ready);
await page.pdf({
  path: out,
  format: 'Letter',
  preferCSSPageSize: true,
  printBackground: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;text-align:center;font-family:Arial;font-size:7px;color:#6f675e">${title} · POS Monarca · página <span class="pageNumber"></span> de <span class="totalPages"></span></div>`,
});
await browser.close();
console.log(out);
