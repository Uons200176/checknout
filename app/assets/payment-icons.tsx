/**
 * Payment Method Icons — SVG Components
 *
 * Colored SVG icons for payment methods.
 * Each component accepts optional size and className props.
 *
 * Usage:
 *   import { BitcoinIcon, EthereumIcon } from "@/app/assets/payment-icons";
 *   <BitcoinIcon size={24} />
 */

interface IconProps {
    size?: number;
    className?: string;
}

// ─── Crypto Currency Icons ────────────────────────────────────────────────────

export function CryptocurrencyIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 500 500" xmlns="http://www.w3.org/2000/svg">
            <path d="M352.8 240.8c22.4-17.6 36.8-45.6 36.8-76v-3.2c0-3.2 0-6.4-.8-10.4v-2.4c0-2.4-.8-4.8-.8-7.2 0-.8-.8-1.6-.8-2.4-.8-2.4-.8-4.8-1.6-7.2 0-.8-.8-1.6-.8-2.4-.8-2.4-1.6-4.8-3.2-7.2 0-.8-.8-.8-.8-1.6-.8-2.4-2.4-4.8-4-7.2 0 0 0-.8-.8-.8l-4.8-7.2c-16.8-23.2-44-39.2-75.2-40.8V21.6c0-12-9.6-21.6-21.6-21.6s-21.6 9.6-21.6 21.6v43.2h-20V21.6c0-12-9.6-21.6-21.6-21.6s-21.6 9.6-21.6 21.6v43.2h-52.8c-12 0-21.6 9.6-21.6 21.6s9.6 21.6 21.6 21.6h53.6v.8c-.8 2.4-1.6 4.8-1.6 7.2v258.4H136c-12 0-21.6 9.6-21.6 21.6s9.6 21.6 21.6 21.6h52.8v48.8c0 12 9.6 21.6 21.6 21.6s21.6-9.6 21.6-21.6v-48.8h20.8v48.8c0 12 9.6 21.6 21.6 21.6s21.6-9.6 21.6-21.6v-49.6c52-1.6 93.6-44.8 93.6-96.8v-3.2c0-30.4-14.4-58.4-36.8-76m-6.4 79.2c0 29.6-24 53.6-53.6 53.6h-59.2V116c0-2.4-.8-4.8-1.6-7.2v-.8h60.8c13.6 0 26.4 4.8 35.2 13.6 8 7.2 14.4 16.8 16.8 28v.8c0 1.6.8 3.2.8 4.8v9.6c0 29.6-24 53.6-53.6 53.6-12 0-21.6 9.6-21.6 21.6v1.6c0 12 9.6 21.6 21.6 21.6 29.6 0 53.6 24 53.6 53.6v3.2z" style={{ opacity: 0.2, fill: "#b2b2b2" }} />
            <path d="M336.8 240.8c22.4-17.6 36.8-45.6 36.8-76v-3.2c0-52-41.6-95.2-93.6-96.8V21.6c0-12-9.6-21.6-21.6-21.6s-21.6 9.6-21.6 21.6v43.2h-20V21.6c0-12-9.6-21.6-21.6-21.6s-21.6 9.6-21.6 21.6v43.2h-52.8c-12 0-21.6 9.6-21.6 21.6s9.6 21.6 21.6 21.6h53.6v.8c-.8 2.4-1.6 4.8-1.6 7.2v258.4H120c-12 0-21.6 9.6-21.6 21.6s9.6 21.6 21.6 21.6h52.8v48.8c0 12 9.6 21.6 21.6 21.6s21.6-9.6 21.6-21.6v-48.8h20.8v48.8c0 12 9.6 21.6 21.6 21.6s21.6-9.6 21.6-21.6v-49.6c52-1.6 93.6-44.8 93.6-96.8v-3.2c0-30.4-14.4-58.4-36.8-76m-6.4 79.2c0 29.6-24 53.6-53.6 53.6h-59.2V116c0-2.4-.8-4.8-1.6-7.2v-.8h60.8c29.6 0 53.6 24 53.6 53.6v3.2c0 29.6-24 53.6-53.6 53.6-12 0-21.6 9.6-21.6 21.6v1.6c0 12 9.6 21.6 21.6 21.6 29.6 0 53.6 24 53.6 53.6z" style={{ fill: "#ffa300" }} />
            <path d="M330.4 161.6v3.2c0 29.6-24 53.6-53.6 53.6-12 0-21.6 9.6-21.6 21.6v1.6c0 12 9.6 21.6 21.6 21.6 29.6 0 53.6 24 53.6 53.6v3.2c0 29.6-24 53.6-53.6 53.6h-59.2V216l-43.2 43.2v115.2h-52.8c-12 0-21.6 9.6-21.6 21.6s9.6 21.6 21.6 21.6h52.8v48.8c0 12 9.6 21.6 21.6 21.6s21.6-9.6 21.6-21.6v-48.8h19.2v48.8c0 12 9.6 21.6 21.6 21.6s21.6-9.6 21.6-21.6v-49.6c52-1.6 93.6-44.8 93.6-96.8v-3.2c0-31.2-14.4-58.4-36.8-76 22.4-17.6 36.8-45.6 36.8-76v-3.2c0-28-12-52.8-31.2-70.4L312 121.6c11.2 9.6 18.4 24 18.4 40" style={{ fill: "#ff7300" }} />
        </svg>
    );
}

