// Shopping Assistant: a chat bubble in its own shadow root. It asks this app's server, never reads the page, and puts
// products in the cart only through the store's own actions, so the store announces it and offers Undo.
(function () {
  var APP_ID = __APP_ID__;
  var APP_URL = __APP_URL__;
  var store = window.FlyCommerce;

  if (!store || typeof store.shopperToken !== 'function' || document.getElementById('flycom-shopping-assistant'))
    return;

  var host = document.createElement('div');
  host.id = 'flycom-shopping-assistant';
  var root = host.attachShadow({ mode: 'open' });

  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '.wrap{position:fixed;bottom:20px;right:20px;z-index:2147483000;display:flex;flex-direction:column;align-items:flex-end;gap:8px;font:14px/1.45 system-ui,sans-serif;color:#1d2433}' +
    '.toggle{border:0;border-radius:999px;padding:12px 18px;background:#1d2433;color:#fff;cursor:pointer;font:inherit}' +
    '.panel{display:none;flex-direction:column;width:320px;max-height:min(480px,calc(100vh - 100px));border-radius:14px;background:#fff;box-shadow:0 10px 32px rgba(0,0,0,.18);overflow:hidden}' +
    '.panel.open{display:flex}' +
    '.head{padding:12px 14px;background:#1d2433;color:#fff;font-weight:600}' +
    '.log{flex:1;overflow:auto;padding:12px;display:flex;flex-direction:column;gap:8px}' +
    '.me{align-self:flex-end;background:#1d2433;color:#fff;border-radius:12px 12px 2px 12px;padding:6px 10px;max-width:85%}' +
    '.bot{align-self:flex-start;background:#f1f3f6;border-radius:12px 12px 12px 2px;padding:8px 10px;max-width:92%}' +
    '.card{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;padding:6px 8px;background:#fff;border:1px solid #e3e6eb;border-radius:8px}' +
    '.card b{font-weight:600}.card small{color:#5b6475}' +
    '.row{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}' +
    '.row button,.card button{font:inherit;font-size:12px;border:1px solid #c9ced8;background:#fff;border-radius:999px;padding:3px 9px;cursor:pointer}' +
    '.card button.add{background:#1d2433;color:#fff;border-color:#1d2433}' +
    'form{display:flex;gap:6px;padding:10px;border-top:1px solid #e3e6eb}' +
    'input{flex:1;padding:8px;border:1px solid #c9ced8;border-radius:8px;font:inherit}' +
    'form button{font:inherit;border:0;border-radius:8px;padding:0 12px;background:#1d2433;color:#fff;cursor:pointer}' +
    'button:focus-visible,input:focus-visible{outline:2px solid #2563eb;outline-offset:2px}' +
    '</style>' +
    '<div class="wrap">' +
    '<div class="panel" role="dialog" aria-label="Shopping assistant">' +
    '<div class="head">Shopping assistant</div>' +
    '<div class="log" aria-live="polite"></div>' +
    '<form><input aria-label="Ask the shopping assistant" placeholder="Search products or ask about an order" maxlength="300"><button>Send</button></form>' +
    '</div>' +
    '<button class="toggle" aria-expanded="false">Ask us</button>' +
    '</div>';

  var panel = root.querySelector('.panel');
  var toggle = root.querySelector('.toggle');
  var log = root.querySelector('.log');
  var input = root.querySelector('input');
  var greeted = false;

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, onClick, className) {
    var node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', onClick);
    return node;
  }

  function say(text) {
    var bubble = el('div', 'bot', text);
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  }

  async function ask(message, quiet) {
    if (!quiet) log.appendChild(el('div', 'me', message));
    var waiting = say('…');

    try {
      // A fresh token per question, so signing in or out counts from the next one.
      var credential = await store.shopperToken(APP_ID);
      if (!credential) throw new Error("This store isn't set up for the assistant yet.");

      var response = await fetch(APP_URL + '/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + credential },
        body: JSON.stringify({ message: message }),
      });
      var body = await response.json().catch(function () {
        return {};
      });
      if (!response.ok) throw new Error(body.message || 'Something went wrong. Try again.');

      waiting.remove();
      show(body);
    } catch (error) {
      waiting.textContent = error.message;
    }
  }

  function show(reply) {
    var bubble = say(reply.text);

    (reply.products || []).forEach(function (product) {
      var card = el('div', 'card');
      var label = el('div');
      label.appendChild(el('b', '', product.title));
      label.appendChild(el('br'));
      label.appendChild(el('small', '', product.price.toFixed(2) + ' ' + (store.currency || '')));
      card.appendChild(label);

      var actions = el('div', 'row');
      if (typeof store.run === 'function') {
        actions.appendChild(
          button(
            'Add to cart',
            function () {
              addToCart(product);
            },
            'add'
          )
        );
        actions.appendChild(
          button('View', function () {
            store.run('nav.goto', { to: 'product', slug: product.slug });
          })
        );
      } else {
        var link = el('a', '', 'View');
        link.href = '/products/' + encodeURIComponent(product.slug);
        actions.appendChild(link);
      }
      card.appendChild(actions);
      bubble.appendChild(card);
    });

    (reply.orders || []).forEach(function (order) {
      bubble.appendChild(
        el('div', 'card', '#' + order.orderNo + ' · ' + order.status + ' · ' + order.total + ' · ' + order.placedOn)
      );
    });

    if (reply.suggestions && reply.suggestions.length) {
      var row = el('div', 'row');
      reply.suggestions.forEach(function (suggestion) {
        row.appendChild(
          button(suggestion, function () {
            ask(suggestion);
          })
        );
      });
      bubble.appendChild(row);
    }
    log.scrollTop = log.scrollHeight;
  }

  // The shopper clicked, so the store adds it: its notice and Undo tell them, and its limits apply.
  async function addToCart(product) {
    var added = await store.run('cart.add', { items: [{ productId: product.id, quantity: 1 }] });

    if (!added.ok) {
      say(added.error);
      return;
    }

    // No count here: the shopper can change the cart elsewhere, and this message would go stale.
    var bubble = say('Added ' + product.title + ' to your cart.');
    var row = el('div', 'row');
    row.appendChild(
      button('Open cart', function () {
        store.run('ui.openCart');
      })
    );
    bubble.appendChild(row);
  }

  toggle.addEventListener('click', function () {
    var open = panel.classList.toggle('open');
    toggle.setAttribute('aria-expanded', String(open));
    if (open && !greeted) {
      greeted = true;
      // The server's greeting names this store's own products.
      ask('hi', true);
    }
    if (open) input.focus();
  });

  root.querySelector('form').addEventListener('submit', function (event) {
    event.preventDefault();
    var message = input.value.trim();
    if (!message) return;
    input.value = '';
    ask(message);
  });

  document.body.appendChild(host);
})();
