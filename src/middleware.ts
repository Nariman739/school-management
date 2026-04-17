export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: [
    // Защищаем все страницы кроме login и API auth
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
