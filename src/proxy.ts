export { middleware as proxy } from "./lib/supabase/middleware";
export const config = { matcher: ["/portal/:path*"] };
