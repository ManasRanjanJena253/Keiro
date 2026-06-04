// ── Keiro Frontend App ──
// Shared API client and utilities used across all pages

const KEIRO = (() => {

    // ── Credential Management ──
    const CREDS_KEY = 'keiro_creds';

    function getCreds() {
        try {
            return JSON.parse(localStorage.getItem(CREDS_KEY) || '{}');
        } catch { return {}; }
    }

    function saveCreds(secret, namespace) {
        localStorage.setItem(CREDS_KEY, JSON.stringify({ secret, namespace }));
    }

    function getHeaders(overrideNamespace) {
        const { secret, namespace } = getCreds();
        return {
            'Content-Type': 'application/json',
            'X-Secret': secret || '',
            'X-Namespace': overrideNamespace || namespace || '',
        };
    }

    function getMultipartHeaders(overrideNamespace) {
        const { secret, namespace } = getCreds();
        return {
            'X-Secret': secret || '',
            'X-Namespace': overrideNamespace || namespace || '',
        };
    }

    // ── API Calls ──
    async function query(queryText, namespace) {
        const res = await fetch('/v1/query', {
            method: 'POST',
            headers: getHeaders(namespace),
            body: JSON.stringify({ query: queryText }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ Error: res.statusText }));
            throw new Error(err.Error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    async function ingest(formData, namespace) {
        const res = await fetch('/v1/ingest', {
            method: 'POST',
            headers: getMultipartHeaders(namespace),
            body: formData,
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ Error: res.statusText }));
            throw new Error(err.Error || `HTTP ${res.status}`);
        }
        return res.json();
    }

    async function jobStatus(jobId, namespace) {
        const res = await fetch(`/v1/jobs/${jobId}`, {
            method: 'GET',
            headers: {
                'X-Secret': getCreds().secret || '',
                'X-Namespace': namespace || getCreds().namespace || '',
            },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    async function health() {
        const res = await fetch('/health');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    // ── Credential Bar Init ──
    function initCredBar() {
        const secretInput = document.getElementById('cred-secret');
        const nsInput     = document.getElementById('cred-namespace');
        const statusDot   = document.getElementById('cred-dot');
        const statusText  = document.getElementById('cred-status-text');

        if (!secretInput) return;

        const { secret, namespace } = getCreds();
        if (secret)    secretInput.value = secret;
        if (namespace) nsInput.value     = namespace;

        updateCredStatus();

        secretInput.addEventListener('input', () => {
            saveCreds(secretInput.value, nsInput.value);
            updateCredStatus();
        });

        nsInput.addEventListener('input', () => {
            saveCreds(secretInput.value, nsInput.value);
            updateCredStatus();
        });

        function updateCredStatus() {
            const s = secretInput.value.trim();
            const n = nsInput.value.trim();
            if (s && n) {
                statusDot.classList.add('ready');
                statusText.textContent = 'Ready';
            } else {
                statusDot.classList.remove('ready');
                statusText.textContent = s || n ? 'Incomplete' : 'Not configured';
            }
        }
    }

    // ── Utility ──
    function tierBadgeClass(tier) {
        const t = (tier || '').toLowerCase();
        if (t.includes('hybrid'))       return 'badge-cyan';
        if (t.includes('multi_vector') || t.includes('multivector')) return 'badge-yellow';
        if (t.includes('self_query') || t.includes('selfquery'))     return 'badge-blue';
        if (t === 'cached')             return 'badge-green';
        return 'badge-gray';
    }

    function tierLabel(tier) {
        const t = (tier || '').toLowerCase();
        if (t.includes('hybrid'))       return 'HYBRID';
        if (t.includes('multi_vector') || t.includes('multivector')) return 'MULTI_VECTOR';
        if (t.includes('self_query') || t.includes('selfquery'))     return 'SELF_QUERYING';
        if (t === 'cached')             return 'CACHED';
        return tier.toUpperCase();
    }

    function statusBadgeClass(status) {
        switch ((status || '').toLowerCase()) {
            case 'complete':   return 'badge-green';
            case 'failed':     return 'badge-red';
            case 'processing': return 'badge-warning';
            default:           return 'badge-gray';
        }
    }

    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function getCredNamespace() {
        return getCreds().namespace || '';
    }

    return {
        getCreds, saveCreds, getHeaders,
        query, ingest, jobStatus, health,
        initCredBar, tierBadgeClass, tierLabel,
        statusBadgeClass, escapeHTML, getCredNamespace,
    };
})();

// Init credential bar on every page
document.addEventListener('DOMContentLoaded', () => KEIRO.initCredBar());