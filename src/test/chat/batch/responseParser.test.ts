import * as assert from 'assert';
import { parseBatchResponse } from '../../../chat/batch/responseParser.js';

suite('responseParser', () => {
  test('parses <file_change> formatted response', () => {
    const response = `
<file_change>
<path>src/example.ts</path>
<action>edit</action>
<description>Update content</description>
<content>export const value = 2;</content>
</file_change>`;

    const parsed = parseBatchResponse(response);
    assert.strictEqual(parsed.fileEdits.length, 1);
    assert.strictEqual(parsed.fileEdits[0].filePath, 'src/example.ts');
    assert.strictEqual(parsed.fileEdits[0].action, 'edit');
    assert.strictEqual(parsed.rawResponse, response);
    assert.strictEqual(parsed.usedFallback, false);
  });

  test('parses CDATA-wrapped content', () => {
    const response = `
<file_change>
<path>src/example.ts</path>
<action>create</action>
<description>New file</description>
<content><![CDATA[
export const value = 2;
const x = 1 + 1;
]]></content>
</file_change>`;

    const parsed = parseBatchResponse(response);
    assert.strictEqual(parsed.fileEdits.length, 1);
    assert.strictEqual(parsed.fileEdits[0].filePath, 'src/example.ts');
    assert.strictEqual(parsed.fileEdits[0].action, 'create');
    assert.ok(parsed.fileEdits[0].content.includes('export const value = 2;'));
    assert.strictEqual(parsed.usedFallback, false);
  });

  test('handles content with unescaped XML characters', () => {
    const response = `
<file_change>
<path>src/comparison.ts</path>
<action>edit</action>
<description>Add comparison</description>
<content><![CDATA[
if (a < b && c > d) {
  return x < y ? 1 : 0;
}
]]></content>
</file_change>`;

    const parsed = parseBatchResponse(response);
    assert.strictEqual(parsed.fileEdits.length, 1);
    assert.strictEqual(parsed.fileEdits[0].filePath, 'src/comparison.ts');
    assert.ok(parsed.fileEdits[0].content.includes('a < b'));
    assert.ok(parsed.fileEdits[0].content.includes('c > d'));
  });

  test('handles content with XML-like tags inside', () => {
    const response = `
<file_change>
<path>src/component.tsx</path>
<action>create</action>
<description>React component</description>
<content><![CDATA[
export const Component = () => {
  return <div className="test"><span>Hello</span></div>;
};
]]></content>
</file_change>`;

    const parsed = parseBatchResponse(response);
    assert.strictEqual(parsed.fileEdits.length, 1);
    assert.ok(parsed.fileEdits[0].content.includes('<div className="test">'));
    assert.ok(parsed.fileEdits[0].content.includes('<span>Hello</span>'));
  });

  test('handles multiple file_change blocks', () => {
    const response = `
<file_change>
<path>src/file1.ts</path>
<action>create</action>
<content><![CDATA[export const a = 1;]]></content>
</file_change>

<file_change>
<path>src/file2.ts</path>
<action>create</action>
<content><![CDATA[export const b = 2;]]></content>
</file_change>`;

    const parsed = parseBatchResponse(response);
    assert.strictEqual(parsed.fileEdits.length, 2);
    assert.strictEqual(parsed.fileEdits[0].filePath, 'src/file1.ts');
    assert.strictEqual(parsed.fileEdits[1].filePath, 'src/file2.ts');
  });

  test('provides raw response when parsing fails', () => {
    const response = 'malformed <file_change> without closing tag';
    const parsed = parseBatchResponse(response);
    assert.strictEqual(parsed.fileEdits.length, 0);
    assert.ok(parsed.parseWarnings.length > 0);
    assert.strictEqual(parsed.rawResponse, response);
    assert.ok(parsed.parseDiagnostics);
    assert.ok(parsed.parseDiagnostics!.length > 0);
  });

  test('falls back to JSON changes format', () => {
    const response = JSON.stringify({
      changes: [
        {
          filePath: 'src/new.ts',
          action: 'create',
          content: 'export const z = 1;',
        },
      ],
    });

    const parsed = parseBatchResponse(response);
    assert.strictEqual(parsed.fileEdits.length, 1);
    assert.strictEqual(parsed.usedFallback, true);
    assert.strictEqual(parsed.rawResponse, response);
  });

  test('returns warning when unparseable', () => {
    const parsed = parseBatchResponse('not parseable');
    assert.strictEqual(parsed.fileEdits.length, 0);
    assert.ok(parsed.parseWarnings.length > 0);
    assert.strictEqual(parsed.rawResponse, 'not parseable');
  });

  test('handles empty response', () => {
    const parsed = parseBatchResponse('');
    assert.strictEqual(parsed.fileEdits.length, 0);
    assert.ok(parsed.parseWarnings.some((w) => w.includes('Empty')));
    assert.strictEqual(parsed.rawResponse, '');
  });

  test('handles whitespace-only response', () => {
    const parsed = parseBatchResponse('   \n\t  ');
    assert.strictEqual(parsed.fileEdits.length, 0);
    assert.ok(parsed.parseWarnings.some((w) => w.includes('Empty')));
  });

  test('skips invalid action values', () => {
    const response = `
<file_change>
<path>src/example.ts</path>
<action>invalid_action</action>
<content>test</content>
</file_change>`;

    const parsed = parseBatchResponse(response);
    assert.strictEqual(parsed.fileEdits.length, 0);
    assert.ok(parsed.parseWarnings.length > 0);
    assert.ok(parsed.parseDiagnostics!.some((d) => d.stage === 'action_validation'));
  });

  test('skips blocks missing required tags', () => {
    const response = `
<file_change>
<path>src/example.ts</path>
<content>missing action</content>
</file_change>

<file_change>
<action>create</action>
<content>missing path</content>
</file_change>`;

    const parsed = parseBatchResponse(response);
    assert.strictEqual(parsed.fileEdits.length, 0);
    assert.ok(parsed.parseDiagnostics);
    assert.strictEqual(parsed.parseDiagnostics!.length, 2);
  });
});
