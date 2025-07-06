// 5. app/api/orders/route.ts 
import { NextResponse } from "next/server";
import { findProcessingOrder } from "@/lib/orderService";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  if (!clientId) return NextResponse.json(null);
  const order = await findProcessingOrder(clientId);
  return NextResponse.json(order);
}
