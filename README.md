# Gemini Chat to PDF

A local Chrome extension that turns an open Gemini conversation into a clean, readable PDF. Pick the messages you want, preview the finished document in a new tab, and save it with one click.

Everything happens in your browser. There is no account, backend, or network upload.

## Install

1. Open `chrome://extensions` in Chrome.
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked**.
4. Select this folder: `W:\Tools\Gemini to PDF convert`.
5. Pin **Gemini Chat to PDF** to the toolbar if you like.

After installing or updating the extension, refresh any Gemini tab that was already open so the page script is available.

## Use

1. Open a conversation at `https://gemini.google.com/`.
2. Click the extension icon, then **Export chat**.
3. In the selector, untick any messages you do not want. **Select all** toggles everything.
4. Click **Done**. A preview tab opens and renders the PDF.
5. Click **Save PDF** to download the file.

The PDF is named after the conversation title, for example `Understanding closures - Gemini.pdf`.

### Preview actions

- **Original** opens the source conversation on Gemini.
- **Save PDF** downloads the generated PDF directly.
- **Print** opens an HTML print view. Use the browser's print dialog and choose **Save as PDF**. This is also the fallback for emoji or scripts that the embedded PDF font cannot display.

## What is exported

- The conversation title, export date, source link, and selected messages.
- User prompts in a right-aligned soft blue bubble; Gemini responses flow from the left with a role label.
- Headings, paragraphs, bold/italic text, inline code, links, bulleted and numbered lists, nested lists, block quotes, dividers, tables, and fenced code blocks with language labels.
- Page headers, footers, and page numbers on A4 pages.

Only messages currently loaded in the Gemini page are available. Gemini virtualizes long conversations, so scroll through the conversation first if you need older messages. Images, attachments, citations, and "thinking" panels are intentionally not included.

## Privacy

- Conversation text is read in the Gemini tab, converted to a plain data model, and kept in `chrome.storage.local`.
- PDF generation and preview rendering run entirely inside the extension.
- No analytics, remote fonts, or external requests are made.
- A new export clears previous temporary exports. The background worker keeps at most four recent exports and removes them after seven days.
- The selected conversation can be up to 7 MB; choose fewer messages if you hit that limit.

## Permissions

| Permission | Why it is needed |
| --- | --- |
| `storage` | Temporarily hold the selected conversation between the Gemini tab and the preview tab. |
| `activeTab` | Read the title of the Gemini tab you are exporting from. |
| `scripting` | Inject the selector if the content script was not loaded (for example, after an extension update). |
| `https://gemini.google.com/*` | Read the conversation and show the in-page selector. |

## Limitations

- The extension targets the current Gemini web layout. A future Gemini redesign may require updates to the extractor.
- Direct PDF output embeds Roboto and Roboto Mono. Latin, Greek, and Cyrillic text is supported; emoji, Devanagari, CJK, Arabic, and other scripts may render as blank boxes. Use **Print** for those conversations.
- Very wide tables are shrunk to fit the page. Extremely wide tables can still be cramped.
- Long code blocks are split into atomic chunks so a header is never left alone at the bottom of a page.
- The preview uses PDF.js. If preview rendering is unavailable, the generated PDF can still be saved or opened in the print view.

## Troubleshooting

- **"This isn't a Gemini tab"** — switch to an open `gemini.google.com` conversation, then reopen the popup.
- **Selector does not open** — refresh the Gemini tab and try again. After loading or reloading the extension, already-open tabs must be refreshed once.
- **"No conversation found"** — make sure a conversation is open and at least one message is visible.
- **Export was too large** — select fewer messages. The limit is 7 MB of prepared conversation data.
- **Emoji look like boxes in the PDF** — use **Print** and save the browser-generated PDF instead.
- **Preview says the export is no longer available** — temporary storage was cleared or pruned. Run the export again from Gemini.

## Project layout

```
manifest.json              Chrome Manifest V3 definition
background.js              Opens the preview tab and prunes old exports
content/extractor.js       Gemini DOM -> plain conversation model
content/content.js         In-page message selector (Shadow DOM)
popup/                     Toolbar popup
preview/                   PDF builder + PDF.js preview page
print/                     HTML print fallback
vendor/                    pdfmake, PDF.js, and embedded fonts
assets/                    Extension icons
```

There is no build step. Edit the source files and reload the extension from `chrome://extensions`.

## Third-party software

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for licenses of the bundled PDF libraries and fonts.
