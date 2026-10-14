// Respaldos (locales y fuera del hotel), restauración, migraciones de formato y acceso de gerencia
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, before, describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { buildApp } from '../src/app.js';
import { inspect, pack, unpack } from '../src/backup.js';
import { KEEP_LOCAL, KEEP_REMOTE_DAYS } from '../src/backups.js';
import { openDb } from '../src/db.js';
import { Engine } from '../src/engine.js';
import { S3, sign } from '../src/s3.js';
import { migrate, MigrationError } from '../../shared/migrations.js';
import { VERSION } from '../../shared/version.js';
import { initialState } from '../src/seed.js';
import { call, login, MANAGERS } from './helpers.js';

const here = dirname(fileURLToPath(import.meta.url));
const run = promisify(execFile);
const SECRET = 'frase secreta de prueba';

// Almacenamiento S3 de mentira: guarda en memoria y revisa que cada petición venga firmada
function fakeS3() {
  const objects = new Map();
  const srv = createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const body = Buffer.concat(chunks);
      const auth = req.headers.authorization || '';
      const hash = createHash('sha256').update(body).digest('hex');
      if (!auth.startsWith('AWS4-HMAC-SHA256 Credential=KEY/') || req.headers['x-amz-content-sha256'] !== hash) {
        res.writeHead(403).end('<Error><Code>SignatureDoesNotMatch</Code></Error>');
        return;
      }
      if (srv.failing) return res.writeHead(500).end('<Error><Code>InternalError</Code></Error>');
      const url = new URL(req.url, 'http://x');
      const [, bucket, ...rest] = url.pathname.split('/');
      const key = rest.map(decodeURIComponent).join('/');
      if (bucket !== 'respaldos') return res.writeHead(404).end('<Error><Code>NoSuchBucket</Code></Error>');
      if (req.method === 'PUT') {
        objects.set(key, body);
        return res.writeHead(200).end();
      }
      if (req.method === 'DELETE') {
        objects.delete(key);
        return res.writeHead(204).end();
      }
      if (req.method === 'GET' && url.searchParams.get('list-type') === '2') {
        const prefix = url.searchParams.get('prefix') || '';
        const items = [...objects]
          .filter(([k]) => k.startsWith(prefix))
          .map(([k, v]) => `<Contents><Key>${k}</Key><Size>${v.length}</Size></Contents>`)
          .join('');
        return res.writeHead(200).end(`<ListBucketResult><IsTruncated>false</IsTruncated>${items}</ListBucketResult>`);
      }
      if (req.method === 'GET' && objects.has(key)) return res.writeHead(200).end(objects.get(key));
      res.writeHead(404).end('<Error><Code>NoSuchKey</Code></Error>');
    });
  });
  srv.objects = objects;
  return new Promise((r) => srv.listen(0, '127.0.0.1', () => r(srv)));
}
const endpointOf = (srv) => `http://127.0.0.1:${srv.address().port}`;
const s3For = (srv) =>
  new S3({ endpoint: endpointOf(srv), bucket: 'respaldos', accessKeyId: 'KEY', secretAccessKey: 'SECRETO' });

const tmp = () => mkdtempSync(join(tmpdir(), 'monarca-resp-'));

