import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";

// Cloudflare Web Analytics: cookieless, no personal data, no cross-site tracking.
// Loads only when a beacon token is configured (production build), so local dev
// and the seed-data fallback send nothing. Token is a public value, not a secret.
const cfToken = import.meta.env.VITE_CF_BEACON_TOKEN;
if (cfToken) {
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.setAttribute("data-cf-beacon", JSON.stringify({ token: cfToken }));
  document.head.appendChild(s);
}

createRoot(document.getElementById("root")).render(<App />);
