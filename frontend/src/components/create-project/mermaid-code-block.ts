import type { Node as ProseMirrorNode } from "@tiptap/pm/model"
import type { NodeView } from "@tiptap/pm/view"
import { CodeBlock } from "reactjs-tiptap-editor/codeblock"

// A Mermaid diagram is a code block whose language is `mermaid`, saved as
// <pre><code class="language-mermaid">. That is the markup GitHub Issues draw
// as a diagram (```mermaid), and setu.github.convert already carries code
// blocks and their language both ways, so diagrams stay code on both sides.
// The diagram itself is only drawn here, under the code, in the browser.
//
// The package's own Mermaid extension is not used: it saves an SVG picture and
// keeps the code in the picture's alt text, which GitHub cannot edit as code
// and setu.api.media does not accept.

export const MERMAID_LANGUAGE = "mermaid"

export const DEFAULT_MERMAID_CODE = "graph TD\n  A[Start] --> B[Done]"

const RENDER_DELAY_MS = 300

type Mermaid = typeof import("mermaid").default

let mermaidLoad: Promise<Mermaid> | null = null
let renderCount = 0

// mermaid is large; it loads the first time a diagram is shown.
function loadMermaid(): Promise<Mermaid> {
  mermaidLoad ??= import("mermaid").then(({ default: mermaid }) => mermaid)
  return mermaidLoad
}

function isDarkTheme() {
  return document.documentElement.classList.contains("dark")
}

// Diagrams are drawn in the theme's colours, so a theme change (the `dark`
// class on <html>, set by theme-provider) redraws every diagram on the page.
const mermaidViews = new Set<CodeBlockView>()
let themeObserver: MutationObserver | null = null
let observedDark = false

function watchTheme(view: CodeBlockView) {
  mermaidViews.add(view)
  if (themeObserver) return
  observedDark = isDarkTheme()
  themeObserver = new MutationObserver(() => {
    const dark = isDarkTheme()
    if (dark === observedDark) return
    observedDark = dark
    for (const each of mermaidViews) each.redraw()
  })
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  })
}

function unwatchTheme(view: CodeBlockView) {
  mermaidViews.delete(view)
  if (mermaidViews.size > 0 || !themeObserver) return
  themeObserver.disconnect()
  themeObserver = null
}

/** The diagram's SVG, or null when the code is not a valid diagram. */
async function renderDiagram(code: string): Promise<string | null> {
  const mermaid = await loadMermaid()
  // `strict` sanitises labels and turns off click handlers in the diagram.
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: isDarkTheme() ? "dark" : "default",
  })
  if (!(await mermaid.parse(code, { suppressErrors: true }))) return null
  renderCount += 1
  const { svg } = await mermaid.render(`envision-mermaid-${renderCount}`, code)
  return svg
}

class CodeBlockView implements NodeView {
  dom: HTMLElement
  contentDOM: HTMLElement
  private pre: HTMLElement
  private code: HTMLElement
  private preview: HTMLElement
  private node: ProseMirrorNode
  private timer: ReturnType<typeof setTimeout> | undefined
  // Drops a slower render that finishes after a newer one started.
  private version = 0
  private renderedCode: string | null = null
  private readonly languageClassPrefix: string

  constructor(
    node: ProseMirrorNode,
    options: { preClass: string; languageClassPrefix: string }
  ) {
    this.node = node
    this.languageClassPrefix = options.languageClassPrefix
    this.dom = document.createElement("div")
    this.dom.className = "envision-code-block"
    this.pre = document.createElement("pre")
    this.pre.className = options.preClass
    this.code = document.createElement("code")
    this.pre.append(this.code)
    this.preview = document.createElement("div")
    this.preview.className = "envision-mermaid-preview"
    this.preview.contentEditable = "false"
    this.dom.append(this.pre, this.preview)
    this.contentDOM = this.code
    watchTheme(this)
    this.sync(true)
  }

  /** Draw the diagram again, as after a theme change. */
  redraw() {
    if (!this.isMermaid) return
    this.renderedCode = null
    this.sync(true)
  }

  private get isMermaid() {
    // An Issue can name it ```Mermaid; the class keeps that case.
    const { language } = this.node.attrs
    return (
      typeof language === "string" &&
      language.toLowerCase() === MERMAID_LANGUAGE
    )
  }

  private sync(immediate = false) {
    const { language } = this.node.attrs
    this.code.className = language ? this.languageClassPrefix + language : ""
    this.dom.dataset.mermaid = this.isMermaid ? "true" : "false"
    clearTimeout(this.timer)
    if (!this.isMermaid) {
      this.version += 1
      this.renderedCode = null
      this.preview.replaceChildren()
      delete this.dom.dataset.state
      return
    }
    const code = this.node.textContent
    if (code === this.renderedCode) return
    if (immediate) void this.draw(code)
    else this.timer = setTimeout(() => void this.draw(code), RENDER_DELAY_MS)
  }

  private async draw(code: string) {
    const version = ++this.version
    if (!code.trim()) {
      this.show(version, code, null, "empty")
      return
    }
    const svg = await renderDiagram(code).catch(() => null)
    this.show(version, code, svg, svg ? "ready" : "invalid")
  }

  private show(
    version: number,
    code: string,
    svg: string | null,
    state: "empty" | "invalid" | "ready"
  ) {
    if (version !== this.version || !this.isMermaid) return
    this.renderedCode = code
    this.dom.dataset.state = state
    if (svg) {
      // mermaid's strict mode has already sanitised the SVG (DOMPurify).
      this.preview.innerHTML = svg
    } else {
      const message = document.createElement("p")
      message.className = "envision-mermaid-message"
      message.textContent =
        state === "empty"
          ? "Write Mermaid code above to draw a diagram."
          : "This Mermaid code has an error, so the diagram cannot be drawn."
      this.preview.replaceChildren(message)
    }
  }

  update(node: ProseMirrorNode) {
    if (node.type !== this.node.type) return false
    this.node = node
    this.sync()
    return true
  }

  // Only the code is the document. The wrapper's data attributes and the
  // drawn diagram change outside it, and must not make ProseMirror redraw.
  ignoreMutation(mutation: { target: Node; type: string }) {
    if (mutation.type === "selection") return false
    return !this.contentDOM.contains(mutation.target)
  }

  stopEvent(event: Event) {
    return event.target instanceof Node && this.preview.contains(event.target)
  }

  destroy() {
    unwatchTheme(this)
    clearTimeout(this.timer)
    this.version += 1
  }
}

/**
 * The package's code block (highlighting, bubble menu, language attribute)
 * with a diagram under any block whose language is `mermaid`. It saves the
 * same HTML as the plain code block.
 */
export const MermaidCodeBlock = CodeBlock.extend({
  addNodeView() {
    return ({ node }) =>
      new CodeBlockView(node, {
        preClass: String(this.options.HTMLAttributes?.class ?? ""),
        languageClassPrefix: this.options.languageClassPrefix ?? "language-",
      })
  },
})
