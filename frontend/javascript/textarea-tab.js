/**
 * Textarea Tab Key Support
 * =================================================================
 * Intercepts Tab/Shift+Tab in <textarea> elements to insert/remove
 * indentation instead of changing focus.
 *
 * Tab       → insert \t at cursor (or indent selected lines)
 * Shift+Tab → remove leading \t or up to 4 spaces from current/selected lines
 *
 * Uses execCommand('insertText') to preserve native undo/redo and
 * fire proper InputEvent automatically.
 * =================================================================
 */

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (!(e.target instanceof HTMLTextAreaElement)) return;

    e.preventDefault();
    const ta = e.target;
    const { selectionStart: start, selectionEnd: end, value } = ta;

    // --- Single cursor (no selection) ---
    if (start === end) {
        if (e.shiftKey) {
            // Shift+Tab: remove one leading \t or up to 4 spaces from current line
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const linePrefix = value.slice(lineStart, start);
            const match = linePrefix.match(/^(\t| {1,4})/);
            if (match) {
                ta.setSelectionRange(lineStart, lineStart + match[1].length);
                document.execCommand('insertText', false, '');
            }
        } else {
            // Tab: insert \t at cursor
            document.execCommand('insertText', false, '\t');
        }
        return;
    }

    // --- Multi-line selection: indent/outdent all affected lines ---
    const firstLineStart = value.lastIndexOf('\n', start - 1) + 1;
    const afterEnd = value.indexOf('\n', end);
    const lastLineEnd = afterEnd === -1 ? value.length : afterEnd;

    const block = value.slice(firstLineStart, lastLineEnd);
    const lines = block.split('\n');

    let startDelta = 0;
    let endDelta = 0;
    let cumLen = 0;

    const newLines = lines.map((line) => {
        const lineAbsStart = firstLineStart + cumLen;
        cumLen += line.length + 1;

        if (e.shiftKey) {
            const match = line.match(/^(\t| {1,4})/);
            if (!match) return line;
            const rm = match[1].length;
            if (lineAbsStart + rm <= start) {
                startDelta -= rm;
            } else if (lineAbsStart <= start) {
                // Cursor is inside the whitespace being removed — snap to line start
                startDelta -= (start - lineAbsStart);
            }
            endDelta -= rm;
            return line.slice(rm);
        }

        if (lineAbsStart <= start) startDelta += 1;
        endDelta += 1;
        return '\t' + line;
    });

    // Replace block via execCommand to preserve undo history
    ta.setSelectionRange(firstLineStart, lastLineEnd);
    document.execCommand('insertText', false, newLines.join('\n'));

    // Restore adjusted selection
    ta.setSelectionRange(
        Math.max(firstLineStart, start + startDelta),
        Math.max(firstLineStart, end + endDelta)
    );
});
