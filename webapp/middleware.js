import { NextResponse } from 'next/server';

export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Public routes that don't require authentication
  const publicRoutes = ['/login', '/api/auth/login'];
  
  if (publicRoutes.includes(pathname)) {
    return NextResponse.next();
  }

  // Check for JWT in cookies for UI routes
  if (pathname.startsWith('/api/')) {
    // API routes use API key in header
    return NextResponse.next();
  }

  // Web UI routes require JWT
  const token = request.cookies.get('jwt')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
