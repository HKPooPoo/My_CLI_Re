/**
 * Textarea Tab Key Support
 * =================================================================
 * Intercepts Tab/Shift+Tab in <textarea> elements to insert/remove
 * indentation instead of changing focus.
 *
 * Tab       → insert \t at cursor (or indent selected lines)
 * Shift+Tab → remove leading \t or up to 4 spaces from current/selected lines
 * =================================================================
 */

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    if (!(e.target instanceof HTMLTextAreaElement)) return;

    e.preventDefault();
    const ta = e.target;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;

    if (start === end) {
        // No selection — single cursor
        if (e.shiftKey) {
            // Shift+Tab: remove leading indent from current line
            const before = ta.value.slice(0, start);
            const lineStart = before.lastIndexOf('\n') + 1;
            const linePrefix = ta.value.slice(lineStart, start);
            const match = linePrefix.match(/^(\t| {1,4})/);
            if (match) {
                ta.value = ta.value.slice(0, lineStart) + ta.value.slice(lineStart + match[1].length);
                ta.selectionStart = ta.selectionEnd = start - match[1].length;
            }
        } else {
            // Tab: insert \t
            ta.value = ta.value.slice(0, start) + '\t' + ta.value.slice(end);
            ta.selectionStart = ta.selectionEnd = start + 1;
        }
    } else {
        // Multi-line selection — indent/outdent all selected lines
        const lines = ta.value.split('\n');
        let pos = 0;
        let newStart = start;
        let newEnd = end;

        const result = lines.map((line, i) => {
            const lineStart = pos;
            const lineEnd = pos + line.length;
            pos = lineEnd + 1; // +1 for \n

            // Is this line within the selection?
            if (lineEnd < start || lineStart > end) return line;

            if (e.shiftKey) {
                const match = line.match(/^(\t| {1,4})/);
                if (match) {
                    if (lineStart < newStart) newStart = Math.max(lineStart, newStart - match[1].length);
                    newEnd -= match[1].length;
                    return line.slice(match[1].length);
                }
                return line;
            } else {
                if (lineStart <= newStart && i > 0 || lineStart < newStart) newStart += 1;
                newEnd += 1;
                return '\t' + line;
            }
        });

        ta.value = result.join('\n');
        ta.selectionStart = newStart;
        ta.selectionEnd = newEnd;
    }

    // Trigger input event so debounce/save handlers pick up the change
    ta.dispatchEvent(new Event('input', { bubbles: true }));
});
