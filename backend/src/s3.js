// Cliente mínimo de almacenamiento compatible con S3 (Cloudflare R2, Backblaze B2, AWS…), con firma
// AWS Signature V4 y sin dependencias. Solo lo que necesitan los respaldos: subir, bajar, listar, borrar.
import { createHash, createHmac } from 'node:crypto';

const sha256 = (data) => createHash('sha256').update(data).digest('hex');
const hmac = (key, data) => createHmac('sha256', key).update(data).digest();
// Codificación de la ruta y la consulta como la pide la firma (RFC 3986)
const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

// Firma una petición. Devuelve los encabezados a enviar (incluye Authorization).
// date: Date de la petición (las pruebas lo fijan para comparar con los ejemplos de AWS).
export function sign({
  method,
  url,
  headers = {},
  body = '',
  accessKeyId,
  secretAccessKey,
  region,
  service = 's3',
  date,
}) {
  const u = new URL(url);
  const amzDate = date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  const day = amzDate.slice(0, 8);
  const payloadHash = service === 's3' ? sha256(body) : null;
  const all = {
    ...headers,
    host: u.host,
    'x-amz-date': amzDate,
    ...(payloadHash ? { 'x-amz-content-sha256': payloadHash } : {}),
  };
  const names = Object.keys(all)
    .map((k) => k.toLowerCase())
    .sort();
  const lower = Object.fromEntries(Object.entries(all).map(([k, v]) => [k.toLowerCase(), String(v).trim()]));
  const canonicalHeaders = names.map((k) => `${k}:${lower[k]}\n`).join('');
  const signedHeaders = names.join(';');
  const query = [...u.searchParams]
    .map(([k, v]) => [enc(k), enc(v)])
    .sort(([a, x], [b, y]) => (a < b ? -1 : a > b ? 1 : x < y ? -1 : x > y ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('&');
  const path = u.pathname
    .split('/')
    .map((seg) => enc(decodeURIComponent(seg)))
    .join('/');
  const canonical = [method, path || '/', query, canonicalHeaders, signedHeaders, payloadHash ?? sha256(body)].join(
    '\n',
  );
  const scope = `${day}/${region}/${service}/aws4_request`;
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256(canonical)].join('\n');
  const key = hmac(hmac(hmac(hmac('AWS4' + secretAccessKey, day), region), service), 'aws4_request');
  const signature = createHmac('sha256', key).update(toSign).digest('hex');
  return {
    ...all,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

export class S3Error extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'S3Error';
    this.status = status;
  }
}

// { endpoint, bucket, accessKeyId, secretAccessKey, region = 'auto', fetch, timeout }
export class S3 {
  constructor({ endpoint, bucket, accessKeyId, secretAccessKey, region = 'auto', fetch: f, timeout = 120_000 }) {
    Object.assign(this, { endpoint: endpoint.replace(/\/+$/, ''), bucket, accessKeyId, secretAccessKey, region });
    this.fetch = f || globalThis.fetch;
    this.timeout = timeout;
  }

  async request(method, key = '', { query = {}, body } = {}) {
    const url = new URL(`${this.endpoint}/${this.bucket}/${key.split('/').map(enc).join('/')}`);
    for (const [k, v] of Object.entries(query)) if (v !== undefined) url.searchParams.set(k, v);
    const headers = sign({
      method,
      url: url.toString(),
      body: body || '',
      accessKeyId: this.accessKeyId,
      secretAccessKey: this.secretAccessKey,
      region: this.region,
      date: new Date(),
    });
    delete headers.host; // lo pone fetch
    let res;
    try {
      res = await this.fetch(url, { method, headers, body, signal: AbortSignal.timeout(this.timeout) });
    } catch (e) {
      throw new S3Error(`Sin conexión con el almacenamiento externo (${e.cause?.code || e.name})`, 0);
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const code = /<Code>([^<]+)<\/Code>/.exec(text)?.[1];
      const msg =
        res.status === 403 || code === 'SignatureDoesNotMatch' || code === 'InvalidAccessKeyId'
          ? 'Las credenciales del almacenamiento externo no son válidas'
          : code === 'NoSuchBucket'
            ? `No existe el bucket "${this.bucket}"`
            : code === 'NoSuchKey'
              ? 'Ese respaldo no está en el almacenamiento externo'
              : `El almacenamiento externo respondió ${res.status}${code ? ' · ' + code : ''}`;
      throw new S3Error(msg, res.status);
    }
    return res;
  }

  async put(key, body) {
    await this.request('PUT', key, { body });
  }
  async get(key) {
    return Buffer.from(await (await this.request('GET', key)).arrayBuffer());
  }
  async del(key) {
    await this.request('DELETE', key);
  }
  // Lista los objetos con ese prefijo: [{ key, size, modified }]
  async list(prefix = '') {
    const out = [];
    let token;
    do {
      const xml = await (
        await this.request('GET', '', { query: { 'list-type': '2', prefix, 'continuation-token': token } })
      ).text();
      for (const [, item] of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
        const tag = (t) => new RegExp(`<${t}>([^<]*)</${t}>`).exec(item)?.[1];
        out.push({ key: unxml(tag('Key')), size: Number(tag('Size') || 0), modified: tag('LastModified') });
      }
      token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? unxml(/<NextContinuationToken>([^<]*)</.exec(xml)?.[1] || '')
        : undefined;
    } while (token);
    return out;
  }
}

const unxml = (s = '') =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
