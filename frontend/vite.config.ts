import path from "path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackRouter } from "@tanstack/router-plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, lazyPlugins } from "vite-plus"

// Frappe site URL comes from the environment; the default lives in mise.toml.
// Dev requests for Frappe paths are proxied so the session cookie is
// same-origin with the Vite dev server.
const FRAPPE_URL = process.env.FRAPPE_URL
const FRAPPE_PATHS = [
  "/api",
  "/login",
  "/assets",
  "/files",
  "/private",
  "/socket.io",
]

// https://vite.dev/config/
export default defineConfig({
  lint: {
    plugins: ["oxc", "typescript", "unicorn", "react"],
    categories: {
      correctness: "warn",
    },
    env: {
      builtin: true,
    },
    ignorePatterns: [
      "dist",
      // Vendored registry code — kept as published so upstream updates
      // apply cleanly. Fix things here only when they bite.
      // shadcn
      "src/components/ui/**",
      "src/hooks/use-mobile.ts",
      // @reui (two small Envision edits, marked "Envision:")
      "src/components/reui/**",
      "src/components/ui/scroll-area.tsx",
      "src/components/ui/spinner.tsx",
      // @ilinxa
      "src/components/kanban-board/**",
      // @data-table-filters
      "src/components/custom/**",
      "src/components/data-table/data-table-column-header.tsx",
      "src/components/data-table/data-table-floating-bar.tsx",
      "src/components/data-table/data-table-provider.tsx",
      "src/components/data-table/data-table-refresh-button.tsx",
      "src/components/data-table/data-table-store-sync.tsx",
      "src/components/data-table/data-table-toolbar.tsx",
      "src/components/data-table/data-table-view-options.tsx",
      "src/components/data-table/types.ts",
      "src/components/data-table/ui-compat.ts",
      "src/components/data-table/utils.ts",
      "src/hooks/use-debounce.ts",
      "src/hooks/use-hot-key.ts",
      "src/hooks/use-local-storage.ts",
      "src/lib/actions/**",
      "src/lib/constants/local-storage.ts",
      "src/lib/data-table/**",
      "src/lib/store/**",
      "src/lib/table/**",
      "src/lib/table-schema/**",
      "src/lib/compose-refs.ts",
      "src/lib/delimiters.ts",
      "src/lib/format.ts",
      "src/lib/is-array.ts",
      "src/lib/style.ts",
    ],
    overrides: [
      {
        files: ["**/*.{ts,tsx}"],
        rules: {
          "constructor-super": "error",
          "for-direction": "error",
          "getter-return": "error",
          "no-async-promise-executor": "error",
          "no-case-declarations": "error",
          "no-class-assign": "error",
          "no-compare-neg-zero": "error",
          "no-cond-assign": "error",
          "no-const-assign": "error",
          "no-constant-binary-expression": "error",
          "no-constant-condition": "error",
          "no-control-regex": "error",
          "no-debugger": "error",
          "no-delete-var": "error",
          "no-dupe-class-members": "error",
          "no-dupe-else-if": "error",
          "no-dupe-keys": "error",
          "no-duplicate-case": "error",
          "no-empty": "error",
          "no-empty-character-class": "error",
          "no-empty-pattern": "error",
          "no-empty-static-block": "error",
          "no-ex-assign": "error",
          "no-extra-boolean-cast": "error",
          "no-fallthrough": "error",
          "no-func-assign": "error",
          "no-global-assign": "error",
          "no-import-assign": "error",
          "no-invalid-regexp": "error",
          "no-irregular-whitespace": "error",
          "no-loss-of-precision": "error",
          "no-misleading-character-class": "error",
          "no-new-native-nonconstructor": "error",
          "no-nonoctal-decimal-escape": "error",
          "no-obj-calls": "error",
          "no-prototype-builtins": "error",
          "no-redeclare": "error",
          "no-regex-spaces": "error",
          "no-self-assign": "error",
          "no-setter-return": "error",
          "no-shadow-restricted-names": "error",
          "no-sparse-arrays": "error",
          "no-this-before-super": "error",
          "no-unassigned-vars": "error",
          "no-undef": "error",
          "no-unexpected-multiline": "error",
          "no-unreachable": "error",
          "no-unsafe-finally": "error",
          "no-unsafe-negation": "error",
          "no-unsafe-optional-chaining": "error",
          "no-unused-labels": "error",
          "no-unused-private-class-members": "error",
          "no-unused-vars": "error",
          "no-useless-assignment": "error",
          "no-useless-backreference": "error",
          "no-useless-catch": "error",
          "no-useless-escape": "error",
          "no-with": "error",
          "preserve-caught-error": "error",
          "require-yield": "error",
          "use-isnan": "error",
          "valid-typeof": "error",
          "no-array-constructor": "error",
          "no-unused-expressions": "error",
          "typescript/ban-ts-comment": "error",
          "typescript/no-duplicate-enum-values": "error",
          "typescript/no-empty-object-type": "error",
          "typescript/no-explicit-any": "error",
          "typescript/no-extra-non-null-assertion": "error",
          "typescript/no-misused-new": "error",
          "typescript/no-namespace": "error",
          "typescript/no-non-null-asserted-optional-chain": "error",
          "typescript/no-require-imports": "error",
          "typescript/no-this-alias": "error",
          "typescript/no-unnecessary-type-constraint": "error",
          "typescript/no-unsafe-declaration-merging": "error",
          "typescript/no-unsafe-function-type": "error",
          "typescript/no-wrapper-object-types": "error",
          "typescript/prefer-as-const": "error",
          "typescript/prefer-namespace-keyword": "error",
          "typescript/triple-slash-reference": "error",
          "react/rules-of-hooks": "error",
          "react/exhaustive-deps": "warn",
          "react/static-components": "error",
          "react/use-memo": "error",
          "react/preserve-manual-memoization": "error",
          "react/incompatible-library": "warn",
          "react/immutability": "error",
          "react/globals": "error",
          "react/refs": "error",
          "react/set-state-in-effect": "error",
          "react/error-boundaries": "error",
          "react/purity": "error",
          "react/set-state-in-render": "error",
          "react/unsupported-syntax": "warn",
          "react/only-export-components": [
            "error",
            {
              allowConstantExport: true,
            },
          ],
        },
        env: {
          browser: true,
        },
      },
      {
        // TanStack route files export `Route` (not a component) beside
        // non-exported components, which keeps them code-splittable.
        files: ["src/routes/**/*.tsx"],
        rules: {
          "react/only-export-components": "off",
        },
      },
      {
        files: ["vite.config.ts"],
        env: {
          node: true,
        },
      },
    ],
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
      "@shadcn/lint",
    ],
    rules: {
      "vite-plus/prefer-vite-plus-imports": "error",
    },
  },
  fmt: {
    endOfLine: "lf",
    semi: false,
    singleQuote: false,
    tabWidth: 2,
    trailingComma: "es5",
    printWidth: 80,
    sortPackageJson: false,
    sortTailwindcss: {
      stylesheet: "src/index.css",
      functions: ["cn", "cva"],
    },
    ignorePatterns: [
      "node_modules/",
      "coverage/",
      "src/routeTree.gen.ts",
      ".pnpm-store/",
      "pnpm-lock.yaml",
      "package-lock.json",
      "pnpm-lock.yaml",
      "yarn.lock",
    ],
  },
  plugins: lazyPlugins(() => [
    // Router plugin must run before the React plugin (TanStack docs).
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
  ]),
  build: {
    outDir: "../setu/public/envision",
    emptyOutDir: true,
    // The rich-text editor chunk (~950 kB, most of it @tiptap/extension-emoji's
    // emoji data) is only loaded lazily, when an editor or description view
    // mounts, so it does not weigh on first load.
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: Object.fromEntries(
      FRAPPE_PATHS.map((p) => [
        p,
        { target: FRAPPE_URL, changeOrigin: true, ws: p === "/socket.io" },
      ])
    ),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
})
