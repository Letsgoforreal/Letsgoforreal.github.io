/* Duvete theme - core script. Native JS, custom elements, no dependencies. */
(() => {
  'use strict';
  const T = window.theme || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const parseHTML = (html) => new DOMParser().parseFromString(html, 'text/html');
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
  };
  const define = (name, cls) => { if (!customElements.get(name)) customElements.define(name, cls); };
  const emit = (name, detail) => document.dispatchEvent(new CustomEvent(name, { detail }));

  /* money formatting, matching Shopify formats */
  T.formatMoney = (cents, format = T.moneyFormat) => {
    if (typeof cents === 'string') cents = cents.replace('.', '');
    const fmt = (n, d = 2, th = ',', dec = '.') => {
      if (isNaN(n) || n == null) return '0';
      const parts = (n / 100).toFixed(d).split('.');
      return parts[0].replace(/(\d)(?=(\d\d\d)+(?!\d))/g, `$1${th}`) + (parts[1] ? dec + parts[1] : '');
    };
    return (format || '{{amount}}').replace(/\{\{\s*(\w+)\s*\}\}/, (_, k) => ({
      amount: fmt(cents), amount_no_decimals: fmt(cents, 0), amount_with_comma_separator: fmt(cents, 2, '.', ','),
      amount_no_decimals_with_comma_separator: fmt(cents, 0, '.', ','), amount_with_apostrophe_separator: fmt(cents, 2, "'", '.'),
      amount_with_space_separator: fmt(cents, 2, ' ', ',')
    }[k] || fmt(cents)));
  };

  /* ---------------- scroll lock + focus trap ---------------- */
  let lockCount = 0;
  const lockScroll = (on) => { lockCount = Math.max(0, lockCount + (on ? 1 : -1)); document.documentElement.classList.toggle('scroll-lock', lockCount > 0); };
  const focusables = (el) => $$('a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])', el).filter((e) => e.offsetParent !== null);

  /* ---------------- generic drawer / modal ---------------- */
  class OverlayPanel extends HTMLElement {
    connectedCallback() {
      this.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) { e.preventDefault(); this.close(); } });
      this.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') this.close();
        if (e.key === 'Tab' && this.isOpen) {
          const f = focusables(this); if (!f.length) return;
          if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
          else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
        }
      });
    }
    get isOpen() { return this.classList.contains('is-open'); }
    open(opener) {
      if (this.isOpen) return;
      this.opener = opener || document.activeElement;
      this.classList.add('is-open'); this.setAttribute('aria-hidden', 'false'); this.locked = !this.hasAttribute('data-no-lock'); if (this.locked) lockScroll(true);
      requestAnimationFrame(() => { const f = $('[autofocus]', this) || focusables(this)[0]; f && f.focus({ preventScroll: true }); });
      this.dispatchEvent(new CustomEvent('panel:open', { bubbles: true }));
    }
    close() {
      if (!this.isOpen) return;
      this.classList.remove('is-open'); this.setAttribute('aria-hidden', 'true'); if (this.locked) lockScroll(false);
      this.opener && this.opener.focus && this.opener.focus({ preventScroll: true });
      this.dispatchEvent(new CustomEvent('panel:close', { bubbles: true }));
    }
  }
  define('overlay-panel', OverlayPanel);
  /* Escape closes the top-most open panel even when focus was lost (e.g. after a cart re-render) */
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const open = $$('overlay-panel.is-open'); const top = open[open.length - 1];
    if (top && !top.contains(document.activeElement)) top.close();
  });
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-open]');
    if (!t) return;
    const panel = document.getElementById(t.dataset.open);
    if (panel && panel.open) { e.preventDefault(); panel.open(t); }
  });

  /* ---------------- cart ---------------- */
  const cartSectionIds = () => [...new Set($$('[data-cart-section]').map((e) => e.dataset.cartSection))];
  const Cart = {
    async request(url, body) {
      const isForm = body instanceof FormData;
      const res = await fetch(url, {
        method: 'POST',
        headers: Object.assign({ Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, isForm ? {} : { 'Content-Type': 'application/json' }),
        body: isForm ? body : JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok || data.status) throw new Error(data.description || data.message || T.strings.cartError);
      return data;
    },
    render(sections) {
      if (!sections) return;
      Object.entries(sections).forEach(([id, html]) => {
        if (!html) return;
        const doc = parseHTML(html);
        $$(`[data-cart-section="${id}"]`).forEach((target) => {
          const fresh = $(`[data-cart-section="${id}"]`, doc);
          if (fresh) target.innerHTML = fresh.innerHTML;
        });
        const count = $('[data-item-count]', doc);
        if (count) Cart.setCount(+count.dataset.itemCount);
      });
      emit('cart:rendered');
      /* keep keyboard focus inside an open cart drawer after its content is replaced */
      const drawer = document.getElementById('cart-drawer');
      if (drawer && drawer.classList.contains('is-open') && !drawer.contains(document.activeElement)) { const f = $('[data-close].icon-button', drawer) || $('a, button', drawer); f && f.focus({ preventScroll: true }); }
    },
    setCount(n) {
      $$('[data-cart-count]').forEach((el) => { el.textContent = n; el.hidden = n === 0; });
      $$('[data-cart-count-label]').forEach((el) => { el.textContent = n; });
    },
    async add(body) {
      const ids = cartSectionIds();
      if (body instanceof FormData) { body.append('sections', ids.join(',')); body.append('sections_url', location.pathname); }
      else Object.assign(body, { sections: ids.join(','), sections_url: location.pathname });
      const data = await Cart.request(T.routes.cartAdd + '.js', body);
      Cart.render(data.sections);
      emit('cart:added', data);
      return data;
    },
    async change(line, quantity, extra = {}) {
      const data = await Cart.request(T.routes.cartChange + '.js', Object.assign({ line, quantity, sections: cartSectionIds().join(','), sections_url: location.pathname }, extra));
      Cart.render(data.sections);
      Cart.setCount(data.item_count);
      emit('cart:changed', data);
      return data;
    },
    async note(note) { return Cart.request(T.routes.cartUpdate + '.js', { note }); },
    afterAdd(data, title) {
      const drawer = document.getElementById('cart-drawer');
      if (T.cartType === 'page' || T.afterAdd === 'page' || (T.afterAdd === 'drawer' && !drawer)) { location.href = T.routes.cart; return; }
      if (T.afterAdd === 'drawer') drawer.open();
      else if (T.afterAdd === 'notification') {
        const n = $('added-notification');
        n && n.show(title || (data.items ? data.items[0].product_title : data.product_title));
      }
    }
  };
  T.cart = Cart;

  class AddedNotification extends HTMLElement {
    connectedCallback() { $('.added-notification__close', this).addEventListener('click', () => this.hide()); }
    show(title) { $('.added-notification__title', this).textContent = title || T.strings.added; this.hidden = false; clearTimeout(this.t); this.t = setTimeout(() => this.hide(), 5000); }
    hide() { this.hidden = true; }
  }
  define('added-notification', AddedNotification);

  /* product form: product page, quick buy, featured product. Keeps app-injected inputs (FormData). */
  class ProductForm extends HTMLElement {
    connectedCallback() {
      this.form = $('form', this);
      if (!this.form || T.afterAdd === 'no-js') return;
      this.form.addEventListener('submit', (e) => this.submit(e));
    }
    async submit(e) {
      e.preventDefault();
      const btn = $('[type=submit]', this.form);
      const err = $('[data-form-error]', this);
      if (btn.getAttribute('aria-disabled') === 'true') return;
      const idInput = $('input[name=id]', this.form);
      if (btn.hasAttribute('data-needs-option') || (idInput && idInput.disabled)) {
        const page = this.closest('product-page') || document;
        const empty = $$('variant-picker select[data-option]', page).find((s) => !s.value) || $$('variant-picker .variant-option', page).find((o) => !$('input:checked', o) && $('input', o));
        if (empty) { (empty.matches('select') ? empty : $('input', empty)).focus(); (empty.closest('.variant-option') || empty).classList.add('is-required'); }
        if (err) { err.textContent = T.strings.chooseOption; err.hidden = false; }
        return;
      }
      btn.classList.add('is-loading'); btn.setAttribute('aria-disabled', 'true');
      if (err) err.hidden = true;
      try {
        const data = await Cart.add(new FormData(this.form));
        const qv = this.closest('#quickbuy'); if (qv && T.afterAdd !== 'notification') qv.close();
        Cart.afterAdd(data, this.dataset.title);
      } catch (ex) {
        if (err) { err.textContent = ex.message; err.hidden = false; }
      } finally { btn.classList.remove('is-loading'); btn.removeAttribute('aria-disabled'); }
    }
  }
  define('product-form', ProductForm);

  /* quick add from product cards (Duvete quick-buy button) */
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-quick-add]');
    if (!btn) return;
    e.preventDefault();
    if (btn.dataset.variantId) {
      const label = btn.innerHTML;
      btn.classList.add('is-loading'); btn.disabled = true;
      try { const data = await Cart.add({ items: [{ id: +btn.dataset.variantId, quantity: 1 }] }); Cart.afterAdd(data, btn.dataset.title); }
      catch (ex) { alert(ex.message); }
      finally { btn.classList.remove('is-loading'); btn.disabled = false; btn.innerHTML = label; }
    } else if (btn.dataset.productUrl) {
      QuickBuy.open(btn.dataset.productUrl, btn);
    }
  });

  const QuickBuy = {
    async open(url, opener) {
      const modal = document.getElementById('quickbuy');
      if (!modal) { location.href = url; return; }
      const body = $('[data-quickbuy-body]', modal);
      body.innerHTML = '<div class="quickbuy__loading"><span class="spinner"></span></div>';
      modal.open(opener);
      try {
        const res = await fetch(url);
        const doc = parseHTML(await res.text());
        const src = $('[data-quickbuy-source]', doc);
        if (!src) { location.href = url; return; }
        $$('[data-quickbuy-exclude]', src).forEach((n) => n.remove());
        /* unique ids so quick-buy never collides with the page's own product form */
        $$('[id]', src).forEach((n) => { n.id += '-qb'; });
        ['for', 'form', 'data-form', 'data-open', 'data-zoom', 'aria-controls', 'aria-labelledby'].forEach((a) => $$(`[${a}]`, src).forEach((n) => { if (n.getAttribute(a)) n.setAttribute(a, n.getAttribute(a) + '-qb'); }));
        body.innerHTML = '';
        body.appendChild(document.importNode(src, true));
        $$('script', body).forEach((old) => { const s = document.createElement('script'); [...old.attributes].forEach((a) => s.setAttribute(a.name, a.value)); s.textContent = old.textContent; old.replaceWith(s); });
        emit('quickbuy:loaded', { root: body });
      } catch (ex) { location.href = url; }
    }
  };
  T.quickBuy = QuickBuy;

  /* cart items (drawer + cart page) */
  class CartItems extends HTMLElement {
    connectedCallback() {
      this.update = debounce((line, qty) => this.change(line, qty), 300);
      this.addEventListener('change', (e) => { const i = e.target.closest('[data-line-qty]'); if (i) this.update(+i.dataset.line, Math.max(0, +i.value)); });
      this.addEventListener('click', (e) => {
        const step = e.target.closest('[data-qty-step]');
        if (step) {
          const input = $('[data-line-qty]', step.closest('.qty'));
          input.value = Math.max(0, +input.value + +step.dataset.qtyStep);
          this.update(+input.dataset.line, +input.value);
        }
        const rm = e.target.closest('[data-line-remove]');
        if (rm) { e.preventDefault(); this.change(+rm.dataset.lineRemove, 0); }
      });
    }
    async change(line, qty) {
      const row = $(`[data-line-row="${line}"]`, this);
      row && row.classList.add('is-updating');
      try { await Cart.change(line, qty); }
      catch (ex) { const err = $(`[data-line-error="${line}"]`, this); if (err) { err.textContent = ex.message; err.hidden = false; } row && row.classList.remove('is-updating'); }
    }
  }
  define('cart-items', CartItems);

  class CartNote extends HTMLElement {
    connectedCallback() { const t = $('textarea', this); t && t.addEventListener('input', debounce(() => Cart.note(t.value), 500)); }
  }
  define('cart-note', CartNote);

  /* checkout terms checkbox gate */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-requires-terms]');
    if (!btn) return;
    const box = document.getElementById(btn.dataset.requiresTerms);
    if (box && !box.checked) { e.preventDefault(); box.closest('.terms')?.classList.add('is-error'); box.focus(); e.stopImmediatePropagation(); }
  });

  const orderMessageFrom = (link) => {
    const note = $('textarea[name=note]', link.closest('[data-cart-section]') || document)?.value.trim();
    const qtyInput = link.closest('form')?.querySelector('input[name="quantity"]');
    let message = (link.getAttribute('data-whatsapp-message') || link.getAttribute('data-instagram-message') || '').replace(/\\n/g, '\n').trim();
    if (link.dataset.whatsappProduct && qtyInput) {
      const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
      message = message.replace(/^\d+ × /m, `${qty} × `);
    }
    if (note && message && !/\nNote:/i.test(message)) message += `\nNote: ${note}`;
    return message || 'Hi, I want to place an order.';
  };
  const showOrderToast = (text) => {
    document.querySelectorAll('.order-toast').forEach((n) => n.remove());
    const el = document.createElement('div');
    el.className = 'order-toast';
    el.setAttribute('role', 'status');
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  };

  /* WhatsApp order: always build a valid wa.me URL so checkout never dies on a bad href. */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-whatsapp-checkout]');
    if (!link) return;
    e.preventDefault();
    const number = String(link.dataset.whatsappNumber || '917000097084').replace(/\D/g, '');
    const message = orderMessageFrom(link);
    const url = `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
    link.setAttribute('href', url);
    window.open(url, '_blank', 'noopener');
  });

  /* Instagram DM order: copy the same order text, then open the Duvete World chat. */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('[data-instagram-checkout]');
    if (!link) return;
    e.preventDefault();
    const handle = String(link.dataset.instagramHandle || 'duveteworld').replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '') || 'duveteworld';
    const message = orderMessageFrom(link);
    const url = `https://ig.me/m/${handle}`;
    link.setAttribute('href', url);
    window.open(url, '_blank', 'noopener');
    const copy = navigator.clipboard && navigator.clipboard.writeText ? navigator.clipboard.writeText(message) : Promise.reject();
    copy.then(() => showOrderToast('Order copied. Paste it in the Instagram chat.')).catch(() => showOrderToast('Instagram opened. Send your order in the chat.'));
  });

  /* cart recommendations (automatic cross-sells) */
  class CartRecommendations extends HTMLElement {
    connectedCallback() {
      if (!this.dataset.productId) return;
      const url = `${T.routes.recommendations}?product_id=${this.dataset.productId}&limit=${this.dataset.limit || 4}&section_id=product-mini-recommendations`;
      fetch(url).then((r) => r.text()).then((html) => {
        const fresh = $('[data-rec-cards]', parseHTML(html));
        if (fresh && fresh.children.length) {
          this.innerHTML = fresh.innerHTML; this.hidden = false; this.closest('[data-cross-sell]')?.removeAttribute('hidden');
          const car = this.closest('carousel-slider'); if (car) { car.slides = $$(':scope > .carousel__slide', this); car.track = this; car.sync && car.sync(); }
          T.init && T.init(this);
        } else { const host = this.closest('[data-cross-sell]'); if (host) host.hidden = true; }
      }).catch(() => {});
    }
  }
  define('cart-recommendations', CartRecommendations);

  /* ---------------- carousel ---------------- */
  class CarouselSlider extends HTMLElement {
    connectedCallback() {
      this.track = $('.carousel__track', this);
      if (!this.track) return;
      this.slides = $$(':scope > .carousel__slide', this.track);
      this.fade = this.classList.contains('carousel--fade');
      this.index = 0;
      this.prev = $('[data-prev]', this); this.next = $('[data-next]', this);
      this.dots = $$('[data-dot]', this);
      this.prev && this.prev.addEventListener('click', () => this.go(this.index - 1));
      this.next && this.next.addEventListener('click', () => this.go(this.index + 1));
      this.dots.forEach((d, i) => d.addEventListener('click', () => this.go(i)));
      if (!this.fade) this.track.addEventListener('scroll', debounce(() => this.sync(), 60), { passive: true });
      if (this.dataset.autoplay === 'true' && this.slides.length > 1) {
        this.speed = (+this.dataset.speed || 5) * 1000;
        ['mouseenter', 'focusin'].forEach((ev) => this.addEventListener(ev, () => this.stop()));
        ['mouseleave', 'focusout'].forEach((ev) => this.addEventListener(ev, () => this.play()));
        document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.play()));
        this.play();
      }
      this.sync();
      if (!this.fade && !$('a[href], button, input, select, textarea, [tabindex]', this.track)) { this.track.tabIndex = 0; if (!this.track.hasAttribute('aria-label')) this.track.setAttribute('aria-label', this.getAttribute('aria-label') || 'Carousel'); }
    }
    perView() { const w = this.slides[0] ? this.slides[0].getBoundingClientRect().width : 1; return Math.max(1, Math.round(this.track.clientWidth / (w || 1))); }
    go(i) {
      const n = this.slides.length; if (!n) return;
      const max = this.fade ? n - 1 : Math.max(0, n - this.perView());
      if (i > max) i = this.dataset.loop === 'false' ? max : 0;
      if (i < 0) i = this.dataset.loop === 'false' ? 0 : max;
      this.index = i;
      if (this.fade) this.slides.forEach((s, k) => s.classList.toggle('is-active', k === i));
      else this.track.scrollTo({ left: this.slides[i].offsetLeft - this.track.offsetLeft, behavior: 'smooth' });
      this.paint();
    }
    sync() {
      if (this.fade) { this.slides.forEach((s, k) => s.classList.toggle('is-active', k === this.index)); this.paint(); return; }
      const left = this.track.scrollLeft; let best = 0, dist = Infinity;
      this.slides.forEach((s, k) => { const d = Math.abs(s.offsetLeft - this.track.offsetLeft - left); if (d < dist) { dist = d; best = k; } });
      this.index = best; this.paint();
    }
    paint() {
      this.dots.forEach((d, k) => { d.classList.toggle('is-active', k === this.index); d.setAttribute('aria-current', k === this.index); });
      if (this.dataset.loop === 'false' && !this.fade) {
        if (this.prev) this.prev.disabled = this.track.scrollLeft < 4;
        if (this.next) this.next.disabled = this.track.scrollLeft + this.track.clientWidth >= this.track.scrollWidth - 4;
      }
      this.slides.forEach((s, k) => s.setAttribute('aria-hidden', this.fade ? k !== this.index : 'false'));
      this.dispatchEvent(new CustomEvent('carousel:change', { detail: { index: this.index } }));
    }
    play() { if (!this.speed) return; this.stop(); this.timer = setInterval(() => this.go(this.index + 1), this.speed); }
    stop() { clearInterval(this.timer); }
  }
  define('carousel-slider', CarouselSlider);

  /* ---------------- tabs ---------------- */
  class TabGroup extends HTMLElement {
    connectedCallback() {
      this.tabs = $$('[role=tab]', this); this.panels = $$('[role=tabpanel]', this);
      this.tabs.forEach((t, i) => {
        t.addEventListener('click', () => this.select(i));
        t.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = (i + (e.key === 'ArrowRight' ? 1 : -1) + this.tabs.length) % this.tabs.length; this.select(n); this.tabs[n].focus(); } });
      });
    }
    select(i) {
      this.tabs.forEach((t, k) => { t.setAttribute('aria-selected', k === i); t.tabIndex = k === i ? 0 : -1; });
      this.panels.forEach((p, k) => { p.hidden = k !== i; });
    }
  }
  define('tab-group', TabGroup);

  /* ---------------- header ---------------- */
  class SiteHeader extends HTMLElement {
    connectedCallback() {
      const section = this.closest('.shopify-section');
      this.sticky = this.dataset.sticky === 'true';
      this.transparent = this.dataset.transparent === 'true';
      if (this.sticky && section) section.classList.add('header-sticky');
      if (this.transparent) document.body.classList.add('has-transparent-header');
      const onScroll = () => {
        const y = window.scrollY;
        this.classList.toggle('is-scrolled', y > 10);
        if (this.transparent) this.classList.toggle('is-transparent', y <= 10 && !this.matches(':hover') && !this.contains(document.activeElement));
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      this.addEventListener('mouseleave', onScroll); this.addEventListener('focusout', () => setTimeout(onScroll, 0));
      this.addEventListener('mouseenter', () => this.classList.remove('is-transparent'));
      this.addEventListener('focusin', () => this.classList.remove('is-transparent'));
      onScroll();
      const setH = () => {
        const barEl = this.querySelector('.site-header__bar');
        const below = this.querySelector('.site-header__below');
        const belowOpen = below && this.classList.contains('is-nav-below') && getComputedStyle(below).display !== 'none';
        const h = (barEl ? barEl.offsetHeight : 0) + (belowOpen ? below.offsetHeight : 0);
        const r = document.documentElement.style;
        r.setProperty('--header-live-h', h + 'px');
        r.setProperty('--header-sticky-h', this.sticky ? h + 'px' : '0px');
      };
      /* inline menu falls back to a centred row below the logo when it doesn't fit */
      const inline = $('[data-inline-nav]', this);
      if (inline) {
        const fit = () => {
          this.classList.remove('is-nav-below');
          const list = $('.site-nav__list', inline);
          const over = list && list.scrollWidth > inline.clientWidth + 1;
          this.classList.toggle('is-nav-below', !!over);
          setH();
        };
        fit(); new ResizeObserver(() => requestAnimationFrame(fit)).observe(this.querySelector('.site-header__bar'));
        document.fonts && document.fonts.ready.then(fit);
      }
      setH();
      const bar = this.querySelector('.site-header__bar');
      if (bar) new ResizeObserver(setH).observe(bar);
      else new ResizeObserver(setH).observe(this);
      /* desktop dropdowns: hover + keyboard */
      const dropdowns = $$('[data-dropdown]', this);
      const closeAll = (except) => {
        dropdowns.forEach((other) => {
          if (other === except) return;
          other.classList.remove('is-open');
          const otherBtn = $(':scope > [aria-expanded]', other);
          otherBtn && otherBtn.setAttribute('aria-expanded', 'false');
        });
      };
      dropdowns.forEach((li) => {
        const btn = $(':scope > [aria-expanded]', li);
        const set = (v) => {
          if (v) closeAll(li);
          li.classList.toggle('is-open', v);
          btn && btn.setAttribute('aria-expanded', v);
        };
        /* after Escape, ignore hover/focus until the pointer leaves or focus moves on */
        li.addEventListener('mouseenter', () => { if (!li.dataset.hold) set(true); });
        li.addEventListener('mouseleave', () => { delete li.dataset.hold; set(false); });
        btn && btn.addEventListener('click', (e) => { if (btn.tagName === 'BUTTON') { e.preventDefault(); set(!li.classList.contains('is-open')); } });
        li.addEventListener('focusout', (e) => { if (!li.contains(e.relatedTarget)) { delete li.dataset.hold; set(false); } });
        li.addEventListener('focusin', () => { if (!li.dataset.hold) set(true); });
        li.addEventListener('keydown', (e) => {
          if (e.key !== 'Escape') return;
          if (!li.classList.contains('is-open') && !dropdowns.some((d) => d.classList.contains('is-open'))) return;
          e.preventDefault();
          dropdowns.forEach((openLi) => {
            if (!openLi.classList.contains('is-open')) return;
            openLi.dataset.hold = '1';
            openLi.classList.remove('is-open');
            const openBtn = $(':scope > [aria-expanded]', openLi);
            openBtn && openBtn.setAttribute('aria-expanded', 'false');
          });
          btn && btn.focus();
        });
      });
    }
  }
  define('site-header', SiteHeader);

  /* mobile nav: nested panels */
  class MobileNav extends HTMLElement {
    connectedCallback() {
      this.addEventListener('click', (e) => {
        const fwd = e.target.closest('[data-subnav-open]'); const back = e.target.closest('[data-subnav-back]');
        if (fwd) { e.preventDefault(); const p = document.getElementById(fwd.dataset.subnavOpen); p && p.classList.add('is-active'); }
        if (back) { e.preventDefault(); back.closest('.mobile-nav__panel').classList.remove('is-active'); }
      });
      this.closest('overlay-panel')?.addEventListener('panel:close', () => $$('.mobile-nav__panel.is-active', this).forEach((p) => p.classList.remove('is-active')));
    }
  }
  define('mobile-nav', MobileNav);

  /* ---------------- predictive search ---------------- */
  class PredictiveSearch extends HTMLElement {
    connectedCallback() {
      this.input = $('input[type=search]', this);
      this.results = $('[data-search-results]', this);
      if (!this.input || !T.search || !T.search.enabled) return;
      this.cache = new Map();
      this.input.addEventListener('input', debounce(() => this.search(this.input.value.trim()), 280));
      this.input.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown') { const f = $('a', this.results); f && (e.preventDefault(), f.focus()); } });
    }
    async search(q) {
      if (!q) { this.results.innerHTML = ''; this.results.hidden = true; this.toggleExtras(true); return; }
      const fields = ['title', 'product_type', 'variants.title', 'vendor'];
      if (T.search.searchMeta) fields.push('tag', 'body');
      const types = (T.search.types || 'product').split(',').concat(['query']).join(',');
      const url = `${T.routes.predictiveSearch}?q=${encodeURIComponent(q)}&section_id=predictive-search&resources[type]=${types}&resources[limit]=6&resources[options][fields]=${fields.join(',')}`;
      this.setAttribute('loading', '');
      try {
        let html = this.cache.get(url);
        if (!html) { html = await (await fetch(url)).text(); this.cache.set(url, html); }
        const fresh = $('[data-predictive]', parseHTML(html));
        this.results.innerHTML = fresh ? fresh.innerHTML : '';
        this.results.hidden = false; this.toggleExtras(false);
      } catch (e) { /* network */ } finally { this.removeAttribute('loading'); }
    }
    toggleExtras(show) { $$('[data-search-extra]', this).forEach((n) => { n.hidden = !show; }); }
  }
  define('predictive-search', PredictiveSearch);

  /* ---------------- popup ---------------- */
  class NewsletterPopup extends HTMLElement {
    connectedCallback() {
      const panel = $('overlay-panel', this); if (!panel) return;
      const mode = this.dataset.mode;
      const key = 'duvete-popup-dismissed';
      if (this.dataset.success === 'true') { panel.open(); store.set(key, Date.now() + 365 * 864e5); return; }
      if (mode === 'disabled' || (window.Shopify && Shopify.designMode && mode !== 'testing')) return;
      const until = store.get(key);
      if (mode !== 'testing' && until && until > Date.now()) return;
      /* never interrupt an open drawer/modal (cart, menu, quick buy): wait until it closes */
      const tryOpen = () => { if (document.documentElement.classList.contains('scroll-lock') || document.querySelector('overlay-panel.is-open')) { setTimeout(tryOpen, 1500); return; } panel.open(); };
      setTimeout(tryOpen, (+this.dataset.delay || 5) * 1000);
      panel.addEventListener('panel:close', () => store.set(key, Date.now() + (+this.dataset.days || 30) * 864e5));
    }
  }
  define('newsletter-popup', NewsletterPopup);

  /* ---------------- countdown ---------------- */
  class CountdownTimer extends HTMLElement {
    connectedCallback() {
      /* end time is rendered by Liquid in the shop's time zone (e.g. 2030-12-31T23:59:00+0530) */
      const raw = String(this.dataset.end || '').trim().replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
      const end = new Date(raw);
      if (isNaN(end)) { this.hidden = true; return; }
      const parts = { d: $('[data-d]', this), h: $('[data-h]', this), m: $('[data-m]', this), s: $('[data-s]', this) };
      const pad = (n) => String(n).padStart(2, '0');
      const tick = () => {
        let left = Math.max(0, end - Date.now());
        if (!left) { clearInterval(this.t); const host = this.closest('[data-countdown-host]'); if (host) host.hidden = true; return; }
        const d = Math.floor(left / 864e5); left -= d * 864e5;
        const h = Math.floor(left / 36e5); left -= h * 36e5;
        const m = Math.floor(left / 6e4); left -= m * 6e4;
        parts.d.textContent = pad(d); parts.h.textContent = pad(h); parts.m.textContent = pad(m); parts.s.textContent = pad(Math.floor(left / 1e3));
      };
      tick(); this.t = setInterval(tick, 1000);
    }
    disconnectedCallback() { clearInterval(this.t); }
  }
  define('countdown-timer', CountdownTimer);

  /* ---------------- localization selector ---------------- */
  document.addEventListener('change', (e) => { const s = e.target.closest('[data-localization-select]'); if (s) s.form.submit(); });

  /* ---------------- quantity input (product page) ---------------- */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-qty-btn]'); if (!b) return;
    const input = $('input', b.closest('.qty')); if (!input) return;
    const min = +input.min || 1; input.value = Math.max(min, (+input.value || min) + +b.dataset.qtyBtn);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* ---------------- hero video: sharp poster first, then native autoplay ---------------- */
  const heroVideos = new WeakSet();
  const initHeroVideo = (video) => {
    if (heroVideos.has(video)) return;
    heroVideos.add(video);
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    const play = () => video.play && video.play().catch(() => {});
    play();
    video.addEventListener('canplay', play, { once: true });
    document.addEventListener('pointerdown', play, { once: true, capture: true });
  };

  /* ---------------- videos: play when visible, pause when not ---------------- */
  const vio = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => entries.forEach((en) => {
    const v = en.target;
    if (en.isIntersecting) { if (v.dataset.src && !v.src) { v.src = v.dataset.src; } v.play && v.play().catch(() => {}); }
    else if (v.pause) v.pause();
  }), { rootMargin: '200px' }) : null;
  const initVideos = (root = document) => {
    $$('.bg-video__el', root).forEach(initHeroVideo);
    $$('video[data-autoplay]:not(.bg-video__el)', root).forEach((v) => (vio ? vio.observe(v) : v.play && v.play().catch(() => {})));
  };

  /* ---------------- reveal on scroll ---------------- */
  const rio = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => entries.forEach((en) => {
    if (en.isIntersecting) { en.target.classList.remove('reveal-pending'); en.target.classList.add('is-revealed'); rio.unobserve(en.target); }
  }), { rootMargin: '0px 0px -8% 0px' }) : null;
  /* only content below the fold animates in; what's on screen at load is never hidden (fast LCP) */
  const initReveal = (root = document) => {
    const nodes = $$('[data-reveal]:not(.is-revealed):not(.reveal-pending)', root);
    if (!document.body.classList.contains('animate') || !rio) { nodes.forEach((n) => n.classList.add('is-revealed')); return; }
    const fold = innerHeight;
    nodes.forEach((n) => { if (n.getBoundingClientRect().top < fold) n.classList.add('is-revealed'); else { n.classList.add('reveal-pending'); rio.observe(n); } });
  };

  /* ---------------- lazy image fade ---------------- */
  /* fade in only images that are still loading below the fold */
  const initImages = (root = document) => $$('img.fade-in:not(.is-loaded)', root).forEach((img) => {
    const show = () => { img.classList.remove('is-fading'); img.classList.add('is-loaded'); };
    if (img.complete || img.getBoundingClientRect().top < innerHeight) { show(); return; }
    img.classList.add('is-fading');
    img.addEventListener('load', show, { once: true });
    img.addEventListener('error', show, { once: true });
  });

  const init = (root = document) => { initVideos(root); initReveal(root); initImages(root); };
  T.init = init;
  init();
  T.ready = true;
  document.addEventListener('cart:rendered', () => init());
  document.addEventListener('quickbuy:loaded', (e) => init(e.detail.root));
  document.addEventListener('shopify:section:load', (e) => init(e.target));
  /* theme editor: open drawers/popups when their section is selected */
  const editorPanel = (root) => { const p = $('overlay-panel', root); return p && (p.closest('newsletter-popup') || p.id === 'cart-drawer') ? p : null; };
  document.addEventListener('shopify:section:select', (e) => { const p = editorPanel(e.target); p && p.open(); });
  document.addEventListener('shopify:section:deselect', (e) => { const p = editorPanel(e.target); p && p.close(); });
  /* theme editor: selecting a slide/testimonial/announcement block shows it and pauses autoplay */
  document.addEventListener('shopify:block:select', (e) => {
    const slide = e.target.closest('.carousel__slide'); const car = slide && slide.closest('carousel-slider');
    if (car && car.slides) { const i = car.slides.indexOf(slide); if (i >= 0) { car.stop && car.stop(); car.go(i); } }
    const d = e.target.closest('details'); if (d) d.open = true;
  });
  document.addEventListener('shopify:block:deselect', (e) => { const car = e.target.closest('carousel-slider'); car && car.play && car.play(); });
})();

