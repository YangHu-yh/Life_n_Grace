import { NextRequest } from "next/server";

// Behind the Lambda Web Adapter, request.url / request.nextUrl.origin resolve
// to the adapter's internal proxy address (e.g. 0.0.0.0:3000), not the public
// Function URL — so any absolute redirect built from them sends the browser to
// a dead address. Prefer the explicit APP_BASE_URL env var (set in
// infra/lib/app-stack.ts), falling back to the request origin for local dev.
export function appOrigin(request: NextRequest): string {
  return (process.env.APP_BASE_URL ?? request.nextUrl.origin).replace(/\/$/, "");
}

export function appUrl(request: NextRequest, path: string): URL {
  return new URL(path, `${appOrigin(request)}/`);
}
