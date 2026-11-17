// Amorçage du lanceur de tests Node (`node --test`) pour le projet web.
// Deux rôles :
//  1. relier `@/*` a `./src/*`, car Node n'exécute pas les `paths` de tsconfig ;
//  2. activer le mode exemple, attendu par les tests de /parcelle qui tournent
//     sans API (NEXT_PUBLIC_DEMO_MODE). Une valeur déjà posée est respectée.
// Utilisé par le script `test` de web/package.json.
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

process.env.NEXT_PUBLIC_DEMO_MODE ??= "true";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
const EXTENSIONS = ["", ".ts", ".tsx", ".js", ".mjs", ".jsx"];

function resolveAlias(specifier) {
  if (!specifier.startsWith("@/")) return null;
  const base = path.join(SRC, specifier.slice(2));
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      return pathToFileURL(candidate).href;
    }
  }
  const index = path.join(base, "index.ts");
  if (existsSync(index)) return pathToFileURL(index).href;
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const url = resolveAlias(specifier);
    if (url) return { url, shortCircuit: true };
    return nextResolve(specifier, context);
  },
});