export function BitcoinIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#f7931a" />
            <path fill="#fff" fillRule="nonzero" d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839-.001-.001-.001-.001q-.562-.125-1.101-.258l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235q.073.017.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84q.707.19 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538m-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11m.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733" />
        </svg>
    );
}

export function EthereumIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path d="m10 0 6.079 10.046-6.057-2.589L9.999 0Z" fill="#E68F7B" />
            <path d="M3.936 10.046 10 0l.023 7.457-6.086 2.59Z" fill="#F8EC7C" />
            <path d="m10 13.75-6.064-3.704 6.086-2.589-.023 6.293Z" fill="#6EB87D" />
            <path d="m16.079 10.046-6.057-2.589-.023 6.293 6.08-3.704Z" fill="#946BA7" />
            <path d="m10 15.025 6.079-3.604-6.08 8.567v-4.963Z" fill="#697CB9" />
            <path d="m10 15.025-6.064-3.604L10 19.989v-4.963Z" fill="#4FADD0" />
        </svg>
    );
}

export function UsdtIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#26a17b" />
            <path fill="#fff" d="M17.922 17.383v-.002c-.11.008-.677.042-1.942.042-1.01 0-1.721-.03-1.971-.042v.003c-3.888-.171-6.79-.848-6.79-1.658s2.902-1.486 6.79-1.66v2.644c.254.018.982.061 1.988.061 1.207 0 1.812-.05 1.925-.06v-2.643c3.88.173 6.775.85 6.775 1.658 0 .81-2.895 1.485-6.775 1.657m0-3.59v-2.366h5.414V7.819H8.595v3.608h5.414v2.365c-4.4.202-7.709 1.074-7.709 2.118s3.309 1.915 7.709 2.118v7.582h3.913v-7.584c4.393-.202 7.694-1.073 7.694-2.116s-3.301-1.914-7.694-2.117" />
        </svg>
    );
}

