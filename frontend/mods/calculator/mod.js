/**
 * Calculator MOD — Button-based on-screen calculator
 * All input via shelf button grid. No keyboard input.
 */

const CALC_ICON = "data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27%3E%3Cpath d=%27M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H7v-2h5v2zm0-4H7v-2h5v2zm5 4h-3v-6h3v6zm0-8H7V5h10v4z%27/%3E%3C/svg%3E";

// [label, cssClass]  — cssClass drives visual color
const BUTTONS = [
    ['C',  'clr'], ['\u232B', 'fn'], ['%',  'op'], ['\u00F7', 'op'],
    ['7',  ''],    ['8',  ''],       ['9',  ''],    ['\u00D7', 'op'],
    ['4',  ''],    ['5',  ''],       ['6',  ''],    ['\u2212', 'op'],
    ['1',  ''],    ['2',  ''],       ['3',  ''],    ['+',     'op'],
    ['\u00B1', 'fn'], ['0', ''],     ['.',  ''],    ['=',     'eq'],
];

const CALC_CSS = `
.calc-wrapper {
    flex: 1;
    min-height: 0;
    width: 100%;
    gap: 8px;
}

.calc-display {
    display: block;
    background: var(--bg-primary);
    border: var(--border-line);
    border-radius: var(--border-radius);
    padding: 6px 10px;
    color: var(--text-green);
    font-family: 'Courier New', monospace;
    font-size: 1.6em;
    text-align: right;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: 1.8em;
    line-height: 1.8em;
    text-shadow: 0 0 8px var(--text-green);
}

.calc-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    grid-template-rows: repeat(5, 1fr);
    gap: 6px;
    flex: 1;
    min-height: 0;
}

.calc-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    border: var(--border-line);
    border-radius: var(--border-radius);
    background: var(--bg-secondary);
    color: var(--text-green);
    font-size: 1.2em;
    font-family: 'Courier New', monospace;
    line-height: 1;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
}

.calc-btn:active {
    background: var(--text-green);
    color: var(--bg-primary);
}

.calc-btn-op {
    color: var(--text-orange);
    border-color: var(--text-orange);
}

.calc-btn-op:active {
    background: var(--text-orange);
    color: var(--bg-primary);
}

.calc-btn-eq {
    color: var(--text-cyan);
    border-color: var(--text-cyan);
}

.calc-btn-eq:active {
    background: var(--text-cyan);
    color: var(--bg-primary);
}

.calc-btn-clr {
    color: var(--text-red);
    border-color: var(--text-red);
}

.calc-btn-clr:active {
    background: var(--text-red);
    color: var(--bg-primary);
}

@media (hover: hover) {
    .calc-btn:hover {
        box-shadow: 0 0 6px var(--text-green);
    }
    .calc-btn-op:hover {
        box-shadow: 0 0 6px var(--text-orange);
    }
    .calc-btn-eq:hover {
        box-shadow: 0 0 6px var(--text-cyan);
    }
    .calc-btn-clr:hover {
        box-shadow: 0 0 6px var(--text-red);
    }
}
`;

