import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        canvas: "#071118",
        ink: "#f4f7fb",
        mist: "#a7b8cc",
        panel: "rgba(9, 22, 31, 0.78)",
        accent: "#70e7c3",
        amber: "#f4c56a",
        danger: "#ff8575"
      },
      fontFamily: {
        display: [
          "var(--font-space-grotesk)"
        ],
        body: [
          "var(--font-ibm-plex)"
        ]
      },
      boxShadow: {
        halo: "0 18px 60px rgba(3, 10, 18, 0.45)"
      },
      backgroundImage: {
        "signal-grid": "linear-gradient(rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.04) 1px, transparent 1px)"
      }
    }
  },
  plugins: []
};

export default config;