/* ---------------- product page components ---------------- */
(() => {
  'use strict';
  const T = window.theme || {};
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const define = (n, c) => { if (!customElements.get(n)) customElements.define(n, c); };
  const parseHTML = (h) => new DOMParser().parseFromString(h, 'text/html');

  class VariantPicker extends HTMLElement {
    connectedCallback() {
      this.variants = JSON.parse($('[data-variants]', this).textContent);
      this.addEventListener('change', () => this.onChange());
      this.paintAvailability();
    }
    selected() {
      return $$('.variant-option', this).map((o) => {
        const sel = $('select[data-option]', o);
        if (sel) return sel.value || null;
        const r = $('input[data-option]:checked', o);
        return r ? r.value : null;
      });
    }
    onChange() {
      $$('.variant-option.is-required', this).forEach((o) => o.classList.remove('is-required'));
      const page = this.closest('product-page'); const err = page && $('[data-form-error]', page); if (err) err.hidden = true;
      const sel = this.selected();
      $$('.variant-option', this).forEach((o, i) => { const v = $('[data-option-value]', o); if (v) v.textContent = sel[i] || ''; });
      const complete = sel.every((v) => v !== null && v !== '');
      const variant = complete ? this.variants.find((v) => v.options.every((ov, i) => ov === sel[i])) || false : null;
      this.paintAvailability();
      this.closest('product-page')?.setVariant(variant);
    }
    paintAvailability() {
      const sel = this.selected();
      const disable = this.dataset.disableUnavailable === 'true';
      $$('.variant-option', this).forEach((o, idx) => {
        const check = (value) => this.variants.some((v) => v.available && v.options[idx] === value && v.options.every((ov, k) => k === idx || !sel[k] || ov === sel[k]));
        $$('select[data-option] option', o).forEach((opt) => {
          if (!opt.value) return;
          const ok = check(opt.value);
          opt.disabled = disable && !ok && !opt.selected;
          opt.textContent = opt.value + (ok ? '' : ` - ${T.strings.soldOut}`);
        });
        $$('input[data-option]', o).forEach((inp) => {
          const ok = check(inp.value);
          inp.classList.toggle('is-unavailable', !ok);
        });
      });
    }
  }
  define('variant-picker', VariantPicker);

  class ProductPage extends HTMLElement {
    connectedCallback() {
      this.form = document.getElementById(this.dataset.form) || $('form[data-type=add-to-cart-form]', this);
      this.gallery = $('product-gallery', this);
      this.inQuickbuy = !!this.closest('#quickbuy');
      if (this.dataset.groupImages === 'true') {
        const picker = $('variant-picker', this);
        if (picker) { const sel = picker.selected(); const v = JSON.parse($('[data-variants]', picker).textContent).find((x) => x.options.every((o, i) => o === sel[i])); v && this.groupMedia(v); }
      }
    }
    setVariant(variant) {
      const input = this.form && $('input[name=id]', this.form);
      const btnWrap = $('[data-swap=buttons]', this);
      const dyn = $('[data-dynamic-checkout]', this);
      if (!variant) {
        if (input) input.disabled = true;
        if (btnWrap) btnWrap.innerHTML = variant === false ? `<button type="submit" class="btn btn--full" disabled>${T.strings.unavailable}</button>` : `<button type="submit" name="add" class="btn btn--full" data-needs-option>${T.strings.addToCartPage}</button>`;
        if (dyn) dyn.hidden = true;
        return;
      }
      if (input) { input.value = variant.id; input.disabled = false; input.dispatchEvent(new Event('change', { bubbles: true })); }
      if (!this.inQuickbuy && this.dataset.url) history.replaceState({}, '', `${this.dataset.url}?variant=${variant.id}`);
      if (variant.featured_media && this.gallery) this.gallery.goToMedia(variant.featured_media.id);
      if (this.dataset.groupImages === 'true') this.groupMedia(variant);
      if (dyn) dyn.hidden = !variant.available;
      $$('pickup-availability', this).forEach((p) => p.load(variant.id));
      this.refresh(variant.id);
      document.dispatchEvent(new CustomEvent('variant:changed', { detail: { variant, root: this } }));
    }
    async refresh(id) {
      const req = (this.req = id);
      try {
        const html = await (await fetch(`${this.dataset.url}?variant=${id}&section_id=${this.dataset.section}`)).text();
        if (req !== this.req) return;
        const doc = parseHTML(html);
        $$('[data-swap]', this).forEach((el) => {
          const fresh = $(`[data-swap="${el.dataset.swap}"]`, doc);
          if (fresh) el.innerHTML = fresh.innerHTML;
        });
      } catch (e) { /* keep current */ }
    }
    groupMedia(variant) {
      if (!this.gallery || !variant.featured_media) return;
      const names = (this.dataset.groupOptions || '').toLowerCase().split(',').map((s) => s.trim());
      const slides = $$('.gallery__slide', this.gallery);
      const starts = new Set(JSON.parse($('[data-variants]', this).textContent).filter((v) => v.featured_media).map((v) => String(v.featured_media.id)));
      let inGroup = false;
      slides.forEach((s) => {
        const id = s.dataset.mediaId;
        if (starts.has(id)) inGroup = id === String(variant.featured_media.id);
        s.hidden = !inGroup;
        const t = $(`.gallery__thumb[data-media-id="${id}"]`, this.gallery); if (t) t.hidden = !inGroup;
      });
      if (!names.length) return;
    }
  }
  define('product-page', ProductPage);

  class ProductGallery extends HTMLElement {
    connectedCallback() {
      this.carousel = $('carousel-slider', this);
      this.thumbs = $$('[data-thumb]', this);
      this.thumbs.forEach((t) => t.addEventListener('click', () => this.carousel.go(+t.dataset.thumb)));
      const fitHeight = (i) => {
        const track = this.carousel.track; if (!track) return;
        if (getComputedStyle(track).display === 'grid') { track.style.height = ''; return; }
        const slide = $$('.gallery__slide', this)[i]; if (slide) track.style.height = slide.offsetHeight + 'px';
      };
      this.carousel.addEventListener('carousel:change', (e) => { this.thumbs.forEach((t, i) => t.classList.toggle('is-active', i === e.detail.index)); fitHeight(e.detail.index); });
      requestAnimationFrame(() => fitHeight(+this.dataset.start || 0));
      window.addEventListener('resize', () => fitHeight(this.carousel.index || 0));
      const start = +this.dataset.start || 0;
      if (start) requestAnimationFrame(() => { const s = $$('.gallery__slide', this)[start]; s && this.carousel.track.scrollTo({ left: s.offsetLeft - this.carousel.track.offsetLeft }); });
      if (this.dataset.zoom) {
        this.addEventListener('click', (e) => { const z = e.target.closest('[data-zoom-trigger]'); if (z) this.zoom(z); });
        this.addEventListener('keydown', (e) => { const z = e.target.closest('[data-zoom-trigger]'); if (z && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); this.zoom(z); } });
      }
    }
    goToMedia(id) {
      const slides = $$('.gallery__slide', this);
      const i = slides.findIndex((s) => s.dataset.mediaId === String(id));
      if (i < 0) return;
      if (getComputedStyle(this.carousel.track).display === 'grid') slides[i].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      else this.carousel.go(i);
    }
    zoom(trigger) {
      const modal = document.getElementById(this.dataset.zoom);
      if (!modal) return;
      const id = trigger.closest('[data-media-id]').dataset.mediaId;
      modal.open(trigger);
      const car = $('carousel-slider', modal); const items = car ? car.slides || [] : [];
      const idx = items.findIndex((s) => s.dataset.mediaId === String(id));
      requestAnimationFrame(() => { if (car && idx >= 0) { car.track.style.scrollBehavior = 'auto'; car.track.scrollLeft = items[idx].offsetLeft - car.track.offsetLeft; car.track.style.scrollBehavior = ''; car.sync(); } });
      if (!modal.bound) { modal.bound = true; modal.addEventListener('click', (e) => { if (e.target.tagName === 'IMG') modal.close(); }); }
    }
  }
  define('product-gallery', ProductGallery);

  class PickupAvailability extends HTMLElement {
    connectedCallback() { this.load(this.dataset.variantId); }
    async load(id) {
      if (!id) { this.innerHTML = ''; return; }
      try {
        const html = await (await fetch(`${this.dataset.baseUrl}variants/${id}/?section_id=store-availability`)).text();
        const fresh = $('[data-pickup]', parseHTML(html));
        this.innerHTML = fresh ? fresh.outerHTML : '';
      } catch (e) { this.innerHTML = ''; }
    }
  }
  define('pickup-availability', PickupAvailability);

  class LazySection extends HTMLElement {
    connectedCallback() {
      const io = new IntersectionObserver((en) => { if (en[0].isIntersecting) { io.disconnect(); this.load(); } }, { rootMargin: '400px' });
      /* a hidden element never intersects: watch its visible parent until content arrives */
      io.observe(this.hidden && this.parentElement ? this.parentElement : this);
    }
    async load() {
      try {
        const doc = parseHTML(await (await fetch(this.dataset.url)).text());
        const fresh = $(this.dataset.select || '[data-recs]', doc);
        if (fresh && fresh.children.length) { const target = $('[data-target]', this) || this; target.innerHTML = fresh.innerHTML; this.hidden = false; T.init && T.init(this); }
        else if (this.dataset.removeEmpty !== 'false') this.closest('.shopify-section')?.classList.add('is-empty');
      } catch (e) { /* ignore */ }
    }
  }
  define('product-recommendations', class extends LazySection {});
  define('complementary-products', class extends LazySection { connectedCallback() { this.dataset.select = '[data-mini-recs]'; super.connectedCallback(); } });

  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-copy-link]'); if (!b) return;
    if (navigator.share) { try { await navigator.share({ url: b.dataset.copyLink }); return; } catch (err) { /* fall back */ } }
    try { await navigator.clipboard.writeText(b.dataset.copyLink); b.classList.add('is-copied'); setTimeout(() => b.classList.remove('is-copied'), 1500); } catch (err) { /* ignore */ }
  });
})();