export default {
    getButtonDataId() { return 'calculator'; },
    getInstanceName(config, tFn) { return tFn('mods.calculator.name'); },
    getIconUrl() { return CALC_ICON; },

    async init(ctx) {
        // Inject CSS once
        if (!document.getElementById('calc-mod-style')) {
            const style = document.createElement('style');
            style.id = 'calc-mod-style';
            style.textContent = CALC_CSS;
            document.head.appendChild(style);
        }

        // Shelf may not exist yet at boot (init runs before createAllInstanceDOM).
        // _buildShelf is idempotent — retried in activate() if needed.
        this._buildShelf(ctx);
    },

    async activate(ctx) {
        this._buildShelf(ctx);
    },

    /** Idempotent: build shelf DOM on first successful call, no-op after. */
    _buildShelf(ctx) {
        if (this._displayEl) return;

        const shelf = ctx.ui.getShelfElement();
        if (!shelf) return;

        const wrapper = document.createElement('div');
        wrapper.className = 'calc-wrapper';

        const display = document.createElement('div');
        display.className = 'calc-display';

        const grid = document.createElement('div');
        grid.className = 'calc-grid';

        for (const [label, css] of BUTTONS) {
            const btn = document.createElement('button');
            btn.className = 'calc-btn' + (css ? ` calc-btn-${css}` : '');
            btn.textContent = label;
            btn.addEventListener('click', () => this._onButtonClick(label));
            grid.appendChild(btn);
        }

        wrapper.appendChild(display);
        wrapper.appendChild(grid);
        shelf.appendChild(wrapper);

        this._displayEl = display;
        this._expression = '';
        this._result = '';
        this._justEvaluated = false;
    },

    async checkHealth() { return 'online'; },

    // ── Calculator Logic ──

    _onButtonClick(label) {
        switch (label) {
            case 'C':
                this._expression = '';
                this._result = '';
                this._justEvaluated = false;
                break;
            case '\u232B': // ⌫
                if (this._justEvaluated) {
                    this._expression = '';
                    this._result = '';
                    this._justEvaluated = false;
                } else {
                    this._expression = this._expression.slice(0, -1);
                }
                break;
            case '%':
                this._handlePercent();
                break;
            case '\u00B1': // ±
                this._handleSign();
                break;
            case '=':
                this._evaluate();
                this._justEvaluated = true;
                break;
            case '+': case '\u2212': case '\u00D7': case '\u00F7':
                this._appendOperator(label);
                break;
            default: // digits and decimal
                this._appendDigit(label);
                break;
        }
        this._updateDisplay();
    },

    _appendDigit(d) {
        if (this._justEvaluated) {
            this._expression = '';
            this._result = '';
            this._justEvaluated = false;
        }
        // Prevent multiple dots in current number
        if (d === '.') {
            const lastNum = this._expression.split(/[+\u2212\u00D7\u00F7]/).pop();
            if (lastNum && lastNum.includes('.')) return;
        }
        this._expression += d;
    },

    _appendOperator(op) {
        if (this._justEvaluated) {
            // Continue from result
            this._expression = this._result || '0';
            this._result = '';
            this._justEvaluated = false;
        }
        if (!this._expression) {
            // Allow leading minus
            if (op === '\u2212') this._expression = '\u2212';
            return;
        }
        // Replace trailing operator
        if (/[+\u2212\u00D7\u00F7]$/.test(this._expression)) {
            this._expression = this._expression.slice(0, -1);
        }
        this._expression += op;
    },

    _handlePercent() {
        if (this._justEvaluated && this._result && this._result !== 'Error') {
            const val = parseFloat(this._result) / 100;
            this._result = String(val);
            this._expression = String(val);
            this._justEvaluated = false;
            return;
        }
        const match = this._expression.match(/(\d+\.?\d*)$/);
        if (!match) return;
        const pct = parseFloat(match[1]) / 100;
        this._expression = this._expression.slice(0, -match[1].length) + String(pct);
    },

    _handleSign() {
        if (this._justEvaluated && this._result && this._result !== 'Error') {
            const val = parseFloat(this._result);
            this._result = String(-val);
            this._expression = String(-val);
            this._justEvaluated = false;
            return;
        }
        if (!this._expression) return;
        if (this._expression.startsWith('\u2212')) {
            this._expression = this._expression.slice(1);
        } else {
            this._expression = '\u2212' + this._expression;
        }
    },

    _evaluate() {
        if (!this._expression) return;
        let expr = this._expression
            .replace(/\u00D7/g, '*')   // × → *
            .replace(/\u00F7/g, '/')   // ÷ → /
            .replace(/\u2212/g, '-');   // − → -
        // Strip trailing operator
        expr = expr.replace(/[+\-*/]$/, '');
        if (!expr) return;
        // Sanitize: only digits, operators, dots, parens, spaces
        if (!/^[\d+\-*/.() ]+$/.test(expr)) {
            this._result = 'Error';
            return;
        }
        try {
            const result = new Function('return (' + expr + ')')();
            if (!isFinite(result)) {
                this._result = 'Error';
            } else {
                this._result = String(Math.round(result * 1e12) / 1e12);
            }
        } catch {
            this._result = 'Error';
        }
    },

    _updateDisplay() {
        if (!this._displayEl) return;
        // Casio-style: show result after =, otherwise show expression
        this._displayEl.textContent =
            (this._justEvaluated && this._result) ? this._result
            : this._expression || '0';
    },
};
