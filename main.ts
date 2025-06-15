import { Plugin, Editor, MarkdownView } from "obsidian";
import { foldEffect, unfoldEffect, foldable } from "@codemirror/language";
import { EditorView } from "@codemirror/view";

interface HeaderNode {
  line: number;
  level: number;
  parent?: HeaderNode;
}

export default class FocusHeaderPlugin extends Plugin {
  onload() {
    this.addCommand({
      id: "focus-on-current-header-smart",
      name: "Focus on Current Header",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.focusOnCurrentHeader(editor);
      },
    });
    this.addCommand({
      id: "focus-next-sibling-header",
      name: "Focus on Next Header",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.focusOnNextSibling(editor);
      },
    });
    this.addCommand({
      id: "focus-previous-sibling-header",
      name: "Focus on Previous Header",
      editorCallback: (editor: Editor, view: MarkdownView) => {
        this.focusOnPreviousSibling(editor);
      },
    });
  }

  focusOnCurrentHeader(editor: Editor) {
    // @ts-ignore: cm is not in the public API
    const cm: EditorView = editor.cm;
    const state = cm.state;
    const cursorLine = editor.getCursor().line;
    const lines = editor.getValue().split("\n");

    const headers: HeaderNode[] = [];
    let lastByLevel: { [level: number]: HeaderNode } = {};

    // Step 1: Build the header tree
    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#+)\s/);
      if (match) {
        const level = match[1].length;
        const node: HeaderNode = { line: i, level };
        // Set parent: look for last smaller level
        for (let l = level - 1; l >= 1; l--) {
          if (lastByLevel[l]) {
            node.parent = lastByLevel[l];
            break;
          }
        }
        headers.push(node);
        lastByLevel[level] = node;
      }
    }

    // Step 2: Find current header node
    let currentHeader: HeaderNode | undefined;
    for (let i = headers.length - 1; i >= 0; i--) {
      if (headers[i].line <= cursorLine) {
        currentHeader = headers[i];
        break;
      }
    }

    if (!currentHeader) return;

    // Step 3: Collect lines to unfold (ancestors + current header + its children only)
    const unfoldLines = new Set<number>();

    // Collect ancestors (without their children)
    let ancestor: HeaderNode | undefined = currentHeader;
    while (ancestor) {
      unfoldLines.add(ancestor.line);
      ancestor = ancestor.parent;
    }

    // Collect current header and its descendants
    const collectDescendants = (node: HeaderNode) => {
      unfoldLines.add(node.line);
      for (const child of headers) {
        if (child.parent === node) {
          collectDescendants(child);
        }
      }
    };
    collectDescendants(currentHeader);

    // Step 4: Create fold/unfold effects
    const effects = [];

    for (const header of headers) {
      const from = state.doc.line(header.line + 1).from;
      const range = foldable(state, from);
      if (!range) continue;

      if (unfoldLines.has(header.line)) {
        effects.push(unfoldEffect.of(range));
      } else {
        effects.push(foldEffect.of(range));
      }
    }

    cm.dispatch({ effects });

    // Scroll to current header
    const pos = state.doc.line(currentHeader.line + 1).from;
    cm.scrollDOM.scrollTop = cm.coordsAtPos(pos)?.top ?? 0;
  }

  focusOnNextSibling(editor: Editor) {
    // @ts-ignore: cm is not in the public API
    const cm: EditorView = editor.cm;
    const state = cm.state;
    const cursorLine = editor.getCursor().line;
    const lines = editor.getValue().split("\n");

    const headers: HeaderNode[] = [];
    let lastByLevel: { [level: number]: HeaderNode } = {};

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#+)\s/);
      if (match) {
        const level = match[1].length;
        const node: HeaderNode = { line: i, level };
        for (let l = level - 1; l >= 1; l--) {
          if (lastByLevel[l]) {
            node.parent = lastByLevel[l];
            break;
          }
        }
        headers.push(node);
        lastByLevel[level] = node;
      }
    }

    let currentHeaderIndex = -1;
    for (let i = headers.length - 1; i >= 0; i--) {
      if (headers[i].line <= cursorLine) {
        currentHeaderIndex = i;
        break;
      }
    }

    if (currentHeaderIndex === -1) return;

    const currentHeader = headers[currentHeaderIndex];
    const level = currentHeader.level;

    // Find the next sibling
    let nextSibling: HeaderNode | undefined;
    for (let i = currentHeaderIndex + 1; i < headers.length; i++) {
      if (headers[i].level === level && headers[i].parent === currentHeader.parent) {
        nextSibling = headers[i];
        break;
      }
      if (headers[i].level <= level) break; // stop at same or higher-level heading
    }

    if (!nextSibling) return;

    const unfoldLines = new Set<number>();

    // Always unfold ancestors of the next sibling
    let ancestor: HeaderNode | undefined = nextSibling;
    while (ancestor) {
      unfoldLines.add(ancestor.line);
      ancestor = ancestor.parent;
    }

    // Unfold next sibling and its descendants
    const collectDescendants = (node: HeaderNode) => {
      unfoldLines.add(node.line);
      for (const child of headers) {
        if (child.parent === node) {
          collectDescendants(child);
        }
      }
    };
    collectDescendants(nextSibling);

    const effects = [];

    for (const header of headers) {
      const from = state.doc.line(header.line + 1).from;
      const range = foldable(state, from);
      if (!range) continue;

      if (unfoldLines.has(header.line)) {
        effects.push(unfoldEffect.of(range));
      } else {
        effects.push(foldEffect.of(range));
      }
    }

    cm.dispatch({ effects });

    const pos = state.doc.line(nextSibling.line + 1).from;
    cm.scrollDOM.scrollTop = cm.coordsAtPos(pos)?.top ?? 0;
    editor.setCursor({ line: nextSibling.line, ch: 0 });
  }

  focusOnPreviousSibling(editor: Editor) {
    // @ts-ignore: cm is not in the public API
    const cm: EditorView = editor.cm;
    const state = cm.state;
    const cursorLine = editor.getCursor().line;
    const lines = editor.getValue().split("\n");

    const headers: HeaderNode[] = [];
    let lastByLevel: { [level: number]: HeaderNode } = {};

    for (let i = 0; i < lines.length; i++) {
      const match = lines[i].match(/^(#+)\s/);
      if (match) {
        const level = match[1].length;
        const node: HeaderNode = { line: i, level };
        for (let l = level - 1; l >= 1; l--) {
          if (lastByLevel[l]) {
            node.parent = lastByLevel[l];
            break;
          }
        }
        headers.push(node);
        lastByLevel[level] = node;
      }
    }

    let currentHeaderIndex = -1;
    for (let i = headers.length - 1; i >= 0; i--) {
      if (headers[i].line <= cursorLine) {
        currentHeaderIndex = i;
        break;
      }
    }

    if (currentHeaderIndex === -1) return;

    const currentHeader = headers[currentHeaderIndex];
    const level = currentHeader.level;

    // Find the previous sibling
    let prevSibling: HeaderNode | undefined;
    for (let i = currentHeaderIndex - 1; i >= 0; i--) {
      if (headers[i].level === level && headers[i].parent === currentHeader.parent) {
        prevSibling = headers[i];
        break;
      }
      if (headers[i].level <= level) break; // stop at same or higher-level heading
    }

    if (!prevSibling) return;

    const unfoldLines = new Set<number>();

    // Always unfold ancestors of the previous sibling
    let ancestor: HeaderNode | undefined = prevSibling;
    while (ancestor) {
      unfoldLines.add(ancestor.line);
      ancestor = ancestor.parent;
    }

    // Unfold previous sibling and its descendants
    const collectDescendants = (node: HeaderNode) => {
      unfoldLines.add(node.line);
      for (const child of headers) {
        if (child.parent === node) {
          collectDescendants(child);
        }
      }
    };
    collectDescendants(prevSibling);

    const effects = [];

    for (const header of headers) {
      const from = state.doc.line(header.line + 1).from;
      const range = foldable(state, from);
      if (!range) continue;

      if (unfoldLines.has(header.line)) {
        effects.push(unfoldEffect.of(range));
      } else {
        effects.push(foldEffect.of(range));
      }
    }

    cm.dispatch({ effects });

    const pos = state.doc.line(prevSibling.line + 1).from;
    cm.scrollDOM.scrollTop = cm.coordsAtPos(pos)?.top ?? 0;
    editor.setCursor({ line: prevSibling.line, ch: 0 });
  }
}