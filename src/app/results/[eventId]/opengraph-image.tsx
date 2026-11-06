import { ImageResponse } from "next/og";

export const alt = "SRB Event Results";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(<div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#0f172a", color: "white", padding: "72px", fontFamily: "sans-serif" }}><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><div style={{ display: "flex", fontSize: 55, fontWeight: 900, letterSpacing: "-4px" }}>SRB<span style={{ color: "#a78bfa" }}>.</span></div><div style={{ display: "flex", color: "#c4b5fd", fontSize: 20, letterSpacing: "4px", fontWeight: 700 }}>SOPHIA UNIVERSITY</div></div><div style={{ display: "flex", flexDirection: "column" }}><div style={{ display: "flex", color: "#c4b5fd", fontWeight: 700, fontSize: 22, letterSpacing: "6px" }}>PLAY / CREATE / SHARE</div><div style={{ display: "flex", fontWeight: 900, fontSize: 110, lineHeight: 1.1, marginTop: 25 }}>EVENT</div><div style={{ display: "flex", color: "#c4b5fd", fontWeight: 900, fontSize: 110, lineHeight: 1.1 }}>RESULTS.</div></div><div style={{ display: "flex", borderTop: "2px solid #334155", paddingTop: 24, color: "#94a3b8", fontSize: 20, letterSpacing: "3px" }}>SRB OFFICIAL WEBSITE</div></div>, size);
}
