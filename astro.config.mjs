import { defineConfig } from "astro/config";
import solid from "@astrojs/solid-js";
import tailwind from "@astrojs/tailwind";

// https://astro.build/config
export default defineConfig({
  site: "https://openridge.dev",
  integrations: [solid(), tailwind({ applyBaseStyles: false })],
  output: "static",
  build: {
    assets: "_assets",
  },
});
