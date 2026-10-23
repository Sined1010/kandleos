import test from 'node:test'
import assert from 'node:assert/strict'
import { renderMarkdown } from './markdown.ts'

test('images never render, not even protocol-relative ones', () => {
  for (const src of ['![x](//host/s/x.png)', '![x](https://example.com/x.png)', '![x](data:image/png;base64,AAAA)']) {
    const html = renderMarkdown(src)
    assert.doesNotMatch(html, /<img/, src)
    assert.doesNotMatch(html, /(src|href)="(?!https:)/, src)
  }
})

test('only absolute https links become links', () => {
  assert.match(renderMarkdown('[x](https://example.com/a)'), /<a href="https:\/\/example\.com\/a" target="_blank" rel="noreferrer">x<\/a>/)
  for (const src of ['[x](//host/p)', '[x](http://example.com)', '[x](javascript:alert(1))', '[x](file:///C:/x)', '[x](/rel)', '<//host/p>']) {
    assert.doesNotMatch(renderMarkdown(src), /href=/, src)
  }
})

test('raw HTML stays text', () => {
  assert.match(renderMarkdown('<img src=x onerror=alert(1)>'), /&lt;img/)
})
