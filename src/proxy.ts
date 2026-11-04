import { auth } from "@/auth";
import { NextResponse } from "next/server";

/**
 * Route protection (Next.js "proxy" convention, formerly middleware).
 *
 * Unauthenticated users hitting an app route (chat, vault, mentorship) are sent
 * to the landing page to sign in. The matcher deliberately excludes Next.js
 * internals, static assets, and the auth API itself.
 */
export default auth((req) => {
  const isLoggedIn = !!req.auth?.user;
  const { pathname } = req.nextUrl;

  const isProtected =
    pathname.startsWith("/chat") ||
    pathname.startsWith("/vault") ||
    pathname.startsWith("/mentorship");

  if (isProtected && !isLoggedIn) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|favicon.ico|logo|.*\\.svg|.*\\.png).*)"],
};
