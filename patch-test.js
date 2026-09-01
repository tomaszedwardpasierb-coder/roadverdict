const fs = require('fs');
let content = fs.readFileSync('tests/unit/receiptParse.test.ts', 'utf-8');

content = content.replace(
  "rejects a file type that isn't JPG or PNG, before touching the network at all",
  'rejects a file type that is not JPG, PNG, or PDF'
);
content = content.replace(
  'parseReceiptFile(fakeFile({ type: "application/pdf" }), "key", bike)',
  'parseReceiptFile(fakeFile({ type: "text/plain" }), "key", bike)'
);
content = content.replace(
  '"Only JPG or PNG photos are supported for scanning."',
  '"Only JPG, PNG, or PDF files are supported for scanning."'
);

const newTest = [
  '',
  '  it(\'accepts a PDF, skips sharp, sends PDF bytes to Gemini with application/pdf mime type, and stores attachment as application/pdf\', async () => {',
  '    const fetchMock = vi.fn().mockResolvedValue(',
  '      geminiResponse(JSON.stringify({ ...validGeminiPayload, items: [{ category: \'service\', date: \'2025-06-12\', cost: 80, description: \'Service\' }] }))',
  '    );',
  '    vi.stubGlobal(\'fetch\', fetchMock);',
  '    const result = await parseReceiptFile(fakeFile({ type: \'application/pdf\', name: \'invoice.pdf\' }), \'key\', bike);',
  '    expect(result.ok).toBe(true);',
  '    expect(mocks.sharpToBuffer).not.toHaveBeenCalled();',
  '    const geminiCall = fetchMock.mock.calls.find((c) => String(c[0]).includes(\'generativelanguage\'));',
  '    const body = JSON.parse(geminiCall[1].body);',
  '    expect(body.contents[0].parts[1].inline_data.mime_type).toBe(\'application/pdf\');',
  '    expect(mocks.uploadData).toHaveBeenCalledWith(',
  '      expect.any(Buffer),',
  '      expect.objectContaining({ blobHTTPHeaders: { blobContentType: \'application/pdf\' } })',
  '    );',
  '    if (result.ok) {',
  '      expect(result.items[0].attachment?.fileType).toBe(\'application/pdf\');',
  '    }',
  '  });',
  ''
].join('\r\n');

content = content.trimEnd();
if (content.endsWith('});')) {
  content = content.slice(0, -3).trimEnd() + newTest + '});\r\n';
}

fs.writeFileSync('tests/unit/receiptParse.test.ts', content);
console.log('done');
