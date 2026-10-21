import MarkdownIt from 'markdown-it'

// Reports come from language models: raw HTML stays text (html: false), so nothing in them can run or restyle
// the app. Links open in the system browser (the window refuses to navigate; see main/index.ts).
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })
const defaultLink = md.renderer.rules.link_open ?? ((tokens, i, options, _env, self) => self.renderToken(tokens, i, options))
md.renderer.rules.link_open = (tokens, i, options, env, self) => {
  tokens[i].attrSet('target', '_blank')
  tokens[i].attrSet('rel', 'noreferrer')
  return defaultLink(tokens, i, options, env, self)
}

export const renderMarkdown = (text: string): string => md.render(text)
