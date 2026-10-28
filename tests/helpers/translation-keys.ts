import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE_DIRS = ["app", "components", "lib"];
const CALLEES = new Set(["t", "msg", "msgWith"]);
const SEPARATOR = "␟";

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

function stringsIn(node: ts.Node, found: string[]) {
  if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text) found.push(node.text);
  ts.forEachChild(node, (child) => stringsIn(child, found));
}

/**
 * Every message the source asks for: the string literals in the first argument of `t(...)`,
 * `msg(...)` and `msgWith(...)` calls (a conditional such as `t(a ? "x" : "y")` counts both).
 */
export function usedKeys(): Map<string, string[]> {
  const used = new Map<string, string[]>();
  for (const dir of SOURCE_DIRS) {
    for (const file of sourceFiles(path.join(ROOT, dir))) {
      if (file.includes(`${path.sep}i18n${path.sep}`)) continue;
      const sf = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isCallExpression(node) && node.arguments.length > 0) {
          const callee = node.expression;
          const name = ts.isIdentifier(callee) ? callee.text : ts.isParenthesizedExpression(callee) ? "t" : "";
          if (CALLEES.has(name)) {
            const found: string[] = [];
            stringsIn(node.arguments[0], found);
            for (const key of found) {
              const clean = key.split(SEPARATOR)[0];
              used.set(clean, [...(used.get(clean) ?? []), path.relative(ROOT, file)]);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return used;
}
