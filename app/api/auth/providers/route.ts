import { NextResponse } from "next/server";
import { isGoogleConfigured } from "@/lib/security/google-oauth";

// Lets the login page render only the sign-in options that are actually
// configured in this environment.
export async function GET() {
  return NextResponse.json({ google: isGoogleConfigured() });
}
