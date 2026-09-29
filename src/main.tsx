import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

const root = createRoot(document.getElementById("root")!);

// Página de amostras (src/dev/Amostras.tsx): só em `npm run dev`. No build, `import.meta.env.DEV`
// vira `false` e o Vite remove este ramo inteiro — o arquivo nem entra no bundle de produção.
if (import.meta.env.DEV && window.location.pathname.startsWith("/dev/amostras")) {
  import("./dev/Amostras").then(({ default: Amostras }) =>
    root.render(
      <StrictMode>
        <Amostras />
      </StrictMode>,
    ),
  );
} else {
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
