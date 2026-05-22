/**
 * DuitNow Dynamic QR Generator
 *
 * Generates EMVCo-compliant DuitNow QR payloads with a pre-filled payment amount.
 * Based on Coffee Oasis's static TNG merchant QR.
 */

const MERCHANT_ACCOUNT = {
  aid: 'A0000006150001',
  proxyType: '588830',
  proxyValue: '0MYM2609241727325406698',
};

const MERCHANT_INFO = {
  mcc: '5812',
  currency: '458',
  country: 'MY',
  name: 'COFFEE OASIS',
  city: 'MY',
};

function tlv(tag: string, value: string): string {
  return `${tag}${String(value.length).padStart(2, '0')}${value}`;
}

function crc16CcittFalse(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function generateDuitNowQR(amount: number): string {
  const merchantAccount =
    tlv('00', MERCHANT_ACCOUNT.aid) +
    tlv('01', MERCHANT_ACCOUNT.proxyType) +
    tlv('02', MERCHANT_ACCOUNT.proxyValue);

  let payload = '';
  payload += tlv('00', '01');
  payload += tlv('01', '12');
  payload += tlv('26', merchantAccount);
  payload += tlv('52', MERCHANT_INFO.mcc);
  payload += tlv('53', MERCHANT_INFO.currency);
  payload += tlv('54', amount.toFixed(2));
  payload += tlv('58', MERCHANT_INFO.country);
  payload += tlv('59', MERCHANT_INFO.name);
  payload += tlv('60', MERCHANT_INFO.city);
  payload += tlv('62', tlv('08', '01'));
  payload += '6304';
  payload += crc16CcittFalse(payload);

  return payload;
}

export function generateStaticDuitNowQR(): string {
  const merchantAccount =
    tlv('00', MERCHANT_ACCOUNT.aid) +
    tlv('01', MERCHANT_ACCOUNT.proxyType) +
    tlv('02', MERCHANT_ACCOUNT.proxyValue);

  let payload = '';
  payload += tlv('00', '01');
  payload += tlv('01', '11');
  payload += tlv('26', merchantAccount);
  payload += tlv('52', MERCHANT_INFO.mcc);
  payload += tlv('53', MERCHANT_INFO.currency);
  payload += tlv('58', MERCHANT_INFO.country);
  payload += tlv('59', MERCHANT_INFO.name);
  payload += tlv('60', MERCHANT_INFO.city);
  payload += tlv('62', tlv('08', '01'));
  payload += '6304';
  payload += crc16CcittFalse(payload);

  return payload;
}
