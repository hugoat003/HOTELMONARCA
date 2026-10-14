// Envío de bytes a la impresora: por red (puerto 9100, "RAW") o por USB (Windows o Linux).
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { open, rm, writeFile } from 'node:fs/promises';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAWPRINT = join(dirname(fileURLToPath(import.meta.url)), 'rawprint.ps1');

export const SEND_TIMEOUT_MS = 6000;

export function sendNetwork(host, port, data, { timeout = SEND_TIMEOUT_MS } = {}) {
  return new Promise((resolve, reject) => {
    if (!host) return reject(new Error('Falta la IP de la impresora'));
    let done = false;
    const finish = (err) => {
      if (done) return;
      done = true;
      sock.destroy();
      if (err) reject(err);
      else resolve();
    };
    const sock = net.createConnection({ host, port: Number(port) || 9100 });
    sock.setTimeout(timeout, () => finish(new Error('La impresora no responde')));
    sock.on('error', (e) =>
      finish(
        new Error(
          e.code === 'ECONNREFUSED'
            ? 'La impresora rechazó la conexión'
            : e.code === 'EHOSTUNREACH' || e.code === 'ENETUNREACH'
              ? 'No se encuentra la impresora en la red'
              : `Error de red (${e.code || e.message})`,
        ),
      ),
    );
    sock.on('connect', () => sock.end(data, () => finish()));
  });
}

// USB. En Windows, `device` es el nombre de la impresora instalada (ej. "Caja") y el ticket va
// "crudo" (RAW) por el administrador de impresión. En Linux es el dispositivo, ej. /dev/usb/lp0.
export function sendUsb(device, data, opts = {}) {
  return (opts.platform || process.platform) === 'win32'
    ? sendWindowsPrinter(device, data, opts)
    : sendUsbDevice(device, data, opts);
}

// Corre powershell.exe con rawprint.ps1. run: (archivo, args, opciones) → promesa (para pruebas)
const runPowerShell = (file, args, options) =>
  new Promise((resolve, reject) =>
    execFile(file, args, options, (err, stdout, stderr) => (err ? reject(Object.assign(err, { stderr })) : resolve())),
  );

export async function sendWindowsPrinter(name, data, { run = runPowerShell, timeout = 20_000 } = {}) {
  if (!name) throw new Error('Falta el nombre de la impresora USB (como aparece en Windows)');
  const file = join(tmpdir(), `monarca-ticket-${randomBytes(6).toString('hex')}.bin`);
  await writeFile(file, data);
  try {
    await run(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        RAWPRINT,
        '-Printer',
        name,
        '-File',
        file,
      ],
      { timeout, windowsHide: true },
    );
  } catch (e) {
    if (e.killed) throw new Error('La impresora USB no responde');
    // El script explica el problema en su error ("no tiene papel", "desconectada"…)
    const msg = String(e.stderr || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    throw new Error(msg || 'No se pudo imprimir por USB');
  } finally {
    await rm(file, { force: true });
  }
}

// Linux (Ubuntu): el controlador usblp expone la impresora como /dev/usb/lp0
async function sendUsbDevice(device, data, { timeout = SEND_TIMEOUT_MS } = {}) {
  let fh;
  const timer = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('La impresora USB no responde')), timeout).unref(),
  );
  try {
    fh = await Promise.race([open(device, 'w'), timer]);
    await Promise.race([fh.write(data), timer]);
  } catch (e) {
    if (e.code === 'ENOENT') throw new Error(`No se encuentra la impresora USB (${device})`);
    if (e.code === 'EACCES') throw new Error(`Sin permiso para usar ${device}`);
    throw e;
  } finally {
    await fh?.close().catch(() => {});
  }
}