export function UsdcIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#3e73c4" />
            <g fill="#fff">
                <path d="M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.243-2.193-.728-2.193-1.578s.61-1.396 1.828-1.396c1.097 0 1.707.364 2.011 1.275a.46.46 0 0 0 .427.303h.975a.416.416 0 0 0 .427-.425v-.06a3.04 3.04 0 0 0-2.743-2.489V9.142c0-.243-.183-.425-.487-.486h-.915c-.243 0-.426.182-.487.486v1.396c-1.829.242-2.986 1.456-2.986 2.974 0 2.002 1.218 2.791 3.778 3.095 1.707.303 2.255.668 2.255 1.639 0 .97-.853 1.638-2.011 1.638-1.585 0-2.133-.667-2.316-1.578-.06-.242-.244-.364-.427-.364h-1.036a.416.416 0 0 0-.426.425v.06c.243 1.518 1.219 2.61 3.23 2.914v1.457c0 .242.183.425.487.485h.915c.243 0 .426-.182.487-.485V21.34c1.829-.303 3.047-1.578 3.047-3.217z" />
                <path d="M12.892 24.497c-4.754-1.7-7.192-6.98-5.424-11.653.914-2.55 2.925-4.491 5.424-5.402.244-.121.365-.303.365-.607v-.85c0-.242-.121-.424-.365-.485-.061 0-.183 0-.244.06a10.895 10.895 0 0 0-7.13 13.717c1.096 3.4 3.717 6.01 7.13 7.102.244.121.488 0 .548-.243.061-.06.061-.122.061-.243v-.85c0-.182-.182-.424-.365-.546m6.46-18.936c-.244-.122-.488 0-.548.242-.061.061-.061.122-.061.243v.85c0 .243.182.485.365.607 4.754 1.7 7.192 6.98 5.424 11.653-.914 2.55-2.925 4.491-5.424 5.402-.244.121-.365.303-.365.607v.85c0 .242.121.424.365.485.061 0 .183 0 .244-.06a10.895 10.895 0 0 0 7.13-13.717c-1.096-3.46-3.778-6.07-7.13-7.162" />
            </g>
        </svg>
    );
}

export function LitecoinIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#BFBBBB" />
            <path fill="#fff" d="M10.427 20.58l1.228-4.653-1.472.618.618-2.35 1.498-.627L14.1 7.619h4.928l-1.345 5.105 1.497-.627-.591 2.35-1.498.609-1.003 3.803h6.903L22.2 21.38H10.181z" />
        </svg>
    );
}

export function TronIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#ef0027" />
            <path fill="#fff" d="M21.932 9.913 7.5 7.257l7.595 19.112 10.583-12.894zm-.232 1.17 2.208 2.099-6.038 1.093zm-5.142 2.973-6.364-5.278 10.402 1.914zm-.453.934-1.038 8.58L9.472 9.487zm.96.455 6.687-1.21-7.67 9.343z" />
        </svg>
    );
}

export function BnbIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#f3ba2f" />
            <path fill="#fff" d="M12.116 14.404 16 10.52l3.886 3.886 2.26-2.26L16 6l-6.144 6.144zM6 16l2.26-2.26L10.52 16l-2.26 2.26zm6.116 1.596L16 21.48l3.886-3.886 2.26 2.259L16 26l-6.144-6.144-.003-.003zM21.48 16l2.26-2.26L26 16l-2.26 2.26zm-3.188-.002h.002V16L16 18.294l-2.291-2.29-.004-.004.004-.003.401-.402.195-.195L16 13.706z" />
        </svg>
    );
}

export function SolanaIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="16" fill="#9945FF" />
            <path fill="#fff" d="M9.8 19.8a.5.5 0 0 1 .35-.15h13.1a.25.25 0 0 1 .18.43l-2.23 2.22a.5.5 0 0 1-.35.15H7.75a.25.25 0 0 1-.18-.43zm0-9.6a.5.5 0 0 1 .35-.15h13.1a.25.25 0 0 1 .18.43l-2.23 2.22a.5.5 0 0 1-.35.15H7.75a.25.25 0 0 1-.18-.43zm11.23 4.85a.5.5 0 0 1-.35.15H7.57a.25.25 0 0 1-.18-.43l2.23-2.22a.5.5 0 0 1 .35-.15h13.1a.25.25 0 0 1 .18.43z" />
        </svg>
    );
}

// ─── Payment Provider & Card Brand Icons ──────────────────────────────────────

