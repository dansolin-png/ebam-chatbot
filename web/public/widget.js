(function () {
  'use strict';

  var API = 'https://l7ha0wuja1.execute-api.us-east-1.amazonaws.com';
  var cfg = window.EBAMChat || {};
  var AUDIENCE = cfg.audience || null; // 'advisor' | 'cpa' | null (show picker)
  var ACCENT   = cfg.accentColor || '#1e3a5f';
  var LABEL    = cfg.buttonLabel || 'Chat with us';

  /* ── Inject styles ─────────────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = [
    '#ebam-btn{position:fixed;bottom:24px;right:24px;z-index:99999;',
    'background:' + ACCENT + ';color:#fff;border:none;border-radius:50px;',
    'padding:13px 20px;font-size:14px;font-weight:600;cursor:pointer;',
    'box-shadow:0 4px 16px rgba(0,0,0,.22);display:flex;align-items:center;gap:8px;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',

    '#ebam-win{position:fixed;bottom:88px;right:24px;z-index:99998;',
    'width:360px;height:540px;background:#fff;border-radius:16px;',
    'box-shadow:0 8px 40px rgba(0,0,0,.18);display:none;flex-direction:column;',
    'overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',

    '#ebam-win.open{display:flex;}',

    '#ebam-header{background:' + ACCENT + ';color:#fff;padding:14px 16px;',
    'display:flex;justify-content:space-between;align-items:center;flex-shrink:0;}',
    '#ebam-header span{font-weight:700;font-size:15px;}',
    '#ebam-close{background:none;border:none;color:rgba(255,255,255,.8);',
    'font-size:20px;cursor:pointer;line-height:1;padding:0 2px;}',

    '#ebam-msgs{flex:1;overflow-y:auto;padding:14px 12px;display:flex;',
    'flex-direction:column;gap:8px;}',

    '.ebam-bubble{max-width:82%;padding:9px 12px;border-radius:12px;',
    'font-size:13px;line-height:1.5;word-break:break-word;}',
    '.ebam-bubble p{margin:0 0 6px 0;}.ebam-bubble p:last-child{margin:0;}',
    '.ebam-bot{background:#f1f5f9;color:#1e293b;align-self:flex-start;',
    'border-radius:4px 12px 12px 12px;}',
    '.ebam-user{background:' + ACCENT + ';color:#fff;align-self:flex-end;',
    'border-radius:12px 4px 12px 12px;}',

    '.ebam-opts{display:flex;flex-direction:column;gap:6px;margin-top:4px;}',
    '.ebam-opt{background:#fff;border:1.5px solid ' + ACCENT + ';color:' + ACCENT + ';',
    'border-radius:8px;padding:8px 12px;font-size:13px;font-weight:500;',
    'cursor:pointer;text-align:left;transition:background .15s,color .15s;}',
    '.ebam-opt:hover{background:' + ACCENT + ';color:#fff;}',
    '.ebam-opt:disabled{opacity:.45;cursor:not-allowed;}',

    '#ebam-pick{padding:12px;border-top:1px solid #e2e8f0;flex-shrink:0;}',
    '#ebam-pick p{font-size:12px;color:#64748b;margin:0 0 8px 0;font-weight:600;',
    'text-transform:uppercase;letter-spacing:.04em;}',
    '#ebam-pick-btns{display:flex;gap:8px;}',
    '.ebam-pick-btn{flex:1;padding:9px;border-radius:8px;border:1.5px solid ' + ACCENT + ';',
    'background:#fff;color:' + ACCENT + ';font-size:13px;font-weight:600;cursor:pointer;}',
    '.ebam-pick-btn:hover{background:' + ACCENT + ';color:#fff;}',

    '#ebam-input-row{display:flex;gap:8px;padding:10px 12px;',
    'border-top:1px solid #e2e8f0;flex-shrink:0;}',
    '#ebam-input{flex:1;border:1.5px solid #e2e8f0;border-radius:8px;',
    'padding:8px 11px;font-size:13px;outline:none;',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}',
    '#ebam-send{background:' + ACCENT + ';color:#fff;border:none;border-radius:8px;',
    'padding:8px 14px;font-size:13px;font-weight:600;cursor:pointer;}',
    '#ebam-send:disabled{opacity:.45;cursor:not-allowed;}',

    '.ebam-typing{display:flex;gap:4px;align-items:center;padding:10px 12px;}',
    '.ebam-dot{width:7px;height:7px;background:#94a3b8;border-radius:50%;',
    'animation:ebam-bounce .9s infinite;}',
    '.ebam-dot:nth-child(2){animation-delay:.15s;}',
    '.ebam-dot:nth-child(3){animation-delay:.3s;}',
    '@keyframes ebam-bounce{0%,80%,100%{transform:translateY(0);}40%{transform:translateY(-6px);}}'
  ].join('');
  document.head.appendChild(style);

  /* ── DOM ────────────────────────────────────────────────────────────── */
  var btn = document.createElement('button');
  btn.id = 'ebam-btn';
  btn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' + LABEL;

  var win = document.createElement('div');
  win.id = 'ebam-win';
  win.innerHTML = [
    '<div id="ebam-header">',
    '  <span>EBAM AI Assistant</span>',
    '  <button id="ebam-close" title="Close">✕</button>',
    '</div>',
    '<div id="ebam-msgs"></div>',
    // audience picker (shown when AUDIENCE not pre-set)
    '<div id="ebam-pick" style="display:none">',
    '  <p>I am a…</p>',
    '  <div id="ebam-pick-btns">',
    '    <button class="ebam-pick-btn" data-aud="advisor">Financial Advisor</button>',
    '    <button class="ebam-pick-btn" data-aud="cpa">CPA / Accountant</button>',
    '  </div>',
    '</div>',
    '<div id="ebam-input-row" style="display:none">',
    '  <input id="ebam-input" placeholder="Type a message…" autocomplete="off"/>',
    '  <button id="ebam-send">Send</button>',
    '</div>'
  ].join('');

  document.body.appendChild(btn);
  document.body.appendChild(win);

  /* ── State ──────────────────────────────────────────────────────────── */
  var sessionId = null;
  var busy      = false;

  /* ── Helpers ────────────────────────────────────────────────────────── */
  function $(id) { return document.getElementById(id); }

  function renderText(text) {
    if (!text) return '';
    var t = text.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    t = t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    return t.split(/\n\n+/)
      .map(function(p) { return '<p>' + p.replace(/\n/g, '<br>') + '</p>'; })
      .join('');
  }

  function scrollBottom() {
    var m = $('ebam-msgs');
    m.scrollTop = m.scrollHeight;
  }

  function addBubble(role, html) {
    var d = document.createElement('div');
    d.className = 'ebam-bubble ' + (role === 'bot' ? 'ebam-bot' : 'ebam-user');
    d.innerHTML = html;
    $('ebam-msgs').appendChild(d);
    scrollBottom();
    return d;
  }

  function showTyping() {
    var d = document.createElement('div');
    d.className = 'ebam-typing ebam-bot ebam-bubble';
    d.id = 'ebam-typing';
    d.innerHTML = '<div class="ebam-dot"></div><div class="ebam-dot"></div><div class="ebam-dot"></div>';
    $('ebam-msgs').appendChild(d);
    scrollBottom();
  }

  function removeTyping() {
    var t = $('ebam-typing');
    if (t) t.parentNode.removeChild(t);
  }

  function setInputVisible(v) {
    $('ebam-input-row').style.display = v ? 'flex' : 'none';
    if (v) { setTimeout(function(){ $('ebam-input').focus(); }, 50); }
  }

  function setPickerVisible(v) {
    $('ebam-pick').style.display = v ? 'block' : 'none';
  }

  function showOptions(opts) {
    var wrap = document.createElement('div');
    wrap.className = 'ebam-opts';
    opts.forEach(function(opt) {
      var b = document.createElement('button');
      b.className = 'ebam-opt';
      b.textContent = opt;
      b.onclick = function() {
        // disable all option buttons
        wrap.querySelectorAll('.ebam-opt').forEach(function(x){ x.disabled = true; });
        addBubble('user', opt);
        sendMsg(opt);
      };
      wrap.appendChild(b);
    });
    $('ebam-msgs').appendChild(wrap);
    scrollBottom();
  }

  /* ── API ────────────────────────────────────────────────────────────── */
  function applyResponse(data) {
    removeTyping();
    busy = false;
    addBubble('bot', renderText(data.message));
    if (data.is_end) {
      setInputVisible(false);
      return;
    }
    if (data.options && data.options.length) {
      showOptions(data.options);
      setInputVisible(false);
    } else {
      setInputVisible(true);
    }
  }

  function startChat(audience) {
    setPickerVisible(false);
    busy = true;
    showTyping();
    fetch(API + '/api/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience: audience })
    })
    .then(function(r){ return r.json(); })
    .then(function(data){
      sessionId = data.session_id;
      applyResponse(data);
    })
    .catch(function(){
      removeTyping();
      busy = false;
      addBubble('bot', 'Sorry, something went wrong. Please try again.');
    });
  }

  function sendMsg(text) {
    if (busy || !text.trim() || !sessionId) return;
    busy = true;
    setInputVisible(false);
    showTyping();
    fetch(API + '/api/chat/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, user_message: text })
    })
    .then(function(r){ return r.json(); })
    .then(applyResponse)
    .catch(function(){
      removeTyping();
      busy = false;
      addBubble('bot', 'Sorry, something went wrong. Please try again.');
      setInputVisible(true);
    });
  }

  /* ── Events ─────────────────────────────────────────────────────────── */
  btn.addEventListener('click', function() {
    win.classList.toggle('open');
    if (win.classList.contains('open') && !sessionId) {
      if (AUDIENCE) {
        startChat(AUDIENCE);
      } else {
        setPickerVisible(true);
      }
    }
  });

  $('ebam-close').addEventListener('click', function() {
    win.classList.remove('open');
  });

  $('ebam-pick-btns').addEventListener('click', function(e) {
    var b = e.target.closest('.ebam-pick-btn');
    if (b) startChat(b.dataset.aud);
  });

  $('ebam-send').addEventListener('click', function() {
    var inp = $('ebam-input');
    var val = inp.value.trim();
    if (!val) return;
    inp.value = '';
    addBubble('user', val);
    sendMsg(val);
  });

  $('ebam-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('ebam-send').click();
    }
  });

})();
