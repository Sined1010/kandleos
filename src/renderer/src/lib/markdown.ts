import MarkdownIt from 'markdown-it'

// Reports come from language models: raw HTML stays text (html: false), so nothing in them can run or restyle
// the app. Links open in the system browser (the window refuses to navigate; see main/index.ts).
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
// No images: they would load by themselves, and in the packaged app "//host/x.png" resolves to file://host (a UNC path
// on Windows). Only absolute https links survive; everything else (relative, //host, javascript:, …) stays text.
md.disable('image')
md.validateLink = (url) => /^https:\/\//i.test(url)
const defaultLink = md.renderer.rules.link_open ?? ((tokens, i, options, _env, self) => self.renderToken(tokens, i, options))
md.renderer.rules.link_open = (tokens, i, options, env, self) => {
  tokens[i].attrSet('target', '_blank')
  tokens[i].attrSet('rel', 'noreferrer')
  return defaultLink(tokens, i, options, env, self)
}

export const renderMarkdown = (text: string): string => md.render(text)