export function PaypalIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="24" fill="#009cde" />
            <path fill="#fff" d="M31.5 16.5c0 4.5-3.1 7.7-7.5 7.7h-3.8l-1.4 8.1H14l3.6-20.5h7.1c3.8 0 6.8 2 6.8 4.7z" />
            <path fill="#c8e8f5" d="M34.2 21.6c0 4.5-3.1 7.7-7.5 7.7h-2.8L22.3 38h-4.8l3.6-20.5h7.8c3.5 0 5.3 1.7 5.3 4.1z" />
        </svg>
    );
}

export function CardViaCryptoIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 42 28" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <linearGradient id="cvg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#ba1212" />
                    <stop offset="100%" stopColor="#ff7575" />
                </linearGradient>
            </defs>
            <rect width="42" height="28" rx="4" fill="url(#cvg)" />
            <rect y="6" width="42" height="8" fill="rgba(0,0,0,0.25)" />
            <circle cx="14" cy="21" r="4" fill="#eb001b" opacity="0.9" />
            <circle cx="20" cy="21" r="4" fill="#f79e1b" opacity="0.85" />
            <rect x="26" y="18" width="10" height="6" rx="1" fill="rgba(255,255,255,0.35)" />
        </svg>
    );
}

/** ── Visa ── clean blue on white pill */
export function VisaIcon({ size = 36, className }: IconProps) {
    const h = Math.round((size * 20) / 36);
    return (
        <svg width={size} height={h} className={className} viewBox="0 0 750 471" xmlns="http://www.w3.org/2000/svg">
            <rect width="750" height="471" rx="40" fill="#fff" />
            <path fill="#1a1f71" d="M278.2 334.5 312 136.9h54.1L332.3 334.5zM524.3 141.6c-10.7-4-27.5-8.3-48.5-8.3-53.4 0-91 26.9-91.4 65.5-.3 28.5 26.9 44.4 47.4 53.9 21 9.7 28.1 15.9 28 24.6-.1 13.3-16.8 19.4-32.3 19.4-21.6 0-33.1-3-50.8-10.4l-7-3.2-7.5 44.4c12.6 5.5 35.9 10.3 60.1 10.6 56.7 0 93.5-26.6 93.9-67.8.2-22.6-14.2-39.7-45.3-53.9-18.9-9.2-30.4-15.3-30.3-24.6 0-8.2 9.8-17 31-17 17.7-.3 30.5 3.6 40.5 7.6l4.8 2.3zM612.4 136.9h-41.7c-12.9 0-22.6 3.5-28.3 16.5l-80.2 181.1h56.7l11.3-29.8h69.3l6.6 29.8h50l-43.7-197.6zm-66.5 128.4c4.5-11.4 21.5-55.4 21.5-55.4-.3.5 4.4-11.5 7.2-19l3.6 17.1s10.3 47.3 12.5 57.3zm-268-128.4-52.9 135.4-5.6-27.5c-9.8-31.7-40.5-66-74.7-83.2l48.3 173.5 57.1-.1 84.9-197.9z" />
            <path fill="#f9a51a" d="M148.3 136.9H63L62.3 141c66.3 16.1 110.2 55 128.4 101.7l-18.5-90c-3.2-12.6-12.7-16.3-23.9-15.8z" />
        </svg>
    );
}

/** ── Mastercard ── red/orange circles on white */
export function MasterCardIcon({ size = 36, className }: IconProps) {
    const h = Math.round((size * 22) / 36);
    return (
        <svg width={size} height={h} className={className} viewBox="0 0 152 95" xmlns="http://www.w3.org/2000/svg">
            <rect width="152" height="95" rx="8" fill="#fff" stroke="#e0e0e0" strokeWidth="1.5" />
            <circle cx="57" cy="47.5" r="28" fill="#eb001b" />
            <circle cx="95" cy="47.5" r="28" fill="#f79e1b" />
            <path fill="#ff5f00" d="M76 23.3a28 28 0 0 1 0 48.4 28 28 0 0 1 0-48.4z" />
        </svg>
    );
}

