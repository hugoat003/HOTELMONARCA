// Almacenamiento externo de los respaldos a partir de las variables de entorno (null si no está configurado)
import { S3 } from './s3.js';

export const REMOTE_PREFIX = 'monarca/';

export function remoteFromEnv(env = process.env) {
  const { MONARCA_S3_ENDPOINT: endpoint, MONARCA_S3_BUCKET: bucket } = env;
  const { MONARCA_S3_KEY_ID: accessKeyId, MONARCA_S3_SECRET: secretAccessKey } = env;
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  return new S3({ endpoint, bucket, accessKeyId, secretAccessKey, region: env.MONARCA_S3_REGION || 'auto' });
}
