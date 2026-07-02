import { ImageResponse } from "next/og";

export const alt = "Meu Controle Financeiro";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#F3F4F6",
          color: "#111827",
          fontFamily: "Arial",
        }}
      >
        <div
          style={{
            width: 1040,
            height: 470,
            display: "flex",
            alignItems: "center",
            gap: 56,
            padding: 64,
            borderRadius: 40,
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            boxShadow: "0 24px 70px rgba(15, 23, 42, 0.12)",
          }}
        >
          <div
            style={{
              width: 190,
              height: 190,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 44,
              background: "#111827",
            }}
          >
            <div
              style={{
                width: 116,
                height: 86,
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                padding: 18,
                borderRadius: 24,
                background: "#FFFFFF",
              }}
            >
              <div style={{ height: 10, borderRadius: 8, background: "#D1D5DB" }} />
              <div
                style={{
                  marginTop: 18,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 999,
                    background: "#10B981",
                    color: "#FFFFFF",
                    fontSize: 28,
                    fontWeight: 800,
                  }}
                >
                  $
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ width: 48, height: 9, borderRadius: 8, background: "#111827" }} />
                  <div style={{ width: 66, height: 9, borderRadius: 8, background: "#6B7280" }} />
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: "#10B981" }}>
              Sistema financeiro pessoal
            </div>
            <div
              style={{
                marginTop: 14,
                maxWidth: 680,
                fontSize: 72,
                lineHeight: 0.95,
                fontWeight: 900,
                letterSpacing: 0,
              }}
            >
              Meu Controle Financeiro
            </div>
            <div
              style={{
                marginTop: 28,
                maxWidth: 720,
                fontSize: 30,
                lineHeight: 1.25,
                color: "#6B7280",
              }}
            >
              Veja gastos, entradas, parcelas e o que falta pagar em cada mes.
            </div>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
