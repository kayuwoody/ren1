// 3. app/api/update-order/[orderId]/route.ts 
import { NextResponse } from "next/server";
import { updateWooOrder } from "@/lib/orderService";

export async function POST(
  req: Request,
  { params }: { params: { orderId: string } }
) {
  const id = parseInt(params.orderId, 10);
  if (isNaN(id)) return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });
  const payload = await req.json();
  const updated = await updateWooOrder(id, payload);
  return NextResponse.json(updated);
}