/** ── American Express ── blue card with AMEX text */
export function AmericanExpressIcon({ size = 36, className }: IconProps) {
    const h = Math.round((size * 22) / 36);
    return (
        <svg width={size} height={h} className={className} viewBox="0 0 152 95" xmlns="http://www.w3.org/2000/svg">
            <rect width="152" height="95" rx="8" fill="#2557D6" />
            <text x="76" y="58" fontFamily="Arial, Helvetica, sans-serif" fontSize="24" fontWeight="bold" fill="#fff" textAnchor="middle" letterSpacing="1">AMEX</text>
        </svg>
    );
}

/** ── Google Pay ── white pill with G-Pay logo colors */
export function GooglePayIcon({ size = 36, className }: IconProps) {
    const h = Math.round((size * 22) / 36);
    return (
        <svg width={size} height={h} className={className} viewBox="0 0 152 95" xmlns="http://www.w3.org/2000/svg">
            <rect width="152" height="95" rx="8" fill="#fff" stroke="#e0e0e0" strokeWidth="1.5" />
            {/* G letter */}
            <path fill="#4285F4" d="M44 47.5c0-8 6.5-14.5 14.5-14.5 3.8 0 7.1 1.4 9.6 3.7l-3.9 3.9c-1.5-1.4-3.5-2.3-5.7-2.3-5 0-9 4-9 9s4 9 9 9c4.5 0 7.6-2.6 8.2-6.3H58.5v-5.2h14.8c.2.8.2 1.6.2 2.5 0 8.3-5.6 14.3-15 14.3-8 0-14.5-6.5-14.5-14.1z" />
            {/* Pay text */}
            <text x="80" y="55" fontFamily="Arial, Helvetica, sans-serif" fontSize="22" fontWeight="500" fill="#3c4043" letterSpacing="-0.5">Pay</text>
        </svg>
    );
}

/** ── Discover ── orange circle mark on white */
export function DiscoverIcon({ size = 36, className }: IconProps) {
    const h = Math.round((size * 22) / 36);
    return (
        <svg width={size} height={h} className={className} viewBox="0 0 152 95" xmlns="http://www.w3.org/2000/svg">
            <rect width="152" height="95" rx="8" fill="#fff" stroke="#e0e0e0" strokeWidth="1.5" />
            <circle cx="115" cy="47.5" r="28" fill="#f47216" />
            <text x="32" y="55" fontFamily="Arial, Helvetica, sans-serif" fontSize="16" fontWeight="bold" fill="#4d4d4d" letterSpacing="0">DISCOVER</text>
        </svg>
    );
}

/** ── UnionPay ── three-stripe logo */
export function UnionpayIcon({ size = 36, className }: IconProps) {
    const h = Math.round((size * 22) / 36);
    return (
        <svg width={size} height={h} className={className} viewBox="0 0 152 95" xmlns="http://www.w3.org/2000/svg">
            <rect width="152" height="95" rx="8" fill="#fff" stroke="#e0e0e0" strokeWidth="1.5" />
            <rect x="18" y="12" width="32" height="71" rx="10" fill="#D10429" />
            <rect x="55" y="12" width="32" height="71" rx="10" fill="#022E64" />
            <rect x="92" y="12" width="32" height="71" rx="10" fill="#076F74" />
        </svg>
    );
}

export function CardIcon({ size = 32, className }: IconProps) {
    return (
        <svg width={size} height={size} className={className} viewBox="0 0 42 28" xmlns="http://www.w3.org/2000/svg">
            <rect width="42" height="28" rx="4" fill="#4f46e5" />
            <rect y="6" width="42" height="9" fill="rgba(0,0,0,0.25)" />
            <rect x="5" y="19" width="10" height="4" rx="1" fill="#f2c72c" />
            <rect x="17" y="19" width="7" height="4" rx="1" fill="rgba(255,255,255,0.35)" />
        </svg>
    );
}