describe('firma y cifrado', () => {
  test('la firma S3 coincide con los ejemplos de la documentación de AWS', () => {
    const creds = {
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      region: 'us-east-1',
      date: new Date('2013-05-24T00:00:00Z'),
    };
    const get = sign({
      method: 'GET',
      url: 'https://examplebucket.s3.amazonaws.com/test.txt',
      headers: { Range: 'bytes=0-9' },
      ...creds,
    });
    assert.match(get.authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
    const list = sign({ method: 'GET', url: 'https://examplebucket.s3.amazonaws.com/?max-keys=2&prefix=J', ...creds });
    assert.match(list.authorization, /Signature=34b48302e7b5fa45bde8084f4b7868a86f0a534bc59db6670ed5711ef69dc6f7$/);
  });

  test('el respaldo que sale del hotel va comprimido y cifrado; sin la clave no se abre', () => {
    const data = Buffer.from('ventas del día '.repeat(1000));
    const box = pack(data, SECRET);
    assert.ok(box.length < data.length / 5);
    assert.ok(!box.includes(Buffer.from('ventas')));
    assert.deepEqual(unpack(box, SECRET), data);
    assert.throws(() => unpack(box, 'otra clave'), /clave de respaldo no es la correcta/);
    const tampered = Buffer.from(box);
    tampered[tampered.length - 1] ^= 1;
    assert.throws(() => unpack(tampered, SECRET), /dañado/);
    assert.throws(() => pack(data, ''), /Falta la clave/);
  });
});

describe('migraciones de formato', () => {
  const v11 = () => {
    const s = initialState('demo');
    s.version = 11;
    s.users = s.users.filter((u) => u.role !== 'admin').map(({ password: _p, email: _e, ...u }) => u);
    return s;
  };

  test('11 → 12: el primer gerente pasa a administración general', () => {
    const s = migrate(v11());
    assert.equal(s.version, VERSION);
    assert.equal(s.users.find((u) => u.id === 'u1').role, 'admin');
  });

  test('datos más nuevos que el programa, o sin un paso de migración: no se tocan', () => {
    assert.throws(() => migrate({ version: VERSION + 1 }), MigrationError);
    assert.throws(() => migrate({ version: 3 }), /del formato 3 al 4/);
    const original = v11();
    migrate(original);
    assert.equal(original.version, 11); // el original queda igual
  });

  test('al arrancar con datos viejos: respalda, migra y sigue', async () => {
    const dir = tmp();
    const dbFile = join(dir, 'monarca.db');
    try {
      const db = openDb(dbFile);
      new Engine(db).replaceAll(v11());
      db.close();
      const app = await buildApp({ dbFile, backups: { dir: join(dir, 'respaldos'), start: false } });
      assert.equal(app.hotel.engine.state.version, VERSION);
      assert.equal(app.hotel.engine.state.users.find((u) => u.id === 'u1').role, 'admin');
      await app.close();
      const saved = readdirSync(join(dir, 'respaldos')).filter((f) => f.startsWith('antes-de-migrar-v11-a-v'));
      assert.equal(saved.length, 1);
      assert.equal(inspect(join(dir, 'respaldos', saved[0])).version, 11);
      // Ya migrado, el siguiente arranque no hace nada
      const again = await buildApp({ dbFile, backups: { dir: join(dir, 'respaldos'), start: false } });
      await again.close();
      assert.equal(readdirSync(join(dir, 'respaldos')).filter((f) => f.startsWith('antes-de-migrar')).length, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('con datos de una versión más nueva, el servidor no arranca', async () => {
    const dir = tmp();
    const dbFile = join(dir, 'monarca.db');
    try {
      const db = openDb(dbFile);
      new Engine(db).replaceAll({ ...initialState('demo'), version: VERSION + 1 });
      db.close();
      await assert.rejects(buildApp({ dbFile }), /más nueva/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('cargar un respaldo de una versión anterior lo actualiza', async () => {
    const app = await buildApp();
    const owner = await login(app, 'u0');
    const future = await call(app, 'POST', '/api/admin/restore', {
      token: owner,
      body: { state: { ...v11(), version: VERSION + 1 } },
    });
    assert.equal(future.status, 400);
    assert.match(future.body.error, /más nueva/);
    const r = await call(app, 'POST', '/api/admin/restore', { token: owner, body: { state: v11() } });
    assert.equal(r.status, 200);
    assert.equal(app.hotel.engine.state.version, VERSION);
    assert.equal(app.hotel.engine.state.users.find((u) => u.id === 'u1').role, 'admin');
    await app.close();
  });
});

describe('respaldo automático', () => {
  let s3, dir, app;
  let clock = new Date('2026-10-14T02:00:00');
  before(async () => {
    s3 = await fakeS3();
    dir = tmp();
    app = await buildApp({
      dbFile: join(dir, 'monarca.db'),
      backups: {
        dir: join(dir, 'respaldos'),
        hour: 3,
        secret: SECRET,
        remote: s3For(s3),
        start: false,
        now: () => clock,
      },
    });
  });
  after(async () => {
    await app.close();
    s3.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const svc = () => app.hotel.backups;

  test('cada noche a la hora indicada: copia local y copia cifrada fuera del hotel', async () => {
    assert.equal(svc().due(), false); // 2:00, aún no
    clock = new Date('2026-10-14T03:05:00');
    assert.equal(svc().due(), true);
    await svc().tick();
    const local = svc().local();
    assert.equal(local.length, 1);
    assert.match(local[0].name, /^diario-20261014-030500\.db$/);
    assert.equal(inspect(join(dir, 'respaldos', local[0].name)).version, VERSION);
    const key = 'monarca/diario-20261014-030500.db.gz.enc';
    assert.ok(s3.objects.has(key));
    // Lo que está fuera es la misma base, y solo se abre con la clave
    const restored = unpack(s3.objects.get(key), SECRET);
    assert.deepEqual(restored, readFileSync(join(dir, 'respaldos', local[0].name)));
    assert.equal(svc().status().ok, true);
    assert.ok(existsSync(join(dir, 'respaldos', 'estado.json')));
    // El mismo día ya no se repite
    clock = new Date('2026-10-14T09:00:00');
    assert.equal(svc().due(), false);
  });

  test('sin internet: queda la copia local, avisa, y sube la copia cuando vuelve', async () => {
    s3.failing = true;
    clock = new Date('2026-10-15T03:00:00');
    await svc().tick();
    assert.equal(svc().local().length, 2);
    const st = svc().status();
    assert.equal(st.ok, false);
    assert.match(st.problems.join(' '), /Copia fuera del hotel/);
    s3.failing = false;
    clock = new Date('2026-10-15T03:30:00'); // aún no pasa la hora de espera
    await svc().tick();
    assert.ok(!s3.objects.has('monarca/diario-20261015-030000.db.gz.enc'));
    clock = new Date('2026-10-15T04:05:00');
    await svc().tick();
    assert.ok(s3.objects.has('monarca/diario-20261015-030000.db.gz.enc'));
    assert.equal(svc().status().ok, true);
  });

  test('se conservan los últimos en la mini PC; fuera, 30 días y uno por mes', async () => {
    const rdir = join(dir, 'respaldos');
    for (let i = 1; i <= 40; i++) writeFileSync(join(rdir, `diario-2026${String(i).padStart(4, '0')}-030000.db`), 'x');
    svc().pruneLocal();
    assert.equal(
      svc()
        .local()
        .filter((f) => f.name.startsWith('diario-')).length,
      KEEP_LOCAL.diario,
    );

    s3.objects.clear();
    // 120 días seguidos fuera del hotel
    for (let i = 0; i < 120; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i));
      const day = d.toISOString().slice(0, 10).replace(/-/g, '');
      s3.objects.set(`monarca/diario-${day}-030000.db.gz.enc`, Buffer.from('x'));
    }
    s3.objects.set('monarca/otra-cosa.txt', Buffer.from('x'));
    await svc().pruneRemote();
    const keys = [...s3.objects.keys()].sort();
    assert.ok(keys.includes('monarca/otra-cosa.txt'));
    const kept = keys.filter((k) => k.endsWith('.gz.enc'));
    assert.equal(kept.length, KEEP_REMOTE_DAYS + 3); // + enero, febrero y marzo (el primero de cada uno)
    for (const m of ['01', '02', '03']) assert.ok(kept.includes(`monarca/diario-2026${m}01-030000.db.gz.enc`));
  });

  test('respaldar ahora y ver el estado: solo administración general', async () => {
    const owner = await login(app, 'u0');
    const mgr = await login(app, 'u1');
    assert.equal((await call(app, 'GET', '/api/admin/backups', { token: mgr })).status, 403);
    assert.equal((await call(app, 'POST', '/api/admin/backups', { token: mgr, body: {} })).status, 403);
    const r = await call(app, 'POST', '/api/admin/backups', { token: owner, body: {} });
    assert.equal(r.status, 200);
    assert.match(r.body.name, /^manual-/);
    assert.ok(r.body.uploaded.key.endsWith('.gz.enc'));
    const st = await call(app, 'GET', '/api/admin/backups', { token: owner });
    assert.equal(st.body.lastOk.name, r.body.name);
  });
});

describe('comandos de soporte', () => {
  let s3, dir, env;
  before(async () => {
    s3 = await fakeS3();
    dir = tmp();
    mkdirSync(join(dir, 'respaldos'));
    env = {
      ...process.env,
      MONARCA_DB: join(dir, 'monarca.db'),
      PORT: '39998',
      MONARCA_RESPALDO_CLAVE: SECRET,
      MONARCA_S3_ENDPOINT: endpointOf(s3),
      MONARCA_S3_BUCKET: 'respaldos',
      MONARCA_S3_KEY_ID: 'KEY',
      MONARCA_S3_SECRET: 'SECRETO',
    };
  });
  after(() => {
    s3.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const script = (name, ...args) => run(process.execPath, [join(here, '../scripts', name), ...args], { env });

  test('restaurar desde fuera del hotel: guarda la base actual antes de reemplazarla', async () => {
    // Una base con un precio especial, respaldada fuera del hotel
    let app = await buildApp({ dbFile: env.MONARCA_DB });
    const m1 = app.hotel.engine.state.menu[0];
    app.hotel.engine.apply({
      aid: 'precio-especial',
      calls: [{ name: 'upsert', args: ['menu', { ...m1, price: 321 }] }],
      userId: 'u0',
    });
    await app.close();
    await script('respaldo.js', '--subir');
    const [key] = [...s3.objects.keys()];
    assert.match(key, /^monarca\/manual-.*\.db\.gz\.enc$/);

    // Después alguien cambia el precio otra vez…
    app = await buildApp({ dbFile: env.MONARCA_DB });
    app.hotel.engine.apply({
      aid: 'otro-precio',
      calls: [{ name: 'upsert', args: ['menu', { ...m1, price: 5 }] }],
      userId: 'u0',
    });
    await app.close();

    const list = await script('restaurar.js', '--lista');
    assert.match(list.stdout, /Fuera del hotel:\n {2}manual-/);
    // Sin --confirmar no hace nada
    await assert.rejects(script('restaurar.js', key.slice('monarca/'.length)), /--confirmar/);
    // Se borra la copia local para que tenga que bajarla
    for (const f of readdirSync(join(dir, 'respaldos'))) if (f.startsWith('manual-')) rmSync(join(dir, 'respaldos', f));
    const r = await script('restaurar.js', key.slice('monarca/'.length), '--confirmar');
    assert.match(r.stdout, /Descargando/);
    assert.match(r.stdout, /Restaurado/);
    assert.ok(readdirSync(join(dir, 'respaldos')).some((f) => f.startsWith('antes-de-restaurar-')));
    app = await buildApp({ dbFile: env.MONARCA_DB });
    assert.equal(app.hotel.engine.state.menu[0].price, 321);
    await app.close();
  });

  test('restaurar con la clave equivocada no toca la base', async () => {
    const [key] = [...s3.objects.keys()];
    await assert.rejects(
      run(process.execPath, [join(here, '../scripts/restaurar.js'), key.slice(8), '--confirmar'], {
        env: { ...env, MONARCA_RESPALDO_CLAVE: 'otra' },
      }),
      /clave de respaldo no es la correcta/,
    );
  });

  test('acceso de soporte: nueva contraseña para la dueña y alta de administración general', async () => {
    const { email } = MANAGERS.u0;
    await assert.rejects(script('acceso.js', '--correo', email, '--contrasena', 'corta'), /al menos 8/);
    await script('acceso.js', '--correo', email, '--contrasena', 'olvide-la-mia');
    await script(
      'acceso.js',
      '--nombre',
      'Soporte HAS',
      '--correo',
      'soporte@hassistemas.com',
      '--contrasena',
      'soporte-2026',
    );
    const app = await buildApp({ dbFile: env.MONARCA_DB });
    const ok = (body) => call(app, 'POST', '/api/login', { body }).then((r) => r.status);
    assert.equal(await ok({ email, password: 'olvide-la-mia' }), 200);
    assert.equal(await ok({ email, password: MANAGERS.u0.password }), 401);
    assert.equal(await ok({ email: 'soporte@hassistemas.com', password: 'soporte-2026' }), 200);
    assert.equal(app.hotel.engine.state.users.find((u) => u.email === 'soporte@hassistemas.com').role, 'admin');
    await app.close();
  });
});

// Sin carpeta configurada no hay respaldos automáticos (pruebas y modo memoria)
test('sin carpeta de respaldos, el servicio no existe', async () => {
  const app = await buildApp();
  assert.equal(app.hotel.backups, null);
  await app.close();
});
