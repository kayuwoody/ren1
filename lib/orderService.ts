import { wcApi } from './wooClient';

/* ------------------------------------------------------------------
 * Types (lightweight; extend if you want stricter typing)
 * ---------------------------------------------------------------- */
export type WooMeta = { key: string; value: any };
export type WooLineItem = {
  product_id: number;
  quantity: number;
  variation_id?: number;
};
export type WooOrder = any; // replace with full Woo order type if desired

export interface NewOrderPayload {
  line_items: WooLineItem[];
  userId?: number;              // Woo customer_id if authenticated
  guestId?: string;             // anonymous session id (local)
  status?: string;              // optional override (default Woo behavior)
  billing?: Record<string, any>;
  shipping?: Record<string, any>;
  meta_data?: WooMeta[];        // additional custom meta
}

/* ------------------------------------------------------------------
 * Utilities
 * ---------------------------------------------------------------- */
function buildCreatePayload(p: NewOrderPayload) {
  const {
    line_items,
    userId,
    guestId,
    status,
    billing,
    shipping,
    meta_data = [],
  } = p;

  const payload: Record<string, any> = {
    line_items,
  };

  if (userId) {
    payload.customer_id = userId;
  } else if (guestId) {
    payload.meta_data = [...meta_data, { key: 'guestId', value: guestId }];
  } else if (meta_data.length) {
    payload.meta_data = meta_data;
  }

  if (status) payload.status = status;
  if (billing) payload.billing = billing;
  if (shipping) payload.shipping = shipping;

  return payload;
}

function buildMetaPatch(meta: WooMeta[] = []) {
  return { meta_data: meta };
}

function logWooErr(where: string, err: any) {
  // Woo errors often land in err.response.data
  const detail = err?.response?.data ?? err;
  console.error(`❌ Woo error in ${where}:`, detail);
  return detail;
}

/* ------------------------------------------------------------------
 * CREATE
 * ---------------------------------------------------------------- */
export async function createWooOrder(payload: NewOrderPayload): Promise<WooOrder> {
  const wooPayload = buildCreatePayload(payload);
  try {
    const { data } = await wcApi.post('orders', wooPayload);
    return data;
  } catch (err: any) {
    throw logWooErr('createWooOrder', err);
  }
}

/* ------------------------------------------------------------------
 * READ SINGLE
 * ---------------------------------------------------------------- */
export async function getWooOrder(id: number | string): Promise<WooOrder> {
  try {
    const { data } = await wcApi.get(`orders/${id}`);
    return data;
  } catch (err: any) {
    throw logWooErr('getWooOrder', err);
  }
}

/* ------------------------------------------------------------------
 * UPDATE / PATCH (generic)
 * ---------------------------------------------------------------- */
export async function updateWooOrder(
  id: number | string,
  patch: Record<string, any>
): Promise<WooOrder> {
  try {
    const { data } = await wcApi.put(`orders/${id}`, patch);
    return data;
  } catch (err: any) {
    throw logWooErr('updateWooOrder', err);
  }
}

/* ------------------------------------------------------------------
 * Update status convenience
 * ---------------------------------------------------------------- */
export async function setWooOrderStatus(
  id: number | string,
  status: string
): Promise<WooOrder> {
  return updateWooOrder(id, { status });
}

/* ------------------------------------------------------------------
 * Add / replace meta convenience
 * NOTE: Woo PUT is *replace*, so include full meta_data you want persisted
 * If you want to append, first fetch existing, then merge.
 * ---------------------------------------------------------------- */
export async function appendWooOrderMeta(
  id: number | string,
  newMeta: WooMeta[]
): Promise<WooOrder> {
  // fetch current
  const current = await getWooOrder(id);
  const combined = [
    ...(current?.meta_data?.map((m: any) => ({ key: m.key, value: m.value })) ?? []),
    ...newMeta,
  ];
  return updateWooOrder(id, buildMetaPatch(combined));
}

/* ------------------------------------------------------------------
 * Mark Ready-to-Pickup helper
 * (attach locker/pickup fields if provided; adjust keys to your store)
 * ---------------------------------------------------------------- */
export interface ReadyPayload {
  locker?: string;
  pickupCode?: string;
  qrUrl?: string;
  status?: string; // default 'ready-to-pickup'
}

export async function markOrderReadyForPickup(
  id: number | string,
  { locker, pickupCode, qrUrl, status = 'ready-to-pickup' }: ReadyPayload
): Promise<WooOrder> {
  const meta: WooMeta[] = [];
  if (locker) meta.push({ key: '_locker_number', value: locker });
  if (pickupCode) meta.push({ key: '_pickup_code', value: pickupCode });
  if (qrUrl) meta.push({ key: '_pickup_qr_url', value: qrUrl });

  // patch both status + meta
  const current = await getWooOrder(id);
  const combined = [
    ...(current?.meta_data?.map((m: any) => ({ key: m.key, value: m.value })) ?? []),
    ...meta,
  ];

  return updateWooOrder(id, {
    status,
    meta_data: combined,
  });
}

/* ------------------------------------------------------------------
 * LIST: logged-in Woo customer
 * ---------------------------------------------------------------- */
export interface ListParams {
  status?: string;  // comma-separated list or single
  per_page?: number;
  page?: number;
}

export async function listOrdersByUser(
  userId: number,
  { status, per_page = 50, page = 1 }: ListParams = {}
): Promise<WooOrder[]> {
  const params: Record<string, any> = {
    customer: userId,
    per_page,
    page,
  };
  if (status) params.status = status;

  try {
    const { data } = await wcApi.get('orders', params);
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    throw logWooErr('listOrdersByUser', err);
  }
}

/* ------------------------------------------------------------------
 * LIST: guest orders via meta guestId
 * ---------------------------------------------------------------- */
export async function listOrdersByGuest(
  guestId: string,
  { status, per_page = 50, page = 1 }: ListParams = {}
): Promise<WooOrder[]> {
  const params: Record<string, any> = {
    meta_key: 'guestId',
    meta_value: guestId,
    per_page,
    page,
  };
  if (status) params.status = status;

  try {
    const { data } = await wcApi.get('orders', params);
    return Array.isArray(data) ? data : [];
  } catch (err: any) {
    throw logWooErr('listOrdersByGuest', err);
  }
}
