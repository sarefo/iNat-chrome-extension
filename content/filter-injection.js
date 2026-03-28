// filter-injection.js
// Injects annotation filters above "More filters".
// Uses native iNat URL params when possible; falls back to API-fetch + id=
// navigation only when combining multiple specific annotation values or mating.

(function () {
  'use strict';

  const PANEL_ID = 'innat-ext-annotation-filters';
  const WITHOUT  = 'without';

  // ── Filter definitions ────────────────────────────────────────────────────────

  const ANNOTATION_FILTERS = [
    {
      label: 'Alive/Dead', termId: 17,
      options: [
        { label: 'Any',                  value: '' },
        { label: 'Alive',                value: '18' },
        { label: 'Dead',                 value: '19' },
        { label: 'Cannot Be Determined', value: '20' },
        { label: '— not set —',          value: WITHOUT },
      ],
    },
    {
      label: 'Life Stage', termId: 1,
      options: [
        { label: 'Any',         value: '' },
        { label: 'Adult',       value: '2' },
        { label: 'Juvenile',    value: '8' },
        { label: 'Nymph',       value: '5' },
        { label: 'Larva',       value: '6' },
        { label: 'Pupa',        value: '4' },
        { label: 'Teneral',     value: '3' },
        { label: 'Subimago',    value: '16' },
        { label: 'Egg',         value: '7' },
        { label: '— not set —', value: WITHOUT },
      ],
    },
    {
      label: 'Sex', termId: 9,
      options: [
        { label: 'Any',                  value: '' },
        { label: 'Female',               value: '10' },
        { label: 'Male',                 value: '11' },
        { label: 'Cannot Be Determined', value: '20' },
        { label: '— not set —',          value: WITHOUT },
      ],
    },
    {
      label: 'Evidence', termId: 22,
      options: [
        { label: 'Any',          value: '' },
        { label: 'Organism',     value: '24' },
        { label: 'Egg',          value: '30' },
        { label: 'Molt',         value: '28' },
        { label: 'Gall',         value: '29' },
        { label: 'Scat',         value: '25' },
        { label: 'Track',        value: '26' },
        { label: 'Feather',      value: '23' },
        { label: 'Bone',         value: '27' },
        { label: 'Hair',         value: '31' },
        { label: 'Leafmine',     value: '32' },
        { label: 'Construction', value: '35' },
        { label: '— not set —',  value: WITHOUT },
      ],
    },
  ];

  // ── Native URL helpers ────────────────────────────────────────────────────────

  // Native works when: no mating AND at most one specific (non-without) value.
  // Multiple without_term_id values work fine natively; a single term_id+value
  // also works. Combinations of two specific values don't (iNat ignores pairing).
  function canUseNative(selects, matingOn) {
    if (matingOn) return false;
    return selects.filter(s => s.value && s.value !== WITHOUT).length <= 1;
  }

  function buildNativeUrl(selects) {
    const url = new URL(window.location.href);
    url.searchParams.delete('term_id');
    url.searchParams.delete('term_value_id');
    url.searchParams.delete('without_term_id');
    url.searchParams.delete('id');
    url.searchParams.delete('page');

    const withoutIds = [];
    selects.forEach(sel => {
      if (!sel.value) return;
      if (sel.value === WITHOUT) {
        withoutIds.push(sel.dataset.termId);
      } else {
        url.searchParams.set('term_id',       sel.dataset.termId);
        url.searchParams.set('term_value_id', sel.value);
      }
    });
    if (withoutIds.length) url.searchParams.set('without_term_id', withoutIds.join(','));
    return url.toString();
  }

  // Read current URL to pre-populate selects. Returns Map<termId(str), value>.
  function currentAnnotationMap() {
    const url     = new URL(window.location.href);
    const ids     = (url.searchParams.get('term_id')         || '').split(',').filter(Boolean);
    const vals    = (url.searchParams.get('term_value_id')   || '').split(',').filter(Boolean);
    const without = (url.searchParams.get('without_term_id') || '').split(',').filter(Boolean);
    const map = new Map();
    ids.forEach((tid, i) => { if (vals[i]) map.set(tid, vals[i]); });
    without.forEach(tid => map.set(tid, WITHOUT));
    return map;
  }

  // ── API helpers (used only for complex combinations) ──────────────────────────

  const PASSTHROUGH = [
    'taxon_id', 'taxon_name', 'user_id', 'user_login', 'place_id', 'project_id',
    'quality_grade', 'identified', 'captive', 'licensed', 'photo_license',
    'd1', 'd2', 'created_d1', 'created_d2', 'created_on', 'observed_on',
    'month', 'year', 'photos', 'sounds',
  ];

  function baseApiParams() {
    const url = new URL(window.location.href);
    const p   = new URLSearchParams();
    PASSTHROUGH.forEach(k => { const v = url.searchParams.get(k); if (v) p.set(k, v); });
    p.set('per_page', '200');
    return p;
  }

  async function fetchAll(params, extraRaw, statusCb) {
    const ids = new Set();
    let page = 1, total = Infinity;
    while (ids.size < total && page <= 20) {
      const p = new URLSearchParams(params);
      p.set('page', page);
      let url = 'https://api.inaturalist.org/v1/observations?' + p.toString();
      if (extraRaw) url += '&' + extraRaw;
      statusCb('Fetching' + (page > 1 ? ' p.' + page : '') + '…');
      const res  = await fetch(url);
      if (!res.ok) throw new Error('API ' + res.status);
      const data = await res.json();
      total = data.total_results;
      (data.results || []).forEach(r => ids.add(r.id));
      if ((data.results || []).length < 200) break;
      page++;
    }
    return ids;
  }

  async function filterIds(idSet, params, extraRaw, statusCb) {
    if (idSet.size === 0) return new Set();
    const result = new Set();
    const arr    = [...idSet];
    for (let i = 0; i < arr.length; i += 200) {
      const p = new URLSearchParams(params);
      p.set('id', arr.slice(i, i + 200).join(','));
      let url = 'https://api.inaturalist.org/v1/observations?' + p.toString();
      if (extraRaw) url += '&' + extraRaw;
      statusCb('Filtering…');
      const res  = await fetch(url);
      if (!res.ok) throw new Error('API ' + res.status);
      const data = await res.json();
      (data.results || []).forEach(r => result.add(r.id));
    }
    return result;
  }

  async function resolveViaApi(selects, matingOn, statusCb) {
    const base = baseApiParams();

    // Order: mating first (smallest set), then annotation conditions.
    const conds = [];
    if (matingOn) conds.push({ extraRaw: 'field:Behavior:%20mating=yes', label: 'mating' });
    selects.forEach(sel => { if (sel.value) conds.push({ sel, label: sel.options[sel.selectedIndex].text }); });

    let current = null;
    for (const cond of conds) {
      const p = new URLSearchParams(base);
      if (cond.sel) {
        if (cond.sel.value === WITHOUT) p.set('without_term_id', cond.sel.dataset.termId);
        else { p.set('term_id', cond.sel.dataset.termId); p.set('term_value_id', cond.sel.value); }
      }
      if (current === null) {
        current = await fetchAll(p, cond.extraRaw || '', statusCb);
      } else {
        if (current.size === 0) break;
        current = await filterIds(current, p, cond.extraRaw || '', statusCb);
      }
      statusCb((cond.label || '') + ': ' + (current ? current.size : 0));
    }
    return current || new Set();
  }

  // ── Panel ─────────────────────────────────────────────────────────────────────

  function createPanel(beforeEl) {
    if (document.getElementById(PANEL_ID)) return;

    const annMap     = currentAnnotationMap();
    const url        = new URL(window.location.href);
    const hasIdFilt  = url.searchParams.has('id');
    const hasAnnFilt = url.searchParams.has('term_id') || url.searchParams.has('without_term_id');

    const panel = document.createElement('div');
    panel.id = PANEL_ID;
    panel.style.cssText = [
      'display:flex', 'align-items:center', 'flex-wrap:wrap', 'gap:6px 10px',
      'margin:8px 0 4px', 'padding:5px 10px',
      'background:#fffbf0', 'border:1.5px dashed #e8a000', 'border-radius:5px',
    ].join(';');

    const selects = [];

    ANNOTATION_FILTERS.forEach((filter, idx) => {
      const lbl = document.createElement('label');
      lbl.style.cssText = 'font-size:11px;font-weight:600;color:#9a6000;margin:0;white-space:nowrap;flex-shrink:0;';
      lbl.textContent = filter.label + ':';

      const sel = document.createElement('select');
      sel.className = 'form-control';
      sel.dataset.termId = String(filter.termId);
      sel.style.cssText = 'height:26px;padding:1px 4px;font-size:12px;width:auto;min-width:80px;flex-shrink:0;';

      filter.options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        sel.appendChild(o);
      });

      // Pre-populate from current URL.
      const pre = annMap.get(String(filter.termId));
      if (pre) {
        sel.value = pre;
        sel.style.borderColor = '#e8a000';
        sel.style.background  = '#fff8e6';
      }

      sel.addEventListener('change', () => {
        const hasVal = sel.value !== '';
        sel.style.borderColor = hasVal ? '#e8a000' : '';
        sel.style.background  = hasVal ? '#fff8e6' : '';
      });

      selects.push(sel);
      panel.appendChild(lbl);
      panel.appendChild(sel);

      if (idx < ANNOTATION_FILTERS.length - 1) {
        const dot = document.createElement('span');
        dot.style.cssText = 'color:#e0c070;font-size:14px;flex-shrink:0;';
        dot.textContent = '·';
        panel.appendChild(dot);
      }
    });

    // Separator + mating.
    const sep = document.createElement('span');
    sep.style.cssText = 'color:#ddd;font-size:16px;flex-shrink:0;';
    sep.textContent = '|';
    panel.appendChild(sep);

    const matingLabel = document.createElement('label');
    matingLabel.style.cssText = 'font-size:11px;font-weight:600;color:#9a6000;margin:0;white-space:nowrap;flex-shrink:0;display:flex;align-items:center;gap:4px;cursor:pointer;';
    const matingCheck = document.createElement('input');
    matingCheck.type = 'checkbox';
    matingCheck.style.cssText = 'margin:0;cursor:pointer;';
    matingLabel.appendChild(matingCheck);
    matingLabel.appendChild(document.createTextNode('♥ Mating'));
    panel.appendChild(matingLabel);

    // Spacer + status + buttons.
    const spacer = document.createElement('span');
    spacer.style.cssText = 'flex:1;min-width:6px;';
    panel.appendChild(spacer);

    const statusLbl = document.createElement('span');
    statusLbl.style.cssText = 'font-size:11px;color:#9a6000;flex-shrink:0;';
    panel.appendChild(statusLbl);

    const searchBtn = document.createElement('button');
    searchBtn.type = 'button';
    searchBtn.className = 'btn btn-xs';
    searchBtn.style.cssText = 'font-size:12px;font-weight:600;color:#9a6000;border:1px solid #e8a000;background:#fff8e6;padding:2px 10px;flex-shrink:0;';
    searchBtn.textContent = '▶ Search';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'btn btn-xs btn-link';
    clearBtn.style.cssText = 'font-size:12px;color:#aaa;padding:2px 4px;flex-shrink:0;';
    clearBtn.title = 'Clear annotation filters';
    clearBtn.textContent = '✕';
    clearBtn.style.display = (hasIdFilt || hasAnnFilt) ? '' : 'none';

    searchBtn.addEventListener('click', async () => {
      const hasCondition = selects.some(s => s.value) || matingCheck.checked;
      if (!hasCondition) { statusLbl.textContent = 'Pick a filter first.'; return; }

      if (canUseNative(selects, matingCheck.checked)) {
        window.location.href = buildNativeUrl(selects);
        return;
      }

      // API path (mating or multiple specific values).
      searchBtn.disabled = true;
      statusLbl.textContent = 'Searching…';
      try {
        const ids = await resolveViaApi(selects, matingCheck.checked,
          msg => { statusLbl.textContent = msg; });

        if (ids.size === 0) { statusLbl.textContent = '0 matches'; return; }

        statusLbl.textContent = ids.size + ' matches…';
        const dest = new URL(window.location.href);
        dest.searchParams.delete('term_id');
        dest.searchParams.delete('term_value_id');
        dest.searchParams.delete('without_term_id');
        dest.searchParams.delete('page');
        dest.searchParams.set('id', [...ids].join(','));
        window.location.href = dest.toString();
      } catch (e) {
        statusLbl.textContent = 'Error — see console';
        console.error('[iNat ext]', e);
      } finally {
        searchBtn.disabled = false;
      }
    });

    clearBtn.addEventListener('click', () => {
      const dest = new URL(window.location.href);
      ['term_id', 'term_value_id', 'without_term_id', 'id', 'page']
        .forEach(k => dest.searchParams.delete(k));
      window.location.href = dest.toString();
    });

    panel.appendChild(searchBtn);
    panel.appendChild(clearBtn);

    beforeEl.parentNode.insertBefore(panel, beforeEl);
  }

  // ── Injection ─────────────────────────────────────────────────────────────────

  function findMoreFiltersToggle() {
    for (const el of document.querySelectorAll('a, button, span')) {
      if (/^more filters\b/i.test(el.textContent.trim()) && el.textContent.trim().length < 40)
        return el;
    }
    return null;
  }

  function tryInject() {
    if (document.getElementById(PANEL_ID)) return;
    const toggle = findMoreFiltersToggle();
    if (toggle) createPanel(toggle);
  }

  new MutationObserver(tryInject).observe(document.body, { childList: true, subtree: true });
  tryInject();
})();
