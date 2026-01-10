import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: "#0a0a12",
        panel: "#15151f",
        border: "#26263a",
        bull: "#16c98d",
        bear: "#f5455c",
        accent: "#f5a524",
        muted: "#8a8a9e",
      },
    },
  },
  plugins: [],
};
export default config;
