// Envío de bytes a la impresora: por red (puerto 9100, "RAW") o por USB (dispositivo en Linux).
import { open } from 'node:fs/promises';
import net from 'node:net';

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

// USB en el NUC (Ubuntu): el controlador usblp expone la impresora como /dev/usb/lp0
export async function sendUsb(device, data, { timeout = SEND_TIMEOUT_MS } = {}) {
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
