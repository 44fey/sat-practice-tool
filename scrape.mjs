import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(ROOT, 'data');

const API_BASE = 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank';
const LEGACY_BASE = 'https://saic.collegeboard.org/disclosed';

// SAT (asmtEventId=99). Each section has its own test id, domain codes, and
// "live items" key in the lookup payload.
const SECTIONS = {
  math: {
    test: 2,
    domain: 'H,P,Q,S',
    liveKey: 'mathLiveItems',
  },
  reading: {
    test: 1,
    domain: 'INI,CAS,EOI,SEC',
    liveKey: 'readingLiveItems',
  },
};

const COMMON_HEADERS = {
  'Content-Type': 'application/json',
  'Origin': 'https://satsuiteeducatorquestionbank.collegeboard.org',
  'Referer': 'https://satsuiteeducatorquestionbank.collegeboard.org/',
  'User-Agent': 'Mozilla/5.0 (sat-question-tool local scraper)',
};

const CONCURRENCY = 8;

async function fetchJson(url, init = {}) {
  const res = await fetch(url, { ...init, headers: { ...COMMON_HEADERS, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchListAndLookup(section) {
  const cfg = SECTIONS[section];
  console.log(`[${section}] Fetching question list...`);
  const list = await fetchJson(`${API_BASE}/digital/get-questions`, {
    method: 'POST',
    body: JSON.stringify({ asmtEventId: 99, test: cfg.test, domain: cfg.domain }),
  });
  console.log(`[${section}]   → ${list.length} total questions`);

  console.log(`[${section}] Fetching live-items lookup...`);
  const lookup = await fetchJson(`${API_BASE}/lookup`);
  const live = new Set(lookup[cfg.liveKey] || []);
  console.log(`[${section}]   → ${live.size} active items`);

  const disclosed = list.filter(q => !live.has(q.external_id));
  console.log(`[${section}]   → ${disclosed.length} disclosed (non-active)`);
  return disclosed;
}

async function fetchModern(externalId) {
  return fetchJson(`${API_BASE}/digital/get-question`, {
    method: 'POST',
    body: JSON.stringify({ external_id: externalId }),
  });
}
async function fetchLegacy(ibn) {
  const arr = await fetchJson(`${LEGACY_BASE}/${ibn}.json`);
  return Array.isArray(arr) ? arr[0] : arr;
}

function fileSlugFor(meta) { return meta.questionId || meta.external_id; }

async function fetchOne(meta, outDir) {
  const slug = fileSlugFor(meta);
  const outFile = join(outDir, `${slug}.json`);
  if (existsSync(outFile)) return { slug, status: 'cached' };

  let detail; let source;
  if (meta.ibn) {
    try {
      detail = await fetchLegacy(meta.ibn);
      source = 'legacy';
    } catch {
      detail = await fetchModern(meta.external_id);
      source = 'modern-fallback';
    }
  } else {
    detail = await fetchModern(meta.external_id);
    source = 'modern';
  }
  await writeFile(outFile, JSON.stringify({ meta, source, detail }));
  return { slug, status: 'fetched', source };
}

async function runPool(items, worker, concurrency) {
  const queue = items.slice();
  const results = [];
  let done = 0;
  const total = items.length;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const item = queue.shift();
      try { results.push(await worker(item)); }
      catch (e) {
        results.push({ slug: fileSlugFor(item), status: 'error', error: e.message });
        console.error(`  ! ${fileSlugFor(item)}: ${e.message}`);
      }
      done++;
      if (done % 25 === 0 || done === total) process.stdout.write(`\r  progress: ${done}/${total}`);
    }
  }));
  process.stdout.write('\n');
  return results;
}

async function scrapeSection(section) {
  const sectionDir = join(DATA_DIR, section);
  const questionsDir = join(sectionDir, 'questions');
  await mkdir(questionsDir, { recursive: true });

  const disclosed = await fetchListAndLookup(section);
  await writeFile(join(sectionDir, 'index.json'), JSON.stringify(disclosed, null, 2));
  console.log(`[${section}] Wrote data/${section}/index.json (${disclosed.length} entries)`);

  console.log(`[${section}] Fetching question details (concurrency=${CONCURRENCY})...`);
  const results = await runPool(disclosed, (m) => fetchOne(m, questionsDir), CONCURRENCY);

  const fetched = results.filter(r => r.status === 'fetched').length;
  const cached = results.filter(r => r.status === 'cached').length;
  const errors = results.filter(r => r.status === 'error');
  console.log(`[${section}] done. fetched=${fetched} cached=${cached} errors=${errors.length}`);
  if (errors.length) errors.forEach(e => console.log(`  - ${e.slug}: ${e.error}`));
}

async function main() {
  // Allow `node scrape.mjs math` or `node scrape.mjs reading` to scrape one;
  // no arg = scrape both.
  const arg = process.argv[2];
  const sections = arg ? [arg] : Object.keys(SECTIONS);
  for (const s of sections) {
    if (!SECTIONS[s]) { console.error(`unknown section: ${s}`); process.exit(1); }
    await scrapeSection(s);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
