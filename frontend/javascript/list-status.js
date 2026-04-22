/**
 * List Status Legend (Tier 22)
 * =================================================================
 * Shared 4-icon stack rendered on every BB branch, WT connection,
 * and BC channel row. The same SVG schema means one glance at any
 * list tells the user the same four things:
 *
 *   HEAD       (eye)     — currently viewed / selected
 *   LOCAL      (file)    — has local data
 *   SYNCED     (check)   — server copy matches local
 *   NOT-SYNCED (warning) — local diverges OR item is cloud-only
 *
 * Every row emits ALL 4 icons; active ones brighten to brand colour,
 * inactive ones dim to 20 % opacity. That way the stack is a visual
 * legend, not a state variable — users can learn the meaning once
 * instead of decoding a different arrangement per list.
 *
 * Icons use CSS mask + `background-color: currentColor` so they
 * theme via the `color` cascade; see `.list-status-icon` rules in
 * `style.css`.
 * =================================================================
 */

const SLOTS = [
    { key: 'head',    svg: 'head'    },
    { key: 'local',   svg: 'local'   },
    { key: 'synced',  svg: 'synced'  },
    { key: 'asynced', svg: 'asynced' },
];

/**
 * Return an HTML string for the 4-icon legend. `state` is an object
 * with boolean keys `head / local / synced / asynced`; each sets the
 * `.active` class on the matching slot.
 *
 * Usage:
 *   item.innerHTML = `... ${buildStatusLegend({ head: true, local: true })} ...`;
 */
export function buildStatusLegend(state = {}) {
    const items = SLOTS.map(({ key, svg }) => {
        const activeCls = state[key] ? ' active' : '';
        return `<span class="list-status-icon${activeCls}" style="--icon-url: url('./images/status-${svg}.svg')"></span>`;
    }).join('');
    return `<div class="list-status-icons">${items}</div>`;
}

/**
 * Imperative variant for renderers that build DOM via `createElement`
 * rather than innerHTML. Returns a detached container ready to append.
 */
export function makeStatusLegend(state = {}) {
    const wrap = document.createElement('div');
    wrap.className = 'list-status-icons';
    for (const { key, svg } of SLOTS) {
        const span = document.createElement('span');
        span.className = 'list-status-icon' + (state[key] ? ' active' : '');
        span.style.setProperty('--icon-url', `url('./images/status-${svg}.svg')`);
        wrap.appendChild(span);
    }
    return wrap;
}
