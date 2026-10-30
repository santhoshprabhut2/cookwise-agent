import type { MetadataRoute } from "next";
import { BASE_PATH, pagePath, withBasePath } from "@/lib/base-path";

// A static export needs to know this route never reads the request.
export const dynamic = "force-static";

/**
 * Served at /manifest.webmanifest (referenced from the root layout metadata).
 *
 * Colours match the design tokens in globals.css: --bg #f6f7f4 for the splash
 * background, --primary #1f6b45 for the theme. Icons come from public/icons/,
 * regenerate them with `scripts/gen-icons.py`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cookwise",
    short_name: "Cookwise",
    description:
      "Cook smarter, live healthier. Plan meals, track your pantry, cook with live measurements and see exactly how much nutrition survives the pan.",
    id: pagePath("/"),
    start_url: pagePath("/home"),
    scope: `${BASE_PATH}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f7f4",
    theme_color: "#1f6b45",
    categories: ["food", "health", "lifestyle", "productivity"],
    lang: "en",
    dir: "ltr",
    icons: [
      {
        src: withBasePath("/icons/icon.svg"),
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: withBasePath("/icons/icon-192.png"),
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/icons/icon-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: withBasePath("/icons/maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Today's plan",
        short_name: "Plan",
        url: pagePath("/plan"),
        icons: [{ src: withBasePath("/icons/icon-192.png"), sizes: "192x192" }],
      },
      {
        name: "Start cooking",
        short_name: "Cook",
        url: pagePath("/cook"),
        icons: [{ src: withBasePath("/icons/icon-192.png"), sizes: "192x192" }],
      },
      {
        name: "Pantry",
        short_name: "Pantry",
        url: pagePath("/pantry"),
        icons: [{ src: withBasePath("/icons/icon-192.png"), sizes: "192x192" }],
      },
    ],
  };
}
