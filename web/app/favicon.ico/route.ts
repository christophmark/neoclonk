export function GET(request: Request) {
  return Response.redirect(new URL('/rage/clonk.ico', request.url), 307);
}
