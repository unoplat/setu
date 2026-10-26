# GitHub Issue body ↔ Task description fidelity

Status: conversion module implemented (`setu/github/convert.py`) and called by sync (`setu/github/inbound.py`, `outbound.py`, `reconcile.py`). The supported subset and review rules below are **approved policy P5**: every lossy conversion is reviewed, presentation-only losses included.

Envision Task descriptions stay HTML, the markup Envision's editor writes (`frontend/src/components/create-project/description-extensions.ts`, stored through `description-html.ts`), and Frappe sanitizes it on save. GitHub Issue bodies stay Markdown. Each direction converts on the server and reports what it could not carry, instead of silently flattening it.

## Interface for sync callers

| Function | Use |
|---|---|
| `markdown_to_html(markdown) -> {html, lossy, dropped}` | Issue body → description HTML, already passed through `frappe.utils.sanitize_html`. |
| `html_to_markdown(html, *, site_url=None) -> {markdown, lossy, dropped}` | Description HTML → Issue Markdown. Pass the site's public URL so the private-address check applies to this site's host only. |
| `issue_body(html, *, marker, remote_body=None, site_url=None) -> {body, changed, lossy, dropped}` | The body to send, with the marker. `changed` is False when GitHub already shows this content: send no `body` field then. Never send a `body_too_long` result. |
| `body_reproducible(markdown) -> bool` | False when the remote body has content a description cannot show (raw HTML, footnotes, math…), so overwriting it would lose that on GitHub. |
| `html_digest(html)`, `markdown_digest(markdown)` | Baseline values: `base_description_hash`, `base_body_hash`. |
| `description_changed(html, baseline)`, `body_changed(markdown, baseline)` | Three-way comparison of the description field against its baseline. |
| `normalize_html`, `normalize_markdown`, `digest` | The comparison forms behind the digests. |
| `new_marker()`, `add_marker(markdown, marker)`, `find_marker(markdown)`, `strip_marker(markdown)` | The uncertain-create marker: `<!-- envision:<token> -->` at the end of the body, hidden by GitHub. |
| `LossCode`, `HIDDEN_LOSSES`, `PRESENTATION_LOSSES`, `MAX_BODY_LENGTH` | Report vocabulary and constants. `PRESENTATION_LOSSES` only describes a conflict; it does not exempt anything from review. |

Rules callers must follow:

1. **Never rewrite a body for an unrelated change.** Convert only when `description_changed(titles.content(task.description, continued), link.base_description_hash)`. Title and status pushes send no `body`. When converting, send the body only if `issue_body(...)["changed"]`.
   - **The title's note is not description.** A long Issue title's **GitHub title continuation:** paragraph (`setu.github.titles`, ADR 0008 → Titles) is taken out with `titles.content` before every digest, conversion and conflict value. So it never reaches the Issue body, and writing or editing it never counts as a description edit.
   - **Only the note is taken out.** It must be the single, explicitly marked first paragraph and carry the continuation label. Frappe and Envision's Paragraph extension preserve `data-github-title-continuation`. Literal label text is ordinary description. Missing, malformed, moved or duplicate markers on a continued title require a title conflict decision before description writes; resolving the title preserves ambiguous text rather than deleting it.
   - **The converter is unchanged.** markdownify still writes every body, and GitHub's raw body and `base_body_hash` are kept exactly as before.
   - **Compatible baselines.** `content` returns a description without a note unchanged, so existing baselines still match.
