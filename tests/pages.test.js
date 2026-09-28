import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
test('inline page scripts parse and source does not contain legacy credentials', () => {
  for(const file of ['index.html','tracking.html','correos.html']) {
    const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    for(const match of source.matchAll(/<script(?: [^>]*)?>([\s\S]*?)<\/script>/g)) new Script(match[1],{filename:file});
    assert.ok(!/sb_publishable_|GMAIL_PASS\s*=|GEMINI_API_KEY\s*=/.test(source));
  }
});
