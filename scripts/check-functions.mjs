// Syntax check for the Supabase Edge Functions.
//
// These are Deno, so tsconfig.json excludes them — `tsc --noEmit` would choke
// on jsr: imports and Deno globals and tell us nothing useful. That left them
// with no check at all, and an unterminated comment block once reached the
// repository and stopped all seven functions from deploying: every one of them
// imports _shared/payriff.ts, so a single unparseable file blocked the lot.
//
// This parses each file with the TypeScript compiler and reports syntax errors
// only — no type checking, no module resolution, nothing that needs Deno
// installed. It catches exactly the class of mistake that got through.
//
//   node scripts/check-functions.mjs

import ts from 'typescript';
import { readFileSync } from 'fs';
import { join } from 'path';
import { readdirSync, statSync } from 'fs';

const ROOT = 'supabase/functions';

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (full.endsWith('.ts')) out.push(full);
  }
  return out;
}

let bad = 0;
for (const file of walk(ROOT)) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const diagnostics = source.parseDiagnostics ?? [];

  if (diagnostics.length === 0) {
    console.log(`✅ ${file}`);
    continue;
  }

  bad++;
  console.log(`❌ ${file}`);
  for (const d of diagnostics.slice(0, 5)) {
    const { line, character } = source.getLineAndCharacterOfPosition(d.start ?? 0);
    const message = ts.flattenDiagnosticMessageText(d.messageText, ' ');
    console.log(`   ${line + 1}:${character + 1} ${message}`);
  }
}

if (bad > 0) {
  console.log(`\n${bad} fayl parse olunmadı — deploy uğursuz olacaq.`);
  process.exitCode = 1;
}
