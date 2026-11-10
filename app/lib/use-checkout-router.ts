"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { themedCheckoutHref } from "./checkout-theme";

/** All internal checkout transitions carry appearance through refresh/back/forward. */
export function useCheckoutRouter() {
    const router = useRouter();
    return useMemo(() => ({
        ...router,
        push: (href: string, options?: Parameters<typeof router.push>[1]) => router.push(themedCheckoutHref(href), options),
        replace: (href: string, options?: Parameters<typeof router.replace>[1]) => router.replace(themedCheckoutHref(href), options),
    }), [router]);
}
