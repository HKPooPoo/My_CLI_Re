/**
 * List Status Icons (Tier 22.5)
 * =================================================================
 * Shared icon vocabulary across BB branch / WT connection / BC
 * channel list rows. Only states that APPLY are rendered — an
 * inactive state simply isn't in the DOM. That mirrors the text-based
 * indicator convention where a row reads `[SAVED]` or `[LOCAL]` but
 * never both at once.
 *
 *   HEAD       → eye            (currently viewed / selected)
 *   LOCAL      → floppy save    (on this device only, not on server)
 *   SYNCED     → cloud          (on server, in sync)
 *   NOT-SYNCED → cloud w/ cross (on server but local diverges)
 *
 * Each list renderer composes a `state` object; truthy keys render
 * their icon, falsy keys render nothing. Consumers are free to light
 * multiple icons (e.g. HEAD + SYNCED) — the icons draw left-to-right
 * in the order defined below.
 * =================================================================
 */

// Each board opts into the subset of slots its data model supports.
// BB uses head/local/synced/asynced; BC uses synced/asynced only;
// WT uses `new` only. Slot order here is also the left-to-right
// render order when multiple fire on the same row.
const SLOTS = [
    { key: 'head',    svg: 'head'    },
    { key: 'local',   svg: 'local'   },
    { key: 'synced',  svg: 'synced'  },
    { key: 'asynced', svg: 'asynced' },
    { key: 'new',     svg: 'new'     },
];

/** HTML-string form for `innerHTML` renderers (BB). */
export function buildStatusLegend(state = {}) {
    const items = SLOTS
        .filter(({ key }) => !!state[key])
        .map(({ svg }) => `<span class="list-status-icon" style="--icon-url: url('./images/status-${svg}.svg')"></span>`)
        .join('');
    if (!items) return '';
    return `<div class="list-status-icons">${items}</div>`;
}

/** DOM-node form for `appendChild` renderers (WT, BC). */
export function makeStatusLegend(state = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'list-status-icons';
    let any = false;
    for (const { key, svg } of SLOTS) {
        if (!state[key]) continue;
        any = true;
        const span = document.createElement('span');
        span.className = 'list-status-icon';
        span.style.setProperty('--icon-url', `url('./images/status-${svg}.svg')`);
        wrap.appendChild(span);
    }
    // An empty container is harmless (no icons, no padding) but returning
    // it anyway keeps consumer code uniform.
    return any ? wrap : document.createDocumentFragment();
}