2. **Remote edits are detected on the raw body.** Use `body_changed(issue.body, link.base_body_hash)`; that ignores the marker, CRLF line endings (GitHub's web editor sends them) and trailing spaces. An echo of our own write matches the baseline and does nothing.
3. **Keep the original Markdown.** Store GitHub's body every time it is read, so a lossy import or a conflict can show and restore exactly what GitHub has.
4. **Take the HTML baseline from the saved Task.** Saving runs Frappe's sanitizer again, and Text Editor fields also link bare addresses. Hash `titles.content(task.description, continued)` after `save()`, not the converter's output.
5. **Lossy means review, not overwrite (approved).**
   - a `lossy` outbound result raises a `description` conflict of kind `lossy_outbound` holding both versions;
   - a `lossy` inbound result raises `lossy_inbound`;
   - so does a local edit when `body_reproducible(remote_body)` is False.

   Title and status still sync. Presentation-only losses (colour, alignment, image size…) are conflicts too. Only `HIDDEN_LOSSES` (HTML comments, which GitHub never shows) leave `lossy` False.
6. **"Both changed to the same result"** for the description is `issue_body(local_html, marker=…, remote_body=remote)["changed"] is False`.
7. **The marker is not proof.** Anyone can paste one. Look it up only among Issues the app's bot created, as the uncertain-create recovery contract says.

## GitHub → Envision

Rendered with `markdown-it-py`: CommonMark plus tables and strikethrough, with `breaks` on, because GitHub shows a newline inside an Issue paragraph as a line break. GitHub task lists are recognised by the module itself. The result is rewritten into the editor's markup, then sanitized.

| Markdown | Description HTML |
|---|---|
| Paragraphs, line breaks | `<p>`, `<br>` |
| `#`, `##`, `###` | `<h1>`–`<h3>` |
| `####`–`######` | `<h3>` (`heading_level`): the editor keeps three levels |
| Bold, italic, `~~strike~~`, inline code | `<strong>`, `<em>`, `<s>`, `<code>` |
| Links (http, https, mailto) | `<a href rel="noopener noreferrer">`. Relative links are unwrapped to their text (`unsupported_url`) |
| Bullet, ordered (`start` kept), nested lists | `<ul>`, `<ol>`, `<li>` |
| `- [ ]` / `- [x]` task lists | The editor's `ul[data-type=taskList]` > `li[data-type=taskItem][data-checked]` with a checkbox label and a `<div>` of paragraphs |
| Task items holding other blocks | Kept but reported (`task_item_blocks`): this editor's task items hold paragraphs only |
| Task items mixed with plain items, or in an ordered list | Plain list with literal `[ ]`/`[x]` text (`mixed_task_list`) |
| Fenced or indented code | `<pre><code class="language-x">`, without the trailing newline |
| Blockquote, thematic break | `<blockquote>`, `<hr>` |
| Tables | `<table>`. Column alignment is dropped (`table_alignment`) |
| `![alt](https://… "title")` alone in a paragraph | Block image `<div class="image"><img src alt data-rte-caption></div>` |
| Image inside text | Inline image `<span class="image"><img … data-rte-inline="true"></span>` |
| Raw `<br>` | `<br>` |
| Raw `<img>` (GitHub's own upload format) | Rebuilt image keeping only `src` (http/https), `alt`, `width`, `align` (left/right) and `title` |
| Raw HTML comments | Dropped (`html_comment`, hidden: GitHub hides them too) |
| Any other raw HTML | Shown as escaped text, never interpreted (`raw_html`) |
| Images inside links | Kept, reported (`linked_image`) |
| Footnotes, `> [!NOTE]` alerts, `$math$` / `$$` / ` ```math ` | Text kept as written, reported (`footnote`, `alert`, `math`): Envision shows the source, and escaping it on the way back would break it on GitHub |
| `data:` or relative images | Replaced by their alt text (`inline_data_image`, `unsupported_url`) |
| Anything the sanitizer then removes | Reported (`sanitizer_removed`) |

## Envision → GitHub

Written by [markdownify](https://github.com/matthewwithanm/python-markdownify) (`markdownify>=1.2.0,<2`; the bench has 1.2.3), called once as `markdownify(html, **options)` and never subclassed. The module adds no Markdown of its own. It does three things around the library:

1. **Before**: reports formatting Markdown cannot hold (table below) and makes four small changes to the markup:
   - takes out addresses GitHub readers cannot open, keeping their text;
   - turns Desk's Quill bullet lists (`<ol>` whose items are all `data-list="bullet"`) into `<ul>`;
   - copies an image's `data-rte-caption` to `title`;
   - removes a `<br>` that ends a paragraph, list item, heading or cell, because Markdown cannot end a block with a line break.
2. **markdownify** writes the Markdown.
3. **After**: when nothing was reported, it renders the Markdown back through the inbound path and compares the two structurally. Anything markdownify escapes, nests or merges differently is reported as `roundtrip_mismatch` and goes to review instead of being published.

### markdownify options

| Option | Value | Why |
|---|---|---|
| `heading_style` | `ATX` | `#` headings; the default underlines h1/h2 |
| `bullets` | `"-"` | One bullet at every depth |
| `strong_em_symbol` | `ASTERISK` | `**bold**`, `*italic*` |
| `newline_style` | `BACKSLASH` | A hard break is `\` + newline, which survives trailing-space trimming (`normalize_markdown`) |
| `escape_misc` | `True` | Escapes backslash, backtick, `&`, `<`, `>`, brackets, `~`, `=`, `+` and the pipe, and `#`, `-` and `1.` runs that would start a heading, list or rule (off by default since 1.0) |
| `escape_asterisks`, `escape_underscores` | `True` | `*` and `_` stay text |
| `autolinks` | `True` | A link showing its own address becomes `<url>` |
| `code_language_callback` | `_fence_language` | The fence's info string comes from the editor's `<code class="language-x">`; `plaintext` and odd names give none |
| `keep_inline_images_in` | `div`, `p`, `span`, `td`, `th` | Images in table cells and headings stay images (the editor wraps them in `div.image`/`span.image`), not just their alt text |
| `table_infer_header` | `False` | A table without a header row is reported (`table_header`), not given one |

Everything else is markdownify's default (`strip_document` and `strip_pre` strip, `wrap` off, `<script>`/`<style>` dropped, comments ignored).

### Supported subset

| Editor node | Markdown (markdownify) |
|---|---|
| Paragraph, hard break | Paragraph; a break is `\` + newline. Empty paragraphs vanish |
| Heading 1–3 (Desk's 4–6 too) | `#`–`######` |
| Bold, italic, strike (`<s>`, `<del>`), inline code | `**`, `*`, `~~`, backtick spans sized to their content |
| Link | `[text](url "title")`, or `<url>` when it shows its own address |
| Bullet and ordered lists, nested | `-` and `1.` (`start` kept), nested by indentation |
| Code block | ```` ```lang ```` fence |
| Blockquote, horizontal rule | `>`, `---` |
| Table with a header first row | GitHub table, one line per row |
| Image (http/https) | `![alt](url "caption")` |
| Emoji | Its Unicode character |
| Desk (Quill) bullet or ordered lists | As above |

### Reported (review needed), text kept

| Code | What markdownify cannot write |
|---|---|
| `underline`, `highlight`, `text_color`, `font`, `alignment`, `indent`, `line_height`, `text_direction` | Presentation (`PRESENTATION_LOSSES`) |
| `image_size` | An image's width, or a left/right float (presentation) |
| `image_transform` | Flipped images (presentation) |
| `table_column_width` | Resized table columns (presentation) |
| `subscript`, `superscript` | `<sub>`, `<sup>` |
| `task_list` | Editor task lists and Quill checklists: markdownify writes no checkboxes, so `- [ ]` would become a plain bullet |
| `mixed_list` | One Quill list mixing bullets, numbers or checks |
| `details`, `columns` | Details blocks and columns, flattened in order |
| `table_header` | A table whose first row is not all header cells, or with header cells elsewhere |
| `table_span` | Merged cells |
| `table_cell_blocks` | Several paragraphs, a list, code or a line break in one cell (markdownify writes a cell on one line) |
| `math` | Text GitHub would show as math (`$x$`, `$$`): markdownify does not escape `$` |
| `unsupported_element` | Any other element, including Quill code blocks |
| `roundtrip_mismatch` | The Markdown does not render back to the same content (examples below) |
| `private_attachment`, `local_url`, `inline_data_image`, `unsupported_url` | Addresses below; only their visible text is published |
| `body_too_long` | The body with its marker is over `MAX_BODY_LENGTH` |

Known `roundtrip_mismatch` causes, all from markdownify writing them literally:

- two lists of the same kind one after another (Markdown merges them);
- a code block containing a ```` ``` ```` line;
- a `|` inside inline code in a table cell;
- a link address with spaces or parentheses, or `]` in an image's alt text;
- `!` right before a link;
- a line break inside a heading (markdownify writes it as a space);
- leading blank lines in a code block (markdownify strips them).

Escaping is markdownify's, and generous: `snake\_case`, `a \+ b`, `\[x\]`. GitHub shows the characters as typed; the backslashes only show to someone editing the body's source on GitHub.

## Addresses and attachments

- Nothing is fetched in either direction. Inbound images keep GitHub's address (including `github.com/user-attachments/…`), so the reader's browser loads them as it would any image pasted into the editor. Private-repository attachments only appear for readers signed in to GitHub with access.
- Outbound, these are never copied to GitHub, only their visible text (link text, image alt text):
  - relative addresses (`local_url`);
  - `/private/…`, `/private/files/…` and `/api/method/…` addresses on this site (`private_attachment`; on any host when `site_url` is not passed);
  - `data:` images (`inline_data_image`);
  - non-http(s)/mailto schemes (`unsupported_url`).
- Absolute public addresses, including this site's `/files/…`, are kept as written.

## Mentions, references and notifications

Text like `@name`, `#123`, `owner/repo#1` or a commit SHA is plain text in Envision. On GitHub it is linked: the mentioned user is notified (if they can see the repository), and referenced Issues get a cross-reference event. markdownify does not escape these, and escaping would not help, because GitHub matches them after rendering. The module does not rewrite them.

Publishing must therefore say so: the repository enablement and backlog confirmation, and the Task's publish warning, state that description text is published as written and that `@mentions` and `#references` notify people and link Issues on GitHub. That warning is the policy; there is no extra approval step for descriptions containing mentions. (Not yet in the UI: the settings and Task screens own this text.)

Emoji shortcodes such as `:tada:` are similar: plain text in Envision, an emoji on GitHub.

## Known limits

- GitHub renders with cmark-gfm; the round-trip check uses markdown-it-py. They agree on the supported subset, but edge cases (emphasis next to Unicode punctuation) are only caught when markdown-it-py disagrees too.
- Hidden HTML comments in a GitHub body (such as issue-template instructions) are lost if an Envision edit later replaces the body. They are invisible, so they do not count as lossy.
- Raw `<img height>` is dropped inbound, because the editor stores width only. Several spaces in a row collapse on GitHub. Empty paragraphs used as spacing vanish. A centred image (the editor's default) is shown left-aligned on GitHub and is not reported.
- Both digests collapse whitespace outside `pre`, so a change that only adds spaces is not seen as a change.
- An Issue imported with a task list, then edited in Envision, is a `task_list` conflict: the inbound side shows checkboxes, but markdownify cannot write them back.
- `MAX_BODY_LENGTH` is 65,536 characters, GitHub's commonly cited limit; confirm it against GitHub's documentation.
- markdownify accepts option names it does not know without complaint. A renamed option in a future release would silently change output; the round-trip check, and the manual checks below after any upgrade, are the guard.

## Validation (manual, for a site with the app installed)

No automated tests are added (`AGENTS.md`). After `bench setup requirements` (or `bench pip install -e apps/setu`), in `bench --site <site> console`:

```python
from setu.github import convert as c

# Inbound
c.markdown_to_html("- [x] done\n- [ ] todo")  # editor task list, lossy False
c.markdown_to_html("| a | b |\n|:-|-:|\n| 1 | 2 |")  # table, dropped ['table_alignment']
c.markdown_to_html('Text<br>more <img width="200" src="https://example.com/a.png" alt="a">')  # br, sized inline image
c.markdown_to_html("<details>x</details>\n\n<!-- hidden -->")  # escaped text; raw_html, html_comment
c.markdown_to_html("```py\nprint(1)\n```")  # <pre><code class="language-py">print(1)</code></pre>

# Outbound: supported, expect lossy False and dropped []
c.html_to_markdown("<h2>Goal</h2><p>Ship <strong>v2</strong> and <em>tidy</em> <s>old</s> <code>a_b</code></p>")
c.html_to_markdown('<p>snake_case *star* 1. x</p><ol start="3"><li><p>a</p></li><li><p>b</p><ul><li><p>c</p></li></ul></li></ol>')
c.html_to_markdown('<p>See <a href="https://example.com" rel="noopener noreferrer">site</a> or https://example.com</p>')
c.html_to_markdown('<pre><code class="language-python">print("hi")\n</code></pre><blockquote><p>quote</p></blockquote><hr>')
c.html_to_markdown('<table><tbody><tr><th><p>a</p></th><th><p>b</p></th></tr><tr><td><p>1 | 2</p></td><td><p>3</p></td></tr></tbody></table>')
c.html_to_markdown('<div class="image" style="text-align: center;"><img src="https://example.com/a.png" alt="a" align="center" data-rte-caption="cap"></div>')
c.html_to_markdown("<p>line<br>break<br></p>")  # "line\\\nbreak"
c.html_to_markdown('<ol><li data-list="bullet">a</li><li data-list="bullet">b</li></ol>')  # "- a\n- b"

# Outbound: reported, expect lossy True
c.html_to_markdown('<p><u>u</u> <span style="color: red">r</span></p>')  # underline, text_color
c.html_to_markdown('<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><label><input type="checkbox" checked><span></span></label><div><p>x</p></div></li></ul>')  # task_list
c.html_to_markdown('<p><img src="/private/files/x.png" alt="secret"></p>', site_url="https://site.example")  # 'secret', private_attachment; no /private address in the output
c.html_to_markdown('<p><img src="https://example.com/a.png" width="200"></p>')  # image_size
c.html_to_markdown("<table><tbody><tr><td><p>a</p><p>b</p></td></tr></tbody></table>")  # table_header, table_cell_blocks
c.html_to_markdown("<p>costs $x+y$</p>")  # math
c.html_to_markdown("<ul><li><p>a</p></li></ul><ul><li><p>b</p></li></ul>")  # roundtrip_mismatch
c.html_to_markdown("<p>Hi @octocat see #12</p>")  # lossy False: published as written (see Mentions)

# Bodies, markers and baselines
c.issue_body("<p>Hi</p>", marker=c.new_marker(), remote_body="Hi\r\n")["changed"]  # False
c.find_marker(c.add_marker("x", "abcdefgh12"))  # 'abcdefgh12'
c.body_changed("Hi  \r\n<!-- envision:abcdefgh12 -->", c.markdown_digest("Hi"))  # False
```

For each outbound result, check that the Markdown has no backslash before characters the text did not contain, and that pasting it into a GitHub Issue preview shows the original text.

Also round-trip real descriptions saved by the editor. Take a Task description, run `html_to_markdown`, then `markdown_to_html`. Check that `lossy` is False for supported content, and that the dropped codes name the unsupported formatting.