/* ---------------- facets: AJAX filtering, sort, pagination ---------------- */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const parseHTML = (h) => new DOMParser().parseFromString(h, 'text/html');
  class FacetFilters extends HTMLElement {
    connectedCallback() {
      this.listing = this.closest('.listing');
      this.section = this.dataset.section;
      this.ajax = this.dataset.ajax === 'true';
      const mq = matchMedia('(min-width: 1024px)');
      if (this.listing) this.listing.classList.toggle('filters-open', this.dataset.openDefault === 'true' && mq.matches);
      this.addEventListener('click', (e) => {
        if (e.target.closest('[data-facets-toggle]')) {
          if (mq.matches) { const open = !this.listing.classList.contains('filters-open'); this.listing.classList.toggle('filters-open', open); e.target.closest('[data-facets-toggle]').setAttribute('aria-expanded', open); }
          else this.openPanel(true);
        }
        if (e.target.closest('[data-facets-close]')) this.openPanel(false);
        const link = e.target.closest('[data-facet-link]');
        if (link && this.ajax) { e.preventDefault(); this.load(link.href); }
      });
      this.addEventListener('change', (e) => {
        if (e.target.closest('[data-facet-sort]') || e.target.closest('[data-facets-form]')) {
          clearTimeout(this.t); this.t = setTimeout(() => this.submit(), e.target.type === 'number' ? 600 : 50);
        }
      });
      if (!this.bound) {
        this.bound = true;
        window.addEventListener('popstate', () => this.ajax && this.load(location.href, false));
        this.listing && this.listing.addEventListener('click', (e) => { const a = e.target.closest('.pagination a'); if (a && this.ajax) { e.preventDefault(); this.load(a.href, true, true); } });
      }
      if (this.dataset.autoUnavailable === 'true' && !/filter\.v\.availability/.test(location.search)) {
        const box = $('input[name="filter.v.availability"][value="1"]', this);
        if (box && !box.disabled) { box.checked = true; this.submit(); }
      }
    }
    openPanel(open) { const p = $('[data-facets-panel]', this); if (!p) return; p.classList.toggle('is-open', open); document.documentElement.classList.toggle('scroll-lock', open); }
    submit() {
      const form = $('[data-facets-form]', this);
      const params = new URLSearchParams();
      if (form) new FormData(form).forEach((v, k) => { if (v !== '') params.append(k, v); });
      const sort = $('[data-facet-sort]', this); if (sort) params.set('sort_by', sort.value);
      const base = form ? form.getAttribute('action') : location.pathname;
      const url = `${base}?${params.toString()}`;
      if (!this.ajax) { location.href = url; return; }
      this.load(url);
    }
    async load(url, push = true, scroll = false) {
      this.listing && this.listing.classList.add('is-loading');
      try {
        const u = new URL(url, location.origin); u.searchParams.set('section_id', this.section);
        const doc = parseHTML(await (await fetch(u)).text());
        ['[data-facets-results]', '[data-facets-active]', '[data-facets-count]', '.facets__bar .facets__toggle'].forEach((sel) => {
          const fresh = $(sel, doc); const cur = $(sel, this.listing);
          if (fresh && cur) cur.innerHTML = fresh.innerHTML;
        });
        /* refresh filter groups (counts / disabled states) but keep open state */
        $$('[data-facet]', doc).forEach((fd) => {
          const cur = $(`[data-facet="${fd.dataset.facet}"]`, this);
          if (cur) { const c = $('.accordion__content', cur); const f = $('.accordion__content', fd); if (c && f && !cur.contains(document.activeElement)) c.innerHTML = f.innerHTML; }
        });
        if (push) history.pushState({}, '', url);
        if (scroll) this.listing.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.theme.init && window.theme.init(this.listing);
      } catch (e) { location.href = url; }
      finally { this.listing && this.listing.classList.remove('is-loading'); }
    }
  }
  if (!customElements.get('facet-filters')) customElements.define('facet-filters', FacetFilters);
})();

