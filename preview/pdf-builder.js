/*
 * Gemini Chat to PDF - PDF document builder
 *
 * pdfmake is loaded globally by the preview page. This module turns the
 * plain-text conversation model into an A4 pdfmake document definition and
 * produces a Blob.
 */
(function () {
  'use strict';

  const PAGE_WIDTH = 595.28;
  const PAGE_HEIGHT = 841.89;
  const MARGIN_X = 52;
  const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN_X * 2);

  const COLORS = {
    text: '#1F2937',
    heading: '#101828',
    muted: '#667085',
    faint: '#98A2B3',
    border: '#E4E7EC',
    rule: '#EAECF0',
    blue: '#2563EB',
    purple: '#7C3AED',
    userPanel: '#F3F6FF',
    tableHead: '#F2F4F7',
    tableAlt: '#FAFBFC',
    codeBg: '#F8FAFC',
    codeBorder: '#E4E7EC',
    quoteBg: '#F8FAFC'
  };

  const CODE_CHARS_PER_LINE = 92;
  const CODE_LINES_PER_CHUNK = 48;

  function sanitizeFilename(title) {
    let base = String(title || 'Gemini chat')
      .replace(/[\u0000-\u001F\u007F<>:"/\\|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (base.length > 110) base = base.slice(0, 110).replace(/\s+\S*$/, '');
    if (!base) base = 'Gemini chat';
    return base + ' - Gemini.pdf';
  }

  function formatDate(value) {
    const date = value ? new Date(value) : new Date();
    if (Number.isNaN(date.getTime())) return '';
    try {
      return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }).format(date);
    } catch (_) {
      return date.toISOString().slice(0, 10);
    }
  }

  function safeLink(value) {
    try {
      const url = new URL(value);
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href;
    } catch (_) {
      // Ignore malformed links.
    }
    return null;
  }

  function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16)
    };
  }

  function interpolateColor(from, to, ratio) {
    const a = hexToRgb(from);
    const b = hexToRgb(to);
    const mix = function (x, y) { return Math.round(x + ((y - x) * ratio)); };
    const hex = function (value) {
      return value.toString(16).padStart(2, '0');
    };
    return '#' + hex(mix(a.r, b.r)) + hex(mix(a.g, b.g)) + hex(mix(a.b, b.b));
  }

  function gradientLine(width) {
    const steps = 32;
    const stepWidth = width / steps;
    const lines = [];
    for (let i = 0; i < steps; i += 1) {
      const ratio = i / Math.max(1, steps - 1);
      const color = interpolateColor('#4285F4', '#A855F7', ratio);
      lines.push({
        type: 'line',
        x1: i * stepWidth,
        y1: 1.7,
        x2: (i + 1) * stepWidth + 0.7,
        y2: 1.7,
        lineWidth: 3.4,
        lineColor: color
      });
    }
    return lines;
  }

  function pdfRuns(runs, options) {
    const opts = options || {};
    const output = [];

    for (const run of runs || []) {
      if (!run || !run.text) continue;
      const item = { text: run.text };

      if (run.bold) item.bold = true;
      if (run.italic) item.italics = true;

      if (run.code) {
        item.font = 'RobotoMono';
        item.fontSize = opts.codeFontSize || 8.9;
        item.color = '#6D28D9';
      }

      if (run.link) {
        const link = safeLink(run.link);
        if (link) {
          item.link = link;
          item.color = COLORS.blue;
          item.decoration = 'underline';
        }
      }

      output.push(item);
    }

    return output;
  }

  function wrapCodeLine(line) {
    if (!line.length) return [''];
    const chunks = [];
    let remaining = line;
    while (remaining.length > CODE_CHARS_PER_LINE) {
      let cut = CODE_CHARS_PER_LINE;
      const charCode = remaining.charCodeAt(cut - 1);
      if (charCode >= 0xD800 && charCode <= 0xDBFF) cut -= 1;
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut);
    }
    if (remaining.length) chunks.push(remaining);
    return chunks;
  }

  function codeDisplayLines(text) {
    const lines = [];
    for (const line of String(text || '').replace(/\r\n?/g, '\n').split('\n')) {
      const wrapped = wrapCodeLine(line);
      for (const part of wrapped) lines.push(part);
    }
    while (lines.length && !lines[lines.length - 1]) lines.pop();
    return lines;
  }

  function codeBlockNodes(block) {
    const lines = codeDisplayLines(block.text);
    if (!lines.length) return [];

    const nodes = [];
    const chunks = [];
    for (let i = 0; i < lines.length; i += CODE_LINES_PER_CHUNK) {
      chunks.push(lines.slice(i, i + CODE_LINES_PER_CHUNK));
    }

    chunks.forEach(function (chunk, index) {
      const isFirst = index === 0;
      const isLast = index === chunks.length - 1;
      const label = block.language
        ? String(block.language).toUpperCase() + (isFirst ? '' : ' (CONTINUED)')
        : null;

      const stack = [];
      if (label) {
        stack.push({
          text: label,
          fontSize: 7.2,
          bold: true,
          color: COLORS.faint,
          characterSpacing: 0.8,
          margin: [0, 0, 0, 6]
        });
      }

      stack.push({
        text: chunk.join('\n'),
        font: 'RobotoMono',
        fontSize: 8.2,
        lineHeight: 1.26,
        color: '#1F2937',
        preserveLeadingSpaces: true
      });

      nodes.push({
        table: {
          widths: ['*'],
          dontBreakRows: true,
          body: [[{
            stack: stack,
            fillColor: COLORS.codeBg
          }]]
        },
        layout: {
          hLineWidth: function () { return 0.75; },
          vLineWidth: function () { return 0.75; },
          hLineColor: function () { return COLORS.codeBorder; },
          vLineColor: function () { return COLORS.codeBorder; },
          paddingLeft: function () { return 11; },
          paddingRight: function () { return 11; },
          paddingTop: function () { return 9; },
          paddingBottom: function () { return 9; }
        },
        margin: [0, 0, 0, isLast ? 11 : 5]
      });
    });

    return nodes;
  }

  function tableNode(block) {
    const rows = block.rows || [];
    if (!rows.length) return null;

    const columns = Math.max.apply(null, rows.map(function (row) { return row.length; }));
    if (!columns) return null;

    const headerRows = Math.max(0, Math.min(block.headerRows || 0, rows.length));
    const fontSize = columns > 10 ? 6.9 : (columns > 7 ? 7.5 : 8.2);
    const padding = columns > 10 ? 3.5 : 4.5;

    const body = rows.map(function (row, rowIndex) {
      const cells = [];
      for (let column = 0; column < columns; column += 1) {
        const value = row[column] == null ? '' : String(row[column]);
        const isHeader = rowIndex < headerRows;
        const shade = isHeader
          ? COLORS.tableHead
          : ((rowIndex - headerRows) % 2 === 1 ? COLORS.tableAlt : null);
        const cell = {
          text: value || ' ',
          fontSize: fontSize,
          lineHeight: 1.3,
          color: COLORS.text,
          bold: isHeader
        };
        if (shade) cell.fillColor = shade;
        cells.push(cell);
      }
      return cells;
    });

    return {
      table: {
        headerRows: headerRows,
        dontBreakRows: true,
        widths: new Array(columns).fill('*'),
        body: body
      },
      layout: {
        hLineWidth: function () { return 0.55; },
        vLineWidth: function () { return 0.55; },
        hLineColor: function () { return COLORS.border; },
        vLineColor: function () { return COLORS.border; },
        paddingLeft: function () { return padding; },
        paddingRight: function () { return padding; },
        paddingTop: function () { return padding; },
        paddingBottom: function () { return padding; }
      },
      margin: [0, 3, 0, 11]
    };
  }

  function quoteNode(block) {
    return {
      table: {
        widths: [3, '*'],
        body: [[
          { text: '', fillColor: '#A5B4FC' },
          {
            stack: [{
              text: pdfRuns(block.runs),
              fontSize: 9.5,
              lineHeight: 1.42,
              color: '#475467',
              margin: [10, 7, 9, 7]
            }],
            fillColor: COLORS.quoteBg
          }
        ]]
      },
      layout: {
        hLineWidth: function () { return 0; },
        vLineWidth: function () { return 0; },
        paddingLeft: function () { return 0; },
        paddingRight: function () { return 0; },
        paddingTop: function () { return 0; },
        paddingBottom: function () { return 0; }
      },
      margin: [0, 2, 0, 10]
    };
  }

  function listNodes(block) {
    const nodes = [];
    for (const item of block.items || []) {
      const level = Math.max(0, Math.min(8, item.level || 0));
      const markerWidth = 15 + (level * 13);
      const rawMarker = String(item.marker || '');
      const ordered = /^\d+[.)]$/.test(rawMarker);
      const marker = ordered ? rawMarker : (level === 0 ? '\u2022' : '\u2013');
      nodes.push({
        columns: [
          {
            width: markerWidth,
            text: marker,
            fontSize: ordered ? 9.2 : 10.5,
            color: level === 0 ? '#667085' : '#98A2B3',
            alignment: 'right'
          },
          {
            width: '*',
            text: pdfRuns(item.runs),
            fontSize: 9.8,
            lineHeight: 1.38,
            color: COLORS.text,
            margin: [6, 0, 0, 0]
          }
        ],
        margin: [0, 0, 0, 4.5]
      });
    }
    return nodes;
  }

  function headingSize(level) {
    if (level <= 1) return 16;
    if (level === 2) return 13.4;
    if (level === 3) return 11.8;
    return 10.8;
  }

  function renderBlocks(blocks) {
    const nodes = [];
    let hasContent = false;

    for (const block of blocks || []) {
      if (!block) continue;
      let rendered = null;

      if (block.type === 'paragraph') {
        if (!block.runs || !block.runs.length) continue;
        rendered = {
          text: pdfRuns(block.runs),
          fontSize: 9.8,
          lineHeight: 1.43,
          color: COLORS.text,
          margin: [0, 0, 0, 7]
        };
      } else if (block.type === 'heading') {
        if (!block.runs || !block.runs.length) continue;
        rendered = {
          text: pdfRuns(block.runs),
          fontSize: headingSize(block.level),
          bold: true,
          color: COLORS.heading,
          lineHeight: 1.25,
          margin: [0, hasContent ? 9 : 0, 0, 4]
        };
      } else if (block.type === 'list') {
        const items = listNodes(block);
        if (items.length) {
          if (hasContent) nodes.push({ text: '', margin: [0, 0, 0, 2] });
          nodes.push.apply(nodes, items);
          hasContent = true;
        }
        continue;
      } else if (block.type === 'code') {
        const code = codeBlockNodes(block);
        if (code.length) {
          nodes.push.apply(nodes, code);
          hasContent = true;
        }
        continue;
      } else if (block.type === 'table') {
        const table = tableNode(block);
        if (table) {
          rendered = table;
        } else {
          continue;
        }
      } else if (block.type === 'quote') {
        if (!block.runs || !block.runs.length) continue;
        rendered = quoteNode(block);
      } else if (block.type === 'divider') {
        rendered = {
          canvas: [{
            type: 'line',
            x1: 0,
            y1: 0,
            x2: CONTENT_WIDTH,
            y2: 0,
            lineWidth: 0.7,
            lineColor: COLORS.rule
          }],
          margin: [0, 4, 0, 10]
        };
      }

      if (rendered) {
        nodes.push(rendered);
        hasContent = true;
      }
    }

    return nodes;
  }

  function roleHeader(message, topMargin) {
    const isUser = message.role === 'user';
    const color = isUser ? COLORS.blue : COLORS.purple;

    return {
      columns: [
        {
          width: 12,
          canvas: [{
            type: 'ellipse',
            x: 3.4,
            y: 5.2,
            r1: 2.3,
            r2: 2.3,
            color: color
          }]
        },
        {
          width: '*',
          text: isUser ? 'YOU' : 'GEMINI',
          fontSize: 8.2,
          bold: true,
          characterSpacing: 1.1,
          color: color
        },
        {
          width: 'auto',
          text: message.timestamp || '',
          fontSize: 7.6,
          color: COLORS.faint,
          alignment: 'right'
        }
      ],
      columnGap: 0,
      margin: [0, topMargin, 0, 5]
    };
  }

  function userPanel(blocks) {
    return {
      table: {
        widths: ['*'],
        body: [[{
          stack: renderBlocks(blocks),
          fillColor: COLORS.userPanel
        }]]
      },
      layout: {
        hLineWidth: function () { return 0; },
        vLineWidth: function () { return 0; },
        paddingLeft: function () { return 13; },
        paddingRight: function () { return 13; },
        paddingTop: function () { return 10; },
        paddingBottom: function () { return 2; }
      },
      margin: [0, 0, 0, 2]
    };
  }

  function buildDocDefinition(model) {
    if (!model || !Array.isArray(model.messages) || !model.messages.length) {
      throw new Error('There are no messages to include in this PDF.');
    }

    const title = String(model.title || 'Gemini conversation').trim() || 'Gemini conversation';
    const messageCount = model.messages.length;
    const exportedDate = formatDate(model.exportedAt);

    const content = [
      {
        canvas: gradientLine(CONTENT_WIDTH),
        margin: [0, 0, 0, 0]
      },
      {
        text: 'GEMINI CONVERSATION',
        fontSize: 7.6,
        bold: true,
        characterSpacing: 1.5,
        color: COLORS.faint,
        margin: [0, 18, 0, 0]
      },
      {
        text: title,
        fontSize: 22,
        bold: true,
        lineHeight: 1.16,
        color: COLORS.heading,
        margin: [0, 6, 0, 0]
      },
      {
        columns: [
          {
            width: '*',
            text: messageCount + (messageCount === 1 ? ' message' : ' messages'),
            fontSize: 8.5,
            color: COLORS.muted
          },
          {
            width: 'auto',
            text: exportedDate ? 'Exported ' + exportedDate : '',
            fontSize: 8.5,
            color: COLORS.muted,
            alignment: 'right'
          }
        ],
        margin: [0, 12, 0, 0]
      }
    ];

    if (model.sourceUrl) {
      content.push({
        text: 'Open the original conversation on gemini.google.com',
        link: model.sourceUrl,
        fontSize: 7.6,
        color: COLORS.blue,
        decoration: 'underline',
        margin: [0, 4, 0, 0]
      });
    }

    content.push({
      canvas: [{
        type: 'line',
        x1: 0,
        y1: 0,
        x2: CONTENT_WIDTH,
        y2: 0,
        lineWidth: 0.8,
        lineColor: COLORS.rule
      }],
      margin: [0, 17, 0, 4]
    });

    let previousRole = null;
    model.messages.forEach(function (message, index) {
      let topMargin = 0;
      if (index > 0) {
        if (message.role === 'user' && previousRole === 'assistant') topMargin = 21;
        else topMargin = 14;
      }

      content.push(roleHeader(message, topMargin));

      if (message.role === 'user') {
        content.push(userPanel(message.blocks || []));
      } else {
        content.push.apply(content, renderBlocks(message.blocks || []));
      }

      if (index < model.messages.length - 1) {
        content.push({
          text: '',
          margin: [0, 0, 0, 1]
        });
      }

      previousRole = message.role;
    });

    return {
      pageSize: 'A4',
      pageMargins: [MARGIN_X, 58, MARGIN_X, 58],
      info: {
        title: title + ' - Gemini',
        author: 'Gemini Chat to PDF',
        subject: 'Gemini conversation export',
        creator: 'Gemini Chat to PDF',
        producer: 'pdfmake'
      },
      defaultStyle: {
        font: 'Roboto',
        fontSize: 9.8,
        lineHeight: 1.4,
        color: COLORS.text
      },
      header: function (currentPage) {
        if (currentPage === 1) return { text: '' };
        return {
          columns: [
            {
              width: '*',
              text: title,
              fontSize: 7.2,
              color: COLORS.faint,
              ellipsis: true
            },
            {
              width: 'auto',
              text: 'GEMINI CHAT EXPORT',
              fontSize: 6.8,
              bold: true,
              characterSpacing: 1,
              color: '#C4B5FD'
            }
          ],
          margin: [MARGIN_X, 23, MARGIN_X, 0]
        };
      },
      footer: function (currentPage, pageCount) {
        return {
          columns: [
            {
              width: '*',
              text: 'Exported with Gemini Chat to PDF',
              fontSize: 7,
              color: COLORS.faint
            },
            {
              width: 'auto',
              text: currentPage + ' / ' + pageCount,
              fontSize: 7,
              color: COLORS.faint,
              alignment: 'right'
            }
          ],
          margin: [MARGIN_X, 24, MARGIN_X, 0]
        };
      },
      content: content
    };
  }

  function createPdfBlob(docDefinition) {
    return new Promise(function (resolve, reject) {
      if (!globalThis.pdfMake || typeof globalThis.pdfMake.createPdf !== 'function') {
        reject(new Error('The PDF engine did not load.'));
        return;
      }

      try {
        globalThis.pdfMake.createPdf(docDefinition).getBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('The PDF could not be generated.'));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  globalThis.GeminiPdfBuilder = {
    PAGE_WIDTH: PAGE_WIDTH,
    PAGE_HEIGHT: PAGE_HEIGHT,
    buildDocDefinition: buildDocDefinition,
    createPdfBlob: createPdfBlob,
    sanitizeFilename: sanitizeFilename
  };
})();
