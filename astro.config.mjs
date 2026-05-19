import { defineConfig } from "astro/config";
import solid from "@astrojs/solid-js";
import tailwind from "@astrojs/tailwind";

// `base` and `site` are env-driven so we can switch between the GH Pages
// project URL (penta2himajin.github.io/openridge/) and a root-served custom
// domain (openridge.dev) without touching this file. Defaults match the
// current state (project URL); flip via deploy.yml env once DNS is live.
const base = process.env.SITE_BASE ?? "/openridge";
const site = process.env.SITE_URL ?? "https://penta2himajin.github.io";

// https://astro.build/config
export default defineConfig({
  site,
  base,
  integrations: [solid(), tailwind({ applyBaseStyles: false })],
  output: "static",
  build: {
    assets: "_assets",
  },
});
