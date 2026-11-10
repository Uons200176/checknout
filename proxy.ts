import { NextRequest, NextResponse } from "next/server";
import { parseCheckoutTheme, THEME_HEADER } from "./app/lib/checkout-theme";

// Root layouts do not receive searchParams. Forward only the validated URL mode
// on the request so the very first HTML paint already has the correct palette.
export function proxy(request: NextRequest) {
    const headers = new Headers(request.headers);
    headers.set(THEME_HEADER, parseCheckoutTheme(request.nextUrl.searchParams.get("theme")) ?? "");
    return NextResponse.next({ request: { headers } });
}

export const config = { matcher: ["/", "/checkout/:path*"] };
