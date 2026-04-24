import crypto from 'crypto';

function md5(v: string) {
  return crypto.createHash('md5').update(v).digest('hex');
}

export function verifyFiuuCallback(body: Record<string, string>): boolean {
  const secretKey = process.env.FIUU_SECRET_KEY;
  if (!secretKey) throw new Error('FIUU_SECRET_KEY not set');

  const { tranID, orderID, status, domain, amount, currency, paydate, skey } = body;
  const raw = `${tranID}${orderID}${status}${domain}${amount}${currency}${paydate}${secretKey}`;
  const expected = md5(md5(raw));
  return expected === skey;
}

/** Fiuu status code "00" = approved */
export function isFiuuSuccess(status: string) {
  return status === '00';
}
