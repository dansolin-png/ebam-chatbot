(function () {
  'use strict';

  if (document.getElementById('ebam-btn')) return;

  var API       = 'https://api.buzzybrains.net';
  var cfg       = window.EBAMChat || {};
  var AUDIENCE  = cfg.audience || null;

  /* ── Color tokens (from original React ChatWidget) ─────────────────── */
  var NAVY      = '#0d1b2a';
  var NAVY_MID  = '#162032';
  var NAVY_LT   = '#1e2d40';
  var GOLD      = '#c9a84c';
  var GOLD_LT   = '#e0c070';
  var WHITE     = '#f8f6f1';
  var BUBBLE_AI = '#1a2840';
  var BUBBLE_US = '#1a3a5c';

  /* ── Styles ─────────────────────────────────────────────────────────── */
  var style = document.createElement('style');
  style.textContent = [
    '@keyframes ebam-typing{0%,60%,100%{opacity:.3;transform:translateY(0);}30%{opacity:1;transform:translateY(-4px);}}',
    '@keyframes ebam-fadein{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}',
    '@keyframes ebam-pulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.4;transform:scale(1.08);}}',

    /* FAB */
    '#ebam-btn{position:fixed;bottom:24px;right:24px;z-index:99999;',
    'width:56px;height:56px;border-radius:50%;background:' + NAVY + ';',
    'color:' + WHITE + ';border:2px solid ' + GOLD + ';display:flex;',
    'align-items:center;justify-content:center;cursor:pointer;',
    'box-shadow:0 6px 24px rgba(13,27,42,.45);transition:transform .2s,box-shadow .2s;}',

    /* panel */
    '#ebam-win{position:fixed;bottom:88px;right:24px;z-index:99998;',
    'width:420px;max-height:640px;display:none;flex-direction:column;',
    'border-radius:20px;overflow:hidden;',
    'box-shadow:0 24px 64px rgba(0,0,0,.5);',
    'font-family:"DM Sans",-apple-system,sans-serif;}',
    '#ebam-win.open{display:flex;}',

    /* header */
    '#ebam-header{background:linear-gradient(135deg,' + NAVY_MID + ' 0%,' + NAVY_LT + ' 100%);',
    'border:1px solid rgba(201,168,76,.25);border-bottom:none;',
    'padding:22px 28px;display:flex;align-items:center;gap:16px;flex-shrink:0;}',
    '#ebam-avatar{width:50px;height:50px;border-radius:50%;',
    'background:linear-gradient(135deg,' + GOLD + ',' + GOLD_LT + ');',
    'display:flex;align-items:center;justify-content:center;font-size:20px;',
    'flex-shrink:0;box-shadow:0 4px 16px rgba(201,168,76,.3);',
    'animation:ebam-pulse 2.5s ease-in-out infinite;}',
    '#ebam-header-title{font-family:"Playfair Display",Georgia,serif;',
    'font-size:1.1rem;color:' + WHITE + ';font-weight:600;}',
    '#ebam-header-sub{font-size:.72rem;color:' + GOLD + ';margin-top:2px;',
    'letter-spacing:.06em;text-transform:uppercase;}',
    '#ebam-online{margin-left:auto;font-size:.72rem;color:#5dba8a;font-weight:500;white-space:nowrap;}',
    '#ebam-close{background:none;border:none;color:rgba(255,255,255,.4);',
    'font-size:18px;cursor:pointer;padding:0;line-height:1;margin-left:8px;}',

    /* messages area */
    '#ebam-msgs{background:' + NAVY_MID + ';',
    'border-left:1px solid rgba(201,168,76,.2);border-right:1px solid rgba(201,168,76,.2);',
    'flex:1;overflow-y:auto;padding:26px 26px 12px;',
    'display:flex;flex-direction:column;gap:16px;max-height:430px;}',

    /* message rows */
    '.ebam-bot-row{display:flex;gap:10px;max-width:88%;align-items:flex-start;',
    'animation:ebam-fadein .3s ease both;}',
    '.ebam-user-row{display:flex;justify-content:flex-end;gap:10px;max-width:88%;',
    'align-self:flex-end;flex-direction:row-reverse;animation:ebam-fadein .3s ease both;}',

    /* avatars */
    '.ebam-av{width:32px;height:32px;border-radius:50%;flex-shrink:0;margin-top:3px;',
    'display:flex;align-items:center;justify-content:center;font-size:13px;}',
    '.ebam-av-bot{background:linear-gradient(135deg,' + GOLD + ',' + GOLD_LT + ');',
    'box-shadow:0 2px 8px rgba(201,168,76,.25);}',
    '.ebam-av-user{background:' + BUBBLE_US + ';border:1px solid rgba(201,168,76,.2);',
    'color:' + GOLD + ';font-size:10px;font-weight:700;}',

    /* bubbles */
    '.ebam-bubble{padding:13px 17px;font-size:.91rem;line-height:1.65;',
    'color:rgba(248,246,241,.92);font-weight:300;word-break:break-word;}',
    '.ebam-bubble p{margin:0 0 8px;}.ebam-bubble p:last-child{margin:0;}',
    '.ebam-bbl-bot{background:' + BUBBLE_AI + ';border:1px solid rgba(201,168,76,.12);',
    'border-radius:4px 15px 15px 15px;box-shadow:0 4px 14px rgba(0,0,0,.2);}',
    '.ebam-bbl-user{background:' + BUBBLE_US + ';border:1px solid rgba(201,168,76,.2);',
    'border-radius:15px 4px 15px 15px;}',

    /* typing */
    '.ebam-typing-ind{display:flex;align-items:center;gap:5px;padding:12px 16px;',
    'background:' + BUBBLE_AI + ';border:1px solid rgba(201,168,76,.12);',
    'border-radius:15px;border-top-left-radius:4px;}',
    '.ebam-td{width:7px;height:7px;background:' + GOLD + ';border-radius:50%;opacity:.4;',
    'display:inline-block;animation:ebam-typing 1.2s ease-in-out infinite;}',
    '.ebam-td:nth-child(2){animation-delay:.2s;}.ebam-td:nth-child(3){animation-delay:.4s;}',

    /* audience picker */
    '#ebam-pick{background:' + NAVY_MID + ';',
    'border-left:1px solid rgba(201,168,76,.2);border-right:1px solid rgba(201,168,76,.2);',
    'padding:0 26px 16px;flex-shrink:0;}',
    '#ebam-pick-btns{display:flex;gap:12px;}',
    '.ebam-pick-btn{flex:1;padding:13px 8px;border-radius:12px;',
    'border:1px solid rgba(201,168,76,.4);background:rgba(201,168,76,.06);',
    'color:' + WHITE + ';font-family:"DM Sans",sans-serif;font-size:.9rem;font-weight:500;',
    'cursor:pointer;text-align:center;transition:all .2s;}',
    '.ebam-pick-btn:hover{background:rgba(201,168,76,.15);border-color:' + GOLD + ';}',
    '.ebam-pick-icon{display:block;font-size:1.4rem;margin-bottom:4px;}',

    /* quick replies */
    '.ebam-opts{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px;padding:0 26px 0;',
    'background:' + NAVY_MID + ';}',
    '.ebam-opt{background:transparent;border:1px solid rgba(201,168,76,.35);',
    'color:' + GOLD_LT + ';padding:7px 14px;border-radius:20px;',
    'font-size:.79rem;font-family:"DM Sans",sans-serif;cursor:pointer;',
    'transition:all .2s;}',
    '.ebam-opt:hover{background:rgba(201,168,76,.1);border-color:' + GOLD + ';}',
    '.ebam-opt:disabled{opacity:.4;cursor:not-allowed;}',

    /* input footer */
    '#ebam-input-row{background:' + NAVY_LT + ';',
    'border:1px solid rgba(201,168,76,.2);border-top:1px solid rgba(201,168,76,.1);',
    'padding:14px 18px;display:none;gap:10px;align-items:flex-end;flex-shrink:0;}',
    '#ebam-input{flex:1;background:' + NAVY_MID + ';',
    'border:1px solid rgba(201,168,76,.2);border-radius:12px;',
    'padding:11px 15px;color:' + WHITE + ';font-family:"DM Sans",sans-serif;',
    'font-size:.88rem;font-weight:300;resize:none;min-height:44px;',
    'line-height:1.5;outline:none;}',
    '#ebam-input::placeholder{color:rgba(248,246,241,.35);}',
    '#ebam-send{width:44px;height:44px;flex-shrink:0;',
    'background:linear-gradient(135deg,' + GOLD + ',' + GOLD_LT + ');',
    'border:none;border-radius:11px;cursor:pointer;',
    'display:flex;align-items:center;justify-content:center;',
    'box-shadow:0 4px 12px rgba(201,168,76,.25);transition:all .2s;}',
    '#ebam-send:disabled{opacity:.4;cursor:not-allowed;}',

    /* branding */
    '#ebam-footer{padding:8px 18px;font-size:.7rem;',
    'color:rgba(138,155,176,.45);letter-spacing:.04em;text-align:center;',
    'background:' + NAVY_LT + ';',
    'border-left:1px solid rgba(201,168,76,.2);border-right:1px solid rgba(201,168,76,.2);',
    'border-bottom:1px solid rgba(201,168,76,.2);',
    'border-bottom-left-radius:20px;border-bottom-right-radius:20px;flex-shrink:0;}'
  ].join('');
  document.head.appendChild(style);

  /* ── DOM ─────────────────────────────────────────────────────────────── */
  var btn = document.createElement('button');
  btn.id = 'ebam-btn';
  btn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var win = document.createElement('div');
  win.id = 'ebam-win';
  win.innerHTML = [
    '<div id="ebam-header">',
    '  <div id="ebam-avatar">\uD83C\uDFAC</div>',
    '  <div style="flex:1">',
    '    <div id="ebam-header-title">Avatar Marketing Assistant</div>',
    '    <div id="ebam-header-sub">Evidence Based Advisor Marketing</div>',
    '  </div>',
    '  <span id="ebam-online">Online</span>',
    '  <button id="ebam-close" title="Close">\u2715</button>',
    '</div>',
    '<div id="ebam-msgs"></div>',
    '<div id="ebam-pick" style="display:none">',
    '  <div id="ebam-pick-btns">',
    '    <button class="ebam-pick-btn" data-aud="advisor"><span class="ebam-pick-icon">\uD83D\uDCBC</span>Financial Advisor</button>',
    '    <button class="ebam-pick-btn" data-aud="cpa"><span class="ebam-pick-icon">\uD83E\uDDFE</span>CPA</button>',
    '  </div>',
    '</div>',
    '<div id="ebam-input-row">',
    '  <input id="ebam-input" placeholder="Type your question here..." autocomplete="off"/>',
    '  <button id="ebam-send">',
    '    <svg viewBox="0 0 24 24" style="width:18px;height:18px;fill:#0d1b2a"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
    '  </button>',
    '</div>',
    '<div id="ebam-footer">Powered by <span style="color:rgba(201,168,76,.45)">Evidence Based Advisor Marketing</span></div>'
  ].join('');

  document.body.appendChild(btn);
  document.body.appendChild(win);

  /* ── State ───────────────────────────────────────────────────────────── */
  var sessionId      = null;
  var sessionState   = null;  // held client-side until name+email captured and session persisted to DB
  var busy           = false;
  var greetingBubble = null;
  var preloaded      = {};   // { advisor: {session_id, message, options, session_state}, cpa: {...} }

  /* ── Helpers ─────────────────────────────────────────────────────────── */
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

  function botAvatar() {
    return '<div class="ebam-av ebam-av-bot">\uD83C\uDFAC</div>';
  }

  function addBotBubble(html) {
    var row = document.createElement('div');
    row.className = 'ebam-bot-row';
    row.innerHTML = botAvatar()
      + '<div class="ebam-bubble ebam-bbl-bot">' + html + '</div>';
    $('ebam-msgs').appendChild(row);
    scrollBottom();
    return row;
  }

  function addUserBubble(text) {
    var row = document.createElement('div');
    row.className = 'ebam-user-row';
    row.innerHTML = '<div class="ebam-bubble ebam-bbl-user">' + escHtml(text) + '</div>'
      + '<div class="ebam-av ebam-av-user">YOU</div>';
    $('ebam-msgs').appendChild(row);
    scrollBottom();
  }

  function escHtml(t) {
    return t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function showTyping() {
    var row = document.createElement('div');
    row.className = 'ebam-bot-row';
    row.id = 'ebam-typing-row';
    row.innerHTML = botAvatar()
      + '<div class="ebam-typing-ind">'
      + '<span class="ebam-td"></span><span class="ebam-td"></span><span class="ebam-td"></span>'
      + '</div>';
    $('ebam-msgs').appendChild(row);
    scrollBottom();
  }

  function removeTyping() {
    var t = $('ebam-typing-row');
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
        wrap.querySelectorAll('.ebam-opt').forEach(function(x){ x.disabled = true; });
        addUserBubble(opt);
        sendMsg(opt);
      };
      wrap.appendChild(b);
    });
    $('ebam-msgs').appendChild(wrap);
    scrollBottom();
  }

  /* ── API ─────────────────────────────────────────────────────────────── */
  function applyResponse(data) {
    removeTyping();
    busy = false;
    addBotBubble(renderText(data.message));
    if (data.is_end) { setInputVisible(false); return; }
    if (data.options && data.options.length) showOptions(data.options);
    setInputVisible(true);
  }

  function startChat(audience) {
    setPickerVisible(false);
    if (greetingBubble && greetingBubble.parentNode) {
      greetingBubble.parentNode.removeChild(greetingBubble);
      greetingBubble = null;
    }

    // Use preloaded response if ready, otherwise fetch now
    if (preloaded[audience]) {
      var cached = preloaded[audience];
      delete preloaded[audience];
      sessionId    = cached.session_id;
      sessionState = cached.session_state || null;
      applyResponse(cached);
      return;
    }

    busy = true;
    showTyping();
    fetch(API + '/api/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience: audience })
    })
    .then(function(r){ return r.json(); })
    .then(function(data){ sessionId = data.session_id; sessionState = data.session_state || null; applyResponse(data); })
    .catch(function(){
      removeTyping(); busy = false;
      addBotBubble('Sorry, something went wrong. Please try again.');
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
      body: JSON.stringify({ session_id: sessionId, user_message: text, session_state: sessionState })
    })
    .then(function(r){ return r.json(); })
    .then(function(data){ sessionState = data.session_state || null; applyResponse(data); })
    .catch(function(){
      removeTyping(); busy = false;
      addBotBubble('Sorry, something went wrong. Please try again.');
      setInputVisible(true);
    });
  }

  /* ── Events ──────────────────────────────────────────────────────────── */
  var ICON_CHAT = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
  var ICON_CLOSE = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';

  var greeted = false;

  function preloadAudience(audience) {
    fetch(API + '/api/chat/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audience: audience })
    })
    .then(function(r){ return r.json(); })
    .then(function(data){ preloaded[audience] = data; })
    .catch(function(){});
  }

  function initWidget() {
    if (greeted) return;
    greeted = true;
    fetch(API + '/api/chat/config')
      .then(function(r){ return r.json(); })
      .then(function(data){
        if (data.greeting) greetingBubble = addBotBubble(renderText(data.greeting));
        if (AUDIENCE) {
          startChat(AUDIENCE);
        } else {
          // preload both in background while user reads the greeting
          preloadAudience('advisor');
          preloadAudience('cpa');
          setPickerVisible(true);
        }
      })
      .catch(function(){
        if (AUDIENCE) { startChat(AUDIENCE); } else { setPickerVisible(true); }
      });
  }

  btn.addEventListener('click', function() {
    win.classList.toggle('open');
    if (win.classList.contains('open')) {
      btn.innerHTML = ICON_CLOSE;
      if (!sessionId) initWidget();
    } else {
      btn.innerHTML = ICON_CHAT;
    }
  });

  $('ebam-close').addEventListener('click', function() {
    win.classList.remove('open');
    btn.innerHTML = ICON_CHAT;
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
    addUserBubble(val);
    sendMsg(val);
  });

  $('ebam-input').addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      $('ebam-send').click();
    }
  });

})();
