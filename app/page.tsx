"use client";

export default function Home() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "60px 24px",
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "400px" }}>
        <div style={{ marginBottom: "20px" }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto" }}>
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1
          style={{
            fontSize: "24px",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "12px",
          }}
        >
          Direct Access Disabled
        </h1>
        <p style={{ fontSize: "15px", color: "var(--text-secondary)", lineHeight: 1.6, marginBottom: "30px" }}>
          Please initiate your checkout from our main website.
        </p>
        <button
           onClick={() => window.history.back()}
           style={{
             padding: "12px 24px",
             background: "var(--bg-elevated)",
             border: "1px solid var(--border)",
             borderRadius: "var(--radius-sm)",
             color: "var(--text-primary)",
             fontSize: "14px",
             fontWeight: 600,
             cursor: "pointer",
             transition: "all var(--transition)"
           }}
           onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border-hover)" }}
           onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)" }}
        >
          Go Back
        </button>
      </div>
    </div>
  );
}
