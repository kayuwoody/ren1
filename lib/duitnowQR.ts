/**
 * DuitNow QR Generator
 *
 * Generates EMVCo-compliant DuitNow QR payloads.
 * Supports two providers:
 *   - Hong Leong merchant QR (static only — dynamic rejected by acquirer)
 *   - TNG eWallet QR (supports dynamic with pre-filled amount)
 */

// Hong Leong DuitNow merchant account
const HONG_LEONG = {
  aid: 'A0000006150001',
  proxyType: '588830',
  proxyValue: '0MYM2609241727325406698',
  mcc: '5812',
  name: 'COFFEE OASIS',
  terminalId: '01',
};

// TNG eWallet account
const TNG_WALLET = {
  aid: 'A0000006150001',
  proxyType: '890053',
  proxyValue: '140504204365',
  mcc: '0000',
  name: 'DANNYLIMTHIAMEE',
  terminalId: '687047754',
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

function generateReference(): string {
  let ref = '';
  for (let i = 0; i < 25; i++) {
    ref += Math.floor(Math.random() * 10).toString();
  }
  return ref;
}

function buildPayload(
  account: typeof HONG_LEONG,
  poiMethod: string,
  amount?: number,
): string {
  const merchantAccount =
    tlv('00', account.aid) +
    tlv('01', account.proxyType) +
    tlv('02', account.proxyValue);

  let additionalData: string;
  if (poiMethod === '12' && amount !== undefined) {
    additionalData = tlv('05', generateReference()) + tlv('06', account.terminalId);
  } else {
    additionalData = tlv('06', account.terminalId);
  }

  let payload = '';
  payload += tlv('00', '02');
  payload += tlv('01', poiMethod);
  payload += tlv('26', merchantAccount);
  payload += tlv('52', account.mcc);
  payload += tlv('53', '458');
  if (amount !== undefined) {
    payload += tlv('54', amount.toFixed(2));
  }
  payload += tlv('58', 'MY');
  payload += tlv('59', account.name);
  payload += tlv('60', 'MY');
  payload += tlv('62', additionalData);
  payload += '6304';
  payload += crc16CcittFalse(payload);

  return payload;
}

/** TNG eWallet dynamic QR with pre-filled amount */
export function generateTngWalletQR(amount: number): string {
  return buildPayload(TNG_WALLET, '12', amount);
}

/** TNG eWallet static QR (no amount) */
export function generateTngWalletStaticQR(): string {
  return buildPayload(TNG_WALLET, '11');
}

/** Hong Leong DuitNow static QR (dynamic not supported by acquirer) */
export function generateDuitNowQR(): string {
  return buildPayload(HONG_LEONG, '11');
}

/** Hong Leong DuitNow static QR */
export function generateStaticDuitNowQR(): string {
  return buildPayload(HONG_LEONG, '11');
}