/* ---------------- video player + FAQ ---------------- */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const define = (n, c) => { if (!customElements.get(n)) customElements.define(n, c); };

  define('video-player', class extends HTMLElement {
    connectedCallback() {
      const btn = $('[data-play]', this); const tpl = $('template', this);
      if (!btn || !tpl) return;
      btn.addEventListener('click', () => {
        const poster = $('.video-player__poster', this);
        poster.innerHTML = ''; poster.appendChild(tpl.content.cloneNode(true));
        this.classList.add('is-playing');
        const v = $('video', poster); v && v.play && v.play().catch(() => {});
      });
    }
  });

  define('faq-header', class extends HTMLElement {
    connectedCallback() {
      const groups = $$('[data-faq-group]');
      const links = $('[data-faq-links]', this);
      if (links) {
        groups.forEach((g) => {
          const t = $('[data-faq-title]', g); if (!t) return;
          const li = document.createElement('li'); const a = document.createElement('a');
          a.href = `#${g.id}`; a.textContent = t.textContent.trim(); li.appendChild(a); links.appendChild(li);
        });
        if (!links.children.length) $('[data-faq-index]', this).hidden = true;
      }
      const input = $('[data-faq-search]', this);
      if (input) input.addEventListener('input', () => {
        const q = input.value.trim().toLowerCase(); let any = false;
        groups.forEach((g) => {
          let groupHit = false;
          $$('[data-faq-item]', g).forEach((it) => {
            const hit = !q || it.textContent.toLowerCase().includes(q);
            it.hidden = !hit; if (hit) groupHit = true;
            if (q && hit) it.open = true;
          });
          g.hidden = !groupHit && !!q; if (groupHit) any = true;
        });
        const none = $('[data-faq-none]', this); if (none) none.hidden = any || !q;
      });
    }
  });
})();

