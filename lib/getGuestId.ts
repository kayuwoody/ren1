// lib/getGuestId.ts
export function getGuestId(): string {
  if (typeof window === 'undefined') return ''; // SSR safety
  let gid = localStorage.getItem('guestId');
  if (!gid) {
    gid = crypto.randomUUID();
    localStorage.setItem('guestId', gid);
  }
  return gid;
}