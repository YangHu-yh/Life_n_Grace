import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Keep this self-contained (jose only) — importing lib/auth would pull
// bcryptjs into the edge bundle. The cookie name mirrors lib/auth.ts.
const TOKEN_COOKIE = "auth_token";

function getSecret() {
  const secret = process.env.AUTH_JWT_SECRET;
  return secret ? new TextEncoder().encode(secret) : null;
}

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(TOKEN_COOKIE)?.value;
  const secret = getSecret();

  if (token && secret) {
    try {
      await jwtVerify(token, secret);
      return NextResponse.next();
    } catch {
      // invalid/expired token → treat as unauthenticated
    }
  }

  const loginUrl = new URL("/login", request.url);
  return NextResponse.redirect(loginUrl);
}

// Only guard the authenticated workspace routes. API routes keep their own
// getUserIdFromRequest checks (defense in depth); everything else is public.
export const config = {
  matcher: [
    "/prayers/:path*",
    "/companion/:path*",
    "/profile/:path*",
    "/topics/:path*"
  ]
};
