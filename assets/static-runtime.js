/* GitHub Pages cart + search. Loaded only on the static export (window.DUVETE_STATIC). */
window.DUVETE_STATIC = true;
(function () {
  const KEY = 'duvete-cart-v1';
  const IG = 'duveteworld';
  const WA = '917000097084';
  const ROOT = (window.Shopify && Shopify.routes && Shopify.routes.root)
    || (window.theme && theme.routes && theme.routes.root)
    || '/';
  const rootPath = '/' + ROOT.replace(/^\/+|\/+$/g, '');
  const withRoot = (value = '') => {
    const raw = String(value || '');
    if (!raw.startsWith('/') || rootPath === '/') return raw;
    return raw === rootPath || raw.startsWith(rootPath + '/') ? raw : rootPath + raw;
  };
  const money = (cents) => '₹' + ((Number(cents) || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' INR';
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const nativeFetch = window.fetch.bind(window);
  let catalog = { products: [], pages: [] };
  const variants = new Map();

  const catalogReady = nativeFetch(withRoot('/catalog.json')).then((r) => r.json()).then((c) => {
    catalog = c;
    (c.products || []).forEach((p) => {
      p.url = withRoot(p.url);
      p.image = withRoot(p.image);
      (p.variants || []).forEach((v) => {
        v.url = withRoot(v.url);
        v.image = withRoot(v.image);
        variants.set(String(v.id), { product: p, variant: v });
      });
    });
    (c.pages || []).forEach((p) => { p.url = withRoot(p.url); });
  }).catch(() => {});

  const loadCart = () => {
    try { return JSON.parse(localStorage.getItem(KEY) || ''); }
    catch { /* ignore */ }
    return { lines: [], note: '' };
  };
  const saveCart = (cart) => localStorage.setItem(KEY, JSON.stringify({ lines: cart.lines, note: cart.note || '' }));

  const skipVariant = (title, variantTitle) => {
    const v = String(variantTitle || '').trim();
    if (!v || v === 'Default Title' || v === '100ML') return true;
    const a = title.toUpperCase().replace(/\s+/g, '');
    const b = v.toUpperCase().replace(/\s+/g, '');
    return a.includes(b);
  };

  const lineView = (line, i) => {
    const hit = variants.get(String(line.id));
    const product = hit?.product || { title: 'Item', handle: '', url: '/', image: '', has_only_default_variant: true };
    const variant = hit?.variant || { id: line.id, title: '', price: 0, url: product.url, sku: '', available: true };
    const qty = Math.max(1, +line.quantity || 1);
    const price = +variant.price || 0;
    return {
      id: variant.id, key: `${variant.id}:${i}`, quantity: qty, variant_id: variant.id, product_id: product.id,
      title: product.has_only_default_variant ? product.title : `${product.title} - ${variant.title}`,
      product_title: product.title, variant_title: product.has_only_default_variant ? null : variant.title,
      price, line_price: price * qty, final_line_price: price * qty, original_line_price: price * qty,
      image: variant.image || product.image, url: variant.url || product.url, handle: product.handle,
      properties: line.properties || {}, sku: variant.sku || '', vendor: product.vendor || 'Duvete',
      url_to_remove: `/cart/change?line=${i + 1}&quantity=0`,
      product, variant
    };
  };

  const cartObj = (cart) => {
    const items = (cart.lines || []).map(lineView);
    const total = items.reduce((s, i) => s + i.final_line_price, 0);
    return {
      token: 'static', items, item_count: items.reduce((s, i) => s + i.quantity, 0),
      total_price: total, items_subtotal_price: total, original_total_price: total, total_discount: 0,
      note: cart.note || '', currency: 'INR', attributes: {}, requires_shipping: true
    };
  };

  const orderLines = (items) => items.map((i) => {
    const extra = skipVariant(i.product_title, i.variant_title) ? '' : ` — ${i.variant_title}`;
    return `${i.quantity} × ${i.product_title}${extra} — ${money(i.final_line_price)}`;
  }).join('\n');

  const orderText = (cart) => {
    const o = cartObj(cart);
    if (!o.items.length) return 'Hi, I want to place an order.';
    let msg = `Hi, I want to place an order for:\n${orderLines(o.items)}\nOrder total: ${money(o.total_price)}`;
    if (o.note) msg += `\nNote: ${o.note}`;
    return msg;
  };

  const ICO = {
    wa: '<svg class="icon icon--small" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20 11.8A8.2 8.2 0 1 1 8.7 4.3 8.2 8.2 0 0 1 20 11.8zm-3.2 4.7-1.2-.6c-.4-.2-.8-.1-1.1.2l-.6.6a6.4 6.4 0 0 1-3.2-3.2l.6-.6c.3-.3.4-.7.2-1.1l-.6-1.2c-.3-.5-.8-.7-1.3-.6l-1.2.2c-.5.1-.8.6-.8 1.1a7.8 7.8 0 0 0 8.5 8.5c.5 0 1-.3 1.1-.8l.2-1.2c.1-.5-.1-1-.6-1.3z"/></svg>',
    ig: '<svg class="icon icon--small" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 4.6c2.4 0 2.7 0 3.6.1 2.4.1 3.6 1.3 3.7 3.7.1 1 .1 1.2.1 3.6s0 2.7-.1 3.6c-.1 2.4-1.3 3.6-3.7 3.7-1 .1-1.2.1-3.6.1s-2.7 0-3.6-.1c-2.5-.1-3.6-1.3-3.7-3.7-.1-1-.1-1.2-.1-3.6s0-2.7.1-3.6C4.8 6 6 4.8 8.4 4.7c1-.1 1.2-.1 3.6-.1zM12 3c-2.4 0-2.8 0-3.7.1C5 3.2 3.2 5 3.1 8.3 3 9.2 3 9.6 3 12s0 2.8.1 3.7c.1 3.3 2 5.1 5.2 5.2.9.1 1.3.1 3.7.1s2.8 0 3.7-.1c3.3-.1 5.1-2 5.2-5.2.1-.9.1-1.3.1-3.7s0-2.8-.1-3.7c-.1-3.3-2-5.1-5.2-5.2C14.8 3 14.4 3 12 3zm0 4.4a4.6 4.6 0 1 0 0 9.2 4.6 4.6 0 0 0 0-9.2zM12 15a3 3 0 1 1 0-6 3 3 0 1 1 0 6zm4.8-8.9a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2z"/></svg>',
    minus: '<svg class="icon icon--small" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M5 12h14"/></svg>',
    plus: '<svg class="icon icon--small" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" d="M12 5v14M5 12h14"/></svg>'
  };

  const orderButtons = (cart, termsId) => {
    const message = orderText(cart);
    const msg = JSON.stringify(message);
    const terms = termsId ? ` data-requires-terms="${termsId}"` : '';
    return `<div class="order-handoff">
      <a href="https://wa.me/${WA}?text=${encodeURIComponent(message)}" class="btn btn--full" data-whatsapp-checkout data-whatsapp-number="${WA}" data-whatsapp-message=${msg}${terms} target="_blank" rel="noopener">${ICO.wa}Order on WhatsApp</a>
      <a href="https://ig.me/m/${IG}" class="btn btn--full btn--instagram-order" data-instagram-checkout data-instagram-handle="${IG}" data-instagram-message=${msg}${terms} target="_blank" rel="noopener">${ICO.ig}Order on Instagram</a>
    </div>`;
  };

  const linesHTML = (items) => `<ul class="cart-lines" role="list">${items.map((item, i) => {
    const n = i + 1;
    const img = item.image ? `<img src="${esc(item.image)}" alt="${esc(item.product_title)}" width="240" height="240" loading="lazy">` : '';
    const variant = item.variant_title ? `<p class="cart-line__variant">${esc(item.variant_title)}</p>` : '';
    return `<li class="cart-line" data-line-row="${n}">
      <a href="${esc(item.url)}" class="cart-line__media media ratio-square">${img}</a>
      <div class="cart-line__info">
        <a href="${esc(item.url)}" class="cart-line__title">${esc(item.product_title)}</a>
        ${variant}
        <div class="cart-line__price"><span>${money(item.final_line_price)}</span></div>
        <div class="cart-line__actions">
          <div class="qty qty--small">
            <button type="button" data-qty-step="-1" aria-label="Decrease">${ICO.minus}</button>
            <input type="number" data-line-qty data-line="${n}" value="${item.quantity}" min="0" aria-label="Quantity">
            <button type="button" data-qty-step="1" aria-label="Increase">${ICO.plus}</button>
          </div>
          <a href="${item.url_to_remove}" class="cart-line__remove" data-line-remove="${n}">Remove</a>
        </div>
        <p class="cart-line__error form-message form-message--error" data-line-error="${n}" role="alert" hidden></p>
      </div>
    </li>`;
  }).join('')}</ul>`;

  const drawerHTML = (id, cart) => {
    const o = cartObj(cart);
    const inner = o.item_count
      ? `<div class="drawer__header"><p class="drawer__title">Bag (${o.item_count})</p><button type="button" class="icon-button" data-close aria-label="Close">×</button></div>
         <div class="drawer__body"><cart-items>${linesHTML(o.items)}</cart-items></div>
         <div class="drawer__footer">
           <p class="cart-total-row cart-total-row--main"><span>Subtotal:</span><span>${money(o.total_price)}</span></p>
           <details class="cart-note-toggle"><summary>Add a note to your order</summary><cart-note><textarea name="note" form="cart-drawer-form" aria-label="Note">${esc(o.note)}</textarea></cart-note></details>
           <form action="/cart" method="post" id="cart-drawer-form" class="cart-drawer__form">${orderButtons(cart, 'cart-drawer-terms')}</form>
         </div>`
      : `<div class="drawer__header"><p class="drawer__title">Bag (0)</p><button type="button" class="icon-button" data-close aria-label="Close">×</button></div>
         <div class="drawer__body cart-empty"><p class="h3 cart-empty__heading">Your cart is empty</p><a class="btn" href="${withRoot('/collections/shop-all')}">Shop All</a></div>`;
    return `<div data-cart-section="${esc(id)}"><span hidden data-item-count="${o.item_count}"></span>${inner}</div>`;
  };

  const pageHTML = (id, cart) => {
    const o = cartObj(cart);
    const inner = o.item_count
      ? `<h1 class="cart-page__title text-center">Your bag</h1>
         <div class="cart-page__grid">
           <div class="cart-page__items"><cart-items>${linesHTML(o.items)}</cart-items></div>
           <aside class="cart-page__summary">
             <form action="/cart" method="post" id="cart-page-form">
               <cart-note class="field"><label for="cart-note">Add a note to your order</label><textarea id="cart-note" name="note">${esc(o.note)}</textarea></cart-note>
               <p class="cart-total-row cart-total-row--main"><span>Subtotal</span><span>${money(o.total_price)}</span></p>
               ${orderButtons(cart, 'cart-page-terms')}
             </form>
           </aside>
         </div>`
      : `<div class="empty-state cart-empty"><h1 class="cart-empty__title">Your cart is empty</h1><a class="btn" href="${withRoot('/collections/shop-all')}">Shop All</a></div>`;
    return `<div data-cart-section="${esc(id)}"><span hidden data-item-count="${o.item_count}"></span>${inner}</div>`;
  };

  const sectionHTML = (id, cart) => (/drawer/i.test(id) ? drawerHTML(id, cart) : pageHTML(id, cart));

  const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const html = (body, status = 200) => new Response(body, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

  const parseBody = async (init) => {
    const body = init && init.body;
    if (!body) return {};
    if (typeof FormData !== 'undefined' && body instanceof FormData) {
      const o = { properties: {} };
      for (const [k, v] of body.entries()) {
        const pm = String(k).match(/^properties\[(.+)\]$/);
        if (pm) o.properties[pm[1]] = v;
        else if (k === 'items') {
          try { o.items = JSON.parse(v); } catch { o.items = v; }
        } else o[k] = v;
      }
      return o;
    }
    if (typeof body === 'string') {
      try { return JSON.parse(body); } catch { return Object.fromEntries(new URLSearchParams(body)); }
    }
    if (body && typeof body === 'object' && !(body instanceof Blob) && !(body instanceof ArrayBuffer)) return body;
    return {};
  };

  const addLines = (cart, body) => {
    const items = body.items || [{ id: body.id, quantity: body.quantity || 1, properties: body.properties }];
    const added = [];
    for (const it of items) {
      const hit = variants.get(String(it.id));
      if (!hit) {
        const err = { status: 404, message: 'Cart Error', description: 'Cannot find variant' };
        throw err;
      }
      if (hit.variant.available === false) {
        throw { status: 422, message: 'Cart Error', description: `${hit.product.title} is already sold out.` };
      }
      const props = Object.fromEntries(Object.entries(it.properties || {}).filter(([, v]) => v !== '' && v != null));
      const ex = cart.lines.find((l) => String(l.id) === String(it.id) && JSON.stringify(l.properties || {}) === JSON.stringify(props));
      if (ex) ex.quantity += +it.quantity || 1;
      else cart.lines.push({ id: +it.id, quantity: +it.quantity || 1, properties: props });
      const idx = cart.lines.findIndex((l) => String(l.id) === String(it.id));
      added.push(lineView(cart.lines[idx], idx));
    }
    return added;
  };

  const sectionsFrom = (body, cart) => {
    const ids = String(body.sections || '').split(',').map((s) => s.trim()).filter(Boolean);
    const sections = {};
    ids.forEach((id) => { sections[id] = sectionHTML(id, cart); });
    return sections;
  };

  const pathOf = (input) => {
    const raw = typeof input === 'string' ? input : (input && input.url) || '';
    try { return new URL(raw, location.origin); } catch { return new URL(location.href); }
  };

  window.fetch = async function (input, init) {
    const u = pathOf(input);
    if (u.origin !== location.origin) return nativeFetch(input, init);
    let p = u.pathname.replace(/\/+$/, '') || '/';
    if (rootPath !== '/' && (p === rootPath || p.startsWith(rootPath + '/'))) p = p.slice(rootPath.length) || '/';
    const method = String((init && init.method) || (typeof input !== 'string' && input.method) || 'GET').toUpperCase();

    await catalogReady;
    const cart = loadCart();

    if (p === '/cart.js' || p === '/cart.json') return json(cartObj(cart));

    if (p === '/cart/add.js' || p === '/cart/add') {
      const body = await parseBody(init);
      try {
        const added = addLines(cart, body);
        saveCart(cart);
        const sections = sectionsFrom(body, cart);
        if (p === '/cart/add' && method !== 'GET') return new Response('', { status: 302, headers: { Location: '/cart/' } });
        return json(body.items ? { items: added, sections } : { ...added[0], sections });
      } catch (err) {
        return json(err, err.status || 404);
      }
    }

    if (p === '/cart/change.js' || p === '/cart/change') {
      const body = method === 'POST' ? await parseBody(init) : Object.fromEntries(u.searchParams);
      const idx = body.line ? +body.line - 1 : cart.lines.findIndex((l) => String(l.id) === String(body.id).split(':')[0]);
      if (idx >= 0 && cart.lines[idx]) {
        const q = +body.quantity;
        if (q <= 0) cart.lines.splice(idx, 1);
        else cart.lines[idx].quantity = q;
      }
      saveCart(cart);
      if (p === '/cart/change' && !p.endsWith('.js') && method !== 'POST') {
        /* keep fetch JSON for ajax; allow GET remove to fall through as JSON too */
      }
      const o = cartObj(cart);
      return json({ ...o, sections: sectionsFrom(body, cart) });
    }

    if (p === '/cart/update.js') {
      const body = await parseBody(init);
      if (body.note !== undefined) cart.note = body.note;
      saveCart(cart);
      return json(cartObj(cart));
    }

    if (p === '/cart/clear.js') {
      cart.lines = [];
      saveCart(cart);
      return json(cartObj(cart));
    }

    if (p === '/cart/prepare_shipping_rates.json') return json({});
    if (p === '/cart/async_shipping_rates.json') return json({ shipping_rates: [{ name: 'Standard', price: '0.00' }, { name: 'Express', price: '199.00' }] });

    if (p === '/search/suggest' || p === '/search/suggest.json') {
      const terms = (u.searchParams.get('q') || '').trim().toLowerCase();
      const hits = (catalog.products || []).filter((x) => x.title.toLowerCase().includes(terms) || (x.handle || '').includes(terms)).slice(0, 6);
      const items = hits.map((p) => `<li><a href="${esc(p.url)}" class="psearch__product"><span class="media ratio-square">${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.title)}" loading="lazy">` : ''}</span><span class="psearch__title">${esc(p.title)}</span></a></li>`).join('');
      const body = hits.length
        ? `<div data-predictive><div class="psearch"><p class="search-drawer__heading">Products</p><ul class="psearch__products">${items}</ul><a class="btn btn--outline psearch__all" href="/search/?q=${encodeURIComponent(terms)}">View all results for "${esc(terms)}"</a></div></div>`
        : `<div data-predictive><p class="psearch__empty">No results for "${esc(terms)}"</p></div>`;
      return html(body);
    }

    if (p === '/recommendations/products' || p === '/recommendations/products.json') {
      const pid = +u.searchParams.get('product_id');
      const lim = +(u.searchParams.get('limit') || 4);
      const recs = (catalog.products || []).filter((x) => x.id !== pid).slice(0, lim);
      return json({ products: recs.map((x) => ({ id: x.id, title: x.title, handle: x.handle })) });
    }

    if (u.searchParams.get('section_id') && u.searchParams.get('variant')) {
      /* Pages cannot re-render Liquid per variant; keep the current markup. */
      return html('', 200);
    }

    return nativeFetch(input, init);
  };

  const applyCart = (cart) => {
    const o = cartObj(cart);
    document.querySelectorAll('[data-cart-count]').forEach((el) => { el.textContent = o.item_count; el.hidden = o.item_count === 0; });
    document.querySelectorAll('[data-cart-count-label]').forEach((el) => { el.textContent = o.item_count; });
    document.querySelectorAll('[data-cart-section]').forEach((el) => {
      const wrap = document.createElement('div');
      wrap.innerHTML = sectionHTML(el.dataset.cartSection, cart);
      const fresh = wrap.querySelector('[data-cart-section]');
      if (fresh) el.innerHTML = fresh.innerHTML;
    });
  };

  const boot = async () => {
    await catalogReady;
    applyCart(loadCart());
    const params = new URLSearchParams(location.search);
    const q = (params.get('q') || '').trim().toLowerCase();
    const path = location.pathname.replace(/\/+$/, '') || '/';
    if (path === '/search' && q) {
      const hits = (catalog.products || []).filter((x) => x.title.toLowerCase().includes(q) || (x.handle || '').includes(q));
      const main = document.getElementById('content');
      if (main) {
        const list = hits.map((p) => `<li style="margin:0 0 12px"><a href="${esc(p.url)}">${esc(p.title)}</a></li>`).join('') || '<li>No results found.</li>';
        main.insertAdjacentHTML('afterbegin', `<div class="container" style="padding:24px 0"><h1>Results for "${esc(q)}"</h1><ul>${list}</ul></div>`);
      }
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
