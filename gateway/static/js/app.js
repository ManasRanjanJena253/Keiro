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
    const jobIdDisplay = document.getElementById('job-id-val');
    const jobStateDisplay = document.getElementById('job-state-val');
    const jobDot = document.getElementById('job-status-dot');
    const jobElapsedDisplay = document.getElementById('job-elapsed-val');

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
    let pollInterval = null;
    let jobStartTime = 0;
    let jobElapsedTimer = null;

    // ── FUNCTIONS ──

    // Load credentials to inputs & display
    function loadSettingsToInputs() {
        const { secret, namespace } = KEIRO.getCreds();
        if (secretInput) secretInput.value = secret || '';
        if (nsInput) nsInput.value = namespace || '';
        if (activeNamespaceDisplay) activeNamespaceDisplay.textContent = namespace || 'not-set';
    }

    // Reset Job status polling
    function resetJobTracker() {
        if (pollInterval) clearInterval(pollInterval);
        if (jobElapsedTimer) clearInterval(jobElapsedTimer);
        pollInterval = null;
        jobElapsedTimer = null;
        
        if (jobIdDisplay) jobIdDisplay.textContent = '—';
        if (jobStateDisplay) jobStateDisplay.textContent = '—';
        if (jobElapsedDisplay) jobElapsedDisplay.textContent = '—';
        if (jobDot) {
            jobDot.className = 'status-dot';
        }
        if (jobStatusPanel) jobStatusPanel.style.display = 'none';
    }

    // Health Monitoring background poll
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

    // Handle single file selection representation
    function handleFileSelect() {
        if (fileInput.files && fileInput.files[0]) {
            const file = fileInput.files[0];
            fileNameDisplay.textContent = `${file.name} (${(file.size / (1024 * 1024)).toFixed(1)} MB)`;
            fileChosenBanner.style.display = 'flex';
        } else {
            fileChosenBanner.style.display = 'none';
        }
    }

    // Start polling active job
    function trackJobStatus(jobId, namespace) {
        resetJobTracker();
        jobStartTime = Date.now();
        if (jobStatusPanel) jobStatusPanel.style.display = 'flex';
        if (jobIdDisplay) jobIdDisplay.textContent = jobId;
        if (jobStateDisplay) jobStateDisplay.textContent = 'PENDING';
        if (jobDot) {
            jobDot.className = 'status-dot warning';
        }
        if (jobElapsedDisplay) jobElapsedDisplay.textContent = '0s ago';

        // Elapsed time ticker
        jobElapsedTimer = setInterval(() => {
            const elapsed = Math.round((Date.now() - jobStartTime) / 1000);
            if (jobElapsedDisplay) jobElapsedDisplay.textContent = `${elapsed}s ago`;
        }, 1000);

        // API status poller
        pollInterval = setInterval(async () => {
            try {
                const data = await KEIRO.jobStatus(jobId, namespace);
                const statusMap = { '0': 'PENDING', '1': 'PROCESSING', '2': 'COMPLETED', '3': 'FAILED' };
                const jobStatusVal = data.job_status !== undefined ? data.job_status : data.JobStatus;
                const rawStatus = String(jobStatusVal);
                const statusStr = statusMap[rawStatus] || String(jobStatusVal).toUpperCase();

                if (jobStateDisplay) jobStateDisplay.textContent = statusStr;

                if (jobDot) {
                    jobDot.className = 'status-dot';
                    if (statusStr === 'COMPLETED' || rawStatus === '2') {
                        jobDot.classList.add('up');
                    } else if (statusStr === 'FAILED' || rawStatus === '3') {
                        jobDot.classList.add('down');
                    } else {
                        jobDot.classList.add('warning');
                    }
                }

                if (statusStr === 'COMPLETED' || statusStr === 'FAILED' || rawStatus === '2' || rawStatus === '3') {
                    clearInterval(pollInterval);
                    clearInterval(jobElapsedTimer);
                    pollInterval = null;
                    jobElapsedTimer = null;
                }
            } catch {
                clearInterval(pollInterval);
                clearInterval(jobElapsedTimer);
                pollInterval = null;
                jobElapsedTimer = null;
                if (jobStateDisplay) jobStateDisplay.textContent = 'POLLING ERROR';
                if (jobDot) jobDot.className = 'status-dot down';
            }
        }, 2000);
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
            fileInput.files = e.dataTransfer.files;
            handleFileSelect();
        });
        fileInput.addEventListener('change', handleFileSelect);
    }

    if (startIngestBtn) {
        startIngestBtn.addEventListener('click', async () => {
            const { secret, namespace } = KEIRO.getCreds();
            if (!secret || !namespace) {
                alert('Please configure Namespace and Secret in settings (gear icon) first.');
                settingsOverlay.classList.add('visible');
                return;
            }
            if (!fileInput.files || !fileInput.files[0]) {
                alert('Please select or drag a file to ingest first.');
                return;
            }

            const file = fileInput.files[0];
            const strategy = document.getElementById('chunk-strategy').value;

            const formData = new FormData();
            formData.append('file', file);
            formData.append('chunking_strategy', strategy);

            startIngestBtn.disabled = true;
            ingestLoading.classList.add('visible');
            resetJobTracker();

            try {
                const data = await KEIRO.ingest(formData, namespace);
                const jobId = data.job_id || data.JobId;
                if (jobId) {
                    trackJobStatus(jobId, namespace);
                } else {
                    alert('Failed to launch ingest: No Job ID returned.');
                }
            } catch (err) {
                alert(`Ingest API error: ${err.message}`);
            } finally {
                startIngestBtn.disabled = false;
                ingestLoading.classList.remove('visible');
                // clear file input
                fileInput.value = '';
                fileChosenBanner.style.display = 'none';
            }
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

                responseContainer.textContent = responseText || 'Empty response received.';

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