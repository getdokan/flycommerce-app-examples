// Runs on the store's own pages, so it touches nothing of theirs: its own element, styled inside a shadow root.
(() => {
  const ID = 'order-export-welcome';
  if (document.getElementById(ID)) return;

  const GREETINGS = {
    product: 'Hi! Any questions about this product?',
    default: 'Hi! Are you looking for something?',
  };
  const greeting = (pageType) => GREETINGS[pageType] ?? GREETINGS.default;

  const host = document.createElement('div');
  host.id = ID;
  const root = host.attachShadow({ mode: 'open' });

  root.innerHTML = `
    <style>
      :host { all: initial; }
      aside {
        position: fixed;
        bottom: 16px;
        inset-inline-end: 16px;
        z-index: 2147483000;
        display: flex;
        align-items: flex-start;
        gap: 8px;
        max-width: min(300px, calc(100vw - 32px));
        padding: 12px 8px 12px 14px;
        border-radius: 14px;
        background: #ffffff;
        color: #1f2328;
        box-shadow: 0 6px 24px rgb(0 0 0 / 0.16);
        font: 14px/1.4 system-ui, -apple-system, 'Segoe UI', sans-serif;
        animation: rise 240ms ease-out;
      }
      p { margin: 0; flex: 1; }
      strong { display: block; margin-bottom: 2px; }
      button {
        flex: none;
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 8px;
        background: transparent;
        color: inherit;
        font: 20px/1 system-ui, sans-serif;
        cursor: pointer;
      }
      button:hover { background: rgb(0 0 0 / 0.06); }
      button:focus-visible { outline: 2px solid #2563eb; outline-offset: 1px; }
      @keyframes rise { from { opacity: 0; transform: translateY(8px); } }
      @media (prefers-reduced-motion: reduce) { aside { animation: none; } }
      @media (prefers-color-scheme: dark) {
        aside { background: #22262b; color: #f2f4f7; }
        button:hover { background: rgb(255 255 255 / 0.1); }
      }
    </style>
    <aside aria-label="Welcome message" aria-live="polite">
      <p><strong>Welcome 👋</strong><span></span></p>
      <button type="button" aria-label="Close">×</button>
    </aside>
  `;

  const text = root.querySelector('span');
  text.textContent = greeting(window.FlyCommerce?.pageType);

  const follow = (event) => {
    text.textContent = greeting(event.detail.pageType);
  };
  window.addEventListener('flycommerce:page', follow);

  // Closed stays closed while the shopper browses: the storefront keeps this script across page changes.
  root.querySelector('button').addEventListener('click', () => {
    host.remove();
    window.removeEventListener('flycommerce:page', follow);
  });

  document.body.append(host);
})();
