import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PROTECTED_PATHS = [
  "/dashboard",
  "/analyzer",
  "/bpm",
  "/similar",
  "/extract",
  "/generator",
  "/chords",
];

const AUTH_PATHS = ["/login", "/signup"];

export async function middleware(request: NextRequest) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(
        cookiesToSet: Array<{
          name: string;
          value: string;
          options?: Parameters<typeof response.cookies.set>[2];
        }>,
      ) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`),
  );
  const isAuthPath = AUTH_PATHS.some((path) => pathname === path);

  if (isProtected && !user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthPath && user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/analyzer/:path*",
    "/bpm/:path*",
    "/similar/:path*",
    "/extract/:path*",
    "/generator/:path*",
    "/chords/:path*",
    "/login",
    "/signup",
  ],
};
