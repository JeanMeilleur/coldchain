import type { Config } from "tailwindcss";

/**
 * Dark mode uses Tailwind's native `dark:` variant, driven by a `dark` class
 * on <html>.
 *
 * The tutorial this project started from used the third-party `tw-colors`
 * plugin here to auto-invert the entire palette. It breaks the build:
 * Tailwind loads this TypeScript config through jiti, and `createThemes`
 * resolves to undefined in that context even though a plain require() of the
 * same package works. The failure surfaces as
 *
 *   TypeError: Cannot read properties of undefined (reading 'call')
 *
 * out of the PostCSS loader, naming globals.css -- a file that is completely
 * fine. Nothing in the error points at this config.
 *
 * Native dark: variants are the better answer regardless: each component
 * declares its own dark colors explicitly, instead of inheriting a global
 * inversion that no one reading the component can see.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};

export default config;
