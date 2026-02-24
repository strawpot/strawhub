import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";
import { ConvexReactClient } from "convex/react";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { createRouter } from "./router";

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);
const router = createRouter();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <RouterProvider router={router} />
    </ConvexAuthProvider>
  </React.StrictMode>,
);