/* ---------------- login panels, address country default, shipping calculator ---------------- */
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  if (!customElements.get('login-tabs')) customElements.define('login-tabs', class extends HTMLElement {
    connectedCallback() {
      const show = (name) => $$('[data-panel]', this).forEach((p) => { p.hidden = p.dataset.panel !== name; });
      this.addEventListener('click', (e) => { const a = e.target.closest('[data-show]'); if (a) { e.preventDefault(); show(a.dataset.show); } });
      if (location.hash === '#recover' || $('[data-recover-success]', this)) show('recover');
    }
  });
  $$('select[data-default]').forEach((s) => { if (s.dataset.default) s.value = s.dataset.default; });
  if (!customElements.get('shipping-calculator')) customElements.define('shipping-calculator', class extends HTMLElement {
    connectedCallback() {
      const country = $('[data-country]', this), prov = $('[data-province]', this), wrap = $('[data-province-wrap]', this);
      const fill = () => {
        const opt = country.selectedOptions[0]; const list = opt ? JSON.parse(opt.dataset.provinces || '[]') : [];
        wrap.hidden = !list.length; prov.innerHTML = list.map((p) => `<option value="${p[0]}">${p[1]}</option>`).join('');
      };
      if (this.dataset.defaultCountry) { const o = [...country.options].find((x) => x.value === this.dataset.defaultCountry || x.textContent.trim() === this.dataset.defaultCountry); if (o) country.value = o.value; }
      country.addEventListener('change', fill); fill();
      $('[data-calc]', this).addEventListener('click', async () => {
        const out = $('[data-result]', this); out.textContent = '...';
        const q = new URLSearchParams({ 'shipping_address[country]': country.value, 'shipping_address[province]': prov.value || '', 'shipping_address[zip]': $('[data-zip]', this).value });
        try {
          const pre = await fetch(`/cart/prepare_shipping_rates.json?${q}`, { method: 'POST' });
          if (!pre.ok) { const err = await pre.json(); out.textContent = Object.values(err).flat().join(' '); return; }
          let data = null;
          for (let i = 0; i < 10 && !data; i++) { const r = await fetch(`/cart/async_shipping_rates.json?${q}`); const j = await r.json(); if (j.shipping_rates) data = j; else await new Promise((res) => setTimeout(res, 500)); }
          const rates = (data && data.shipping_rates) || [];
          out.innerHTML = rates.length ? `<ul>${rates.map((r) => `<li>${r.name}: ${window.theme.formatMoney(Math.round(parseFloat(r.price) * 100))}</li>`).join('')}</ul>` : '-';
        } catch (e) { out.textContent = window.theme.strings.cartError; }
      });
    }
  });
})();
