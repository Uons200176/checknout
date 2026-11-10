"use client";

interface CheckoutFooterProps {
    /** Brand display name — falls back to a neutral label. */
    brandName?: string;
    /** "© {year} {brand}. All rights reserved." template (localized). */
    rightsTemplate?: string;
    /** Per-site support links from site_settings — only rendered when set. */
    supportLinks?: {
        whatsapp?: string | null;
        telegram?: string | null;
        email?: string | null;
    };
}

export default function CheckoutFooter({
    brandName,
    rightsTemplate = "© {year} {brand}. All rights reserved.",
    supportLinks,
}: CheckoutFooterProps) {
    const rights = rightsTemplate
        .replace("{year}", String(new Date().getFullYear()))
        .replace("{brand}", brandName || "Premium IPTV");

    const links: { label: string; href: string }[] = [];
    if (supportLinks?.whatsapp) links.push({ label: "WhatsApp", href: supportLinks.whatsapp });
    if (supportLinks?.telegram) links.push({ label: "Telegram", href: supportLinks.telegram });
    if (supportLinks?.email) links.push({ label: "Email", href: `mailto:${supportLinks.email}` });

    return (
        <footer
            style={{
                borderTop: "1px solid var(--border)",
                padding: "24px 0",
                marginTop: "auto",
            }}
        >
            <div
                style={{
                    maxWidth: "1100px",
                    margin: "0 auto",
                    padding: "0 24px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: "12px",
                }}
            >
                <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>{rights}</p>

                {links.length > 0 && (
                    <div style={{ display: "flex", gap: "20px" }}>
                        {links.map((link) => (
                            <a
                                key={link.label}
                                href={link.href}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{
                                    fontSize: "12px",
                                    color: "var(--text-tertiary)",
                                    textDecoration: "none",
                                    transition: "color var(--transition)",
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = "var(--text-secondary)";
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = "var(--text-tertiary)";
                                }}
                            >
                                {link.label}
                            </a>
                        ))}
                    </div>
                )}
            </div>
        </footer>
    );
}
