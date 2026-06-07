// ── Keiro Unified JS Driver ──

const KEIRO = (() => {
    const CREDS_KEY = 'keiro_creds';

    function getCreds() {
        try {
            return JSON.parse(localStorage.getItem(CREDS_KEY) || '{}');
        } catch { return {}; }
    }

    function saveCreds(secret, namespace) {
        localStorage.setItem(CREDS_KEY, JSON.stringify({ secret, namespace }));
        window.dispatchEvent(new Event('keiro-creds-updated'));
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

    function getBaseUrl() {
        if (window.location.protocol === 'file:') {
            return 'http://localhost:8080';
        }
        const devServerPorts = ['3000', '5173', '5500', '8000', '8081'];
        if (devServerPorts.includes(window.location.port)) {
            return 'http://localhost:8080';
        }
        return '';
    }

    async function query(queryText, namespace) {
        const res = await fetch(getBaseUrl() + '/v1/query', {
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
        const res = await fetch(getBaseUrl() + '/v1/ingest', {
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
        const res = await fetch(getBaseUrl() + `/v1/jobs/${jobId}`, {
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
        const res = await fetch(getBaseUrl() + '/health');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    }

    function escapeHTML(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    return {
        getCreds, saveCreds,
        query, ingest, jobStatus, health,
        escapeHTML
    };
})();

// ── UI Integration Script (For Dashboard) ──
document.addEventListener('DOMContentLoaded', () => {
    // ── HELPER: Format file size — shows KB when < 1 MB ──
    function formatFileSize(bytes) {
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    // ── HELPER: Inline markdown (bold, italic, inline code) ──
    function inlineMarkdown(text) {
        text = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
        // inline code first to avoid interfering with bold/italic
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/__(.+?)__/g, '<strong>$1</strong>');
        text = text.replace(/\*(.+?)\*/g, '<em>$1</em>');
        text = text.replace(/_(.+?)_/g, '<em>$1</em>');
        return text;
    }

    // ── HELPER: Block-level markdown parser ──
    function parseMarkdown(text) {
        const lines = text.split('\n');
        let html = '';
        let inUL = false, inOL = false, inPre = false, preBuffer = '';

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            // Fenced code blocks
            if (/^```/.test(line)) {
                if (!inPre) {
                    if (inUL) { html += '</ul>'; inUL = false; }
                    if (inOL) { html += '</ol>'; inOL = false; }
                    inPre = true; preBuffer = '';
                    html += '<pre><code>';
                } else {
                    inPre = false;
                    html += preBuffer
                            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                        + '</code></pre>';
                }
                continue;
            }
            if (inPre) { preBuffer += line + '\n'; continue; }

            const isULItem = /^[\-\*]\s+/.test(line);
            const isOLItem = /^\d+\.\s+/.test(line);

            if (!isULItem && inUL) { html += '</ul>'; inUL = false; }
            if (!isOLItem && inOL) { html += '</ol>'; inOL = false; }

            if (isULItem) {
                if (!inUL) { html += '<ul>'; inUL = true; }
                html += '<li>' + inlineMarkdown(line.replace(/^[\-\*]\s+/, '')) + '</li>';
                continue;
            }
            if (isOLItem) {
                if (!inOL) { html += '<ol>'; inOL = true; }
                html += '<li>' + inlineMarkdown(line.replace(/^\d+\.\s+/, '')) + '</li>';
                continue;
            }

            const hMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (hMatch) {
                html += `<h${hMatch[1].length}>${inlineMarkdown(hMatch[2])}</h${hMatch[1].length}>`;
                continue;
            }

            if (/^-{3,}$/.test(line.trim())) { html += '<hr>'; continue; }
            if (line.trim() === '')          { html += '<br>';  continue; }

            html += '<p>' + inlineMarkdown(line) + '</p>';
        }

        if (inUL) html += '</ul>';
        if (inOL) html += '</ol>';
        // unclosed code block — still render what we have
        if (inPre) html += preBuffer
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            + '</code></pre>';

        return html;
    }

    // ── HELPER: Word-by-word typewriter that re-renders markdown each tick ──
    async function streamMarkdownResponse(container, text) {
        // Split preserving whitespace tokens so spacing is reconstructed faithfully
        const tokens = text.split(/(\s+)/);
        let buffer = '';
        const WORD_DELAY_MS = 22; // ~45 tokens/s — feels natural, not sluggish

        for (let i = 0; i < tokens.length; i++) {
            buffer += tokens[i];
            container.innerHTML = parseMarkdown(buffer);
            container.scrollTop = container.scrollHeight;
            await new Promise(r => setTimeout(r, WORD_DELAY_MS));
        }
        // Final authoritative render (closes any half-open markdown tokens)
        container.innerHTML = parseMarkdown(text);
    }

    const isDashboard = document.getElementById('dashboard-view-trigger');
    if (!isDashboard) return;

    // ── DOM ELEMENTS ──
    const secretInput = document.getElementById('setting-secret');
    const nsInput     = document.getElementById('setting-namespace');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const settingsOverlay = document.getElementById('settings-modal');
    const gearIcon = document.getElementById('gear-icon');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const activeNamespaceDisplay = document.getElementById('active-namespace');

    const fileInput = document.getElementById('file-input');
    const dropZone = document.getElementById('drop-zone');
    const fileChosenBanner = document.getElementById('file-chosen-banner');
    const fileNameDisplay = document.getElementById('file-name-display');
    const startIngestBtn = document.getElementById('start-ingest-btn');
    const ingestLoading = document.getElementById('ingest-loading');

    const jobStatusPanel = document.getElementById('job-status-panel');

    const queryInput = document.getElementById('query-input');
    const runQueryBtn = document.getElementById('run-query-btn');
    const queryLoading = document.getElementById('query-loading');
    const responseContainer = document.getElementById('response-container');
    const tierDisplay = document.getElementById('meta-tier');
    const cacheDisplay = document.getElementById('meta-cache');
    const latencyDisplay = document.getElementById('meta-latency');

    const telemetryPanel = document.getElementById('telemetry-panel');
    const telemetryModel = document.getElementById('telemetry-model');
    const telemetryPrompt = document.getElementById('telemetry-prompt-tokens');
    const telemetryCompletion = document.getElementById('telemetry-completion-tokens');
    const telemetryTotal = document.getElementById('telemetry-total-tokens');
    const telemetryRetrievalSection = document.getElementById('telemetry-retrieval-section');
    const telemetryTopK = document.getElementById('telemetry-top-k');
    const telemetryRerank = document.getElementById('telemetry-rerank');
    const telemetryDecompose = document.getElementById('telemetry-decompose');

    const gwDot = document.getElementById('gw-dot');
    const gwLat = document.getElementById('gw-latency');
    const intDot = document.getElementById('intel-dot');
    const intLat = document.getElementById('intel-latency');
    const chrDot = document.getElementById('chroma-dot');
    const chrLat = document.getElementById('chroma-latency');

    // ── STATE VARIABLES ──
    let activeJobs = new Map(); // jobId -> { pollInterval, elapsedTimer }
    let fileQueue  = [];        // accumulates files across multiple drops / picker opens

    // ── FUNCTIONS ──

    // Load credentials to inputs & display
    function loadSettingsToInputs() {
        const { secret, namespace } = KEIRO.getCreds();
        if (secretInput) secretInput.value = secret || '';
        if (nsInput) nsInput.value = namespace || '';
        if (activeNamespaceDisplay) activeNamespaceDisplay.textContent = namespace || 'not-set';
    }

    // Clear all tracked jobs and hide the panel
    function resetJobTracker() {
        for (const { pollInterval, elapsedTimer } of activeJobs.values()) {
            if (pollInterval) clearInterval(pollInterval);
            if (elapsedTimer) clearInterval(elapsedTimer);
        }
        activeJobs.clear();
        const container = document.getElementById('job-cards-container');
        if (container) container.innerHTML = '';
        if (jobStatusPanel) jobStatusPanel.style.display = 'none';
    }

    // Add a new tracked job card (called once per file)
    function addJobTracker(jobId, namespace, fileName) {
        if (jobStatusPanel) jobStatusPanel.style.display = 'flex';
        const container = document.getElementById('job-cards-container');
        if (!container) return;

        const card = document.createElement('div');
        card.className = 'job-status-info';
        card.id = `job-card-${jobId}`;
        card.style.cssText = 'border-top: 1px dashed var(--border-dark); padding-top: 0.6rem;';
        card.innerHTML = `
            <div class="info-row">
                <span class="info-label">FILE</span>
                <span class="info-val" style="word-break:break-all;">${KEIRO.escapeHTML(fileName)}</span>
            </div>
            <div class="info-row" style="margin-top:0.4rem;">
                <span class="info-label">JOB ID</span>
                <span class="info-val" style="font-family:var(--font-mono);font-size:0.72rem;word-break:break-all;">${KEIRO.escapeHTML(jobId)}</span>
            </div>
            <div class="info-row" style="margin-top:0.4rem;">
                <span class="info-label">STATUS</span>
                <span style="display:flex;align-items:center;gap:0.4rem;">
                    <span id="dot-${jobId}" class="status-dot warning"></span>
                    <span id="state-${jobId}" class="info-val">PENDING</span>
                </span>
            </div>
            <div class="info-row" style="margin-top:0.4rem;">
                <span class="info-label">TIME</span>
                <span id="elapsed-${jobId}" class="info-val" style="color:var(--text-secondary);">0s ago</span>
            </div>`;
        container.appendChild(card);

        const jobStartTime = Date.now();

        const elapsedTimer = setInterval(() => {
            const el = document.getElementById(`elapsed-${jobId}`);
            if (el) el.textContent = `${Math.round((Date.now() - jobStartTime) / 1000)}s ago`;
        }, 1000);

        const pollInterval = setInterval(async () => {
            try {
                const data = await KEIRO.jobStatus(jobId, namespace);
                const statusMap = { '0': 'PENDING', '1': 'PROCESSING', '2': 'COMPLETED', '3': 'FAILED' };
                const jobStatusVal = data.job_status !== undefined ? data.job_status : data.JobStatus;
                const rawStatus = String(jobStatusVal);
                const statusStr = statusMap[rawStatus] || String(jobStatusVal).toUpperCase();

                const stateEl = document.getElementById(`state-${jobId}`);
                const dotEl   = document.getElementById(`dot-${jobId}`);
                if (stateEl) stateEl.textContent = statusStr;
                if (dotEl) {
                    dotEl.className = 'status-dot';
                    if (statusStr === 'COMPLETED' || rawStatus === '2') dotEl.classList.add('up');
                    else if (statusStr === 'FAILED' || rawStatus === '3') dotEl.classList.add('down');
                    else dotEl.classList.add('warning');
                }

                if (['COMPLETED', 'FAILED'].includes(statusStr) || ['2', '3'].includes(rawStatus)) {
                    const job = activeJobs.get(jobId);
                    if (job) {
                        clearInterval(job.pollInterval);
                        clearInterval(job.elapsedTimer);
                        activeJobs.delete(jobId);
                    }
                }
            } catch {
                const stateEl = document.getElementById(`state-${jobId}`);
                const dotEl   = document.getElementById(`dot-${jobId}`);
                if (stateEl) stateEl.textContent = 'POLLING ERROR';
                if (dotEl) dotEl.className = 'status-dot down';
                const job = activeJobs.get(jobId);
                if (job) {
                    clearInterval(job.pollInterval);
                    clearInterval(job.elapsedTimer);
                    activeJobs.delete(jobId);
                }
            }
        }, 2000);

        activeJobs.set(jobId, { pollInterval, elapsedTimer });
    }
    async function updateSystemHealth() {
        try {
            const data = await KEIRO.health();

            if (gwDot && gwLat) {
                gwDot.className = 'status-dot ' + (data.gateway_up ? 'up' : 'down');
                gwLat.textContent = data.gateway_latency || '< 1ms';
            }
            if (intDot && intLat) {
                intDot.className = 'status-dot ' + (data.intelligence_up ? 'up' : 'down');
                intLat.textContent = data.intelligence_latency || '—';
            }
            if (chrDot && chrLat) {
                chrDot.className = 'status-dot ' + (data.chromadb_up ? 'up' : 'down');
                chrLat.textContent = data.chromadb_latency || '—';
            }
        } catch {
            if (gwDot) gwDot.className = 'status-dot down';
            if (intDot) intDot.className = 'status-dot down';
            if (chrDot) chrDot.className = 'status-dot down';
        }
    }

    // Render the current fileQueue into the banner
    function renderFileQueue() {
        if (fileQueue.length === 0) {
            fileChosenBanner.style.display = 'none';
            return;
        }
        fileChosenBanner.style.display = 'flex';
        if (fileQueue.length === 1) {
            fileNameDisplay.textContent = `${fileQueue[0].name} (${formatFileSize(fileQueue[0].size)})`;
        } else {
            fileNameDisplay.textContent =
                `${fileQueue.length} files queued: ` +
                fileQueue.map(f => `${f.name} (${formatFileSize(f.size)})`).join(' · ');
        }
    }

    // Merge new files into the queue, skipping exact duplicates (name + size)
    function addFilesToQueue(newFiles) {
        for (const f of Array.from(newFiles)) {
            if (!fileQueue.some(q => q.name === f.name && q.size === f.size)) {
                fileQueue.push(f);
            }
        }
        renderFileQueue();
    }

    // ── INITIALIZATION & LISTENERS ──
    loadSettingsToInputs();

    if (gearIcon && settingsOverlay) {
        gearIcon.addEventListener('click', () => {
            loadSettingsToInputs();
            settingsOverlay.classList.add('visible');
        });
    }

    if (closeSettingsBtn) {
        closeSettingsBtn.addEventListener('click', () => {
            settingsOverlay.classList.remove('visible');
        });
    }

    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', () => {
            const secret = secretInput.value.trim();
            const namespace = nsInput.value.trim();
            KEIRO.saveCreds(secret, namespace);
            settingsOverlay.classList.remove('visible');
        });
    }

    window.addEventListener('keiro-creds-updated', () => {
        loadSettingsToInputs();
        resetJobTracker();
    });

    // Run health check and start interval
    updateSystemHealth();
    setInterval(updateSystemHealth, 8000);

    // Ingest events
    if (dropZone && fileInput) {
        dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.style.borderColor = 'var(--border-accent)'; });
        dropZone.addEventListener('dragleave', () => dropZone.style.borderColor = '');
        dropZone.addEventListener('drop', e => {
            e.preventDefault();
            dropZone.style.borderColor = '';
            if (e.dataTransfer.files && e.dataTransfer.files.length) {
                addFilesToQueue(e.dataTransfer.files);
            }
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length) {
                addFilesToQueue(fileInput.files);
                // Reset so the same file can be re-selected later if needed
                fileInput.value = '';
            }
        });
    }

    if (startIngestBtn) {
        startIngestBtn.addEventListener('click', async () => {
            const { secret, namespace } = KEIRO.getCreds();
            if (!secret || !namespace) {
                alert('Please configure Namespace and Secret in settings (gear icon) first.');
                settingsOverlay.classList.add('visible');
                return;
            }
            if (!fileQueue.length) {
                alert('Please select or drag a file to ingest first.');
                return;
            }

            const files = [...fileQueue];   // snapshot the queue
            const strategy = document.getElementById('chunk-strategy').value;

            startIngestBtn.disabled = true;
            ingestLoading.classList.add('visible');

            const results = await Promise.allSettled(files.map(async file => {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('chunking_strategy', strategy);
                const data = await KEIRO.ingest(formData, namespace);
                const jobId = data.job_id || data.JobId;
                if (!jobId) throw new Error(`No Job ID returned for "${file.name}"`);
                addJobTracker(jobId, namespace, file.name);
            }));

            const failed = results.filter(r => r.status === 'rejected');
            if (failed.length) {
                alert(`${failed.length} file(s) failed to ingest:\n${failed.map(r => r.reason.message).join('\n')}`);
            }

            startIngestBtn.disabled = false;
            ingestLoading.classList.remove('visible');
            // Clear the queue and banner after dispatch
            fileQueue = [];
            renderFileQueue();
        });
    }

    // Query events
    if (runQueryBtn && queryInput) {
        runQueryBtn.addEventListener('click', async () => {
            const { secret, namespace } = KEIRO.getCreds();
            if (!secret || !namespace) {
                alert('Please configure Namespace and Secret in settings (gear icon) first.');
                settingsOverlay.classList.add('visible');
                return;
            }

            const queryText = queryInput.value.trim();
            if (!queryText) {
                alert('Please type a query first.');
                return;
            }

            runQueryBtn.disabled = true;
            queryLoading.classList.add('visible');
            responseContainer.textContent = 'Awaiting strategy classification & retrieval...';

            if (tierDisplay) tierDisplay.textContent = '—';
            if (cacheDisplay) cacheDisplay.textContent = '—';
            if (latencyDisplay) latencyDisplay.textContent = '—';
            if (telemetryPanel) telemetryPanel.style.display = 'none';

            const startTime = Date.now();

            try {
                const data = await KEIRO.query(queryText, namespace);
                const responseText = data.response !== undefined ? data.response : data.Response;
                const isCached = data.cache_hit !== undefined ? !!data.cache_hit : !!data.CacheHit;
                const retrievalDetailsVal = data.retrieval_details !== undefined ? data.retrieval_details : data.RetrievalDetails;

                responseContainer.innerHTML = '';
                await streamMarkdownResponse(responseContainer, responseText || 'Empty response received.');

                const tierRaw = retrievalDetailsVal?.retrieval_type || retrievalDetailsVal?.RetrievalType || (isCached ? 'cached' : '—');
                let tierLabel = 'HYBRID';
                if (String(tierRaw).toLowerCase().includes('multi_vector') || String(tierRaw).toLowerCase().includes('multivector')) {
                    tierLabel = 'MULTI_VECTOR';
                } else if (String(tierRaw).toLowerCase().includes('self_query') || String(tierRaw).toLowerCase().includes('selfquery')) {
                    tierLabel = 'SELF_QUERYING';
                } else if (isCached) {
                    tierLabel = 'CACHED';
                }

                if (tierDisplay) tierDisplay.textContent = tierLabel;
                if (cacheDisplay) cacheDisplay.textContent = isCached ? 'HIT' : 'MISS';

                const responseLatency = Date.now() - startTime;
                if (latencyDisplay) latencyDisplay.textContent = `${responseLatency}ms`;

                if (telemetryPanel) {
                    telemetryPanel.style.display = 'flex';
                    if (isCached) {
                        if (telemetryModel) telemetryModel.textContent = 'semantic-cache (local)';
                        if (telemetryPrompt) telemetryPrompt.textContent = '0';
                        if (telemetryCompletion) telemetryCompletion.textContent = '0';
                        if (telemetryTotal) telemetryTotal.textContent = '0';
                        if (telemetryRetrievalSection) telemetryRetrievalSection.style.display = 'none';
                    } else {
                        const modelName = data.response_model || data.ResponseModel || '—';
                        const promptTokens = data.prompt_tokens !== undefined ? data.prompt_tokens : (data.PromptTokens ?? 0);
                        const completionTokens = data.completion_token !== undefined ? data.completion_token : (data.CompletionToken ?? 0);
                        const totalTokens = promptTokens + completionTokens;

                        if (telemetryModel) telemetryModel.textContent = modelName;
                        if (telemetryPrompt) telemetryPrompt.textContent = promptTokens;
                        if (telemetryCompletion) telemetryCompletion.textContent = completionTokens;
                        if (telemetryTotal) telemetryTotal.textContent = totalTokens;

                        if (telemetryRetrievalSection) {
                            telemetryRetrievalSection.style.display = 'block';
                            const topK = retrievalDetailsVal?.top_k ?? retrievalDetailsVal?.topK ?? retrievalDetailsVal?.TopK ?? '—';
                            const isRerank = retrievalDetailsVal?.rerank !== undefined ? retrievalDetailsVal?.rerank : retrievalDetailsVal?.Rerank;
                            const isDecompose = retrievalDetailsVal?.decompose !== undefined ? retrievalDetailsVal?.decompose : retrievalDetailsVal?.Decompose;

                            if (telemetryTopK) telemetryTopK.textContent = topK;
                            if (telemetryRerank) {
                                telemetryRerank.textContent = isRerank !== undefined
                                    ? (isRerank ? 'ENABLED (CROSS-ENCODER)' : 'DISABLED')
                                    : '—';
                            }
                            if (telemetryDecompose) {
                                telemetryDecompose.textContent = isDecompose !== undefined
                                    ? (isDecompose ? 'ENABLED (MULTI-HOP)' : 'DISABLED')
                                    : '—';
                            }
                        }
                    }
                }
            } catch (err) {
                responseContainer.textContent = `CRITICAL QUERY ERROR:\n${err.message}`;
                if (tierDisplay) tierDisplay.textContent = 'ERROR';
                if (cacheDisplay) cacheDisplay.textContent = 'ERR';
                if (latencyDisplay) latencyDisplay.textContent = 'N/A';
            } finally {
                runQueryBtn.disabled = false;
                queryLoading.classList.remove('visible');
            }
        });

        queryInput.addEventListener('keydown', e => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                runQueryBtn.click();
            }
        });
    }
});