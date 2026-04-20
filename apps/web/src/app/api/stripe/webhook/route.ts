import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Use backend Stripe webhook endpoint at /v1/stripe/webhook" },
    { status: 200 },
  );
}
