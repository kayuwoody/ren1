// lib/getClientId.ts
export function getClientId(): string {
  let cid = localStorage.getItem('clientId');

  if (!cid) {
    cid = crypto.randomUUID();
    localStorage.setItem('clientId', cid);
  }

  return cid;
}
