import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Guards against the bug the dashboard.module.css split introduced: a
// component applies a class from its OWN module (ownStyles.sidebar), while
// rules that also style that class name - mobile media-query overrides,
// descendant selectors like `.sidebar .iconBtn` - stayed in another module
// the component also imports. CSS Modules hashes the same name differently
// per file, so those rules silently never match anywhere (on mobile the
// desktop sidebar showed and the "More" sheet never opened).
//
// Flags a class only when the other module's rules for it are dead
// everywhere - deliberately reusing another module's style (e.g. the garage
// compare page using the dashboard's .card while garage.module.css styles
// its own .card for /garage) is fine.
const SRC = path.resolve(__dirname, "../../src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const classCache = new Map<string, Set<string>>();
function selectorClasses(cssFile: string): Set<string> {
  if (!classCache.has(cssFile)) {
    const css = fs.readFileSync(cssFile, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{[^{}]*\}/g, "{}");
    classCache.set(cssFile, new Set([...css.matchAll(/\.([a-zA-Z_][\w-]*)/g)].map((m) => m[1])));
  }
  return classCache.get(cssFile)!;
}

interface ModuleImport { alias: string; css: string; used: Set<string> }

function moduleImports(file: string, src: string): ModuleImport[] {
  return [...src.matchAll(/import (\w+) from ['"]((?:\.{1,2}|@)\/[\w./[\]-]+\.module\.css)['"]/g)].map((m) => ({
    alias: m[1],
    css: m[2].startsWith("@/") ? path.join(SRC, m[2].slice(2)) : path.resolve(path.dirname(file), m[2]),
    used: new Set([...src.matchAll(new RegExp(String.raw`\b${m[1]}\.([a-zA-Z_]\w*)`, "g"))].map((u) => u[1])),
  }));
}

describe("CSS module class ownership", () => {
  it("never leaves a module's rules for a class dead because components apply that class from a different module", () => {
    const files = walk(SRC).map((file) => {
      // Comments stripped so a class mentioned in prose doesn't count as applied.
      const src = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
      return { file, imports: moduleImports(file, src) };
    });

    const appliedViaModule = new Map<string, Set<string>>();
    for (const { imports } of files) {
      for (const im of imports) {
        if (!appliedViaModule.has(im.css)) appliedViaModule.set(im.css, new Set());
        im.used.forEach((c) => appliedViaModule.get(im.css)!.add(c));
      }
    }

    const problems: string[] = [];
    for (const { file, imports } of files) {
      for (const a of imports) {
        for (const b of imports) {
          if (a === b) continue;
          const orphaned = [...a.used].filter((c) => selectorClasses(b.css).has(c) && !appliedViaModule.get(b.css)!.has(c));
          if (orphaned.length) {
            problems.push(`${path.relative(SRC, file)}: ${orphaned.join(", ")} applied via ${a.alias}, so ${path.basename(b.css)}'s rules for it never match anywhere`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
