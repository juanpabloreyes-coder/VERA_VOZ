/* =====================================================================
   GCPeasa Vector · Asistente de voz "Vera"  (widget v3: control total de Vector)
   ---------------------------------------------------------------------
   Módulo independiente. Lo sirve el Worker vera-voz en /widget.js y
   vector-config.js lo carga en Vector. Funciones:
     · conversación por voz y por escrito (todo queda transcrito)
     · control de Vector: Vera lee la pantalla y ejecuta clics y capturas
     · memoria a largo plazo en este navegador (intereses, proyectos, preferencias)

   API pública: VectorVoz.abrir(), .cerrar(), .preguntar('texto'), .memoria()
   ===================================================================== */
(() => {
  'use strict';
  if (window.VectorVoz) return;

  const SCRIPT = document.currentScript && document.currentScript.src || '';
  const ORIGEN_SCRIPT = (() => { try { const u = new URL(SCRIPT); return u.origin !== location.origin ? u.origin : ''; } catch (_) { return ''; } })();
  const CFG = Object.assign({
    endpoint: (ORIGEN_SCRIPT || 'https://vera-voz.juanpablo-reyes.workers.dev') + '/api/voz',
    nombre: 'Vera',
    lanzador: true,
    conversacionContinua: true,
    interrumpirConVoz: true,
    vozActiva: true,
    atajo: 'Alt+V',
    idioma: 'es-MX',
  }, window.VECTOR_VOZ_CONFIG || {});

  const REDUCIR_MOV = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  // Memoria persistente en ESTE navegador (localStorage del dominio de Vector)
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} },
  };

  /* ===================================================================
     1. ESTILOS (alineados a Vector: tinta #18242e, azul marino #273c4c,
        azul #315f80, líneas #e3e8ec, fondo #f6f8fa, tipografía del sistema)
     =================================================================== */
  const CSS = `
  .vvz, .vvz *{box-sizing:border-box}
  .vvz{--ink:#18242e;--navy:#273c4c;--blue:#315f80;--steel:#7294ab;--muted:#71808d;--line:#e3e8ec;--soft:#f4f6f8;--bg:#f6f8fa;
    --cyan:#4fd8ff;--violet:#a04dff;
    font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","Segoe UI",Roboto,sans-serif;color:var(--ink);font-size:15px;line-height:1.45;letter-spacing:normal;text-align:left}
  .vvz button{font:inherit;cursor:pointer}
  .vvz-launch{position:fixed;right:20px;bottom:20px;z-index:2147482000;width:60px;height:60px;padding:0;border:0;border-radius:50%;display:grid;place-items:center;
    background:radial-gradient(circle at 50% 45%,#1d3446,#0e1a24);box-shadow:0 0 0 3px rgba(255,255,255,.9),0 10px 28px rgba(20,41,59,.32),0 0 26px rgba(94,141,255,.35);transition:transform .2s ease,box-shadow .2s ease,opacity .2s}
  .vvz-launch:hover{transform:scale(1.06);box-shadow:0 0 0 3px #fff,0 12px 34px rgba(20,41,59,.36),0 0 34px rgba(94,141,255,.55)}
  .vvz-launch:focus-visible{outline:3px solid rgba(79,216,255,.7);outline-offset:4px}
  .vvz-launch canvas{width:56px;height:56px;border-radius:50%;display:block}
  .vvz-launch .vvz-tip{position:absolute;right:70px;top:50%;transform:translate(6px,-50%);white-space:nowrap;background:var(--navy);color:#fff;font-size:12.5px;font-weight:600;padding:7px 12px;border-radius:999px;opacity:0;pointer-events:none;transition:opacity .2s,transform .2s;box-shadow:0 6px 18px rgba(20,41,59,.25)}
  .vvz-launch:hover .vvz-tip,.vvz-launch:focus-visible .vvz-tip{opacity:1;transform:translate(0,-50%)}
  .vvz-launch.oculto{opacity:0;pointer-events:none;transform:scale(.8)}

  .vvz-backdrop{position:fixed;inset:0;z-index:2147482500;display:flex;align-items:center;justify-content:center;padding:16px;
    background:rgba(24,36,46,.38);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);opacity:0;pointer-events:none;transition:opacity .25s ease}
  .vvz-backdrop.abierto{opacity:1;pointer-events:auto}
  .vvz-modal{position:relative;width:min(1080px,100%);height:min(700px,100%);display:flex;flex-direction:column;background:#fff;border-radius:22px;overflow:hidden;
    box-shadow:0 1px 2px rgba(20,41,59,.04),0 24px 80px rgba(20,41,59,.28);border-top:3px solid var(--navy);transform:translateY(14px) scale(.985);transition:transform .3s cubic-bezier(.2,.8,.2,1)}
  .vvz-backdrop.abierto .vvz-modal{transform:none}

  .vvz-head{display:flex;align-items:center;gap:14px;padding:16px 20px 14px 24px;border-bottom:1px solid var(--line)}
  .vvz-kicker{display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:700;letter-spacing:.13em;text-transform:uppercase;color:var(--blue)}
  .vvz-kicker i{width:8px;height:8px;border-radius:50%;background:var(--navy);box-shadow:0 0 0 3px rgba(49,95,128,.16)}
  .vvz-title{margin:2px 0 0;font-size:21px;font-weight:600;letter-spacing:-.01em;line-height:1.15}
  .vvz-title span{color:var(--muted);font-weight:400}
  .vvz-head-actions{margin-left:auto;display:flex;gap:8px}
  .vvz-chip-btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 13px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--ink);font-size:12.5px;font-weight:600}
  .vvz-chip-btn:hover{background:var(--soft)}
  .vvz-icon-btn{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:#fff;color:var(--ink);display:grid;place-items:center;padding:0}
  .vvz-icon-btn:hover{background:var(--soft)}
  .vvz svg{width:18px;height:18px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}

  .vvz-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(0,46fr) minmax(0,54fr)}
  .vvz-stage{position:relative;margin:14px 0 14px 14px;border-radius:18px;overflow:hidden;display:flex;flex-direction:column;align-items:center;
    background:radial-gradient(120% 90% at 50% 38%,#1e3547 0%,#15283a 45%,#0d1822 100%);color:#e8f1f7;isolation:isolate}
  .vvz-stage::before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.05) 1px,transparent 1px);background-size:22px 22px;mask-image:radial-gradient(circle at 50% 42%,transparent 30%,#000 80%);-webkit-mask-image:radial-gradient(circle at 50% 42%,transparent 30%,#000 80%);z-index:-1}
  .vvz-orb{position:absolute;inset:0;width:100%;height:100%;cursor:pointer}
  .vvz-status{position:relative;margin-top:16px;display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);font-size:12px;font-weight:600;letter-spacing:.02em;pointer-events:none}
  .vvz-status i{width:7px;height:7px;border-radius:50%;background:#8aa3b5;transition:background .3s,box-shadow .3s}
  .vvz[data-estado=escuchando] .vvz-status i{background:var(--cyan);box-shadow:0 0 10px var(--cyan);animation:vvzPulse 1.2s ease-in-out infinite}
  .vvz[data-estado=pensando] .vvz-status i{background:var(--violet);box-shadow:0 0 10px var(--violet);animation:vvzPulse .7s ease-in-out infinite}
  .vvz[data-estado=hablando] .vvz-status i{background:#6f8dff;box-shadow:0 0 10px #6f8dff}
  @keyframes vvzPulse{50%{opacity:.35}}
  .vvz-demo{position:relative;margin-top:8px;font-size:11px;color:#ffd59a;background:rgba(183,122,63,.18);border:1px solid rgba(183,122,63,.4);padding:3px 10px;border-radius:999px;pointer-events:none}
  .vvz-caption{position:relative;margin:auto 22px 0;min-height:3.2em;max-height:4.6em;overflow:hidden;text-align:center;font-size:15.5px;line-height:1.5;color:#f3f8fb;text-shadow:0 1px 12px rgba(0,0,0,.5);pointer-events:none;transition:opacity .3s}
  .vvz-caption.tenue{color:rgba(232,241,247,.62);font-style:italic}
  .vvz-controls{position:relative;display:flex;align-items:center;gap:18px;margin:12px 0 6px}
  .vvz-ctrl{width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#dce8f0;display:grid;place-items:center;transition:background .2s,color .2s,border-color .2s}
  .vvz-ctrl:hover{background:rgba(255,255,255,.12)}
  .vvz-ctrl[aria-pressed=true]{color:#fff;border-color:rgba(79,216,255,.55);background:rgba(79,216,255,.16)}
  .vvz-ctrl.off{color:#8aa3b5}
  .vvz-mic{width:68px;height:68px;border-radius:50%;border:0;color:#0d1822;display:grid;place-items:center;
    background:linear-gradient(135deg,#7fe6ff 0%,#5e8dff 55%,#a86bff 100%);box-shadow:0 0 0 6px rgba(94,141,255,.14),0 10px 30px rgba(60,90,255,.45);transition:transform .15s ease,box-shadow .3s}
  .vvz-mic:hover{transform:scale(1.04)}
  .vvz-mic svg{width:26px;height:26px;stroke-width:2}
  .vvz-mic[aria-pressed=true]{box-shadow:0 0 0 8px rgba(79,216,255,.22),0 0 40px rgba(79,216,255,.6)}
  .vvz-ctrl:focus-visible,.vvz-mic:focus-visible,.vvz-icon-btn:focus-visible,.vvz-chip-btn:focus-visible,.vvz-send:focus-visible,.vvz-sug:focus-visible{outline:3px solid rgba(79,216,255,.6);outline-offset:2px}
  .vvz-hint{position:relative;font-size:11.5px;color:rgba(220,232,240,.55);margin-bottom:14px;text-align:center;padding:0 12px}

  .vvz-chat{display:flex;flex-direction:column;min-height:0;padding:14px 18px 12px}
  .vvz-log{flex:1;min-height:0;overflow-y:auto;padding:6px 4px 10px;display:flex;flex-direction:column;gap:12px;scroll-behavior:smooth}
  .vvz-msg{max-width:88%;padding:10px 14px;border-radius:16px;font-size:14.5px;line-height:1.5;word-wrap:break-word;overflow-wrap:anywhere}
  .vvz-msg.user{align-self:flex-end;background:var(--navy);color:#fff;border-bottom-right-radius:5px}
  .vvz-msg.user.interino{background:#e9eef2;color:var(--muted);font-style:italic}
  .vvz-msg.user.interino .vvz-meta{color:var(--steel)}
  .vvz-mk{background:linear-gradient(transparent 58%,rgba(94,141,255,.3) 58%);color:inherit;-webkit-box-decoration-break:clone;box-decoration-break:clone;padding:0 1px}
  .vvz-msg.bot{align-self:flex-start;background:var(--bg);border:1px solid var(--line);border-bottom-left-radius:5px}
  .vvz-msg.bot.error{background:#fbf1ef;border-color:#ecd2cd;color:#7c3d35}
  .vvz-msg .vvz-meta{display:flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--blue);margin-bottom:3px}
  .vvz-msg.user .vvz-meta{color:rgba(255,255,255,.65);justify-content:flex-end}
  .vvz-msg .vvz-meta svg{width:12px;height:12px}
  .vvz-msg p{margin:0 0 .5em}.vvz-msg p:last-child{margin:0}
  .vvz-msg ul,.vvz-msg ol{margin:.2em 0 .5em;padding-left:1.25em}.vvz-msg li{margin:.15em 0}
  .vvz-msg code{background:rgba(24,36,46,.07);padding:1px 5px;border-radius:5px;font-size:.92em}
  .vvz-msg .vvz-hablando{background:rgba(94,141,255,.1);border-radius:6px;box-shadow:0 0 0 3px rgba(94,141,255,.1)}
  .vvz-cursor{display:inline-block;width:7px;height:1em;vertical-align:-2px;margin-left:2px;border-radius:2px;background:var(--steel);animation:vvzPulse .9s steps(2) infinite}
  .vvz-empty{margin:auto 0;padding:10px 6px;text-align:left}
  .vvz-empty h3{margin:0 0 4px;font-size:18px;font-weight:600}
  .vvz-empty p{margin:0 0 14px;color:var(--muted);font-size:14px}
  .vvz-sugs{display:flex;flex-wrap:wrap;gap:8px}
  .vvz-sug{border:1px solid var(--line);background:#fff;border-radius:999px;padding:8px 13px;font-size:13px;color:var(--ink);text-align:left;transition:border-color .2s,background .2s}
  .vvz-sug:hover{border-color:var(--steel);background:var(--soft)}
  .vvz-input{display:flex;align-items:flex-end;gap:8px;padding:8px 8px 8px 14px;border:1px solid var(--line);border-radius:18px;background:#fff;box-shadow:0 1px 2px rgba(20,41,59,.03);transition:border-color .2s,box-shadow .2s}
  .vvz-input:focus-within{border-color:var(--steel);box-shadow:0 0 0 3px rgba(114,148,171,.16)}
  .vvz-input textarea{flex:1;border:0;outline:0;resize:none;font:inherit;font-size:14.5px;line-height:1.45;max-height:120px;padding:6px 0;background:transparent;color:var(--ink)}
  .vvz-send{width:38px;height:38px;flex:none;border-radius:50%;border:0;background:var(--navy);color:#fff;display:grid;place-items:center;transition:opacity .2s}
  .vvz-send:disabled{opacity:.35;cursor:default}
  .vvz-foot{margin:8px 4px 0;font-size:11px;color:var(--muted)}
  .vvz-toast{position:absolute;left:50%;bottom:18px;transform:translate(-50%,10px);background:var(--ink);color:#fff;font-size:13px;padding:9px 16px;border-radius:999px;opacity:0;transition:opacity .25s,transform .25s;pointer-events:none;max-width:90%;text-align:center;z-index:5}
  .vvz-toast.ver{opacity:1;transform:translate(-50%,0)}

  /* --- modo compacto: Vera flota y deja ver/usar la app --- */
  .vvz.compacto .vvz-backdrop{background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;pointer-events:none;align-items:flex-end;justify-content:flex-end;padding:18px}
  .vvz.compacto .vvz-backdrop.abierto .vvz-modal{pointer-events:auto}
  .vvz.compacto .vvz-modal{width:330px;height:340px;border-radius:20px;box-shadow:0 18px 50px rgba(20,41,59,.32),0 0 0 1px rgba(20,41,59,.06)}
  .vvz.compacto .vvz-head{padding:9px 10px 8px 14px;gap:8px}
  .vvz.compacto .vvz-kicker,.vvz.compacto .vvz-title span,.vvz.compacto .vvz-nuevo,.vvz.compacto .vvz-btn-mem{display:none}
  .vvz.compacto .vvz-title{font-size:15.5px;margin:0}
  .vvz.compacto .vvz-body{grid-template-columns:1fr;grid-template-rows:1fr}
  .vvz.compacto .vvz-chat{display:none}
  .vvz.compacto .vvz-stage{margin:0 8px 8px}
  .vvz.compacto .vvz-hint,.vvz.compacto .vvz-demo{display:none}
  .vvz.compacto .vvz-status{margin-top:10px;font-size:11px;padding:4px 10px}
  .vvz.compacto .vvz-caption{font-size:13px;margin:auto 12px 0;min-height:2.9em;max-height:4.4em}
  .vvz.compacto .vvz-controls{gap:14px;margin:8px 0 10px}
  .vvz.compacto .vvz-mic{width:52px;height:52px}
  .vvz.compacto .vvz-mic svg{width:22px;height:22px}
  .vvz.compacto .vvz-ctrl{width:36px;height:36px}
  .vvz .vvz-btn-tam svg{width:16px;height:16px}

  /* --- resaltado de lo que Vera opera --- */
  .vvz-foco{position:fixed;z-index:2147482400;pointer-events:none;border-radius:10px;border:2px solid #5e8dff;box-shadow:0 0 0 4px rgba(94,141,255,.22),0 0 26px rgba(94,141,255,.55);opacity:0;transition:opacity .25s,left .35s,top .35s,width .35s,height .35s}
  .vvz-foco.ver{opacity:1}
  .vvz-foco i{position:absolute;left:-2px;top:-24px;font:600 11px/1 -apple-system,"Segoe UI",sans-serif;font-style:normal;color:#fff;background:linear-gradient(135deg,#4fb7ff,#7a5cff);padding:5px 8px;border-radius:7px 7px 7px 2px;white-space:nowrap}
  .vvz[data-midiendo] *{pointer-events:none!important}

  /* --- acciones y confirmaciones en el chat --- */
  .vvz-acc{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
  .vvz-acc span{display:inline-flex;align-items:center;gap:5px;font-size:12px;line-height:1.3;color:var(--blue);background:#eaf1f7;border:1px solid #d6e3ee;border-radius:999px;padding:3px 10px}
  .vvz-acc span.mal{color:#8a4a41;background:#fbf1ef;border-color:#ecd2cd}
  .vvz-conf{display:flex;gap:8px;margin-top:10px}
  .vvz-conf button{border-radius:999px;padding:7px 14px;font-size:13px;font-weight:600;border:1px solid var(--line);background:#fff;color:var(--ink)}
  .vvz-conf button.si{background:#a85a50;border-color:#a85a50;color:#fff}

  /* --- panel de memoria --- */
  .vvz-mem{position:absolute;inset:0;z-index:6;background:#fff;display:flex;flex-direction:column;transform:translateX(100%);transition:transform .3s cubic-bezier(.2,.8,.2,1);visibility:hidden}
  .vvz-mem.ver{transform:none;visibility:visible}
  .vvz-mem header{display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--line)}
  .vvz-mem h3{margin:0;font-size:18px;font-weight:600}
  .vvz-mem header p{margin:2px 0 0;font-size:12.5px;color:var(--muted)}
  .vvz-mem header .vvz-icon-btn{margin-left:auto;flex:none}
  .vvz-mem-cuerpo{flex:1;overflow:auto;padding:14px 20px}
  .vvz-mem-sec{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--blue);margin:8px 0 8px}
  .vvz-mem ul{list-style:none;margin:0 0 16px;padding:0;display:flex;flex-direction:column;gap:6px}
  .vvz-mem li{display:flex;align-items:flex-start;gap:10px;padding:9px 10px 9px 12px;border:1px solid var(--line);border-radius:12px;background:var(--bg);font-size:14px}
  .vvz-mem li span{flex:1}
  .vvz-mem li small{color:var(--muted);font-size:11.5px;display:block;margin-top:2px}
  .vvz-mem li button{flex:none;width:26px;height:26px;border-radius:50%;border:0;background:transparent;color:var(--muted);display:grid;place-items:center}
  .vvz-mem li button:hover{background:#ecd2cd;color:#7c3d35}
  .vvz-mem-vacio{color:var(--muted);font-size:14px;margin:0 0 16px}
  .vvz-mem-pie{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 20px;border-top:1px solid var(--line)}
  .vvz-mem-pie label{display:flex;align-items:center;gap:8px;font-size:13px;margin-right:auto}
  .vvz-mem-pie button{border-radius:999px;padding:7px 13px;font-size:12.5px;font-weight:600;border:1px solid var(--line);background:#fff;color:var(--ink)}
  .vvz-mem-pie button.peligro{color:#8a4a41;border-color:#ecd2cd}
  .vvz-mem-add{display:flex;gap:8px;margin-bottom:16px}
  .vvz-mem-add input{flex:1;border:1px solid var(--line);border-radius:10px;padding:8px 10px;font:inherit;font-size:13.5px}
  .vvz-mem-add button{border-radius:10px;border:0;background:var(--navy);color:#fff;padding:0 14px;font-size:13px;font-weight:600}

  @media (max-width:820px){
    .vvz-backdrop{padding:0}
    .vvz-modal{width:100%;height:100%;border-radius:0}
    .vvz-head{padding:12px 16px}
    .vvz-title{font-size:18px}
    .vvz-chip-btn span{display:none}
    .vvz-body{grid-template-columns:1fr;grid-template-rows:minmax(290px,46%) minmax(0,1fr)}
    .vvz-stage{margin:10px 16px 0}
    .vvz-chat{padding:10px 16px 10px}
    .vvz-caption{font-size:14px;min-height:2.6em;max-height:3em}
    .vvz-hint{display:none}
    .vvz-k2{display:none}
    .vvz-demo{font-size:10px;margin-top:6px}
    .vvz-caption{margin:auto 16px 0}
    .vvz-mic{width:58px;height:58px}
    .vvz-ctrl{width:40px;height:40px}
    .vvz-controls{margin-bottom:12px}
    .vvz-launch{right:14px;bottom:14px;width:54px;height:54px}
    .vvz-launch canvas{width:50px;height:50px}
    .vvz-launch .vvz-tip{display:none}
    .vvz.compacto .vvz-backdrop{padding:10px}
    .vvz.compacto .vvz-modal{width:min(330px,100%);height:300px;border-radius:18px}
    .vvz.compacto .vvz-body{grid-template-rows:1fr}
    .vvz.compacto .vvz-stage{margin:0 8px 8px}
  }
  @media (prefers-reduced-motion:reduce){.vvz *{animation:none!important;transition:none!important}}
  `;

  const ICON = {
    mic: '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>',
    stop: '<svg viewBox="0 0 24 24"><rect x="7" y="7" width="10" height="10" rx="2"/></svg>',
    voz: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M4 9.5h3l4.5-4v13L7 14.5H4z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>',
    loop: '<svg viewBox="0 0 24 24"><path d="M17 3l3 3-3 3"/><path d="M20 6H9a5 5 0 0 0-5 5v1M7 21l-3-3 3-3"/><path d="M4 18h11a5 5 0 0 0 5-5v-1"/></svg>',
    cerrar: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    nuevo: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
    enviar: '<svg viewBox="0 0 24 24"><path d="M12 19V5M6 11l6-6 6 6"/></svg>',
    onda: '<svg viewBox="0 0 24 24"><path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2"/></svg>',
    compacto: '<svg viewBox="0 0 24 24"><path d="M14 10l6-6M20 9V4h-5M10 14l-6 6M4 15v5h5"/></svg>',
    expandir: '<svg viewBox="0 0 24 24"><path d="M4 10V4h6M20 14v6h-6M4 4l6 6M20 20l-6-6"/></svg>',
    memoria: '<svg viewBox="0 0 24 24"><path d="M9 4.5a3 3 0 0 0-3 3v.2A3.2 3.2 0 0 0 4 10.6a3.3 3.3 0 0 0 1 2.4 3.2 3.2 0 0 0 1 5.5A3 3 0 0 0 9 20.5c1.2 0 2-.6 3-1.5V6c-.8-1-1.8-1.5-3-1.5zM15 4.5a3 3 0 0 1 3 3v.2a3.2 3.2 0 0 1 2 2.9 3.3 3.3 0 0 1-1 2.4 3.2 3.2 0 0 1-1 5.5 3 3 0 0 1-3 2c-1.2 0-2-.6-3-1.5"/></svg>',
    basura: '<svg viewBox="0 0 24 24"><path d="M5 7h14M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    clic: '<svg viewBox="0 0 24 24"><path d="M9 9l11 4-5 2-2 5z"/><path d="M5 3v3M3 5h3M5.5 9.5 4 11"/></svg>',
    teclado: '<svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10"/></svg>',
  };

  /* ===================================================================
     2. RUIDO SIMPLEX 3D (para la deformación orgánica del núcleo)
     =================================================================== */
  const Ruido = (() => {
    const g = [[1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],[1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],[0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]];
    const p = new Uint8Array(512), pm = new Uint8Array(512);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) base[i] = i;
    let s = 1337;
    for (let i = 255; i > 0; i--) { s = (s * 16807) % 2147483647; const j = s % (i + 1); [base[i], base[j]] = [base[j], base[i]]; }
    for (let i = 0; i < 512; i++) { p[i] = base[i & 255]; pm[i] = p[i] % 12; }
    const F3 = 1 / 3, G3 = 1 / 6;
    return function (xin, yin, zin) {
      let n0, n1, n2, n3;
      const s2 = (xin + yin + zin) * F3;
      const i = Math.floor(xin + s2), j = Math.floor(yin + s2), k = Math.floor(zin + s2);
      const t = (i + j + k) * G3;
      const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
      let i1, j1, k1, i2, j2, k2;
      if (x0 >= y0) {
        if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
        else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
        else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
      } else {
        if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
        else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
        else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      }
      const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
      const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
      const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
      const ii = i & 255, jj = j & 255, kk = k & 255;
      const dot = (gi, x, y, z) => { const v = g[gi]; return v[0] * x + v[1] * y + v[2] * z; };
      let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
      n0 = t0 < 0 ? 0 : (t0 *= t0, t0 * t0 * dot(pm[ii + p[jj + p[kk]]], x0, y0, z0));
      let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
      n1 = t1 < 0 ? 0 : (t1 *= t1, t1 * t1 * dot(pm[ii + i1 + p[jj + j1 + p[kk + k1]]], x1, y1, z1));
      let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
      n2 = t2 < 0 ? 0 : (t2 *= t2, t2 * t2 * dot(pm[ii + i2 + p[jj + j2 + p[kk + k2]]], x2, y2, z2));
      let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
      n3 = t3 < 0 ? 0 : (t3 *= t3, t3 * t3 * dot(pm[ii + 1 + p[jj + 1 + p[kk + 1]]], x3, y3, z3));
      return 32 * (n0 + n1 + n2 + n3);
    };
  })();

  /* ===================================================================
     3. NÚCLEO DE PARTÍCULAS (esfera de puntos cian → azul → violeta)
     =================================================================== */
  const PALETA = [[92,232,255],[70,200,255],[58,160,255],[52,120,255],[58,90,255],[82,72,255],[112,66,255],[146,70,255],[176,74,250],[204,78,240],[226,84,228],[240,96,214]];
  const NB = PALETA.length, ND = 4;
  const ALFA = [0.2, 0.42, 0.72, 1];
  const TAM = [0.9, 1.15, 1.45, 1.9];

  const MODOS = {
    reposo:     { deform: .085, freq: 1.45, nvel: .32, spin: .13, swirl: 0,  hue: 0,    glow: .32, ripple: 0,   spike: 0,   scatter: .05, swell: 0 },
    escuchando: { deform: .06,  freq: 1.6,  nvel: .45, spin: .2,  swirl: 0,  hue: -.2,  glow: .42, ripple: .35, spike: 0,   scatter: .04, swell: 0 },
    pensando:   { deform: .11,  freq: 2.3,  nvel: 1.0, spin: .6,  swirl: 1,  hue: .24,  glow: .5,  ripple: 0,   spike: .05, scatter: .1,  swell: -.04 },
    hablando:   { deform: .075, freq: 1.7,  nvel: .6,  spin: .24, swirl: 0,  hue: 0,    glow: .5,  ripple: .1,  spike: 0,   scatter: .07, swell: 0 },
  };

  class Orbe {
    constructor(canvas, opts = {}) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.mini = !!opts.mini;
      const n = opts.puntos || 2200;
      this.n = n;
      this.pts = new Float32Array(n * 4);
      const ga = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < n; i++) {
        const y = 1 - (i / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = ga * i;
        this.pts[i * 4] = Math.cos(th) * r; this.pts[i * 4 + 1] = y; this.pts[i * 4 + 2] = Math.sin(th) * r; this.pts[i * 4 + 3] = Math.random();
      }
      const nd = opts.polvo == null ? 240 : opts.polvo;
      this.nd = nd;
      this.polvo = new Float32Array(nd * 5);
      for (let i = 0; i < nd; i++) {
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
        this.polvo.set([Math.cos(a) * r, u, Math.sin(a) * r, 1.05 + Math.random() * .4, Math.random()], i * 5);
      }
      this.buf = Array.from({ length: NB * ND }, () => ({ c: 0, xy: new Float32Array((n + nd) * 3) }));
      this.P = Object.assign({ tilt: 0 }, MODOS.reposo);
      this.T = Object.assign({ tilt: 0 }, MODOS.reposo);
      this.modo = 'reposo';
      this.entrada = { nivel: 0, bajos: 0, medios: 0, altos: 0 };
      this.imp = { tilt: 0, spike: 0, burst: 0, ola: 0 };
      this.t = Math.random() * 100; this.rot = 0; this.ultimo = 0; this.vivo = false;
      this.velGlobal = REDUCIR_MOV ? .45 : 1;
      this._loop = this._loop.bind(this);
      this.resize();
    }
    setModo(m) { if (MODOS[m]) { this.modo = m; Object.assign(this.T, MODOS[m]); } }
    impulso(tipo, f = 1) { if (tipo in this.imp) this.imp[tipo] = Math.max(this.imp[tipo], f); }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = this.cv.clientWidth || 300, h = this.cv.clientHeight || 300;
      this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
      this.dpr = dpr; this.w = w; this.h = h;
    }
    start() { if (!this.vivo) { this.vivo = true; this.ultimo = performance.now(); requestAnimationFrame(this._loop); } }
    stop() { this.vivo = false; }
    _loop(now) {
      if (!this.vivo) return;
      const dt = Math.min(.05, (now - this.ultimo) / 1000); this.ultimo = now;
      if (!document.hidden) this._frame(dt);
      requestAnimationFrame(this._loop);
    }
    _frame(dt) {
      const P = this.P, T = this.T, E = this.entrada, I = this.imp;
      // Objetivos dinámicos según la entrada de audio y el modo
      const lvl = E.nivel, k = 1 - Math.exp(-dt * 6);
      const tgt = Object.assign({}, T);
      if (this.modo === 'hablando') {
        tgt.deform = T.deform + E.bajos * .2;
        tgt.spike = E.altos * .14 + I.spike * .2;
        tgt.ripple = .1 + E.medios * .9;
        tgt.glow = T.glow + lvl * .7;
        tgt.scatter = T.scatter + lvl * .06 + I.burst * .22;
        tgt.swell = lvl * .07 + E.bajos * .05;
        tgt.hue = Math.sin(this.t * .13) * .12 + I.spike * .14;
      } else if (this.modo === 'escuchando') {
        tgt.ripple = .25 + lvl * 1.6;
        tgt.deform = T.deform + lvl * .22;
        tgt.glow = T.glow + lvl * .8;
        tgt.swell = lvl * .05;
        tgt.spin = T.spin + lvl * .4;
      } else if (this.modo === 'pensando') {
        tgt.glow = T.glow + Math.sin(this.t * 3.2) * .12;
        tgt.swell = Math.sin(this.t * 2.4) * .025 - .03;
      }
      tgt.tilt = I.tilt * .45;
      for (const key in tgt) P[key] = (P[key] == null ? tgt[key] : P[key] + (tgt[key] - P[key]) * k);
      for (const key in I) I[key] *= Math.exp(-dt * 2.2);

      const vg = this.velGlobal;
      this.t += dt * vg;
      this.rot += dt * P.spin * vg;
      const t = this.t, ns = t * P.nvel;
      const ctx = this.ctx, dpr = this.dpr, W = this.w, H = this.h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, W, H);

      const bajo = !this.mini && H < 430, muyBajo = !this.mini && H < 300;
      const cx = W / 2, cy = this.mini ? H / 2 : H * (muyBajo ? .4 : bajo ? .38 : .44);
      const R = (this.mini ? Math.min(W, H) * .36 : Math.min(W * .27, H * (muyBajo ? .18 : bajo ? .2 : .27))) * (1 + P.swell);
      // Resplandor interior
      const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, R * 1.6);
      gr.addColorStop(0, `rgba(70,110,255,${.28 * P.glow})`);
      gr.addColorStop(.45, `rgba(60,90,255,${.14 * P.glow})`);
      gr.addColorStop(1, 'rgba(40,60,200,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);

      for (const b of this.buf) b.c = 0;
      const cr = Math.cos(this.rot), sr = Math.sin(this.rot);
      const pitch = .32 + P.tilt, cp = Math.cos(pitch), sp = Math.sin(pitch);
      const f = P.freq, cam = 3.1, base = this.mini ? .9 : 1.15;
      const swirlA = P.swirl * Math.sin(t * .9) * 1.6;
      const pts = this.pts, n = this.n;

      const empuja = (x, y, z, r, alfaMul, tamMul) => {
        x *= r; y *= r; z *= r;
        const x1 = x * cr - z * sr, z1 = x * sr + z * cr;
        const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
        const s = cam / (cam - z2);
        const px = x1 * s, py = -y2 * s;
        let c = (px * .62 + py * .42) * .5 + .5 + P.hue;
        c = c < 0 ? 0 : c > .999 ? .999 : c;
        let d = (z2 + 1.25) / 2.5; d = d < 0 ? 0 : d > .999 ? .999 : d;
        let db = (d * ND) | 0;
        if (alfaMul === 1 && db < 3 && Math.abs(z2) < .3 * r) db++;
        if (alfaMul < 1 && db > 0) db--;
        const bf = this.buf[((c * NB) | 0) * ND + db];
        const o = bf.c * 3;
        bf.xy[o] = cx + px * R; bf.xy[o + 1] = cy + py * R; bf.xy[o + 2] = TAM[db] * base * s * .8 * tamMul;
        bf.c++;
      };

      for (let i = 0; i < n; i++) {
        let x = pts[i * 4], y = pts[i * 4 + 1], z = pts[i * 4 + 2];
        const sd = pts[i * 4 + 3];
        if (swirlA) { const a = swirlA * y, ca = Math.cos(a), sa = Math.sin(a); const xx = x * ca - z * sa; z = x * sa + z * ca; x = xx; }
        const n1 = Ruido(x * f + ns, y * f + ns * .8, z * f - ns * .6);
        let r = 1 + P.deform * n1;
        if (P.spike > .002) { const n2 = Ruido(x * 3.6 + ns * 2.2, y * 3.6 - ns, z * 3.6 + ns * 1.7); r += P.spike * n2 * Math.abs(n2) * 1.6; }
        if (P.ripple > .002) r += P.ripple * .045 * Math.sin(y * 9 - t * 7.5 + n1 * 2) * (1 - y * y);
        if (I.ola > .01) r += I.ola * .08 * Math.sin(y * 5 + t * 10);
        r += P.scatter * (sd - .5) * (.6 + .8 * Math.max(0, n1)) * 1.2;
        empuja(x, y, z, r, 1, .9 + sd * .3);
      }
      const pv = this.polvo;
      for (let i = 0; i < this.nd; i++) {
        const o = i * 5, sd = pv[o + 4];
        const r = pv[o + 3] + Math.sin(t * .6 + sd * 20) * .05 + P.scatter * .9 * sd + I.burst * .25 * sd;
        empuja(pv[o], pv[o + 1], pv[o + 2], r, .5, .7);
      }

      ctx.globalCompositeOperation = 'lighter';
      for (let ci = 0; ci < NB; ci++) {
        const col = PALETA[ci];
        for (let di = 0; di < ND; di++) {
          const bf = this.buf[ci * ND + di];
          if (!bf.c) continue;
          ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${ALFA[di]})`;
          ctx.beginPath();
          const xy = bf.xy;
          for (let j = 0; j < bf.c; j++) { const s = xy[j * 3 + 2]; ctx.rect(xy[j * 3] - s / 2, xy[j * 3 + 1] - s / 2, s, s); }
          ctx.fill();
        }
      }
    }
  }

  /* ===================================================================
     4. AUDIO: análisis de la voz de salida y del micrófono
     =================================================================== */
  const Audio = {
    ctx: null, salida: null, gan: null, mic: null, micStream: null,
    fbuf: null, tbuf: null,
    asegurar() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        this.ctx = new AC();
        this.salida = this.ctx.createAnalyser(); this.salida.fftSize = 512; this.salida.smoothingTimeConstant = .72;
        this.gan = this.ctx.createGain(); this.gan.connect(this.salida); this.salida.connect(this.ctx.destination);
        this.fbuf = new Uint8Array(this.salida.frequencyBinCount); this.tbuf = new Uint8Array(this.salida.fftSize);
      }
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return this.ctx;
    },
    async abrirMic() {
      if (this.micStream) return true;
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return false;
      try {
        this.micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const ctx = this.asegurar(); if (!ctx) return false;
        const src = ctx.createMediaStreamSource(this.micStream);
        this.mic = ctx.createAnalyser(); this.mic.fftSize = 512; this.mic.smoothingTimeConstant = .6;
        src.connect(this.mic);
        return true;
      } catch (_) { return false; }
    },
    cerrarMic() {
      if (this.micStream) this.micStream.getTracks().forEach(t => t.stop());
      this.micStream = null; this.mic = null;
    },
    medir(an) {
      if (!an) return null;
      an.getByteFrequencyData(this.fbuf); an.getByteTimeDomainData(this.tbuf);
      let rms = 0; for (let i = 0; i < this.tbuf.length; i++) { const v = (this.tbuf[i] - 128) / 128; rms += v * v; }
      rms = Math.sqrt(rms / this.tbuf.length);
      const prom = (a, b) => { let s = 0; for (let i = a; i < b; i++) s += this.fbuf[i]; return s / (b - a) / 255; };
      return { nivel: Math.min(1, rms * 3.2), bajos: prom(1, 6), medios: prom(6, 28), altos: prom(28, 90) };
    },
  };

  /* ===================================================================
     5. TEXTO → VOZ (Azure neural es-MX vía Worker, o voz del navegador)
     =================================================================== */
  const SIGLAS = { BIM: 'bim', '5D': 'cinco D', '4D': 'cuatro D', '3D': 'tres D', '6D': 'seis D', '7D': 'siete D', QTO: 'Q T O', ACC: 'A C C', APS: 'A P S', APU: 'A P U', IFC: 'I F C', AEC: 'A E C', CDE: 'C D E', BEP: 'B E P', LOD: 'L O D', LOI: 'L O I', MXN: 'pesos', IVA: 'I V A', EVM: 'E V M', FSR: 'F S R' };
  function paraVoz(t) {
    return String(t)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[*_`#>|]+/g, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/\$\s?(\d[\d.,]*)(?:\s*(millones|mill[oó]n|mil|MXN|pesos|M\b))?/g, (m, num, suf) => {
        if (!suf || /mxn|pesos/i.test(suf)) return num + ' pesos';
        if (suf === 'M' || /^mill/i.test(suf)) return num + ' millones de pesos';
        return num + ' mil pesos';
      })
      .replace(/(\d)\s?m²|(\d)\s?m2\b/g, (m, a, b) => (a || b) + ' metros cuadrados')
      .replace(/(\d)\s?m³|(\d)\s?m3\b/g, (m, a, b) => (a || b) + ' metros cúbicos')
      .replace(/\/m²|\/m2\b/g, ' por metro cuadrado')
      .replace(/(\d)\s?%/g, '$1 por ciento')
      .replace(/\bvs\.?\s/gi, 'contra ')
      .replace(/\b(BIM|5D|4D|3D|6D|7D|QTO|ACC|APS|APU|IFC|AEC|CDE|BEP|LOD|LOI|MXN|IVA|EVM|FSR)\b/g, s => SIGLAS[s] || s)
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Lee la frase para darle "intención" al movimiento del núcleo
  function intencion(frase) {
    return {
      pregunta: /[?¿]/.test(frase),
      cifras: /\d|\$|millones|por ciento|metros/i.test(frase),
      enfasis: /[!¡]|importante|ojo|clave|nunca|siempre/i.test(frase),
      lista: /primero|segundo|tercero|además|por último|finalmente/i.test(frase),
    };
  }

  class Voz {
    constructor(h) {
      this.h = h;               // callbacks: inicioFrase(frase), finTurno()
      this.modo = 'navegador';  // 'servidor' (Voxtral/Azure) | 'navegador'
      this.turnoTTS = Promise.resolve(); this.ultimaTTS = 0; this.fallasTTS = 0;
      this.cola = []; this.reproduciendo = false; this.cerrado = true; this.fuente = null;
      this.sim = { activo: false, pulso: 0 };
      this.generacion = 0;
      this.vozNav = null;
      if ('speechSynthesis' in window) {
        const elegir = () => { this.vozNav = elegirVozNavegador(); };
        elegir(); speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', elegir);
      }
    }
    get hablando() { return this.reproduciendo || this.cola.length > 0; }
    iniciarTurno() { this.detener(); this.cerrado = false; }
    decir(texto) {
      const limpio = paraVoz(texto);
      if (!limpio || !/[a-z0-9áéíóúñ]/i.test(limpio)) return;
      const item = { frase: texto, voz: limpio, gen: this.generacion };
      if (this.modo === 'servidor') item.audio = this._sintetizar(limpio, item);
      this.cola.push(item);
      if (!this.reproduciendo) this._siguiente();
    }
    cerrarTurno() { this.cerrado = true; if (!this.hablando) this._fin(); }
    detener() {
      this.generacion++;
      this.cola.length = 0;
      if (this.fuente) { try { this.fuente.onended = null; this.fuente.stop(); } catch (_) {} this.fuente = null; }
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      this.reproduciendo = false; this.sim.activo = false;
    }
    // La voz del servidor admite ~1 solicitud por segundo: se piden en fila, separadas, y con un reintento
    _sintetizar(texto, item) {
      const tarea = this.turnoTTS.then(async () => {
        if (item.gen !== this.generacion) return null;
        for (let intento = 0; intento < 2; intento++) {
          const espera = this.ultimaTTS + 1050 - Date.now();
          if (espera > 0) await new Promise(r => setTimeout(r, espera));
          if (item.gen !== this.generacion) return null;
          this.ultimaTTS = Date.now();
          try {
            const r = await fetch(CFG.endpoint + '/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto }) });
            if (!r.ok) throw new Error('tts ' + r.status);
            const buf = await r.arrayBuffer();
            const audio = await Audio.asegurar().decodeAudioData(buf);
            this.fallasTTS = 0;
            return audio;
          } catch (e) { /* reintenta una vez */ }
        }
        // Tras varias fallas seguidas se usa la voz del navegador (Edge: Dalia) hasta recargar
        if (++this.fallasTTS >= 3) this.modo = 'navegador';
        return null;
      });
      this.turnoTTS = tarea.catch(() => null);
      return tarea;
    }
    async _siguiente() {
      const item = this.cola.shift();
      if (!item) { this.reproduciendo = false; if (this.cerrado) this._fin(); return; }
      this.reproduciendo = true;
      const gen = item.gen;
      let buffer = null;
      if (item.audio) buffer = await item.audio;
      if (gen !== this.generacion) return;
      this.h.inicioFrase(item.frase);
      if (buffer) {
        const ctx = Audio.asegurar();
        const src = ctx.createBufferSource(); src.buffer = buffer; src.connect(Audio.gan);
        this.fuente = src;
        src.onended = () => { if (gen === this.generacion) { this.fuente = null; this._siguiente(); } };
        src.start();
      } else if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(item.voz);
        u.lang = CFG.idioma; if (this.vozNav) u.voice = this.vozNav;
        u.rate = this.vozNav && /natural|online|neural/i.test(this.vozNav.name) ? 1.04 : 1.0; u.pitch = 1.04;
        this.sim.activo = true;
        u.onboundary = () => { this.sim.pulso = 1; };
        const fin = () => { if (gen === this.generacion) { this.sim.activo = false; this._siguiente(); } };
        u.onend = fin; u.onerror = fin;
        speechSynthesis.speak(u);
      } else { this._siguiente(); }
    }
    _fin() { this.reproduciendo = false; this.h.finTurno(); }
    // Envolvente simulada cuando no hay audio analizable (voz del navegador)
    simulada(t) {
      if (!this.sim.activo) return null;
      this.sim.pulso *= .86;
      const sil = Math.abs(Math.sin(t * 13.5)) * .55 + Math.abs(Math.sin(t * 5.1 + 1)) * .3;
      const nivel = Math.min(1, .25 + sil * .45 + this.sim.pulso * .4);
      return { nivel, bajos: .2 + sil * .35, medios: .25 + this.sim.pulso * .5, altos: .1 + Math.abs(Math.sin(t * 21)) * .3 };
    }
  }

  function elegirVozNavegador() {
    const voces = (window.speechSynthesis && speechSynthesis.getVoices()) || [];
    const masc = /jorge|ra[uú]l|gerardo|cecilio|liberto|luciano|pelayo|yago|juan|diego|carlos|pablo|andr[eé]s|enrique|alonso|tom[aá]s|male|hombre/i;
    const fem = /dalia|renata|beatriz|candela|carlota|larissa|marina|nuria|yolanda|paulina|sabina|m[oó]nica|helena|elvira|paloma|female|mujer|sof[ií]a|valentina|ximena|camila/i;
    const pts = v => {
      let p = 0;
      const lang = (v.lang || '').replace('_', '-').toLowerCase();
      if (lang === 'es-mx') p += 50; else if (lang === 'es-us') p += 25; else if (lang.startsWith('es')) p += 10; else return -1;
      if (/dalia/i.test(v.name)) p += 40;
      if (/natural|online|neural|premium|enhanced/i.test(v.name)) p += 25;
      if (fem.test(v.name)) p += 15;
      if (masc.test(v.name)) p -= 60;
      if (/google/i.test(v.name)) p += 45;                       // Chrome: voz en línea de Google, más natural que las locales
      if (v.localService && !/natural|online|neural/i.test(v.name)) p -= 20; // voces locales de Windows (Sabina, Raúl): robóticas
      return p;
    };
    let mejor = null, mp = -1;
    for (const v of voces) { const p = pts(v); if (p > mp) { mp = p; mejor = v; } }
    return mejor;
  }

  /* ===================================================================
     6. VOZ → TEXTO (reconocimiento de voz del navegador, es-MX)
     =================================================================== */
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  class Oido {
    constructor(h) { this.h = h; this.rec = null; this.activo = false; this.final = ''; this.interino = ''; this.tSilencio = 0; this.tInactivo = 0; }
    get disponible() { return !!SR; }
    iniciar() {
      if (!SR || this.activo) return;
      this.activo = true; this.final = ''; this.interino = '';
      this._crear();
      this._inactividad();
    }
    _crear() {
      const rec = new SR();
      rec.lang = CFG.idioma; rec.continuous = true; rec.interimResults = true; rec.maxAlternatives = 1;
      rec.onresult = ev => {
        let interino = '';
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          const r = ev.results[i];
          if (r.isFinal) this.final += (this.final ? ' ' : '') + r[0].transcript.trim();
          else interino += r[0].transcript;
        }
        this.interino = interino.trim();
        this.h.parcial((this.final + ' ' + this.interino).trim());
        clearTimeout(this.tSilencio);
        this.tSilencio = setTimeout(() => this._confirmar(), this.interino ? 1500 : 850);
        this._inactividad();
      };
      rec.onerror = ev => {
        // Si el servicio de dictado del navegador no está disponible, se pasa a Voxtral (la voz de Vera sigue siendo la misma)
        if (/network|service-not-allowed|language-not-supported/.test(ev.error) && this.h.respaldo && this.h.respaldo(ev.error)) { this.detener(); return; }
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') { this.detener(); this.h.error('Permite el acceso al micrófono para hablar con ' + CFG.nombre + '.'); }
        else if (ev.error === 'audio-capture') { this.detener(); this.h.error('No se detectó un micrófono.'); }
        else if (ev.error === 'network') { this.detener(); this.h.error('El reconocimiento de voz necesita conexión a internet.'); }
      };
      rec.onend = () => { if (this.activo && this.rec === rec) { try { rec.start(); } catch (_) { this._crear(); } } };
      this.rec = rec;
      try { rec.start(); } catch (_) { /* ya iniciado */ }
    }
    _inactividad() {
      clearTimeout(this.tInactivo);
      this.tInactivo = setTimeout(() => { if (this.activo && !this.final && !this.interino) { this.detener(); this.h.inactivo(); } }, 14000);
    }
    _confirmar() {
      const texto = (this.final + ' ' + this.interino).trim();
      if (!texto) return;
      this.detener();
      this.h.frase(texto);
    }
    detener() {
      this.activo = false; clearTimeout(this.tSilencio); clearTimeout(this.tInactivo);
      const rec = this.rec; this.rec = null;
      if (rec) { rec.onend = null; try { rec.abort(); } catch (_) {} }
    }
  }

  // Escucha con Voxtral (Mistral): graba la frase, detecta el silencio y la manda a transcribir
  class OidoVoxtral {
    constructor(h) { this.h = h; this.activo = false; this.ses = 0; this.rec = null; this.t = 0; }
    get disponible() { return !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia); }
    async iniciar() {
      if (this.activo) return;
      this.activo = true; const ses = ++this.ses;
      const ok = await Audio.abrirMic();
      if (ses !== this.ses) return;
      if (!ok || !Audio.micStream || !Audio.mic) { this.activo = false; this.h.error('Permite el acceso al micrófono para hablar con ' + CFG.nombre + '.'); return; }
      const tipo = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'].find(x => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(x)) || '';
      let rec;
      try { rec = new MediaRecorder(Audio.micStream, tipo ? { mimeType: tipo } : {}); } catch (_) { this.activo = false; this.h.error('Este navegador no puede grabar audio.'); return; }
      const trozos = []; rec.ondataavailable = e => { if (e.data && e.data.size) trozos.push(e.data); };
      this.rec = rec; rec.start(250);
      const buf = new Uint8Array(Audio.mic.fftSize), t0 = Date.now();
      let piso = 0, n = 0, hablo = false, tHablo = 0, ultimaVoz = 0;
      const paso = () => {
        if (!this.activo || ses !== this.ses) return;
        Audio.mic.getByteTimeDomainData(buf);
        let suma = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; suma += v * v; }
        const rms = Math.sqrt(suma / buf.length), ahora = Date.now();
        if (ahora - t0 < 350) { piso += rms; n++; }                       // ruido de fondo
        const umbral = Math.max(0.02, (n ? piso / n : 0.01) * 2.8);
        if (ahora - t0 >= 350 && rms > umbral) { if (!hablo) { hablo = true; tHablo = ahora; this.h.parcial('🎙️ …'); } ultimaVoz = ahora; }
        if (hablo && ahora - ultimaVoz > 950 && ahora - tHablo > 450) return this._cerrar(rec, trozos, tipo, ses);
        if (hablo && ahora - tHablo > 25000) return this._cerrar(rec, trozos, tipo, ses);
        if (!hablo && ahora - t0 > 14000) { this.detener(); this.h.inactivo(); return; }
        this.t = setTimeout(paso, 50);
      };
      paso();
    }
    async _cerrar(rec, trozos, tipo, ses) {
      this.activo = false; clearTimeout(this.t);
      await new Promise(res => { rec.onstop = res; try { rec.stop(); } catch (_) { res(); } });
      if (ses !== this.ses) return;
      this.h.parcial('Transcribiendo…');
      try {
        const blob = new Blob(trozos, { type: (tipo || 'audio/webm').split(';')[0] });
        const r = await fetch(CFG.endpoint + '/transcribir', { method: 'POST', headers: { 'content-type': blob.type }, body: blob });
        const d = await r.json().catch(() => ({}));
        if (ses !== this.ses) return;
        const texto = String(d.texto || '').trim();
        if (r.ok && texto) this.h.frase(texto);
        else if (r.ok) this.h.inactivo();
        else this.h.error('No pude transcribir tu voz en este momento. Inténtalo de nuevo o escríbeme.');
      } catch (_) { if (ses === this.ses) this.h.error('No pude transcribir tu voz en este momento. Inténtalo de nuevo o escríbeme.'); }
    }
    detener() {
      this.activo = false; this.ses++; clearTimeout(this.t);
      const rec = this.rec; this.rec = null;
      if (rec && rec.state !== 'inactive') { rec.ondataavailable = null; try { rec.stop(); } catch (_) {} }
    }
  }

  // Usa el dictado del navegador; si no existe o falla su servicio, escucha con Voxtral
  class OidoMixto {
    constructor(h) {
      this.h = h; this.servidor = false; this.usarVox = !SR;
      const hh = Object.assign({}, h, { respaldo: () => { if (!this.servidor || !this.vox.disponible) return false; this.usarVox = true; setTimeout(() => this.vox.iniciar(), 0); return true; } });
      this.nav = new Oido(hh); this.vox = new OidoVoxtral(h);
    }
    get disponible() { return this.nav.disponible || (this.servidor && this.vox.disponible); }
    get activo() { return this.nav.activo || this.vox.activo; }
    get modo() { return this.usarVox || !SR ? 'voxtral' : 'navegador'; }
    iniciar() { if ((this.usarVox || !SR) && this.servidor) this.vox.iniciar(); else this.nav.iniciar(); }
    detener() { this.nav.detener(); this.vox.detener(); }
  }

  /* ===================================================================
     7. UTILIDADES DE TEXTO
     =================================================================== */
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function markdown(txt) {
    const lineas = esc(txt).split('\n');
    let html = '', lista = null, parrafo = [];
    const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*(?!\s)(.+?)\*(?!\*)/g, '$1<i>$2</i>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const cerrarP = () => { if (parrafo.length) { html += '<p>' + inline(parrafo.join('<br>')) + '</p>'; parrafo = []; } };
    const cerrarL = () => { if (lista) { html += `</${lista}>`; lista = null; } };
    for (const l of lineas) {
      const ul = l.match(/^\s*[-•*]\s+(.*)/), ol = l.match(/^\s*\d+[.)]\s+(.*)/);
      if (ul || ol) {
        cerrarP(); const tipo = ul ? 'ul' : 'ol';
        if (lista !== tipo) { cerrarL(); html += `<${tipo}>`; lista = tipo; }
        html += '<li>' + inline((ul || ol)[1]) + '</li>';
      } else if (!l.trim()) { cerrarP(); cerrarL(); }
      else { cerrarL(); parrafo.push(l.replace(/^#{1,6}\s+/, '')); }
    }
    cerrarP(); cerrarL();
    return html;
  }

  // Algunos modelos pegan oraciones ("ahora.¿Estás"): agrega el espacio que falta
  const espaciar = t => String(t).replace(/([.!?…])(?=[¿¡(A-ZÁÉÍÓÚÑ])/g, '$1 ');

  // Divide el texto que llega en streaming en frases para hablarlas cuanto antes
  class Troceador {
    constructor(cb) { this.cb = cb; this.pend = ''; this.n = 0; }
    agregar(delta) {
      this.pend += delta;
      for (;;) {
        const re = /([.!?…]+["”»)]?)(\s+)|(\n+)|([:;])(\s+)/g;
        let m, corte = -1;
        while ((m = re.exec(this.pend))) {
          const fin = m.index + m[0].length;
          const largo = this.pend.slice(0, fin).trim().length;
          const minimo = this.n === 0 ? 12 : 40;
          if (largo >= minimo) { corte = fin; break; }
        }
        if (corte < 0 && this.pend.length > 220) { const c = this.pend.lastIndexOf(', ', 200); if (c > 60) corte = c + 2; }
        if (corte < 0) break;
        const frase = this.pend.slice(0, corte).trim(); this.pend = this.pend.slice(corte);
        if (frase) { this.n++; this.cb(frase); }
      }
    }
    terminar() { const f = this.pend.trim(); this.pend = ''; if (f) { this.n++; this.cb(f); } }
  }

  /* ===================================================================
     8. CONTROL DE VECTOR: Vera lee la pantalla y opera los controles
     =================================================================== */
  const PELIGRO = /limpiar|restablecer|borrar|eliminar|proyecto nuevo|reiniciar|quitar todo|desde cero/i;
  const ENVIO = /^(enviar|mandar)\b|enviar solicitud|enviar correo|abrir en outlook|enviar por correo/i;
  // Devuelve la etiqueta de la acción si borra información o envía algo fuera de Vector (requiere un "sí")
  function riesgo(a) {
    if (a.tipo === 'clic' || a.tipo === 'tecla') {
      if (a.tipo === 'tecla') return '';
      const l = Control.etiqueta(Control.resolver(a));
      return PELIGRO.test(l) || ENVIO.test(l) ? l : '';
    }
    if (a.tipo === 'mapa' && /^(limpia|borra)/.test(norm(a.accion))) return 'Limpiar el polígono del mapa';
    return '';
  }
  const FIN = '(?=$|[\\s,.;:!¡?¿])';
  const AFIRMA = new RegExp('^\\s*(s[ií]|claro|confirmo|confirmado|adelante|hazlo|dale|ok|okay|de acuerdo|procede|correcto|as[ií] es|va|sale)' + FIN, 'i');
  const CONFIRMA_EN_TEXTO = new RegExp('(^|[\\s,¡¿])(s[ií]|confirmo|adelante|hazlo|procede|de acuerdo)' + FIN, 'i');
  const NIEGA = /^\s*(no|cancela|cancelar|mejor no|olv[ií]dalo|det[eé]nte|alto|espera)\b/i;
  const PUEDES = /^\s*¿?\s*(puedes|podr[ií]as|me ayudas a|ay[uú]dame a|quiero que|necesito que|me haces el favor de)\s+\w/i;
  const COMANDO = /\b(gira\w*|rota\w*|voltea\w*|ac[eé]rca\w*|al[eé]ja\w*|zoom|vista|corte|corta\w*|delimita\w*|dibuja\w*|traza\w*|mueve|mu[eé]vete|pausa\w*|reanuda\w*|repite|desliza\w*|ajusta\w*|identifica\w*|resalta\w*|centra\w*|enfoca\w*|sat[eé]lite|inclina\w*|explora\w*|env[ií]a\w*|adjunta\w*|oprime|presiona|tecla|desplaza\w*|ve|ir|vamos|vete|ll[eé]vame|lleva|abre|abrir|cierra|captur\w*|escrib\w*|pon|ponle|p[oó]n\w*|coloca|llena|ll[eé]na\w*|selecciona\w*|elige|escoge|activa\w*|desactiva\w*|marca|desmarca|quita\w*|agrega\w*|añade|cambia\w*|regresa\w*|vuelve|avanza|siguiente|contin[uú]a|genera\w*|haz|hazme|muestra\w*|ens[eé]ñame|baja|sube|busca\w*|configura\w*|limpia\w*|borra\w*|restablece\w*|usa|apaga|enciende|oculta|paso|pesta[nñ]a|modo|reporte|clic|presiona|dale|incluye|excluye|considera|cotiza)\b/i;

  // Afirmaciones sobre el proyecto ("la nave mide…", "sin tapial") también son órdenes
  const DICE_PROYECTO = /\b(nave|oficinas?|terreno|tapial|demol\w*|muros?|gr[uú]as?|mezzanine|and[eé]n\w*|cortinas?|domos?|luz natural|fosas?|piso|plaf[oó]n|fachada|control de acceso|tr[aá]iler\w*|cami[oó]n\w*|[aá]reas? verdes|per[ií]metro|murete|torniquete|drenaje|vialidad|pavimento|asfalto|banquetas?|estacionamiento|caseta|sanitarios?|cuartos? de servicio|presupuesto meta|metros|m²|m2|hect[aá]reas?|nivel (b[aá]sico|funcional|est[aá]ndar|superior))\b/i;
  const ES_PREGUNTA = /^\s*¿|\?\s*$|^\s*(qu[eé]|cu[aá]nt\w*|c[oó]mo|cu[aá]l\w*|por ?qu[eé]|d[oó]nde|expl[ií]ca\w*|dime|sabes|crees)\b/i;
  const ORDEN_FUERTE = /\b(mu[eé]stra\w*|ens[eé][ñn]a\w*|gira\w*|g[ií]ra\w*|rota\w*|ac[eé]rca\w*|al[eé]ja\w*|delimita\w*|dibuja\w*|mueve|pausa\w*|reanuda\w*|ajusta\w*|desliza\w*|identifica\w*|resalta\w*|inclina\w*|desplaza\w*|env[ií]a\w*|busca\w*|ll[eé]va\w*|captur\w*|escrib\w*|pon\w*|selecciona\w*|elige|escoge|activa\w*|desactiva\w*|marca\w*|cambia\w*|ve al|ir al|abre|genera\w*|limpia\w*|quita\w*|agrega\w*|configura\w*|regresa\w*)\b/i;
  const PIDE_IR = /ll[eé]va|ve a|ve al|ir a|vamos|abre|paso|regresa|vuelve|mu[eé]strame|ens[eé]ñame|pasa a|siguiente|contin[uú]a|avanza/i;
  const PIDE_AVANZAR = /contin[uú]|siguiente|avanz|sigue|adelante|pr[oó]xim|termina|pasa al/i;
  const PIDE_APLICAR = /aplica|c[aá]mbia|cambiar|usa |elige|escoge|qu[eé]date|pon |ponle|qu[ií]ero (esa|la|el)|me quedo|s[ií],? (esa|la|aplica)/i;
  const PIDE_VER = /atras|detras|desde|costado|perfil|isometric|zenital|lejos|cerca|vista|\bver\b|\bve[ao]?\b|muestr|ensen|gir|rot[ae]|vuelta|acerc|alej|zoom|modelo|3d|planta|arriba|abajo|frente|frontal|lado|lateral|enfoc|centr|ubica|selecci|resalt|elemento|camara|isom|mueve|muevel|despl|inclin|perspectiv|restablec|nube|recorr/i;
  const AVANZAR = /^(continuar|siguiente)\s*[→›>]?\s*$/i;

  const visible = e => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(e);
    return s.visibility !== 'hidden' && s.display !== 'none' && !e.closest('[aria-hidden="true"]');
  };

  // Un elemento dentro de un contenedor casi transparente no se ve (p. ej., ventanas cerradas con opacity:0)
  // Rango de una barra personalizada leyendo su texto ("Semana 6.1 / 34.6" → 34.6)
  function rangoBarra(el) {
    const re = /(?:semana|sem|d[ií]a|mes)\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)/i;
    for (let p = el, i = 0; p && i < 6; p = p.parentElement, i++) {
      const m = ((p.title || '') + ' ' + (p.getAttribute && p.getAttribute('aria-label') || '') + ' ' + (p.innerText || '')).replace(/\s+/g, ' ').match(re);
      if (m && parseFloat(m[2]) > 1) return parseFloat(m[2]);
    }
    return 0;
  }
  const transparente = e => { for (let p = e; p && p !== document.body; p = p.parentElement) { if (parseFloat(getComputedStyle(p).opacity) < 0.05) return true; } return false; };
  // Termina las transiciones de entrada de Vector (aparecer, deslizar) para leer la pantalla ya asentada.
  // Si la pestaña está en segundo plano el navegador las congela y los controles quedarían "invisibles".
  function asentar() {
    try {
      for (const a of document.getAnimations()) {
        const t = a.effect && a.effect.target, tm = a.effect && a.effect.getTiming ? a.effect.getTiming() : {};
        if (!t || t.getRootNode() !== document || a.playState !== 'running' || tm.iterations === Infinity) continue;
        if (typeof CSSTransition !== 'undefined' && a instanceof CSSTransition || (tm.iterations || 1) <= 1) { try { a.finish(); } catch (_) {} }
      }
    } catch (_) {}
  }
  // Ventana modal abierta encima de todo (sus controles son los únicos que el usuario puede usar)
  function modalActivo() {
    const c = [...document.querySelectorAll('#gcPointCloudModal.show,#gcSurveyModal.show,#gcEmailPreview.show,[aria-modal="true"],[role=dialog]')]
      .filter(d => !d.closest('#vector-voz') && visible(d) && !transparente(d) && getComputedStyle(d).position === 'fixed' && d.getBoundingClientRect().width * d.getBoundingClientRect().height > innerWidth * innerHeight * 0.25);
    if (!c.length) return null;
    return c.sort((a, b) => (parseInt(getComputedStyle(b).zIndex) || 0) - (parseInt(getComputedStyle(a).zIndex) || 0))[0];
  }
  // "30 de octubre", "30/10/2026" → 2026-10-30 (para campos de fecha)
  function fechaISO(t) {
    const M = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    const n = norm(t), hoy = new Date(); let d, m, y;
    let k = n.match(/(\d{1,2}) de ([a-z]+)(?: (?:de|del) (\d{4}))?/);
    if (k && M.indexOf(k[2]) >= 0) { d = +k[1]; m = M.indexOf(k[2]) + 1; y = k[3] ? +k[3] : hoy.getFullYear(); }
    else if ((k = String(t).match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/))) { d = +k[1]; m = +k[2]; y = +k[3] < 100 ? 2000 + +k[3] : +k[3]; }
    else return '';
    if (!k[3] && new Date(y, m - 1, d) < new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate())) y++;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const Control = {
    refs: [], etiquetas: [], tipos: [], raiz: null,
    _tipo(e) {
      const t = e.tagName, ty = (e.type || '').toLowerCase(), role = e.getAttribute('role');
      if (t === 'CANVAS') return 'visor 3D';
      if (e.id === 'gcSurveyMap') return 'mapa';
      if (Extra.esBarra(e)) return 'barra';
      if (t === 'INPUT' && ty === 'file') return 'adjuntar';
      if (t === 'INPUT' && (ty === 'checkbox' || ty === 'radio')) return 'casilla';
      if (t === 'SUMMARY') return 'desplegable';
      if (t === 'INPUT' || t === 'TEXTAREA') return ty === 'search' ? 'buscador' : 'campo';
      if (t === 'SELECT') return 'lista';
      if (role === 'tab' || /(^|\s)tab(\s|$)/.test(e.className)) return 'pestaña';
      if (/g-step/.test(e.className)) return 'paso';
      if (t === 'A') return 'enlace';
      return 'botón';
    },
    _sel(e) {
      if (e.type === 'checkbox' || e.type === 'radio') return e.checked;
      if (e.getAttribute('aria-pressed') === 'true' || e.getAttribute('aria-selected') === 'true' || e.getAttribute('aria-checked') === 'true' || (e.getAttribute('aria-current') && e.getAttribute('aria-current') !== 'false')) return true;
      return /(^|\s)(selected|active|on|current|is-active|checked)(\s|$)/.test(typeof e.className === 'string' ? e.className : '');
    },
    _contexto(e) {
      let p = e.parentElement;
      for (let i = 0; i < 4 && p; i++) { const t = (p.innerText || '').trim(); if (t) return t; p = p.parentElement; }
      return '';
    },
    _etiqueta(e) {
      if (e.tagName === 'CANVAS') return e.closest('#gcPointCloudModal') ? 'Nube de puntos del levantamiento (usa [[vista ...]])' : 'Modelo 3D del proyecto (usa [[vista ...]] y [[elemento ...]])';
      if (e.id === 'gcSurveyMap') return 'Mapa de Google del terreno (usa [[mapa ...]])';
      if (e.tagName === 'INPUT' && e.type === 'range') {
        const l = e.getAttribute('aria-label') || (e.id && document.querySelector(`label[for="${window.CSS.escape(e.id)}"]`) || {}).innerText || this._contexto(e);
        return `${l} = ${e.value} (de ${e.min || 0} a ${e.max || 100})`;
      }
      if (Extra.esBarra(e)) {
        const l = (e.getAttribute('aria-label') || e.title || 'Barra').replace(/^arrastra para\s*/i, '');
        const card = e.closest('[class*=card]'); const head = card && card.querySelector('[class*=head]');
        const vmin = e.getAttribute('aria-valuemin'), vmax = e.getAttribute('aria-valuemax');
        return l + (head ? ' · ' + head.innerText.replace(/\s+/g, ' ').trim().slice(0, 60) : '') + (e.getAttribute('aria-valuenow') ? ` = ${e.getAttribute('aria-valuenow')}` : '') + (vmax != null ? ` (de ${vmin || 0} a ${vmax})` : rangoBarra(e) ? ` (valor = semana 0–${rangoBarra(e)}, o %)` : ' (usa %: 0% inicio, 50% mitad, 100% final)');
      }
      if (e.tagName === 'INPUT' && (e.type === 'checkbox' || e.type === 'radio')) {
        const cod = e.dataset.sub || e.dataset.part || e.dataset.front;
        if (cod) { const x = Experto.catalogo().find(k => k.c === cod); if (x) return `${cod} ${x.n}${e.disabled ? ' (opción alterna)' : ''}`; }
        const sib = e.nextElementSibling;
        const l = e.closest('label') || (e.id && document.querySelector(`label[for="${window.CSS.escape(e.id)}"]`)) || (sib && sib.tagName === 'LABEL' ? sib : null);
        if (l && l.innerText.trim()) return l.innerText;
      }
      if (e.tagName === 'INPUT' && (e.dataset.topArea || e.dataset.area)) {
        const c = e.dataset.topArea || e.dataset.area, x = Experto.catalogo().find(k => k.c === c);
        return `Área m² del frente ${c} ${x ? x.n : ''} = "${e.value || ''}"`;
      }
      if (/INPUT|SELECT|TEXTAREA/.test(e.tagName)) {
        const l = (e.id && document.querySelector(`label[for="${window.CSS.escape(e.id)}"]`)) || e.closest('label');
        const ph = /\p{L}{3}/u.test(e.placeholder || '') ? e.placeholder : '';
        const prev = e.previousElementSibling, lp = prev && /LABEL|SPAN|SMALL|B|STRONG/.test(prev.tagName) && prev.innerText.trim().length < 80 ? prev.innerText : '';
        const cx = this._contexto(e), cxc = cx && cx.length <= 60 ? cx : '';
        const ctx = (l && l.innerText.trim() ? l.innerText : '') || e.getAttribute('aria-label') || lp || cxc || ph || cx || '';
        const v = (e.type === 'checkbox' || e.type === 'radio') ? '' : e.tagName === 'SELECT'
          ? ` = "${(e.options[e.selectedIndex] || {}).text || ''}"${e.options.length <= 10 ? ` (opciones: ${[...e.options].map(o => o.text.trim()).filter(Boolean).join(' | ')})` : ''}`
          : ` = "${e.value || ''}"${e.type === 'date' ? ' (fecha AAAA-MM-DD)' : ''}`;
        return ctx.replace(/Cambiar a esta opción/g, '') + v;
      }
      return e.getAttribute('aria-label') || e.innerText || e.title || '';
    },
    _esOverlay(t) {
      for (let p = t; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (parseFloat(cs.opacity) < 0.05) return false;
        if (cs.position === 'fixed') {
          const r = p.getBoundingClientRect();
          if (r.width * r.height > innerWidth * innerHeight * 0.3) return true;
        }
      }
      return false;
    },
    // Lista numerada de los controles que el usuario podría usar ahora mismo.
    // Si hay demasiados, prioriza los visibles, los del diálogo abierto y los que coinciden con la petición.
    mapa(limite = 70, consulta) {
      if (consulta == null) consulta = this.consulta || '';
      asentar();
      if (this.raiz) this.raiz.dataset.midiendo = '';
      this.refs = []; this.etiquetas = []; this.tipos = []; this.dialogo = false;
      const SEL = 'button,input:not([type=hidden]):not([type=password]),select,textarea,[role=button],[role=tab],[role=checkbox],[role=radio],[role=switch],[role=slider],[role=menuitem],[role=option],a[href],summary,canvas[title],#gcSurveyMap,[title*="rrastra"]';
      const pal = norm(consulta).split(' ').filter(w => w.length > 2 && !VACIAS.has(w));
      const cands = [];
      try {
        const modal = modalActivo();
        // Las opciones de la Experiencia Guiada se manejan con [[opcion …]] (catálogo); no se repiten en el mapa
        const els = [...document.querySelectorAll(SEL)].filter(e => !e.disabled && !e.closest('#vector-voz') && !e.matches('button.choice[data-choice-field],input[data-gcheck]') && (!modal || modal.contains(e)) && visible(e) && !transparente(e) && !(e.tagName === 'CANVAS' && !/orbitar/i.test(e.title || '')) && !(e.closest('#gcSurveyMap') && e.id !== 'gcSurveyMap' && !e.matches('button,[role=button],[role=menuitemradio],[role=menuitemcheckbox]')));
        for (const e of els) {
          const r = e.getBoundingClientRect();
          const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1), cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
          let fuera = r.bottom < 0 || r.top > innerHeight;
          if (!fuera && e.tagName !== 'CANVAS' && e.id !== 'gcSurveyMap') {
            const t = document.elementFromPoint(cx, cy);
            if (t && !(t === e || e.contains(t) || t.contains(e)) && this._esOverlay(t)) { this.dialogo = true; continue; } // tapado por un diálogo
          }
          let l = this._etiqueta(e).replace(/\s+/g, ' ').trim().replace(/^[^\p{L}\p{N}¿¡"«(]+/u, '').trim();
          if (!l) continue;
          if (l.length > 90) l = l.slice(0, 88) + '…';
          const enDialogo = !!e.closest('[aria-modal="true"],[role=dialog],.show[class*=modal],#gBuildSimulation:not([hidden])');
          const n = norm(l);
          const coincide = pal.filter(w => n.includes(w)).length;
          cands.push({ e, l, fuera, tipo: this._tipo(e), pts: (fuera ? 0 : 3) + (enDialogo ? 2 : 0) + coincide * 4 + (e.tagName === 'CANVAS' || e.id === 'gcSurveyMap' ? 3 : 0) });
        }
      } finally { if (this.raiz) delete this.raiz.dataset.midiendo; }
      // Botones con el mismo texto ("Cambiar", "Cambiar a esta opción"): se agrega su contexto
      const cuenta = {};
      cands.forEach(c => { const k = norm(c.l); cuenta[k] = (cuenta[k] || 0) + 1; });
      for (const c of cands) {
        if (cuenta[norm(c.l)] < 2 || /casilla|campo|barra/.test(c.tipo)) continue;
        let ctx = '';
        const prev = c.e.previousElementSibling;
        if (prev && prev.innerText && prev.innerText.trim()) ctx = prev.innerText;
        else { let p = c.e.parentElement; for (let i = 0; i < 4 && p && !ctx; i++, p = p.parentElement) { const t = (p.innerText || '').replace(c.e.innerText || '', '').trim(); if (t) ctx = t; } }
        ctx = ctx.replace(/\s+/g, ' ').trim().slice(0, 50);
        if (ctx) c.l = `${c.l} · ${ctx}`;
      }
      let elegidos = cands;
      if (cands.length > limite) {
        const orden = cands.map((c, i) => [c.pts, -i, c]).sort((a, b) => b[0] - a[0] || b[1] - a[1]).slice(0, limite).map(x => x[2]);
        const set = new Set(orden); elegidos = cands.filter(c => set.has(c));
      }
      const out = [];
      for (const c of elegidos) {
        this.refs.push(c.e); this.etiquetas.push(c.l); this.tipos.push(c.tipo);
        out.push(`[${this.refs.length}] ${c.fuera ? '↓' : ''}${c.tipo} · ${c.l}${c.tipo !== 'barra' && this._sel(c.e) ? ' (SELECCIONADO)' : ''}`);
      }
      if (cands.length > elegidos.length) out.push(`(… ${cands.length - elegidos.length} controles más fuera de vista; si no ves el que necesitas, usa [[desplazar abajo]] y [[seguir]])`);
      return out.join('\n');
    },
    pantalla() {
      try {
        const modo = [...document.querySelectorAll('.mode-btn')].find(b => this._sel(b));
        const paso = [...document.querySelectorAll('.g-step')].find(b => this._sel(b));
        const h1 = [...document.querySelectorAll('h1')].find(h => visible(h) && !h.closest('#vector-voz'));
        const ventanas = [];
        if (document.querySelector('#gcPointCloudModal.show')) ventanas.push('Nube de puntos (ejemplo 3D)');
        const sv = document.querySelector('#gcSurveyModal.show'); if (sv) ventanas.push('Solicitud de levantamiento con mapa de Google');
        const sim = document.getElementById('gBuildSimulation'); if (sim && !sim.hidden && visible(sim)) ventanas.push(document.body.classList.contains('vector-build-explore') || (document.getElementById('gBuildExplore') && !document.getElementById('gBuildExplore').hidden) ? 'Exploración del modelo terminado (cortes X·Y·Z)' : 'Simulación constructiva 4D');
        [...document.querySelectorAll('[aria-modal="true"],[role=dialog]')].filter(d => !d.closest('#vector-voz') && visible(d) && !/gcPointCloudModal|gcSurveyModal/.test(d.id)).slice(0, 2).forEach(d => { const h = d.querySelector('h2,h3,strong'); if (h) ventanas.push(h.innerText.replace(/\s+/g, ' ').trim().slice(0, 60)); });
        if ([...document.querySelectorAll('button')].some(b => !b.closest('#vector-voz') && visible(b) && /^saltar (el )?recorrido/i.test((b.innerText || '').trim()))) ventanas.push('Recorrido de ayuda abierto (botones Siguiente / Saltar recorrido)');
        const tab = [...document.querySelectorAll('button.tab')].find(b => visible(b) && this._sel(b));
        return [modo && 'Modo: ' + modo.innerText.trim(),
          paso && 'Paso: ' + (paso.getAttribute('aria-label') || '').split('·')[0].replace(/^Ir a\s*/, '').trim(),
          tab && 'Pestaña: ' + tab.innerText.trim(),
          ventanas.length && 'Ventana abierta: ' + ventanas.join(' / '),
          h1 && 'Título: ' + h1.innerText.replace(/\s+/g, ' ').trim().slice(0, 140)].filter(Boolean).join(' · ');
      } catch (_) { return ''; }
    },
    etiqueta(n) { return this.etiquetas[n - 1] || ''; },
    // Para hablar de alternativas o ahorros en el Resultado, se abre el panel que tiene las cifras reales
    async abrirAlternativas() {
      try {
        if ([...document.querySelectorAll('.g-alt-group')].some(visible)) return;
        const b = [...document.querySelectorAll('button')].find(e => !e.closest('#vector-voz') && visible(e) && /^explorar alternativas/i.test((e.innerText || '').trim()));
        if (b) { this._clicReal(b); await espera(900); asentar(); }
      } catch (_) {}
    },
    pideRecorrido() { return /recorrido|tour|gu[ií]ame|ens[eé][ñn]ame (a usar|c[oó]mo)|expl[ií]came (la|esta) pantalla/i.test(this.consulta || '') && !/salta|cierra|termina|quita|omite|det[eé]n/i.test(this.consulta || ''); },
    // Cierra recorridos de ayuda (no borran nada) para que Vera vea la pantalla real
    async despejarAyuda() {
      asentar();
      for (let i = 0; i < 3; i++) {
        let b = null;
        if (this.raiz) this.raiz.dataset.midiendo = '';
        try {
          b = [...document.querySelectorAll('button,[role=button]')].find(e => {
            if (e.closest('#vector-voz') || !/^(saltar (el )?(recorrido|introducci[oó]n|tour|ayuda)|entendido(,? continuar)?\s*[→›]?)$/i.test((e.innerText || '').trim()) || !visible(e)) return false;
            // Si el usuario pidió el recorrido, no se cierra solo
            if (/^saltar/i.test((e.innerText || '').trim()) && this.pideRecorrido()) return false;
            const r = e.getBoundingClientRect(), t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            return t && (t === e || e.contains(t));
          });
        } finally { if (this.raiz) delete this.raiz.dataset.midiendo; }
        if (!b) return;
        // Avisos informativos de Vector: se cierran, pero se guarda qué decían para contárselo al usuario
        if (/^entendido$/i.test(b.innerText.trim())) {
          const d = b.closest('[role=dialog],[aria-modal="true"],[class*=modal],[class*=dialog]') || b.parentElement.parentElement;
          const tit = d && (d.querySelector('h1,h2,h3') || {}).innerText, cuerpo = d && [...d.querySelectorAll('p,strong,b')].map(x => x.innerText).join(' ');
          if (tit) this.avisos.push(`${tit.replace(/\s+/g, ' ').trim()}: ${(cuerpo || '').replace(/\s+/g, ' ').trim().slice(0, 220)}`);
        }
        this._clicReal(b);
        await espera(500);
      }
    },
    avisos: [], avisosVistos: new Set(),
    // Encuentra el control: valida que el número coincida con el texto; si no, lo busca por texto
    resolver(a) {
      let txt = norm(a.texto || '');
      // "barra", "botón", "campo"… no describen nada: manda el número del mapa
      if (/^(la |el )?(barra|boton|campo|control|slider|deslizador|casilla|lista|linea del tiempo|valor)$/.test(txt)) txt = '';
      const sim = lab => {
        if (!txt) return 0;
        const L = norm(lab.replace(/\s=\s".*"$/, ''));
        if (L === txt || L.startsWith(txt)) return 1;
        const w = txt.split(' ').filter(Boolean), Lw = L.split(' ');
        // palabras cortas (X, Y, Z, 1, 2) cuentan solo como palabra completa
        return w.length ? w.filter(x => x.length <= 2 ? Lw.includes(x) : L.includes(x)).length / w.length : 0;
      };
      const esCampo = i => a.tipo === 'ajustar' ? /barra/.test(this.tipos[i] || '') : /campo|buscador|lista/.test(this.tipos[i] || '');
      if (a.n && this.refs[a.n - 1] && (!txt || sim(this.etiquetas[a.n - 1]) >= 0.6 || (/escribir|ajustar/.test(a.tipo) && norm(this.etiquetas[a.n - 1]).includes(txt))) && (!/escribir|ajustar/.test(a.tipo) || esCampo(a.n - 1))) return a.n;
      if (!txt) return /escribir|ajustar/.test(a.tipo) && a.n && this.refs[a.n - 1] && esCampo(a.n - 1) ? a.n : 0;
      let mejor = 0, ms = 0;
      this.etiquetas.forEach((l, i) => {
        if (/escribir|ajustar/.test(a.tipo) && !esCampo(i)) return;
        const sc = sim(l) - (this.etiquetas[i].startsWith('↓') ? 0 : 0);
        if (sc > ms) { ms = sc; mejor = i + 1; }
      });
      if (ms >= 0.6) return mejor;
      // Si solo hay una barra en pantalla, "ajustar" se refiere a ella
      if (a.tipo === 'ajustar') { const bs = this.tipos.map((t, i) => /barra/.test(t || '') ? i + 1 : 0).filter(Boolean); if (bs.length === 1) return bs[0]; }
      return 0;
    },
    // Marca o desmarca una casilla del MAPA por número ([[opcion 12 = Sí]] que a veces escribe la IA)
    async casilla(n, valor, foco) {
      const el = this.refs[n - 1];
      if (!el || !el.isConnected) return { ok: false, txt: `El control #${n} cambió; vuelve a pedírmelo` };
      const cb = el.matches('input[type=checkbox],input[type=radio]') ? el : el.querySelector && el.querySelector('input[type=checkbox],input[type=radio]');
      const nombre = this.etiqueta(n).replace(/\s=\s".*$/, '').slice(0, 48);
      if (!cb) { this._clicReal(el); await espera(400); return { ok: true, txt: `Clic en ${nombre}` }; }
      const quiere = !/^(no|false|0|desmarc|quit|sin|desactiv)/i.test(norm(valor));
      if (cb.checked === quiere) return { ok: true, txt: `${nombre} ya estaba ${quiere ? 'marcado' : 'sin marcar'}` };
      foco.mostrar(cb, quiere ? 'Marcar' : 'Desmarcar'); await espera(250);
      this._clicReal(cb); await espera(400);
      if (cb.checked !== quiere) { cb.checked = quiere; cb.dispatchEvent(new Event('input', { bubbles: true })); cb.dispatchEvent(new Event('change', { bubbles: true })); }
      return { ok: true, txt: `${quiere ? 'Marqué' : 'Desmarqué'} ${nombre}` };
    },
    // Un "clic" en una opción de lista desplegable: se elige esa opción en la lista que la contiene
    _opcionDeLista(texto) {
      const t = norm(texto || ''); if (!t) return 0;
      for (let i = 0; i < this.refs.length; i++) {
        const el = this.refs[i];
        if (el && el.tagName === 'SELECT' && [...el.options].some(o => norm(o.text) === t || (t.length >= 4 && norm(o.text).includes(t)))) return i + 1;
      }
      return 0;
    },
    _clicReal(el) {
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, cancelable: true, composed: true, view: window, button: 0, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      try {
        el.dispatchEvent(new PointerEvent('pointerdown', { ...o, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
        el.dispatchEvent(new MouseEvent('mousedown', o));
        el.focus({ preventScroll: true });
        el.dispatchEvent(new PointerEvent('pointerup', { ...o, pointerId: 1, isPrimary: true, pointerType: 'mouse' }));
        el.dispatchEvent(new MouseEvent('mouseup', o));
      } catch (_) {}
      el.click();
    },
    _escribir(el, valor) {
      let v = String(valor).trim();
      if (el.tagName === 'SELECT') {
        const SIN = { espanol: 'es', ingles: 'eng', english: 'eng', pesos: 'mxn', 'pesos mexicanos': 'mxn', dolares: 'usd', 'dolares americanos': 'usd', si: 'si', no: 'no' };
        const nv = norm(v), alt = SIN[nv] || nv;
        const ops = [...el.options], nt = o => norm(o.text);
        const op = ops.find(o => o.value === v) || ops.find(o => nt(o) === alt) || ops.find(o => nt(o).includes(alt) && alt.length >= 2) || ops.find(o => alt.includes(nt(o)) && nt(o).length >= 3);
        if (!op) return false;
        el.value = op.value;
      } else {
        if (el.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) { const f = fechaISO(v); if (f) v = f; }
        if (el.type !== 'date' && /^[\d\s.,]+\s*(m2|m²|mxn|pesos|\$|%)?$/i.test(v.replace(/^\$/, ''))) v = v.replace(/[^\d.,]/g, '').replace(/,(?=\d{3}(\D|$))/g, '');
        const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        el.focus({ preventScroll: true });
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
      return true;
    },
    async ejecutar(a, foco) {
      asentar();
      try {
        if (a.tipo === 'ir') return await Habil.irA(a.paso, foco);
        if (a.tipo === 'dato') return await Habil.dato(a.clave, a.valor, foco);
        if (a.tipo === 'opcion' && /^\d+$/.test(String(a.grupo).trim())) return await this.casilla(+a.grupo, a.valor, foco);
        if (a.tipo === 'opcion') return await Habil.opcion(a.grupo, a.valor, foco);
        if (a.tipo === 'vista') return await Visor3D.ejecutar(a.accion, a.valor, foco);
        if (a.tipo === 'elemento') {
          let r = await Visor3D.identificar(a.texto, foco);
          // Si no está en la vista actual, se vuelve a la vista completa y se busca otra vez
          if (!r.ok && a.texto && Visor3D.activo()) { await Visor3D.ejecutar('restablecer', '', foco); r = await Visor3D.identificar(a.texto, foco); }
          return r;
        }
        if (a.tipo === 'mapa') return await MapaG.ejecutar(a.accion, a.valor, foco);
        if (a.tipo === 'concepto') return await Experto.concepto(a.ref, a.valor, foco);
        if (a.tipo === 'area') return await Experto.areaFrente(a.ref, a.valor, foco);
        if (a.tipo === 'resaltar') return await Experto.resaltar(a.ref, foco);
        if (a.tipo === 'tecla') return Extra.tecla(a.valor);
        if (a.tipo === 'pagina') { const r = Extra.desplazar(a.valor); await espera(500); return r; }
      } catch (err) { return { ok: false, txt: 'No pude completar esa acción' }; }
      let n = this.resolver(a);
      // La app pudo redibujarse tras la acción anterior: vuelve a mirar la pantalla y busca por nombre
      if (!n || !this.refs[n - 1] || !this.refs[n - 1].isConnected) {
        if (!a.texto) return { ok: false, txt: `El control #${a.n} cambió; vuelve a pedírmelo` };
        this.mapa();
        n = this.resolver({ ...a, n: 0 });
      }
      if (!n && a.tipo === 'clic') { const ns = this._opcionDeLista(a.texto); if (ns) { a = { ...a, tipo: 'escribir', valor: a.texto }; n = ns; } }
      if (!n) return { ok: false, txt: `No encontré «${(a.texto || ('#' + a.n)).slice(0, 40)}» en pantalla` };
      a.n = n;
      const el = this.refs[n - 1], et = this.etiqueta(n);
      const corta = et.replace(/\s=\s".*$/, '').replace(/\s·\s(revisado|pendiente.*)$/, '').slice(0, 48);
      // Un panel o pestaña que ya está abierto no se vuelve a pulsar (lo cerraría) si lo que se pidió es verlo
      if (a.tipo === 'clic' && this._sel(el) && /button/i.test(el.tagName) && !/paso/.test(this.tipos[n - 1] || '') && /mu[eé]str|abre|abrir|ens[eé]ñ|\bve\b|\bver\b|explor|ll[eé]v|revisa|consulta/i.test(this.consulta || '') && !/quita|cierra|oculta|desactiva|deselecc|apaga/i.test(this.consulta || ''))
        return { ok: true, txt: `«${corta.slice(0, 40)}» ya estaba activo` };
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: REDUCIR_MOV ? 'auto' : 'smooth' });
      await espera(380);
      const verbo = a.tipo === 'escribir' ? `Escribí ${a.valor} en` : a.tipo === 'ver' ? 'Mostré' : 'Clic en';
      if (a.tipo !== 'ajustar') foco.mostrar(el, a.tipo === 'escribir' ? `Escribiendo ${a.valor}` : a.tipo === 'ver' ? 'Aquí' : 'Clic');
      await espera(280);
      try {
        if (a.tipo === 'ajustar') return await Extra.ajustar(el, a.valor, foco);
        const archivo = el.matches('input[type=file]') ? el : el.tagName === 'LABEL' && el.control && el.control.type === 'file' ? el.control : null;
        if (a.tipo === 'clic' && archivo) return { ok: false, txt: 'Por seguridad del navegador, los archivos los eliges tú: da clic en «' + corta + '»' };
        if (a.tipo === 'clic' && el.tagName === 'SELECT' && a.texto && this._escribir(el, a.texto)) { await espera(300); return { ok: true, txt: `Elegí ${a.texto} en ${corta}` }; }
        if (a.tipo === 'clic') {
          if (el.disabled) return { ok: false, txt: `${corta} está deshabilitado` };
          if (a.confirmado) {
            // El usuario ya lo confirmó con Vera: acepta también la confirmación nativa de la app
            const orig = window.confirm; window.confirm = () => true;
            try { this._clicReal(el); } finally { window.confirm = orig; }
          } else this._clicReal(el);
          // Vector avisa si hay pasos sin revisar; el usuario ya pidió la acción, así que se continúa
          await espera(500);
          const aviso = Habil._hit('button', b => /de todos modos$/i.test(b.innerText.trim()));
          if (aviso) {
            foco.mostrar(aviso, 'Continuar'); this._clicReal(aviso); await espera(700);
            // repite la acción original sobre la pantalla actualizada
            this.mapa(); const n2 = this.resolver({ ...a, n: 0, texto: a.texto || corta });
            if (n2 && !/de todos modos$/i.test(this.etiqueta(n2))) { this._clicReal(this.refs[n2 - 1]); await espera(500); }
          }
        } else if (a.tipo === 'escribir') {
          if (!/INPUT|TEXTAREA|SELECT/.test(el.tagName)) return { ok: false, txt: `${corta} no es un campo` };
          if (el.type === 'password' || /api.?key|maps.?key|token|contrase/i.test(el.id + ' ' + (el.name || ''))) return { ok: false, txt: 'Las llaves y contraseñas las escribes tú; yo no las capturo' };
          if (!this._escribir(el, a.valor)) return { ok: false, txt: `No encontré "${a.valor}" en ${corta}` };
        }
      } catch (err) { return { ok: false, txt: `Falló ${corta}` }; }
      await espera(420);
      return { ok: true, txt: `${verbo} ${corta}` };
    },
  };

  /* ===================================================================
     8b. HABILIDADES DE VECTOR: catálogo conocido de pasos, datos y opciones.
         El modelo solo elige la clave; el código navega, resuelve diálogos y da los clics.
     =================================================================== */
  const PASOS = ['Inicio', 'Objetivo', 'Sitio', 'Nave', 'Oficinas', 'Exteriores', 'Revisión', 'Simulación', 'Resultado'];
  const DATOS = {
    objetivo: { id: 'gf-clientTarget', pasos: ['Objetivo'], desc: 'presupuesto meta del cliente, en pesos' },
    terreno: { id: 'gif-landArea', pasos: ['Sitio'], desc: 'área del terreno, m² (informativo)' },
    nave: { id: 'gf-naveArea', pasos: ['Sitio', 'Nave'], desc: 'nave industrial, m²' },
    oficinas_exteriores: { id: 'gf-officeExternalFootprint', pasos: ['Sitio', 'Oficinas'], desc: 'huella de oficinas exteriores o anexas, m²' },
    niveles_oficinas: { id: 'gf-officeExternalLevels', pasos: ['Sitio', 'Oficinas'], desc: 'niveles de oficinas exteriores' },
    oficinas_interiores: { id: 'gf-officeInternalArea', pasos: ['Sitio', 'Nave'], desc: 'oficinas dentro de la nave, m²' },
    sanitarios_interiores: { id: 'gf-sanitaryInteriorArea', pasos: ['Sitio', 'Nave'], desc: 'sanitarios interiores, m²' },
    servicios_interiores: { id: 'gf-serviceInteriorArea', pasos: ['Sitio', 'Nave'], desc: 'cuartos de servicio interiores, m²' },
    sanitarios_exteriores: { id: 'gf-sanitaryExternalArea', pasos: ['Sitio', 'Exteriores'], desc: 'sanitarios exteriores, m²' },
    servicios_exteriores: { id: 'gf-serviceExternalArea', pasos: ['Sitio', 'Exteriores'], desc: 'cuartos de servicio exteriores, m²' },
    caseta: { id: 'gf-guardArea', pasos: ['Sitio', 'Exteriores'], desc: 'caseta de vigilancia, m²' },
    demolicion: { id: 'gf-demolitionArea', pasos: ['Sitio'], desc: 'área aproximada a demoler, m²' },
  };
  // Opciones de la Experiencia Guiada con los campos internos de Vector (data-choice-field / data-gcheck).
  // ops: [valor interno, título en pantalla, descripción]
  const GUIADA = {
    demolicion_existe: { f: 'demolition', paso: 'Sitio', d: "¿hay construcciones que retirar?", ops: [["no", "No", "No consideraremos demolición."], ["yes", "Sí", "Mostraremos el edificio a retirar y usaremos el área aproximada capturada al inicio de Sitio."]] },
    terreno_estado: { f: 'siteCondition', paso: 'Sitio', d: "preparación del terreno (desmontes y terracerías)", ops: [["prepared", "Ya está preparado", "No agregaremos desmontes ni terracerías."], ["needs", "Necesita preparación", "Incluiremos desmontes y terracerías paramétricas."], ["unknown", "No lo sé", "Los incluiremos como supuesto visible para no subestimar el inicio."]] },
    tapial: { f: 'tapial', paso: 'Sitio', d: "tapial temporal perimetral durante la obra", ops: [["no", "Sin tapial", "No se agrega protección temporal perimetral."], ["yes", "Sí, incluir tapial", "Selecciona el material temporal que quieres considerar."], ["unknown", "No lo sé", "Se usa malla ciclónica como supuesto visible."]] },
    material_tapial: { f: 'tapialMaterial', paso: 'Sitio', d: "material del tapial", ops: [["woodPlastic", "Madera + plástico", "Postes de madera con cerramiento plástico negro."], ["mesh", "Malla ciclónica", "Postes galvanizados + malla permeable."], ["drywall", "Tablaroca", "Panel temporal cerrado con modulación visible."], ["sheet", "Lámina", "Panel metálico acanalado galvanizado."]], req: ["tapial", "yes"] },
    nivel_interiores_nave: { f: 'interiorLevel', paso: 'Nave', d: "nivel de oficinas, sanitarios y cuartos de servicio dentro de la nave", ops: [["functional", "Funcional", "Base de costo para oficinas, sanitarios y cuartos de servicio interiores."], ["standard", "Estándar", "Nivel medio para los espacios interiores de la nave."], ["superior", "Superior", "Mayor nivel de especificación para los espacios interiores."]] },
    operacion: { f: 'operation', paso: 'Nave', d: "tipo de operación; define el piso de concreto", ops: [["light", "Almacenamiento / ligera", "Piso industrial normal y acabado base de menor exigencia."], ["normal", "Producción industrial", "Piso industrial normal para operación convencional."], ["heavy", "Operación pesada", "Piso de tráfico pesado y acabado de mayor resistencia."], ["unknown", "No lo sé", "Usaremos tráfico industrial normal y lo marcaremos como supuesto."]] },
    muros: { f: 'wallSystem', paso: 'Nave', d: "sistema de muros de la nave", ops: [["metal", "Muro metálico", "Solución ligera con opción de aislamiento en muro."], ["precast", "Precolado", "Panel prefabricado de concreto con cimentación compatible."], ["tiltup", "Tilt-Up", "Panel colado en sitio y levantado, con su cimentación compatible."], ["unknown", "No lo sé", "Usaremos muro metálico como base y lo dejaremos como supuesto."]] },
    confort_termico: { f: 'thermal', paso: 'Nave', d: "cubierta y aislamiento térmico", ops: [["basic", "Funcional", "Cubierta de lámina sin aislamiento adicional."], ["standard", "Estándar", "Lámina + aislamiento de fibra en cubierta"], ["high", "Alto desempeño", "Cubierta tipo panel aislado"]] },
    grua: { f: 'cranes', paso: 'Nave', d: "grúas viajeras (incluye su trabe carril)", ops: [["0", "Sin grúa viajera", "No se considera trabe carril."], ["1", "1 grúa viajera", "Incluye automáticamente trabe carril para una grúa."], ["2", "2 grúas viajeras", "Sustituye la opción anterior e incluye trabe carril para dos grúas."]] },
    mezzanine: { f: 'mezzanine', paso: 'Nave', d: "mezzanine de estructura pesada", ops: [["none", "Sin mezzanine", ""], ["100", "100 m²", "Estructura pesada adicional para aprox. 100 m²."], ["500", "500 m²", "Estructura pesada adicional para aprox. 500 m²."], ["1000", "1,000 m²", "Estructura pesada adicional para aprox. 1,000 m²."]] },
    iluminacion_natural: { f: 'daylight', paso: 'Nave', d: "entrada de luz natural en cubierta", ops: [["yes", "Sí", "Agregaremos un sistema de entrada de luz natural."], ["no", "No", "No agregaremos elementos translúcidos."], ["unknown", "No lo sé", "Lo dejaremos pendiente sin costo adicional por ahora."]] },
    tipo_iluminacion: { f: 'daylightType', paso: 'Nave', d: "acrílico o domos para la luz natural", ops: [["acrylic", "Acrílico", "Franjas o elementos translúcidos en cubierta."], ["domes", "Domos", "Domos puntuales; sustituye al acrílico."], ["auto", "Recomendación", "Usaremos acrílico como base."]], req: ["daylight", "yes"] },
    fosas: { f: 'pits', paso: 'Nave', d: "fosas o trincheras en piso", ops: [["none", "No", ""], ["small", "Pequeña", "Aprox. 5 × 5 m."], ["medium", "Mediana", "Aprox. 10 × 5 m."], ["large", "Grande", "Aprox. 15 × 5 m."]] },
    acabado_piso_nave: { f: 'floorFinish', paso: 'Nave', d: "acabado del piso de la nave", ops: [["auto", "Automático", "Densificador en operación normal; endurecedor en operación pesada."], ["densifier", "Densificador", "Tratamiento superficial tipo densificador."], ["hardener", "Endurecedor", "Tratamiento superficial de mayor resistencia."], ["epoxy", "Epóxico", "Recubrimiento epóxico de 0.50 mm."]] },
    nivel_oficinas: { f: 'officeLevel', paso: 'Oficinas', d: "nivel general de las oficinas exteriores", ops: [["functional", "Funcional", "Ligera + lámina · mampostería aparente · vinílico · plafón sencillo · equipamiento básico."], ["standard", "Estándar", "Ligera + Multytecho · muros aplanados/pintados · cerámico · cajillo · acceso arquitectónico."], ["superior", "Superior", "Pesada + losacero · precolado · porcelánico · cristal · cocineta · imagen corporativa."]] },
    piso_oficinas: { f: 'officeFloor', paso: 'Oficinas', d: "acabado de piso de oficinas", ops: [["auto", "Según nivel", "Funcional: vinílico · Estándar: cerámico · Superior: porcelánico."], ["vinyl", "Vinílico", "Incluye zoclo."], ["ceramic", "Cerámico", "Incluye zoclo."], ["porcelain", "Porcelánico", "Incluye zoclo."], ["carpet", "Alfombra", "Opción de mayor costo."], ["raised", "Piso elevado", "Solución especializada de mayor costo."]] },
    fachada_oficinas: { f: 'officeFacade', paso: 'Oficinas', d: "acabado especial del acceso de oficinas", ops: [["auto", "Según nivel", "Funcional: sin acabado especial · Estándar: piedra · Superior: cristal."], ["none", "Sin acabado especial", "Mantiene únicamente el tratamiento general del muro."], ["stone", "Piedra", "Acabado pétreo en acceso."], ["alucobond", "Alucobond", "Revestimiento de aluminio."], ["glass", "Cristal", "Acabado de acceso en cristal."]] },
    plafon_oficinas: { f: 'officeCeiling', paso: 'Oficinas', d: "plafón de oficinas", ops: [["auto", "Según nivel", "Funcional: sencillo · Estándar: plafón con cajillo · Superior: modular con cajillo."], ["plain", "Plafón + pintura", "Solución sencilla."], ["cove", "Plafón + cajillo", "Mayor detalle arquitectónico."], ["modular", "Plafón modular", "Solución modular con cajillo."]] },
    vehiculos: { f: 'traffic', paso: 'Exteriores', d: "qué vehículos circularán (define la vialidad)", ops: [["cars", "Principalmente autos", "Base de vialidad para tráfico ligero."], ["trucks", "Principalmente camiones", "Base de vialidad para tráfico pesado."], ["both", "Autos y camiones", "Base pesada para la circulación principal."]] },
    areas_verdes: { f: 'landscape', paso: 'Exteriores', d: "jardinería y áreas exteriores", ops: [["green", "Más áreas verdes", "Pasto cerca de oficinas y en otras áreas."], ["mixed", "Combinado", "Pasto cerca de oficinas + grava en otras áreas."], ["low", "Bajo mantenimiento", "Grava cerca de oficinas y en otras áreas."]] },
    perimetro: { f: 'perimeter', paso: 'Exteriores', d: "cerca o reja perimetral", ops: [["economic", "Económico", "Malla ciclónica con acceso."], ["standard", "Estándar", "Malla perimetral + reja arquitectónica al frente."], ["premium", "Imagen arquitectónica", "Reja arquitectónica en todo el perímetro."]] },
    control_acceso: { f: 'accessControl', paso: 'Exteriores', d: "control de acceso", ops: [["none", "Sin control especial", "No se agregan barreras ni torniquetes."], ["vehicles", "Vehículos", "Barreras de acceso vehicular."], ["people", "Personas", "Torniquetes para peatones."], ["both", "Personas y vehículos", "Barreras + torniquetes."]] },
    torniquete: { f: 'peopleGate', paso: 'Exteriores', d: "torniquete peatonal", ops: [["half", "Medio cuerpo", "Control peatonal convencional."], ["full", "Cuerpo completo", "Mayor control físico de acceso."]], req: ["accessControl", "both"] },
    drenaje_pluvial: { f: 'drainage', paso: 'Exteriores', d: "drenaje pluvial", ops: [["channels", "Canales superficiales", "Canales de paso."], ["underground", "Red subterránea", "Tubería pluvial enterrada."], ["unknown", "No lo sé", "Usaremos canales colectores superficiales como supuesto."]] },
    pavimento: { f: 'paving', paso: 'Exteriores', d: "tipo de pavimento de la vialidad", ops: [["auto", "Automático", "Autos: asfalto ligero · Camiones: asfalto pesado."], ["asphaltLight", "Asfalto ligero", "Para vialidad de tráfico ligero."], ["asphaltHeavy", "Asfalto pesado", "Para vialidad de tráfico pesado."], ["concrete", "Concreto pesado", "Incluye vialidad/andenes y sustituye opciones incompatibles."]] },
    banquetas: { f: 'sidewalk', paso: 'Exteriores', d: "banquetas", ops: [["concrete", "Concreto", "Banqueta perimetral alrededor de la nave, interrumpida en andenes."], ["paver", "Adoquín", "Misma traza perimetral, con acabado de mayor costo."]] },
    andenes: { chk: 'docks', paso: 'Nave', d: "andenes de carga (incluye muro de contención, fosas para rampa y cortinas)", ops: [['si', 'Sí', ''], ['no', 'No', '']] },
    puertas_industriales: { chk: 'industrialDoors', paso: 'Nave', d: "puertas y cortinas industriales", ops: [['si', 'Sí', ''], ['no', 'No', '']] },
    estacionamiento: { chk: 'parking', paso: 'Exteriores', d: "estacionamiento con pavimento para tráfico ligero", ops: [['si', 'Sí', ''], ['no', 'No', '']] },
    muro_perimetral: { chk: 'perimeterWall', paso: 'Exteriores', d: "murete de block de 60 cm bajo la cerca perimetral", ops: [['si', 'Sí', ''], ['no', 'No', '']] },
  };
  const ALIAS = {
    huella_oficinas: 'oficinas_exteriores', oficinas: 'oficinas_exteriores', area_nave: 'nave', nave_industrial: 'nave', presupuesto: 'objetivo', meta: 'objetivo', target: 'objetivo', area_terreno: 'terreno', caseta_vigilancia: 'caseta', vigilancia: 'caseta',
    material: 'material_tapial', tipo_tapial: 'material_tapial', grua_viajera: 'grua', gruas: 'grua', gruas_viajeras: 'grua', iluminacion: 'iluminacion_natural', iluminacion_cubierta: 'iluminacion_natural', luz_natural: 'iluminacion_natural',
    acceso: 'control_acceso', drenaje: 'drenaje_pluvial', preparacion: 'terreno_estado', demoler: 'demolicion_existe', demolicion_si: 'demolicion_existe', nivel_nave: 'nivel_interiores_nave', interiores: 'nivel_interiores_nave',
    confort: 'confort_termico', cubierta: 'confort_termico', termico: 'confort_termico', aislamiento: 'confort_termico', sistema_muros: 'muros', muro: 'muros', piso: 'acabado_piso_nave', piso_nave: 'acabado_piso_nave', acabado_piso: 'acabado_piso_nave',
    fosa: 'fosas', trincheras: 'fosas', domos: 'tipo_iluminacion', acrilico: 'tipo_iluminacion', anden: 'andenes', andenes_carga: 'andenes', cortinas: 'puertas_industriales', puertas: 'puertas_industriales',
    piso_oficina: 'piso_oficinas', acceso_oficinas: 'fachada_oficinas', fachada: 'fachada_oficinas', plafon: 'plafon_oficinas', trafico: 'vehiculos', vialidad: 'pavimento', jardineria: 'areas_verdes', entorno: 'areas_verdes', cerca: 'perimetro', reja: 'perimetro',
    murete: 'muro_perimetral', barda: 'muro_perimetral', torniquetes: 'torniquete', banqueta: 'banquetas', estacionamientos: 'estacionamiento',
  };

  // Pistas para elegir bien la opción cuando el usuario habla con sus propias palabras
  const PISTAS = {
    operacion: 'bodega, almacén o distribución = Almacenamiento / ligera; manufactura o ensamble normal = Producción industrial; carga pesada, montacargas grandes, maquinaria pesada = Operación pesada',
    vehiculos: 'tráileres, camiones o carga = Principalmente camiones; mezcla de autos y camiones = Autos y camiones',
    nivel_oficinas: 'básico o económico = Funcional; normal = Estándar; de lujo, premium o corporativo = Superior',
    nivel_interiores_nave: 'básico = Funcional; normal = Estándar; de lujo = Superior',
    confort_termico: 'el mejor o máximo aislamiento = Alto desempeño',
    perimetro: 'barato = Económico; bonito o de imagen = Imagen arquitectónica',
    areas_verdes: 'más jardín = Más áreas verdes; poco mantenimiento = Bajo mantenimiento',
    drenaje_pluvial: 'subterráneo o entubado = Red subterránea; canales o cunetas = Canales superficiales',
    control_acceso: 'para gente = Personas; para autos o camiones = Vehículos; ambos = Personas y vehículos',
    tapial: 'cualquier material de tapial implica tapial = Sí, incluir tapial y además material_tapial',
    iluminacion_natural: 'domos o acrílico implican iluminacion_natural = Sí y además tipo_iluminacion',
  };
  function catalogoTexto() {
    return 'PASOS: ' + PASOS.join(', ') +
      '\nDATOS (usa [[dato clave = número]]):\n' + Object.entries(DATOS).map(([k, d]) => `- ${k}: ${d.desc}`).join('\n') +
      '\nOPCIONES (usa [[opcion clave = opción]], escribe la opción tal cual):\n' + Object.entries(GUIADA).map(([k, o]) => `- ${k} (${o.paso}; ${o.d}): ${o.ops.map(x => x[1]).join(' | ')}${PISTAS[k] ? ' [' + PISTAS[k] + ']' : ''}`).join('\n');
  }
  // Lista de precios unitarios de Vector (obligatorios): frente → partida → subpartida $/m² del área del frente
  let _precios = null;
  function preciosTexto() {
    if (_precios != null) return _precios;
    try {
      const d = JSON.parse(document.getElementById('cost-data').textContent);
      const nom = x => String(x.nombre).replace(/^\d+\s*-\s*/, '').trim();
      const fmt = v => '$' + Number(v).toLocaleString('es-MX', { maximumFractionDigits: 2 });
      const out = []; let partida = '', items = [];
      const cerrar = () => { if (items.length) out.push(`  ${partida}: ${items.join('; ')}`); items = []; };
      for (const x of d) {
        const c = String(x.codigo);
        if (c.length === 2) { cerrar(); out.push(`${c} ${nom(x)}`); }
        else if (c.length === 4) { cerrar(); partida = `${c} ${nom(x)}`; }
        else if (x.costo != null) items.push(`${c} ${nom(x)} ${fmt(x.costo)}`);
      }
      cerrar(); _precios = out.join('\n');
    } catch (_) { _precios = ''; }
    return _precios;
  }
  // Explicación de cada opción (para responder preguntas sobre Vector con precisión)
  const REGLAS_VECTOR = `Reglas y automatismos de Vector:
- Pasos de la Experiencia Guiada: Inicio, Objetivo (presupuesto meta), Sitio (áreas de todo el proyecto, demolición, terreno, tapial), Nave, Oficinas, Exteriores, Revisión (configuración, decisiones automáticas, supuestos y restricciones protegidas), Simulación constructiva 4D y Resultado.
- Si un espacio no tiene área, Vector entiende que no forma parte del proyecto. El área del terreno es informativa (no afecta presupuesto ni modelo). Las áreas de Sitio, Nave, Oficinas y Exteriores están sincronizadas.
- Oficinas exteriores: área construida = huella × niveles. Funcional = estructura ligera + lámina, mampostería aparente, piso vinílico, plafón sencillo, puertas de madera, sanitarios básicos. Estándar = estructura ligera + Multytecho, mampostería aplanada y pintada, cerámico, plafón con cajillo, puertas aluminio/cristal, acceso en piedra. Superior = estructura pesada + losacero + azotea, muros precolados pintados, porcelánico, plafón modular, puertas de cristal, cocineta, acceso en cristal. Con 2 o más niveles siempre se usa estructura pesada + losacero + azotea impermeabilizada.
- Grúas 0/1/2 son excluyentes y activan su trabe carril. Mezzanine 100/500/1,000 m² son alternativas excluyentes. Muros metálico, precolado y Tilt-Up son sistemas alternativos (la cimentación se ajusta al sistema y requiere validación estructural y geotécnica). Pisos: densificador, endurecedor y epóxico son excluyentes; en automático, densificador en operación normal y endurecedor en operación pesada. Iluminación natural: acrílico o domos.
- Supuestos cuando el usuario no sabe: terreno → se incluyen desmontes y terracerías; tapial → malla ciclónica; muros → muro metálico; operación → piso de tráfico industrial normal; iluminación natural → no se agrega; drenaje → solución superficial colectora. Siempre se incluyen requerimientos generales, ingeniería, permisos y un paquete base de instalaciones eléctricas, ventilación, protección contra incendio y detección.
- Vialidad automática: asfalto ligero si circulan principalmente autos; asfalto pesado si hay camiones. Concreto pesado sustituye opciones incompatibles. Exteriores = aprox. 50% de los m² de edificios.
- Simulación 4D: ritmo general de 175 m² por semana; naves de 700 m² o menos se consideran en 4 semanas. Tiene línea del tiempo, curva financiera, pausa, repetir y exploración del modelo terminado con cortes X·Y·Z.
- Resultado: estimación preliminar con rango ±15%, costo promedio por m², comparación contra el objetivo, frentes que concentran el costo, Explorar alternativas (sustituciones compatibles con su diferencia de costo), ¿Qué pasa si cambia el área? (+500 y +1,000 m² por frente), Supuestos y restricciones, y Generar reporte.
- Es una estimación paramétrica de orden de magnitud (Clase 5 a 4 AACE), no un presupuesto oficial.`;
  function guiaTexto() {
    return REGLAS_VECTOR + '\nOpciones:\n' + Object.entries(GUIADA).map(([k, o]) => `${k} (${o.paso}): ` + o.ops.map(x => x[2] ? `${x[1]} = ${x[2]}` : x[1]).join(' / ')).join('\n');
  }
  // Estado actual de TODA la Experiencia Guiada (Vector lo guarda en este navegador)
  function estadoGuiada() {
    let g = null;
    try { g = JSON.parse(localStorage.getItem('gcp-presupuesto-guided-v05') || 'null'); } catch (_) {}
    if (!g) return '';
    const n = v => Number(String(v || 0).replace(/,/g, '')) || 0, partes = [];
    for (const [k, d] of Object.entries(DATOS)) {
      const campo = d.id.replace(/^gi?f-/, ''), v = g[campo];
      if (v !== undefined && v !== '' && n(v)) partes.push(`${k}=${n(v).toLocaleString('es-MX')}`);
    }
    for (const [k, o] of Object.entries(GUIADA)) {
      if (o.chk) { partes.push(`${k}=${g[o.chk] ? 'Sí' : 'No'}`); continue; }
      const op = o.ops.find(x => x[0] === String(g[o.f])); if (op) partes.push(`${k}=${op[1]}`);
    }
    const paso = { welcome: 'Inicio', target: 'Objetivo', spaces: 'Sitio', nave: 'Nave', offices: 'Oficinas', exteriors: 'Exteriores', review: 'Revisión', construction: 'Simulación', result: 'Resultado' }[g.currentStep] || '';
    return (paso ? `paso=${paso}; ` : '') + partes.join('; ');
  }

  // Palabras del usuario que deciden sin ambigüedad una opción: si la IA eligió otra en ese grupo, se corrige
  const CORRECCIONES = [
    [/pesad|montacargas grandes|maquinaria pesada|carga pesada/i, 'operacion', 'Operación pesada'],
    [/\b(almac[eé]n|bodega de|distribuci[oó]n|log[ií]stic)/i, 'operacion', 'Almacenamiento / ligera', /pesad/i],
    [/\b(manufactura|ensamble|producci[oó]n)\b/i, 'operacion', 'Producción industrial', /pesad/i],
    [/tr[aá]iler|tractocami|puros cami/i, 'vehiculos', 'Principalmente camiones', /auto|coche|carro/i],
    [/de lujo|premium|corporativ|alta gama/i, 'nivel_oficinas', 'Superior'],
    [/de lujo|premium|alta gama/i, 'nivel_interiores_nave', 'Superior'],
    [/subterr[aá]ne|entubad/i, 'drenaje_pluvial', 'Red subterránea'],
  ];
  const NUM_PAL = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4 };
  // La nota interna "(Resultado: …)" del historial nunca se muestra ni se habla (por si la IA la repite)
  const sinNotas = t => String(t || '').replace(/\s*\(Resultado:[^)]*\)?/g, '');
  // Si la IA cambió varias opciones y algunas no tienen nada que ver con lo que dijo el usuario, se quitan esas extras
  const GENERICAS = new Set(['nave', 'oficinas', 'oficina', 'exteriores', 'exterior', 'interiores', 'nivel', 'niveles', 'tipo', 'entrada', 'area', 'areas', 'sobre', 'para', 'como', 'entre', 'metros', 'segun', 'incluye', 'incluir', 'general', 'dentro']);
  // Distancia de edición (para errores de dictado: "mezanin" ≈ "mezzanine")
  function distancia(a, b) {
    const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  function quitarExtras(ui, texto) {
    const t = norm(texto), tw = t.split(' ');
    const ops = ui.filter(a => a.tipo === 'opcion');
    if (ops.length < 2) return ui;
    const toca = a => {
      const k = claveDe(a.grupo, GUIADA); if (!k) return true;
      const o = GUIADA[k];
      const pal = norm([k.replace(/_/g, ' '), o.d || '', a.valor || '', PISTAS[k] || ''].join(' ')).split(' ').filter(w => w.length >= 4 && !GENERICAS.has(w));
      return pal.some(w => t.includes(w) || (w.length >= 6 && t.includes(w.slice(0, 5))) || (w.length >= 5 && tw.some(x => x.length >= 5 && Math.abs(x.length - w.length) <= 2 && distancia(x, w) <= 2)));
    };
    const si = ops.filter(toca);
    if (!si.length || si.length === ops.length) return ui;
    return ui.filter(a => a.tipo !== 'opcion' || si.includes(a));
  }
  function corregirOpciones(ui, texto) {
    // "Quita una grúa" / "agrega otra grúa": relativo a lo que ya hay
    const est = (() => { try { return estadoGuiada(); } catch (_) { return ''; } })();
    for (const a of ui) {
      if (a.tipo !== 'opcion' || claveDe(a.grupo, GUIADA) !== 'grua') continue;
      if (/\b(quita\w*|elimina\w*|menos|b[aá]ja\w*)\s+(una|1)\s+gr[uú]a/i.test(texto)) {
        const v = /grua=2/.test(est) ? '1 grúa viajera' : /grua=1/.test(est) ? 'Sin grúa viajera' : '';
        if (v) { a.valor = v; a.raw = 'opcion grua = ' + v; }
      } else if (/\b(agrega\w*|añade\w*|pon\w*|otra|una m[aá]s)\b.*\b(otra|una m[aá]s)\s+gr[uú]a|\botra\s+gr[uú]a/i.test(texto)) {
        const v = /grua=1/.test(est) ? '2 grúas viajeras' : /grua=Sin/.test(est) ? '1 grúa viajera' : '';
        if (v) { a.valor = v; a.raw = 'opcion grua = ' + v; }
      }
    }
    // Niveles de oficinas dichos de pasada ("oficinas de 300 en un nivel") que la IA a veces omite
    const mN = /oficina/i.test(texto) && texto.match(/\b(un|uno|una|dos|tres|cuatro|[1-4])\s+(nivel(?:es)?|plantas?)\b/i);
    if (mN && ui.some(a => a.tipo === 'dato' || a.tipo === 'opcion') && !ui.some(a => a.tipo === 'dato' && /nivel/.test(norm(a.clave)))) {
      const n = NUM_PAL[mN[1].toLowerCase()] || Number(mN[1]);
      ui.push({ tipo: 'dato', clave: 'niveles_oficinas', valor: String(n), raw: 'dato niveles_oficinas = ' + n });
    }
    for (const a of ui) {
      if (a.tipo !== 'opcion') continue;
      const k = claveDe(a.grupo, GUIADA);
      for (const [re, grupo, valor, salvo] of CORRECCIONES) {
        if (k === grupo && re.test(texto) && !(salvo && salvo.test(texto)) && norm(a.valor) !== norm(valor)) { a.valor = valor; a.raw = `opcion ${grupo} = ${valor}`; break; }
      }
    }
  }
  const claveDe = (k, tabla) => {
    const n = norm(k).replace(/ /g, '_');
    if (tabla[n]) return n;
    if (ALIAS[n] && tabla[ALIAS[n]]) return ALIAS[n];
    return Object.keys(tabla).find(x => x.includes(n) || n.includes(x)) || '';
  };
  // Formas comunes de decir cada opción (campo:valor → palabras)
  const SINONIMOS = {
    'traffic:trucks': ['trailer', 'trailers', 'traileres', 'camion', 'camiones', 'tractocamion', 'carga pesada', 'pesados'], 'traffic:cars': ['auto', 'autos', 'coche', 'coches', 'carro', 'carros', 'ligeros'], 'traffic:both': ['ambos', 'mixto', 'de todo'],
    'wallSystem:tiltup': ['tilt', 'tilt up', 'tiltup'], 'wallSystem:metal': ['metalico', 'lamina', 'acero'], 'wallSystem:precast': ['precolado', 'precolados', 'prefabricado', 'prefabricados', 'concreto prefabricado'],
    'operation:light': ['almacen', 'bodega', 'distribucion', 'logistica', 'ligera', 'almacenamiento'], 'operation:heavy': ['pesada', 'montacargas', 'maquinaria pesada', 'carga pesada'], 'operation:normal': ['produccion', 'manufactura', 'fabrica', 'planta', 'industrial normal'],
    'thermal:high': ['mejor', 'maximo', 'panel aislado', 'alto', 'premium', 'alto desempeno'], 'thermal:basic': ['basico', 'sin aislamiento', 'economico', 'sencillo'],
    'officeLevel:superior': ['lujo', 'premium', 'alto', 'mejor', 'ejecutivo'], 'officeLevel:functional': ['basico', 'economico', 'sencillo'], 'interiorLevel:superior': ['lujo', 'premium', 'alto', 'mejor'], 'interiorLevel:functional': ['basico', 'economico', 'sencillo'],
    'landscape:green': ['jardin', 'jardines', 'verde', 'verdes', 'pasto'], 'landscape:low': ['grava', 'poco mantenimiento', 'xerojardin'], 'perimeter:premium': ['arquitectonico', 'arquitectonica', 'imagen', 'reja'], 'perimeter:economic': ['economico', 'barato', 'malla'],
    'drainage:underground': ['subterraneo', 'subterranea', 'tuberia', 'enterrado'], 'drainage:channels': ['canal', 'canales', 'superficial'], 'paving:concrete': ['concreto'], 'paving:asphaltHeavy': ['asfalto pesado'], 'paving:asphaltLight': ['asfalto ligero'],
    'sidewalk:paver': ['adoquin'], 'officeFacade:glass': ['vidrio', 'cristal'], 'officeFacade:stone': ['piedra', 'cantera'], 'officeFloor:carpet': ['alfombra', 'alfombrado'], 'officeFloor:raised': ['elevado', 'falso piso'], 'officeCeiling:modular': ['modular', 'reticular'],
    'floorFinish:epoxy': ['epoxico', 'epoxi', 'resina'], 'floorFinish:hardener': ['endurecedor'], 'floorFinish:densifier': ['densificador'], 'daylightType:domes': ['domo', 'domos', 'tragaluz', 'tragaluces'], 'daylightType:acrylic': ['acrilico', 'laminas translucidas', 'traslucido'],
    'tapialMaterial:woodPlastic': ['madera', 'plastico'], 'tapialMaterial:mesh': ['malla', 'ciclonica'], 'tapialMaterial:drywall': ['tablaroca', 'panel'], 'tapialMaterial:sheet': ['lamina', 'metalico'],
    'siteCondition:prepared': ['nivelado', 'limpio', 'listo', 'preparado', 'plano'], 'siteCondition:needs': ['monte', 'maleza', 'desnivel', 'hay que limpiar', 'necesita'],
    'accessControl:both': ['ambos', 'personas y vehiculos', 'todo'], 'accessControl:none': ['ninguno', 'sin control'], 'peopleGate:full': ['completo', 'cuerpo completo', 'alto'], 'peopleGate:half': ['medio', 'medio cuerpo'],
    'pits:small': ['chica', 'pequena'], 'pits:medium': ['mediana'], 'pits:large': ['grande'],
  };
  // Encuentra la opción pedida dentro de un grupo: exacta, por inicio, por número o por palabras
  function opcionDe(o, valor) {
    const r = opcionDe_(o, valor); if (r || o.chk) return r;
    // Sinónimos: gana la opción con más coincidencias ("producción pesada con montacargas" → Operación pesada)
    const v = ' ' + norm(valor) + ' ';
    let mejor = null, max = 0;
    for (const x of o.ops) {
      const sin = (SINONIMOS[o.f + ':' + x[0]] || []).concat(norm(x[1]).split(' ').filter(w => w.length > 3));
      const n = sin.filter(w => v.includes(' ' + w + ' ') || v.includes(' ' + w)).length;
      if (n > max) { max = n; mejor = x; }
    }
    return mejor;
  }
  function opcionDe_(o, valor) {
    const v = norm(valor), num = (String(valor).match(/\d[\d,]*/) || [''])[0].replace(/,/g, '');
    if (!v) return null;
    if (o.chk) return /^(si|s|activa|incluye|con|agrega|quiero|pon|true|1)\b/.test(v) ? o.ops[0] : /^(no|sin|quita|desactiva|elimina|false|0)\b/.test(v) ? o.ops[1] : null;
    const L = o.ops.map(x => [x, norm(x[1])]);
    // "no" / "ninguno" = la opción "Sin …" o "No" (nunca "No lo sé"); "sí" = la opción afirmativa
    if (/^(no|ninguno|ninguna|nada|sin)$/.test(v)) { const r = L.find(([x, t]) => t === 'no') || L.find(([x, t]) => t.startsWith('sin ')); if (r) return r[0]; }
    if (/^(si|claro|incluir|con)$/.test(v)) { const r = L.find(([x, t]) => t === 'si') || L.find(([x, t]) => t.startsWith('si ')); if (r) return r[0]; }
    if (/^(no se|nose|no lo se|desconozco|no estoy seguro)$/.test(v)) { const r = L.find(([x, t]) => t === 'no lo se'); if (r) return r[0]; }
    return (L.find(([x, t]) => t === v || norm(x[0]) === v) ||
      L.find(([x, t]) => t.startsWith(v) || v.startsWith(t)) ||
      (num && L.find(([x, t]) => (t.match(/\d[\d ]*/) || [''])[0].replace(/ /g, '') === num)) ||
      L.find(([x, t]) => { const w = v.split(' ').filter(p => p.length > 2); return w.length && w.every(p => t.includes(p)); }) || [null])[0];
  }

  const Habil = {
    _ok(e) { const r = e.getBoundingClientRect(); if (r.width < 1) return false; const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!t && (t === e || e.contains(t)); },
    _hit(sel, prueba) {
      if (Control.raiz) Control.raiz.dataset.midiendo = '';
      try { return [...document.querySelectorAll(sel)].find(e => !e.closest('#vector-voz') && visible(e) && (!prueba || prueba(e)) && this._ok(e)) || null; }
      finally { if (Control.raiz) delete Control.raiz.dataset.midiendo; }
    },
    // Elemento visible (aunque esté fuera de la vista: se desplaza para usarlo)
    _vis(sel) { return [...document.querySelectorAll(sel)].find(e => !e.closest('#vector-voz') && (visible(e) || (e.type === 'checkbox' && e.closest('label') && visible(e.closest('label'))))) || null; },
    pasoActual() { const p = [...document.querySelectorAll('.g-step')].find(s => Control._sel(s)); return p ? (p.getAttribute('aria-label') || '').split('·')[0].replace(/^Ir a\s*/, '').trim() : ''; },
    async irA(paso, foco) {
      const destino = PASOS.find(p => norm(p) === norm(paso)) || PASOS.find(p => norm(p).startsWith(norm(paso).slice(0, 4)));
      if (!destino) return { ok: false, txt: `No conozco el paso «${paso}»` };
      const guiada = [...document.querySelectorAll('.mode-btn')].find(b => /guiada/i.test(b.innerText));
      if (guiada && !Control._sel(guiada)) { Control._clicReal(guiada); await espera(900); }
      await Control.despejarAyuda();
      if (this.pasoActual() === destino) return { ok: true, txt: `Ya estás en ${destino}` };
      const st = [...document.querySelectorAll('.g-step')].find(s => (s.getAttribute('aria-label') || '').startsWith('Ir a ' + destino));
      if (!st) return { ok: false, txt: `No encontré el paso ${destino}` };
      foco.mostrar(st, 'Ir a ' + destino); Control._clicReal(st); await espera(900);
      for (let i = 0; i < 4; i++) {
        await Control.despejarAyuda();
        const d = this._hit('button', b => { const t = b.innerText.trim(); return t === 'Ir a ' + destino || /^continuar donde me qued/i.test(t) || /de todos modos$/i.test(t); });
        if (!d) break;
        foco.mostrar(d, 'Clic'); Control._clicReal(d); await espera(900);
      }
      await Control.despejarAyuda();
      return this.pasoActual() === destino ? { ok: true, txt: `Fui al paso ${destino}` } : { ok: false, txt: `No pude abrir el paso ${destino}` };
    },
    async dato(clave, valor, foco) {
      const k = claveDe(clave, DATOS); if (!k) return { ok: false, txt: `No conozco el dato «${clave}»` };
      const d = DATOS[k];
      let el = document.getElementById(d.id);
      if (!el || !visible(el)) { const r = await this.irA(d.pasos[0], foco); if (!r.ok) return r; el = document.getElementById(d.id); }
      if (!el || !visible(el)) return { ok: false, txt: `No encontré el campo de ${d.desc}` };
      el.scrollIntoView({ block: 'center', behavior: REDUCIR_MOV ? 'auto' : 'smooth' }); await espera(380);
      foco.mostrar(el, 'Escribiendo ' + valor); await espera(250);
      Control._escribir(el, valor); await espera(450);
      const etq = d.desc.split(',')[0];
      return { ok: true, txt: `Capturé ${(document.getElementById(d.id) || el).value || valor} en ${etq}` };
    },
    // Valor actual de un grupo según lo que Vector guardó (sirve aunque el grupo no esté en pantalla)
    valorActual(o) {
      try { const g = JSON.parse(localStorage.getItem('gcp-presupuesto-guided-v05') || '{}'); return o.chk ? (g[o.chk] ? 'si' : 'no') : String(g[o.f] ?? ''); } catch (_) { return ''; }
    },
    async opcion(grupo, valor, foco) {
      let k = claveDe(grupo, GUIADA), o = k ? GUIADA[k] : null, op = o ? opcionDe(o, valor) : null;
      if (!op) {
        // El modelo pudo usar otra clave: busca la opción en todos los grupos (prefiere el del mismo paso)
        const c = Object.entries(GUIADA).map(([kk, oo]) => [kk, oo, oo.chk ? null : opcionDe(oo, valor)]).filter(x => x[2] && norm(x[2][1]) === norm(valor));
        const c2 = c.length ? c : Object.entries(GUIADA).map(([kk, oo]) => [kk, oo, oo.chk ? null : opcionDe(oo, valor)]).filter(x => x[2]);
        const elegido = c2.length === 1 ? c2[0] : o ? c2.find(x => x[1].paso === o.paso) : null;
        if (elegido) [k, o, op] = elegido;
      }
      if (!o) return { ok: false, txt: `No conozco la opción «${grupo}»` };
      if (!op) return { ok: false, txt: `«${valor}» no es una opción de ${k.replace(/_/g, ' ')} (${o.ops.map(x => x[1]).join(', ')})` };
      if (this.valorActual(o) === op[0]) return { ok: true, txt: `${op[1]} ya estaba elegido en ${k.replace(/_/g, ' ')}` };
      // Prerrequisitos: el material del tapial requiere incluir tapial, el torniquete requiere control de personas, etc.
      if (o.req) {
        const [rf, rv] = o.req, [rk, ro] = Object.entries(GUIADA).find(([, x]) => x.f === rf) || [];
        if (rk) {
          const actual = this.valorActual(ro);
          const listo = rf === 'accessControl' ? /people|both/.test(actual) : actual === rv;
          if (!listo) {
            const destino = rf === 'accessControl' ? (actual === 'vehicles' ? 'both' : 'people') : rv;
            const r = await this.opcion(rk, (ro.ops.find(x => x[0] === destino) || [])[1] || destino, foco);
            if (!r.ok) return r;
            await espera(400);
          }
        }
      }
      const sel = o.chk ? `input[type=checkbox][data-gcheck="${o.chk}"]` : `button.choice[data-choice-field="${o.f}"][data-choice-value="${op[0]}"]`;
      let b = this._vis(sel);
      if (!b && !document.querySelector(sel)) { const r = await this.irA(o.paso, foco); if (!r.ok) return r; await Control.despejarAyuda(); b = this._vis(sel); }
      if (!b) {
        // Algunas opciones viven en secciones plegables ("Personalizar acabados…"): se abren
        const oculto = document.querySelector(sel), det = oculto && oculto.closest('details:not([open])');
        if (det) { const sum = det.querySelector('summary'); sum.scrollIntoView({ block: 'center', behavior: 'auto' }); foco.mostrar(sum, 'Abrir'); Control._clicReal(sum); if (!det.open) det.open = true; await espera(450); b = this._vis(sel); }
        else if (oculto && Habil.pasoActual() !== o.paso) { const r = await this.irA(o.paso, foco); if (!r.ok) return r; await Control.despejarAyuda(); b = this._vis(sel); }
      }
      if (!b) {
        const motivo = o.paso === 'Oficinas' ? 'Las opciones de oficinas aparecen cuando hay área de oficinas exteriores' : o.paso === 'Nave' ? 'Las opciones de la nave aparecen cuando hay área de nave' : `No encontré «${op[1]}» en ${o.paso}`;
        return { ok: false, txt: motivo };
      }
      b.scrollIntoView({ block: 'center', behavior: REDUCIR_MOV ? 'auto' : 'smooth' }); await espera(380);
      foco.mostrar(o.chk ? (b.closest('label') || b.parentElement || b) : b, 'Clic'); await espera(250);
      if (o.chk) { if (b.checked !== (op[0] === 'si')) Control._clicReal(b); }
      else Control._clicReal(b);
      await espera(550);
      const ok = this.valorActual(o) === op[0] || (!o.chk && (this._vis(sel) || { classList: { contains: () => false } }).classList.contains('selected'));
      return ok ? { ok: true, txt: o.chk ? `${op[0] === 'si' ? 'Incluí' : 'Quité'} ${o.d.split('(')[0].trim()}` : `Elegí ${op[1]} en ${k.replace(/_/g, ' ')}` } : { ok: false, txt: `No pude elegir ${op[1]}` };
    },
  };

  /* ===================================================================
     8c. CONTROL AVANZADO: visor 3D, nube de puntos, Google Maps,
         catálogo experto, barras, teclas y desplazamiento de página.
     =================================================================== */
  // Un cuadro de animación; con la pestaña en segundo plano el navegador los pausa, así que hay tope de tiempo
  const cuadro = () => new Promise(r => { let ok = false; const fin = () => { if (!ok) { ok = true; r(); } }; requestAnimationFrame(fin); setTimeout(fin, 60); });
  const numero = v => { const m = String(v).replace(/(\d),(?=\d{3}\b)/g, '$1').replace(',', '.').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : NaN; };
  const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
  const midiendo = fn => { if (Control.raiz) Control.raiz.dataset.midiendo = ''; try { return fn(); } finally { if (Control.raiz) delete Control.raiz.dataset.midiendo; } };
  const area = e => { const r = e.getBoundingClientRect(); return r.width * r.height; };

  // Gestos de puntero sintéticos: orbitar, desplazar, rueda y toque en un punto
  const Gestos = {
    _ev(tipo, x, y, extra) {
      const o = Object.assign({ bubbles: true, cancelable: true, composed: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, pointerId: 31, isPrimary: true, pointerType: 'mouse', button: 0, buttons: 1 }, extra || {});
      return tipo.startsWith('pointer') ? new PointerEvent(tipo, o) : new MouseEvent(tipo, o);
    },
    // Los eventos sintéticos no pueden capturar el puntero: se neutraliza mientras dura el gesto
    async _sinCaptura(el, fn) {
      el.setPointerCapture = () => {}; el.releasePointerCapture = () => {};
      try { return await fn(); } finally { delete el.setPointerCapture; delete el.releasePointerCapture; }
    },
    async arrastrar(el, dx, dy, opc) {
      const o = opc || {}, r = el.getBoundingClientRect();
      let x = r.left + r.width * (o.desde ? o.desde[0] : 0.5), y = r.top + r.height * (o.desde ? o.desde[1] : 0.5);
      const pasos = limitar(Math.ceil(Math.hypot(dx, dy) / 60), 4, 16);
      const extra = o.pan ? { shiftKey: true } : {};
      await this._sinCaptura(el, async () => {
        el.dispatchEvent(this._ev('pointerdown', x, y, extra));
        for (let i = 0; i < pasos; i++) {
          x += dx / pasos; y += dy / pasos;
          el.dispatchEvent(this._ev('pointermove', x, y, extra));
          if (i % 4 === 3) await cuadro();
        }
        el.dispatchEvent(this._ev('pointerup', x, y, Object.assign({}, extra, { buttons: 0 })));
      });
      await cuadro();
    },
    async rueda(el, total) {
      const r = el.getBoundingClientRect(), n = Math.max(1, Math.ceil(Math.abs(total) / 120));
      for (let i = 0; i < n; i++) {
        el.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, composed: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, deltaY: total / n, deltaMode: 0 }));
        await cuadro();
      }
    },
    // Toque sin movimiento (sirve para identificar elementos del modelo o elegir un punto de una barra)
    async tocar(el, fx, fy, soltarEnVentana) {
      const r = el.getBoundingClientRect(), x = r.left + r.width * fx, y = r.top + r.height * fy;
      await this._sinCaptura(el, () => {
        el.dispatchEvent(this._ev('pointerdown', x, y));
        (soltarEnVentana ? window : el).dispatchEvent(this._ev('pointerup', x, y, { buttons: 0 }));
      });
    },
  };

  /* ---------- Visor 3D (modelo conceptual, simulación 4D, exploración) y nube de puntos ---------- */
  // Captura la escena y la cámara 3D de Vector cuando se dibujan (sin tocar su código): así Vera sabe qué elementos hay y dónde están
  const captura3D = { escena: null, camara: null };
  function instalarCaptura3D() {
    try {
      const P = window.THREE && window.THREE.Object3D && window.THREE.Object3D.prototype;
      if (!P || P.__vera) return;
      const orig = P.updateMatrixWorld;
      const revisadas = new WeakMap();
      P.updateMatrixWorld = function () {
        if (this.isScene) {
          // ¿Es la escena del modelo de Vector? (tiene elementos con nombre). Se revisa a lo más cada 2 s por escena.
          let m = revisadas.get(this);
          if (!m || (!m.si && Date.now() - m.t > 2000)) { let si = false; this.traverse(o => { if (!si && o.userData && o.userData.vectorLabel) si = true; }); m = { si, t: Date.now() }; revisadas.set(this, m); }
          captura3D.siguienteCam = m.si ? this : null;
        } else if (this.isCamera && captura3D.siguienteCam) {
          // La cámara que se actualiza justo después de la escena es la del dibujo (no la de sombras)
          captura3D.escena = captura3D.siguienteCam; captura3D.camara = this; captura3D.siguienteCam = null;
        }
        return orig.apply(this, arguments);
      };
      P.__vera = true;
    } catch (_) {}
  }
  const Visor3D = {
    lienzos() { return [...document.querySelectorAll('canvas')].filter(c => !c.closest('#vector-voz') && /orbitar/i.test(c.title || '') && visible(c)); },
    activo() {
      const pc = document.querySelector('#gcPointCloudModal.show canvas');
      if (pc && visible(pc)) return { c: pc, tipo: 'nube', nombre: 'la nube de puntos' };
      const modal = modalActivo();
      const c = this.lienzos().filter(x => !x.closest('#gcPointCloudModal') && (!modal || modal.contains(x))).sort((a, b) => area(b) - area(a))[0];
      return c ? { c, tipo: 'modelo', nombre: 'el modelo 3D' } : null;
    },
    async _restablecer(v) {
      const sel = v.tipo === 'nube' ? ['#gcPointCloudModal [data-pc-reset]'] : ['#gBuildExploreResetView', '#gModelResetBtn'];
      for (const s of sel) { const b = document.querySelector(s); if (b && visible(b)) { Control._clicReal(b); await espera(750); return true; } }
      v.c.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
      await espera(500);
      return true;
    },
    // Ángulos de la vista restablecida: modelo θ=.72 (cámara), nube yaw=.55
    _girarA(v, ang) { const base = v.tipo === 'nube' ? 0.55 : 0.72; return v.tipo === 'nube' ? (ang - base) / 0.008 : (base - ang) / 0.008; },
    async ejecutar(accion, valor, foco) {
      const v = this.activo();
      if (!v) return { ok: false, txt: 'No hay un visor 3D abierto en pantalla' };
      const acc = norm(accion).replace(/ /g, '_'), cant = numero(valor);
      const grados = Number.isFinite(cant) ? cant : 45;
      v.c.scrollIntoView({ block: 'center', behavior: 'auto' }); await espera(120);
      foco.mostrar(v.c, 'Vista 3D');
      const vistaFija = async (azimut, alto) => {
        await this._restablecer(v);
        if (azimut != null) await Gestos.arrastrar(v.c, this._girarA(v, azimut), 0);
        await Gestos.arrastrar(v.c, 0, 900);                  // tope superior conocido
        if (alto != null) await Gestos.arrastrar(v.c, 0, -alto / 0.006);
      };
      const H = 1.32; // de la vista superior a casi horizontal
      if (/^(superior|planta|arriba_total|cenital)/.test(acc)) { await Gestos.arrastrar(v.c, 0, 900); return { ok: true, txt: `Vista superior de ${v.nombre}` }; }
      if (/^inferior|desde_abajo/.test(acc)) { await Gestos.arrastrar(v.c, 0, -900); return { ok: true, txt: `Vista desde abajo de ${v.nombre}` }; }
      if (/^(frontal|frente|alzado)/.test(acc)) { await vistaFija(0, H); return { ok: true, txt: `Vista frontal de ${v.nombre}` }; }
      if (/^(posterior|trasera|atras)/.test(acc)) { await vistaFija(Math.PI, H); return { ok: true, txt: `Vista posterior de ${v.nombre}` }; }
      if (/lateral_?izq|izquierda$/.test(acc) && /lateral|lado|vista/.test(acc)) { await vistaFija(-Math.PI / 2, H); return { ok: true, txt: `Vista lateral izquierda de ${v.nombre}` }; }
      if (/lateral|lado/.test(acc)) { await vistaFija(Math.PI / 2, H); return { ok: true, txt: `Vista lateral derecha de ${v.nombre}` }; }
      if (/^(isometrica|iso|perspectiva|restablecer|reset|inicial|original|centrar)/.test(acc)) { await this._restablecer(v); return { ok: true, txt: /^(iso|persp)/.test(acc) ? `Vista isométrica de ${v.nombre}` : `Restablecí la vista de ${v.nombre}` }; }
      if (/^gir\w*_?izq|^rot\w*_?izq/.test(acc)) { await Gestos.arrastrar(v.c, -(grados * Math.PI / 180) / 0.008, 0); return { ok: true, txt: `Giré ${v.nombre} ${grados}° a la izquierda` }; }
      if (/^gir|^rot|^voltea/.test(acc)) { await Gestos.arrastrar(v.c, (grados * Math.PI / 180) / 0.008, 0); return { ok: true, txt: `Giré ${v.nombre} ${grados}° a la derecha` }; }
      if (/^inclin\w*_?(abajo)|^baja_vista/.test(acc)) { await Gestos.arrastrar(v.c, 0, -(grados * Math.PI / 180) / 0.006); return { ok: true, txt: `Bajé la cámara ${grados}°` }; }
      if (/^inclin|^sube_vista/.test(acc)) { await Gestos.arrastrar(v.c, 0, (grados * Math.PI / 180) / 0.006); return { ok: true, txt: `Subí la cámara ${grados}°` }; }
      if (/^(acerc|zoom_?in|amplia)/.test(acc)) { const p = Number.isFinite(cant) ? limitar(cant, 5, 90) : 35; await Gestos.rueda(v.c, Math.log(1 - p / 100) / 0.001); return { ok: true, txt: `Acerqué ${v.nombre}` }; }
      if (/^(alej|zoom_?out|reduc)/.test(acc)) { const p = Number.isFinite(cant) ? limitar(cant, 5, 300) : 50; await Gestos.rueda(v.c, Math.log(1 + p / 100) / 0.001); return { ok: true, txt: `Alejé ${v.nombre}` }; }
      const px = Number.isFinite(cant) ? limitar(cant, 20, 600) : 160;
      if (/^(mover|desplaz|pan)\w*_?izq/.test(acc)) { await Gestos.arrastrar(v.c, -px, 0, { pan: true }); return { ok: true, txt: `Moví la vista a la izquierda` }; }
      if (/^(mover|desplaz|pan)\w*_?der/.test(acc)) { await Gestos.arrastrar(v.c, px, 0, { pan: true }); return { ok: true, txt: `Moví la vista a la derecha` }; }
      if (/^(mover|desplaz|pan)\w*_?arr/.test(acc)) { await Gestos.arrastrar(v.c, 0, -px, { pan: true }); return { ok: true, txt: `Moví la vista hacia arriba` }; }
      if (/^(mover|desplaz|pan)\w*_?ab/.test(acc)) { await Gestos.arrastrar(v.c, 0, px, { pan: true }); return { ok: true, txt: `Moví la vista hacia abajo` }; }
      if (/auto|rotacion|girando/.test(acc) && v.tipo === 'nube') {
        const b = document.querySelector('#gcPointCloudModal [data-pc-autorotate]');
        if (!b) return { ok: false, txt: 'No encontré el control de giro automático' };
        const on = b.classList.contains('active'), quiere = !/(deten|para|apaga|off|stop|quita|desactiva)/.test(acc + ' ' + norm(valor || ''));
        if (on !== quiere) Control._clicReal(b);
        return { ok: true, txt: quiere ? 'Activé el giro automático' : 'Detuve el giro automático' };
      }
      return { ok: false, txt: `No conozco la vista «${accion}»` };
    },
    // Identifica elementos del modelo tocándolo en una retícula y leyendo el panel de selección
    // Escena 3D de Vector (se captura cuando se dibuja; ver instalarCaptura3D)
    async _escena(v) {
      instalarCaptura3D();
      if (!captura3D.escena) { await Gestos.arrastrar(v.c, 2, 0); await Gestos.arrastrar(v.c, -2, 0); await espera(150); }
      return captura3D.escena && captura3D.camara ? { s: captura3D.escena, c: captura3D.camara } : null;
    },
    _elementos(sc) {
      const out = [];
      sc.s.traverse(o => {
        if (!o.userData || !o.userData.vectorLabel) return;
        for (let p = o; p; p = p.parent) if (p.visible === false) return;
        out.push({ o, l: String(o.userData.vectorLabel), d: String(o.userData.vectorDetail || '') });
      });
      return out;
    },
    // Puntos de pantalla donde tocar un elemento: su centro y el de sus piezas (una grúa tiene hueco al centro)
    _puntos(v, sc, o) {
      const out = [];
      try {
        const T = window.THREE, proy = c => { const p = c.clone().project(sc.c); if (p.z < 1 && Math.abs(p.x) <= 0.98 && Math.abs(p.y) <= 0.98) out.push([(p.x + 1) / 2, (1 - p.y) / 2]); };
        proy(new T.Box3().setFromObject(o).getCenter(new T.Vector3()));
        const piezas = []; o.traverse(m => { if (m.isMesh && m.geometry) piezas.push(m); });
        for (const m of piezas.slice(0, 6)) proy(new T.Box3().setFromObject(m).getCenter(new T.Vector3()));
      } catch (_) {}
      return out.slice(0, 5);
    },
    async _porEscena(v, texto, leer) {
      if (!window.THREE) return null;
      const sc = await this._escena(v); if (!sc) return null;
      const els = this._elementos(sc); if (!els.length) return null;
      const nombres = [...new Set(els.map(e => e.l))];
      const q = norm(texto || '');
      if (!q) return { ok: true, txt: `Identifiqué ${nombres.length} elementos en el modelo`, detalle: 'Elementos del modelo: ' + nombres.slice(0, 60).join('; '), leer: true };
      const pal = q.split(' ').filter(w => w.length > 2);
      const sc1 = e => { const n = norm(e.l + ' ' + e.d), l = norm(e.l); if (l === q) return 3; if (l.includes(q) || q.includes(l)) return 2.5; if (n.includes(q)) return 2; return pal.length ? pal.filter(w => n.includes(w) || n.includes(w.slice(0, 5))).length / pal.length : 0; };
      const cand = els.map(e => [sc1(e), e]).filter(x => x[0] >= 0.5).sort((a, b) => b[0] - a[0]);
      if (!cand.length) return { ok: false, txt: `El modelo de este paso no incluye «${texto}» (el modelo completo se ve en Exteriores y en Resultado)`, detalle: 'Elementos del modelo: ' + nombres.slice(0, 60).join('; '), leer: true };
      const top = cand.filter(x => x[0] === cand[0][0]).map(x => x[1]);
      // Si otro elemento lo tapa (p. ej., la cubierta sobre una grúa), ese se aparta un instante solo para el toque
      const apartados = [];
      const apartar = l => { for (const x of els) if (norm(x.l) === norm(l) && x.o.layers) { apartados.push([x.o, x.o.layers.mask]); x.o.layers.mask = 0; } };
      const regresar = () => { for (const [o, m] of apartados.splice(0)) o.layers.mask = m; };
      try {
        for (let intento = 0; intento < 2; intento++) {
          for (const e of top.slice(0, 4)) {
            for (const pt of this._puntos(v, sc, e.o)) for (let capa = 0; capa < 4; capa++) {
              await Gestos.tocar(v.c, pt[0], pt[1]); await espera(120);
              const t = leer();
              if (t && norm(t.l) === norm(e.l)) { regresar(); return { ok: true, txt: `Seleccioné ${e.l}`, detalle: 'Elemento seleccionado: ' + t.d, leer: true }; }
              if (!t || !t.l) break;
              apartar(t.l);
            }
            regresar();
          }
          // Fuera de cuadro: vista completa y otro intento
          if (intento === 0) { await this._restablecer(v); await espera(300); }
        }
      } finally { regresar(); }
      return { ok: false, txt: `«${top[0].l}» existe pero no se alcanza a ver desde esta vista`, detalle: 'Sugerencia: oculta la cubierta o cambia la vista', leer: true };
    },
    async identificar(texto, foco) {
      const v = this.activo();
      if (!v || v.tipo !== 'modelo') return { ok: false, txt: 'Abre el modelo 3D para identificar elementos' };
      const panel = () => document.getElementById('gModelSelection');
      const leer = () => { const p = panel(); if (!p || !p.classList.contains('show')) return null; const s = p.querySelector('strong'); return { l: (s ? s.innerText : p.innerText).trim(), d: p.innerText.replace(/\s+/g, ' ').trim() }; };
      v.c.scrollIntoView({ block: 'center', behavior: 'auto' }); await espera(120);
      foco.mostrar(v.c, 'Identificando');
      // Camino rápido y preciso: leer los elementos de la escena 3D y tocar justo donde está el que se pidió
      const viaEscena = await this._porEscena(v, texto, leer);
      if (viaEscena) return viaEscena;
      const vistos = new Map(), N = 10, M = 7, q0 = norm(texto || '');
      // recorrido en espiral desde el centro: lo importante suele estar al centro de la vista
      const celdas = [];
      for (let j = 0; j < M; j++) for (let i = 0; i < N; i++) celdas.push([(i + 0.5) / N, (j + 0.5) / M]);
      celdas.sort((a, b) => Math.hypot(a[0] - 0.5, a[1] - 0.5) - Math.hypot(b[0] - 0.5, b[1] - 0.5));
      for (const [fx, fy] of celdas) {
        const antes = (leer() || {}).d || '';
        await Gestos.tocar(v.c, fx, fy);
        // Vector actualiza la ficha del elemento un instante después del toque (se espera el cambio, máx. ~160 ms)
        let t = leer(); for (let k = 0; k < 4 && (!t || t.d === antes); k++) { await espera(40); t = leer(); }
        if (t && t.l) {
          const k = norm(t.l); if (!vistos.has(k)) vistos.set(k, { ...t, fx, fy, n: 0 }); vistos.get(k).n++;
          if (q0 && norm(t.l + ' ' + t.d).includes(q0)) break;
        }
      }
      const lista = [...vistos.values()];
      const p = panel();
      if (!lista.length) { if (p) p.classList.remove('show'); return { ok: false, txt: 'No encontré elementos visibles en el modelo' }; }
      const q = norm(texto || '');
      if (!q) {
        if (p) p.classList.remove('show');
        const nombres = lista.sort((a, b) => b.n - a.n).map(x => x.l).slice(0, 25);
        return { ok: true, txt: `Identifiqué ${nombres.length} elementos visibles`, detalle: 'Elementos visibles en el modelo: ' + nombres.join('; '), leer: true };
      }
      const pal = q.split(' ').filter(w => w.length > 2);
      const sc = x => { const n = norm(x.l + ' ' + x.d); if (n.includes(q)) return 2; return pal.length ? pal.filter(w => n.includes(w)).length / pal.length : 0; };
      const mejor = lista.map(x => [sc(x), x]).sort((a, b) => b[0] - a[0] || b[1].n - a[1].n)[0];
      if (!mejor || mejor[0] < 0.5) {
        if (p) p.classList.remove('show');
        return { ok: false, txt: `No veo «${texto}» en la vista actual`, detalle: 'Elementos visibles: ' + lista.map(x => x.l).slice(0, 20).join('; '), leer: true };
      }
      await Gestos.tocar(v.c, mejor[1].fx, mejor[1].fy);
      return { ok: true, txt: `Seleccioné ${mejor[1].l}`, detalle: 'Elemento seleccionado: ' + mejor[1].d, leer: true };
    },
    estado() {
      const v = this.activo(); if (!v) return '';
      const sel = document.querySelector('#gModelSelection.show');
      return `Visor 3D activo: ${v.tipo === 'nube' ? 'nube de puntos (levantamiento de ejemplo)' : 'modelo conceptual del proyecto'}${sel ? ' · elemento seleccionado: ' + sel.innerText.replace(/\s+/g, ' ').trim().slice(0, 120) : ''}`;
    },
  };

  /* ---------- Google Maps del levantamiento (buscar, zoom, tipo, delimitar terreno) ---------- */
  const MapaG = {
    inst: null,
    // Vector crea el mapa al abrir "Solicitar levantamiento": se intercepta su creación para poder operarlo
    enganchar() {
      const self = this;
      const parchar = () => {
        const g = window.google && window.google.maps;
        if (!g || !g.Map || g.Map.__vvz) return;
        try {
          const Orig = g.Map;
          const Envuelto = function (...a) { const m = Reflect.construct(Orig, a, new.target || Envuelto); self.inst = m; return m; };
          Envuelto.prototype = Orig.prototype; Object.setPrototypeOf(Envuelto, Orig); Envuelto.__vvz = true;
          g.Map = Envuelto;
        } catch (_) { /* si no se puede envolver, se intenta por los listeners */ }
        try {
          const P = g.MVCObject && g.MVCObject.prototype;
          if (P && P.addListener && !P.addListener.__vvz) {
            const o = P.addListener;
            P.addListener = function (...a) { try { if (typeof this.getDiv === 'function' && this.getDiv() && this.getDiv().id === 'gcSurveyMap') self.inst = this; } catch (_) {} return o.apply(this, a); };
            P.addListener.__vvz = true;
          }
        } catch (_) {}
      };
      let actual = window.__gcSurveyMapReady;
      const envolver = f => (typeof f === 'function' && !f.__vvz) ? Object.assign(function (...a) { parchar(); return f.apply(this, a); }, { __vvz: true }) : f;
      try {
        actual = envolver(actual);
        Object.defineProperty(window, '__gcSurveyMapReady', { configurable: true, enumerable: true, get() { return actual; }, set(v) { actual = envolver(v); } });
      } catch (_) {}
      parchar();
    },
    listo() { const m = this.inst; try { return m && m.getDiv && visible(m.getDiv()) ? m : null; } catch (_) { return null; } },
    boton(sel) { return [...document.querySelectorAll(sel)].find(b => !b.closest('#vector-voz') && visible(b)) || null; },
    async asegurar(foco) {
      if (this.listo()) return { ok: true };
      if (!document.querySelector('#gcSurveyModal.show')) {
        let b = this.boton('[data-survey-open]');
        if (!b) { const r = await Habil.irA('Sitio', foco); if (!r.ok) return r; await espera(400); b = this.boton('[data-survey-open]'); }
        if (!b) return { ok: false, txt: 'No encontré «Solicitar levantamiento» para abrir el mapa' };
        b.scrollIntoView({ block: 'center', behavior: 'auto' }); foco.mostrar(b, 'Abrir mapa'); Control._clicReal(b);
      }
      for (let i = 0; i < 40 && !this.listo(); i++) {
        await espera(250);
        const setup = document.querySelector('#gcSurveyMapSetup.show');
        if (setup && visible(setup)) return { ok: false, txt: 'Google Maps no tiene clave configurada en Vector' };
      }
      await Control.despejarAyuda();
      return this.listo() ? { ok: true } : { ok: false, txt: 'El mapa de Google no terminó de cargar' };
    },
    async _clic(sel, foco, etiqueta) {
      const b = this.boton(sel); if (!b) return null;
      foco.mostrar(b, etiqueta || 'Clic'); Control._clicReal(b); await espera(450); return b;
    },
    resultados() { return [...document.querySelectorAll('[data-search-result-index]')].filter(visible).map(b => b.innerText.replace(/\s+/g, ' ').trim().replace(/^\d+\s+/, '').replace(/\s+\d+(\.\d+)?\s*(m|km)$/, '').slice(0, 90)); },
    snapshot() { return window.GCPEASA_SURVEY_SHARED || null; },
    async _buscarTexto(q, foco) {
      const inp = document.getElementById('gcSurveySearch');
      if (!inp) return { ok: false, txt: 'No encontré el buscador del mapa' };
      foco.mostrar(inp, 'Buscando ' + q); Control._escribir(inp, q); await espera(150);
      const antes = JSON.stringify(this.snapshot() || {});
      await this._clic('[data-survey-search]', foco, 'Buscar');
      for (let i = 0; i < 32; i++) {
        await espera(250);
        const btn = this.boton('[data-survey-search]');
        if (btn && btn.disabled) continue;
        const res = this.resultados();
        if (res.length) {
          if (res.length === 1) { await this._clic('[data-search-result-index="0"]', foco, 'Elegir'); return { ok: true, txt: `Ubiqué ${res[0]}` }; }
          return { ok: true, txt: `Encontré ${res.length} lugares para «${q}»`, detalle: 'Resultados de búsqueda en el mapa: ' + res.map((r, k) => `${k + 1}) ${r}`).join(' | ') + '. Elige con [[mapa resultado = N]] o pregunta al usuario cuál.', leer: true };
        }
        if (JSON.stringify(this.snapshot() || {}) !== antes && i > 3) break;
      }
      const s = this.snapshot();
      return s && s.hasLocation ? { ok: true, txt: `Ubiqué ${s.locationLabel || q}` } : { ok: false, txt: `No encontré «${q}» en el mapa` };
    },
    _vertices(cx, A, B, giro) {
      const t = (giro || 0) * Math.PI / 180, k = 111320, kl = k * Math.cos(cx.lat * Math.PI / 180);
      return [[-A / 2, -B / 2], [A / 2, -B / 2], [A / 2, B / 2], [-A / 2, B / 2]].map(([x, y]) => {
        const xr = x * Math.cos(t) + y * Math.sin(t), yr = -x * Math.sin(t) + y * Math.cos(t);
        return { lat: cx.lat + yr / k, lng: cx.lng + xr / kl };
      });
    },
    async _dibujar(puntos, foco) {
      const g = window.google.maps, m = this.listo();
      const s = this.snapshot();
      if (s && s.polygon && s.polygon.length) { await this._clic('[data-survey-clear]', foco, 'Limpiar polígono'); await espera(250); }
      const b = this.boton('[data-survey-draw]'); if (!b) return { ok: false, txt: 'No encontré «Delimitar terreno»' };
      if (!b.classList.contains('on')) { foco.mostrar(b, 'Delimitar'); Control._clicReal(b); await espera(350); }
      for (const p of puntos) { g.event.trigger(m, 'click', { latLng: new g.LatLng(p.lat, p.lng) }); await espera(140); }
      const b2 = this.boton('[data-survey-draw]');
      if (b2 && b2.classList.contains('on')) { foco.mostrar(b2, 'Terminar'); Control._clicReal(b2); await espera(600); }
      const s2 = this.snapshot();
      return { ok: true, txt: `Delimité el terreno${s2 && s2.areaM2 ? ': ' + Math.round(s2.areaM2).toLocaleString('es-MX') + ' m²' : ''}` };
    },
    async ejecutar(accion, valor, foco) {
      const acc = norm(accion), val = String(valor || '').trim(), nv = norm(val);
      const r0 = await this.asegurar(foco); if (!r0.ok) return r0;
      const g = window.google.maps, m = this.listo();
      if (/^busca|^ubica|^encuentra|^lugar|^direccion/.test(acc)) return val ? this._buscarTexto(val, foco) : { ok: false, txt: 'Dime qué lugar busco' };
      if (/^(ir|coordenadas|centrar_en|centra)/.test(acc) && /-?\d+\.\d+\s*[, ]\s*-?\d+\.\d+/.test(val)) return this._buscarTexto(val.match(/-?\d+\.\d+\s*[, ]\s*-?\d+\.\d+/)[0].replace(/\s+/, ''), foco);
      if (/^resultado|^opcion|^elige/.test(acc)) {
        const n = Math.round(numero(val)) || 1;
        const b = await this._clic(`[data-search-result-index="${n - 1}"]`, foco, 'Elegir');
        return b ? { ok: true, txt: `Elegí el resultado ${n}` } : { ok: false, txt: `No hay resultado ${n} en la lista` };
      }
      if (/^zoom|^acerca|^aleja/.test(acc)) {
        const z = m.getZoom() || 5, n = numero(val);
        let nz = /^acerca/.test(acc) || /^(mas|acerca|\+)/.test(nv) ? z + (Number.isFinite(n) && n < 8 ? n : 2) : /^aleja/.test(acc) || /^(menos|aleja|-)/.test(nv) ? z - (Number.isFinite(n) && n < 8 ? Math.abs(n) : 2) : n;
        if (!Number.isFinite(nz)) return { ok: false, txt: 'Dime el nivel de zoom (1 a 21)' };
        nz = limitar(Math.round(nz), 2, 21); m.setZoom(nz); await espera(400);
        return { ok: true, txt: `Zoom del mapa en ${nz}` };
      }
      if (/^tipo|^vista|^capa|^modo/.test(acc) || /satel|hibrid|relieve|terreno|calles|^mapa$/.test(nv)) {
        const t = /satel/.test(nv) ? 'satellite' : /hibrid/.test(nv) ? 'hybrid' : /relieve|terreno|topo/.test(nv) ? 'terrain' : 'roadmap';
        m.setMapTypeId(t); await espera(300);
        return { ok: true, txt: `Mapa en vista ${({ satellite: 'satélite', hybrid: 'híbrida', terrain: 'relieve', roadmap: 'de calles' })[t]}` };
      }
      if (/^mover|^desplaza|^pan/.test(acc)) {
        const metros = Number.isFinite(numero(val)) ? numero(val) : 100;
        const c = m.getCenter().toJSON(), z = m.getZoom(), mpp = 156543.03392 * Math.cos(c.lat * Math.PI / 180) / Math.pow(2, z), px = metros / mpp;
        const d = /norte|arriba/.test(nv) ? [0, -px] : /sur|abajo/.test(nv) ? [0, px] : /este|oriente|derecha/.test(nv) ? [px, 0] : /oeste|poniente|izquierda/.test(nv) ? [-px, 0] : null;
        if (!d) return { ok: false, txt: 'Dime hacia dónde muevo el mapa (norte, sur, este u oeste)' };
        m.panBy(d[0], d[1]); await espera(400);
        return { ok: true, txt: `Moví el mapa ${Math.round(metros)} m al ${/norte|arriba/.test(nv) ? 'norte' : /sur|abajo/.test(nv) ? 'sur' : /este|oriente|derecha/.test(nv) ? 'este' : 'oeste'}` };
      }
      if (/^rectang|^delimita|^dibuja|^terreno|^poligono/.test(acc) && /\d/.test(val)) {
        const nums = (val.replace(/(\d),(?=\d{3}\b)/g, '$1').match(/\d+(?:\.\d+)?/g) || []).map(Number);
        const giro = /gir|rot|grad/.test(nv) ? nums[2] || 0 : 0;
        if (/-?\d+\.\d{3,}/.test(val) && nums.length >= 6) {
          const pares = val.match(/-?\d+\.\d+\s*,\s*-?\d+\.\d+/g) || [];
          const pts = pares.map(p => { const [a, b] = p.split(',').map(Number); return { lat: a, lng: b }; });
          if (pts.length >= 3) return this._dibujar(pts, foco);
        }
        if (nums.length < 2) return { ok: false, txt: 'Dime frente y fondo del terreno en metros (p. ej., 120 x 80)' };
        const c = m.getCenter().toJSON();
        return this._dibujar(this._vertices(c, nums[0], nums[1], giro), foco);
      }
      if (/^punto|^vertice|^marca/.test(acc)) {
        const b = this.boton('[data-survey-draw]');
        if (b && !b.classList.contains('on')) { Control._clicReal(b); await espera(300); }
        const cm = val.match(/-?\d+\.\d+\s*,\s*-?\d+\.\d+/);
        const p = cm ? (([a, bb]) => ({ lat: a, lng: bb }))(cm[0].split(',').map(Number)) : m.getCenter().toJSON();
        g.event.trigger(m, 'click', { latLng: new g.LatLng(p.lat, p.lng) }); await espera(200);
        const s = this.snapshot();
        return { ok: true, txt: `Marqué un vértice (${s && s.polygon ? s.polygon.length : 1} en total)` };
      }
      if (/^termina|^cierra_poligono|^finaliza/.test(acc)) {
        const b = this.boton('[data-survey-draw]');
        if (b && b.classList.contains('on')) { foco.mostrar(b, 'Terminar'); Control._clicReal(b); await espera(500); }
        const s = this.snapshot();
        return { ok: true, txt: s && s.areaM2 ? `Terreno delimitado: ${Math.round(s.areaM2).toLocaleString('es-MX')} m²` : 'Terminé la delimitación' };
      }
      if (/^deshace/.test(acc)) { const b = await this._clic('[data-survey-undo]', foco, 'Deshacer'); return b ? { ok: true, txt: 'Quité el último vértice' } : { ok: false, txt: 'No encontré «Deshacer punto»' }; }
      if (/^limpia|^borra/.test(acc)) { const b = await this._clic('[data-survey-clear]', foco, 'Limpiar'); return b ? { ok: true, txt: 'Limpié el polígono del mapa' } : { ok: false, txt: 'No encontré «Limpiar»' }; }
      if (/^ubicacion|^mi_ubicacion|^gps|^donde_estoy/.test(acc)) { const b = await this._clic('[data-survey-current]', foco, 'Mi ubicación'); return b ? { ok: true, txt: 'Pedí tu ubicación actual (acepta el permiso del navegador si aparece)' } : { ok: false, txt: 'No encontré «Mi ubicación»' }; }
      return { ok: false, txt: `No conozco la acción de mapa «${accion}»` };
    },
    estado() {
      const m = this.listo(); if (!m) return '';
      let t = '';
      try {
        const c = m.getCenter().toJSON(), s = this.snapshot() || {}, d = this.boton('[data-survey-draw]');
        t = `Mapa de Google abierto · zoom ${m.getZoom()} · vista ${m.getMapTypeId()} · centro ${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
        if (s.locationLabel) t += ` · ubicación: ${String(s.locationLabel).slice(0, 80)}`;
        if (s.polygon && s.polygon.length) t += ` · polígono: ${s.polygon.length} vértices${s.areaM2 ? ', ' + Math.round(s.areaM2).toLocaleString('es-MX') + ' m²' : ''}`;
        if (d && d.classList.contains('on')) t += ' · modo delimitar ACTIVO';
        const res = this.resultados(); if (res.length) t += ' · resultados: ' + res.map((r, k) => `${k + 1}) ${r}`).join(' | ').slice(0, 400);
      } catch (_) {}
      return t;
    },
  };

  /* ---------- Experiencia GCPeasa: catálogo de frentes, partidas y subpartidas ---------- */
  const VACIAS = new Set('de del la las el los un una unos unas y o en con para por que al a mi me se su sus lo le les quiero pon ponle activa activar desactiva desactivar quita quitar agrega agregar marca marcar desmarca incluye incluir concepto partida subpartida frente vector'.split(' '));
  const Experto = {
    _cat: null,
    catalogo() {
      if (this._cat) return this._cat;
      try { this._cat = JSON.parse(document.getElementById('cost-data').textContent).map(x => ({ c: String(x.codigo), n: String(x.nombre).replace(/^\d+\s*-\s*/, '').trim() })); } catch (_) { this._cat = []; }
      return this._cat;
    },
    _pal(t) { return norm(t).split(' ').filter(w => w.length > 2 && !VACIAS.has(w)); },
    buscar(ref) {
      const cat = this.catalogo(), cod = (String(ref).match(/\b\d{6}\b|\b\d{4}\b|\b\d{2}\b/) || [])[0];
      if (cod) { const x = cat.find(e => e.c === cod); if (x) return x; }
      const q = this._pal(ref); if (!q.length) return null;
      let mejor = null, ms = 0;
      for (const e of cat) {
        const n = norm(e.n), s = q.filter(w => n.includes(w)).length / q.length + (norm(ref) === n ? 1 : 0) + e.c.length * 0.001;
        if (s > ms) { ms = s; mejor = e; }
      }
      return ms >= 0.6 ? mejor : null;
    },
    casilla(c) { return document.querySelector(`input[type=checkbox][data-front="${c}"],input[type=checkbox][data-part="${c}"],input[type=checkbox][data-sub="${c}"]`); },
    estadoDe(c) { const cb = this.casilla(c); return !cb ? 'oculto (su frente o partida está apagado)' : cb.checked ? 'ACTIVO' : cb.disabled && document.querySelector(`[data-switch="${c}"]`) ? 'inactivo (opción alterna)' : 'inactivo'; },
    relacionados(texto, max) {
      const q = this._pal(texto); if (!q.length) return '';
      const cod = String(texto).match(/\b\d{2}(?:\d{2}){0,2}\b/g) || [];
      const sc = this.catalogo().map(e => { const n = norm(e.n); return [q.filter(w => n.includes(w)).length + (cod.includes(e.c) ? 3 : 0), e]; }).filter(x => x[0] > 0).sort((a, b) => b[0] - a[0] || a[1].c.length - b[1].c.length).slice(0, max || 10);
      return sc.map(([, e]) => `${e.c} ${e.n} · ${this.estadoDe(e.c)}`).join('\n');
    },
    enExperto() { const b = [...document.querySelectorAll('.mode-btn')].find(x => /gcpeasa/i.test(x.innerText)); return !!b && Control._sel(b); },
    async modoExperto(foco) {
      if (this.enExperto()) return;
      const b = [...document.querySelectorAll('.mode-btn')].find(x => /gcpeasa/i.test(x.innerText));
      if (!b) return;
      foco.mostrar(b, 'Experiencia GCPeasa'); Control._clicReal(b); await espera(1100);
      for (let i = 0; i < 3; i++) {
        await Control.despejarAyuda();
        const d = Habil._hit('button', x => /^continuar donde me qued/i.test(x.innerText.trim()));
        if (!d) break; Control._clicReal(d); await espera(800);
      }
    },
    async _limpiarFiltros() {
      const s = document.getElementById('expertSearch');
      if (s && s.value) { Control._escribir(s, ''); await espera(300); }
      const todo = [...document.querySelectorAll('.expert-chip')].find(x => /^todo$/i.test(x.innerText.trim()));
      if (todo && !Control._sel(todo)) { Control._clicReal(todo); await espera(400); }
    },
    async _marcar(cb, foco, etq) {
      cb.scrollIntoView({ block: 'center', behavior: 'auto' }); await espera(200);
      foco.mostrar(cb.parentElement || cb, etq); Control._clicReal(cb); await espera(450);
    },
    async concepto(ref, accion, foco) {
      const e = this.buscar(ref);
      if (!e) return { ok: false, txt: `No encontré «${ref}» en el catálogo de conceptos` };
      const activar = !/desactiv|quita|apaga|excluy|desmarc|elimin|^no\b|off|sin\b/.test(norm(accion || 'activar'));
      await this.modoExperto(foco);
      let cb = this.casilla(e.c);
      if (!cb) { await this._limpiarFiltros(); cb = this.casilla(e.c); }
      if (!cb && !activar) return { ok: true, txt: `${e.c} ${e.n} no está activo` };
      if (activar) {
        for (const a of [e.c.slice(0, 2), e.c.slice(0, 4)].filter(x => x.length < e.c.length)) {
          const ca = this.casilla(a);
          if (ca && !ca.checked && !ca.disabled) await this._marcar(ca, foco, 'Activar ' + a);
        }
        cb = this.casilla(e.c);
      }
      if (!cb) return { ok: false, txt: `No encontré la casilla de ${e.c} ${e.n}` };
      if (cb.checked === activar) return { ok: true, txt: `${e.c} ${e.n} ya estaba ${activar ? 'activo' : 'desactivado'}` };
      if (activar && cb.disabled) {
        const sw = document.querySelector(`[data-switch="${e.c}"]`);
        if (sw) { sw.scrollIntoView({ block: 'center', behavior: 'auto' }); await espera(200); foco.mostrar(sw, 'Cambiar opción'); Control._clicReal(sw); await espera(500); return { ok: true, txt: `Cambié a ${e.c} ${e.n}` }; }
      }
      if (cb.disabled) return { ok: false, txt: `${e.c} ${e.n} está bloqueado por otra selección` };
      await this._marcar(cb, foco, (activar ? 'Activar ' : 'Desactivar ') + e.c);
      const cb2 = this.casilla(e.c);
      return cb2 && cb2.checked === activar ? { ok: true, txt: `${activar ? 'Activé' : 'Desactivé'} ${e.c} ${e.n}` } : { ok: false, txt: `No pude cambiar ${e.c} ${e.n}` };
    },
    async areaFrente(ref, valor, foco) {
      const e = this.buscar(ref); const c = e ? e.c.slice(0, 2) : (String(ref).match(/\b\d{2}\b/) || [])[0];
      if (!c) return { ok: false, txt: `No identifiqué el frente «${ref}»` };
      await this.modoExperto(foco);
      let el = [...document.querySelectorAll(`input[data-top-area="${c}"],input[data-area="${c}"]`)].find(visible);
      if (!el) { await this._limpiarFiltros(); el = [...document.querySelectorAll(`input[data-top-area="${c}"],input[data-area="${c}"]`)].find(visible); }
      if (!el) return { ok: false, txt: `El frente ${c} no tiene un campo de área visible (actívalo primero)` };
      el.scrollIntoView({ block: 'center', behavior: 'auto' }); await espera(200);
      foco.mostrar(el, 'Escribiendo ' + valor); Control._escribir(el, valor); await espera(400);
      const nombre = (this.catalogo().find(x => x.c === c) || {}).n || c;
      return { ok: true, txt: `Capturé ${el.value || valor} m² en ${c} ${nombre}` };
    },
    async resaltar(ref, foco) {
      const e = this.buscar(ref); if (!e) return { ok: false, txt: `No encontré «${ref}» en el catálogo` };
      await this.modoExperto(foco);
      const l = [...document.querySelectorAll(`[data-focus-code="${e.c}"]`)].find(visible);
      if (!l) return { ok: false, txt: `${e.c} ${e.n} no está visible para resaltarlo` };
      l.scrollIntoView({ block: 'center', behavior: 'auto' }); await espera(200);
      foco.mostrar(l, 'Resaltar'); Control._clicReal(l); await espera(400);
      return { ok: true, txt: `Resalté ${e.c} ${e.n}` };
    },
  };

  /* ---------- Barras, teclas y desplazamiento de página ---------- */
  const Extra = {
    esBarra(e) { return (e.tagName === 'INPUT' && e.type === 'range') || e.getAttribute('role') === 'slider' || (e.tagName !== 'CANVAS' && /arrastra/i.test(e.title || '') && e.getBoundingClientRect().width > 3 * e.getBoundingClientRect().height); },
    async ajustar(el, valor, foco) {
      const t = String(valor).trim(), n = numero(t), pct = /%/.test(t);
      if (!Number.isFinite(n)) return { ok: false, txt: `No entendí el valor «${valor}»` };
      el.scrollIntoView({ block: 'center', behavior: 'auto' }); await espera(200);
      if (el.tagName === 'INPUT' && el.type === 'range') {
        const min = parseFloat(el.min || 0), max = parseFloat(el.max || 100), st = parseFloat(el.step) || 1;
        let v = pct ? min + (max - min) * n / 100 : n;
        v = limitar(Math.round((v - min) / st) * st + min, min, max);
        foco.mostrar(el, 'Ajustando a ' + v);
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, String(v));
        el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        await espera(350);
        return { ok: true, txt: `Ajusté ${(el.getAttribute('aria-label') || 'la barra').toLowerCase()} a ${el.value}` };
      }
      // Barra personalizada (p. ej., la línea del tiempo de la simulación): se toca en la proporción pedida
      let vmin = parseFloat(el.getAttribute('aria-valuemin') || 0), vmax = parseFloat(el.getAttribute('aria-valuemax'));
      // Línea del tiempo "Semana 6.1 / 34.6": un número sin % se entiende en esas unidades (semana 20 de 34.6)
      if (!Number.isFinite(vmax)) { const r = rangoBarra(el); if (r) { vmin = 0; vmax = r; } }
      const f = limitar(!pct && Number.isFinite(vmax) && vmax > vmin ? (n - vmin) / (vmax - vmin) : pct || n > 1 ? n / 100 : n, 0, 1);
      foco.mostrar(el, 'Ajustando a ' + Math.round(f * 100) + '%');
      await Gestos.tocar(el, f, 0.5, true); await espera(350);
      const rg = rangoBarra(el);
      if (rg) return { ok: true, txt: `Llevé la simulación a la semana ${(f * rg).toFixed(1)} de ${rg} (${Math.round(f * 100)}%)` };
      return { ok: true, txt: `Llevé ${(el.title || 'la barra').replace(/^arrastra para\s*/i, '').toLowerCase()} al ${Math.round(f * 100)}%` };
    },
    TECLAS: { escape: 'Escape', esc: 'Escape', salir: 'Escape', enter: 'Enter', intro: 'Enter', aceptar: 'Enter', tab: 'Tab', tabulador: 'Tab', espacio: ' ', arriba: 'ArrowUp', abajo: 'ArrowDown', izquierda: 'ArrowLeft', derecha: 'ArrowRight', inicio: 'Home', fin: 'End', retroceso: 'Backspace', borrar: 'Delete', suprimir: 'Delete', avpag: 'PageDown', repag: 'PageUp' },
    tecla(nombre) {
      const n = norm(nombre).replace(/^flecha /, '').replace(/ /g, '');
      const key = this.TECLAS[n] || (nombre.length === 1 ? nombre : '');
      if (!key) return { ok: false, txt: `No conozco la tecla «${nombre}»` };
      const destino = document.activeElement && document.activeElement !== document.body && !document.activeElement.closest('#vector-voz') ? document.activeElement : document;
      const o = { key, code: key === ' ' ? 'Space' : key, bubbles: true, cancelable: true, composed: true };
      destino.dispatchEvent(new KeyboardEvent('keydown', o)); destino.dispatchEvent(new KeyboardEvent('keyup', o));
      return { ok: true, txt: `Presioné ${key === ' ' ? 'Espacio' : key}` };
    },
    desplazar(dir) {
      const d = norm(dir);
      // contenedor desplazable más grande visible (o la página)
      const desplazable = e => e && e.scrollHeight > e.clientHeight + 40 && /(auto|scroll|overlay)/.test(getComputedStyle(e).overflowY);
      const ancestro = e => { for (let p = e; p && p !== document.body && p !== document.documentElement; p = p.parentElement) if (desplazable(p)) return p; return null; };
      const modal = modalActivo();
      let c = null;
      if (modal) c = desplazable(modal) ? modal : [...modal.querySelectorAll('*')].filter(desplazable).sort((a, b) => area(b) - area(a))[0];
      if (!c) {
        const centro = midiendo(() => document.elementFromPoint(innerWidth * 0.4, innerHeight * 0.55)), lista = [];
        for (let p = centro; p && p !== document.body && p !== document.documentElement; p = p.parentElement) if (!p.closest('#vector-voz') && desplazable(p)) lista.push(p);
        c = lista.sort((a, b) => area(b) - area(a))[0] || null;
      }
      if (!c) c = [...document.querySelectorAll('main,section,div,aside')].filter(e => !e.closest('#vector-voz') && desplazable(e) && visible(e)).sort((a, b) => area(b) - area(a))[0];
      if (!c || document.scrollingElement.scrollHeight > innerHeight + 40 && !modal && !desplazable(c)) c = document.scrollingElement;
      const h = c === document.scrollingElement ? innerHeight : c.clientHeight;
      const top = /inicio|arriba del todo|principio/.test(d) ? 0 : /fin|final|hasta abajo/.test(d) ? c.scrollHeight : c.scrollTop + (/arriba|sube/.test(d) ? -0.8 : 0.8) * h;
      c.scrollTo({ top, behavior: REDUCIR_MOV ? 'auto' : 'smooth' });
      return { ok: true, txt: /inicio|principio/.test(d) ? 'Subí al inicio' : /fin|final/.test(d) ? 'Bajé al final' : /arriba|sube/.test(d) ? 'Subí la pantalla' : 'Bajé la pantalla' };
    },
  };

  // Detalle adicional de pantalla que acompaña al MAPA DE PANTALLA
  function detallePantalla(consulta) {
    const l = [];
    try {
      const v = Visor3D.estado(); if (v) l.push(v);
      const mg = MapaG.estado(); if (mg) l.push(mg);
      const sim = document.getElementById('gBuildSimulation');
      if (sim && !sim.hidden && visible(sim)) {
        const t = id => (document.getElementById(id) || {}).innerText || '';
        l.push(`Simulación 4D: ${t('gBuildLiveTime')} · ${t('gBuildLivePct')} · ${t('gBuildPhaseTitle')} ${t('gBuildPhaseDetail')}`.replace(/\s+/g, ' ').slice(0, 220));
      }
      // Paneles del Resultado: la IA necesita las cifras completas (el mapa recorta las etiquetas)
      const panel = [...document.querySelectorAll('.g-analysis-panel')].find(visible);
      if (panel) {
        const limpio = t => String(t || '').replace(/\s+/g, ' ').trim();
        const grupos = [...panel.querySelectorAll('.g-alt-group')];
        if (grupos.length) {
          const out = ['ALTERNATIVAS DEL RESULTADO (cifras de Vector; para aplicar una usa [[clic N | Cambiar a esta opción]] con el número indicado):'];
          for (const g of grupos) {
            const tit = limpio((g.firstElementChild || g).innerText).replace(/Configuración inicial activa.*$/i, '').slice(0, 90);
            const ops = [...g.querySelectorAll('.g-alt-option')];
            const actual = ops.find(o => /Selección actual/i.test(o.innerText));
            out.push(`- ${tit}${actual ? ' · actual: ' + limpio(actual.innerText.split('\n')[0]) : ''}`);
            for (const o of ops) {
              if (o === actual) continue;
              const b = o.querySelector('button'), n = b ? Control.refs.indexOf(b) + 1 : 0;
              const txt = limpio(o.innerText.replace(/Cambiar a esta opción/g, '')).replace(/\s-?\+?\$[\d,]+$/, '');
              out.push(`   · ${txt}${n ? ` [clic ${n}]` : ''}`);
            }
          }
          l.push(out.join('\n').slice(0, 3800));
        } else l.push('PANEL ABIERTO EN RESULTADO: ' + limpio(panel.innerText).slice(0, 1800));
      }
      if (Experto.enExperto() || /\b\d{4,6}\b|concepto|partida|subpartida|frente/i.test(consulta || '')) {
        const r = Experto.relacionados(consulta || '', 10);
        if (r) l.push('CONCEPTOS DEL CATÁLOGO relacionados con la petición (código nombre · estado):\n' + r);
      }
    } catch (_) {}
    return l.join('\n');
  }

  /* ===================================================================
     8d. REGLAS DE CONTROL PARA LA IA (viajan con el widget junto con sus comandos)
     =================================================================== */
  const REGLAS = {
    base: `# Control de la aplicación
Eres experta en Vector y lo operas por el usuario. Cuando pida hacer, cambiar, mover o mostrar algo, HAZLO tú con comandos al final de tu respuesta, entre dobles corchetes. Usa el comando más específico; la app navega sola al paso correcto, resuelve los diálogos y da los clics.
Experiencia Guiada (usa las claves y opciones exactas del CATÁLOGO):
[[dato clave = número]] captura un dato (solo dígitos) · [[opcion clave = opción]] elige una opción o casilla (Sí/No) · [[ir Paso]] cambia de paso (solo si lo pidió)
Cualquier otro control: usa el MAPA DE PANTALLA copiando número y texto de la misma línea:
[[clic N | texto]] · [[escribir N | campo = valor]] · [[ajustar N | barra = valor o %]] · [[tecla Escape]] · [[desplazar abajo]] · [[seguir]] (pide la pantalla actualizada para continuar)
Reglas:
- Haz ÚNICAMENTE lo que el usuario pidió, pero hazlo COMPLETO: si pide varias cosas en una frase, escribe un comando por cada una.
- Peticiones vagas de costo ("hazla más barata", "optimízala"): NO cambies nada; propone 2 o 3 cambios concretos con su ahorro aproximado (con precios de Vector) y pregunta cuáles aplico.
- Para decir cuánto cambió algo usa la "[Nota de la app…]" del historial (estimación A → B); no lo recalcules ni copies esas notas en tus respuestas.
- Al llenar formularios, escribe SOLO en los campos que el usuario mencionó; si agrega texto a un campo que ya tiene algo, conserva lo anterior solo si lo pidió.
- Si la orden es ambigua, PREGUNTA en una frase con las opciones y NO pongas comandos: cuando no dice a qué parte se refiere ("el piso": ¿acabado del piso de la nave o piso de oficinas?; "nivel superior": ¿oficinas exteriores o interiores de la nave?) o no dice a qué valor cambiar ("cámbiale el piso" sin decir a cuál).
- Cambios relativos con lo que ya hay en el ESTADO: "quita una grúa" con 2 grúas → 1 grúa viajera; "agrega otra grúa" con 1 → 2 grúas viajeras; "súbele un nivel a las oficinas" con 1 nivel → niveles_oficinas = 2.
- No toques datos ni opciones que el usuario no mencionó (si solo da el área del terreno o de la demolición, NO cambies el estado del terreno; si solo cambia un área, no cambies acabados).
- Las acciones SOLO ocurren con comandos. Nunca digas que hiciste algo sin escribir su comando, ni inventes resultados.
- Una afirmación sobre su proyecto ("no necesito tapial", "la nave mide 3,000 m²", "van a entrar tráileres") es una instrucción: refléjala con comandos.
- Usa el ESTADO DE LA EXPERIENCIA GUIADA para saber qué está elegido; no repitas lo que ya está y calcula cambios relativos ("súbele 500 m² a la nave": si nave=4,000 → [[dato nave = 4500]]).
- Si corrige ("no, mejor lámina"), aplica la corrección.
- Elige la clave correcta: "oficinas exteriores" o "anexas" es oficinas_exteriores; "oficinas dentro de la nave" es oficinas_interiores; "tráileres" o "camiones" es vehiculos = Principalmente camiones o Autos y camiones.
- Borrar información (Limpiar todo, Limpiar paso, Restablecer selección, Proyecto nuevo, limpiar polígono) o enviar solicitudes y correos: escribe directamente el comando (p. ej., [[clic 31 | Enviar solicitud]]); la app le pide la confirmación al usuario con botones. No preguntes tú ni hagas otra acción en esa respuesta.
- Formularios: escribe solo lo que dijo el usuario, en el campo que corresponde; no inventes texto para otros campos ni datos de contacto.
- Mapa: busca solo lugares que el usuario mencionó; si pide un levantamiento sin decir dónde, abre la solicitud y pregúntale la ubicación.
- Los archivos adjuntos los elige el usuario: pídele que dé clic en el botón de adjuntar.
- Si haces una pregunta o pides confirmación, NO agregues comandos. Si el usuario solo pregunta algo, responde sin comandos usando el ESTADO, el CATÁLOGO y la GUÍA.
- Al recibir "RESULTADO DE ACCIONES", si ya terminaste, di el resultado en una frase corta sin comandos (menciona el nuevo total si viene en el resultado).
Ejemplos:
"la nave mide 5,000 m² y las oficinas exteriores 400" → "Capturo 5,000 m² de nave y 400 m² de oficinas exteriores. [[dato nave = 5000]] [[dato oficinas_exteriores = 400]]"
"no necesito tapial y el terreno ya está listo" → "Quito el tapial y marco el terreno como preparado. [[opcion tapial = Sin tapial]] [[opcion terreno_estado = Ya está preparado]]"
"muros de precolado, dos grúas y con andenes" → "Pongo muros precolados, dos grúas viajeras y andenes de carga. [[opcion muros = Precolado]] [[opcion grua = 2 grúas viajeras]] [[opcion andenes = Sí]]"
"las oficinas que sean de lujo con piso porcelánico" → "Subo las oficinas a Superior con piso porcelánico. [[opcion nivel_oficinas = Superior]] [[opcion piso_oficinas = Porcelánico]]"
"llévame a exteriores" → "Vamos a Exteriores. [[ir Exteriores]]"
"cámbiale el piso" → "¿Cuál piso: el acabado del piso de la nave o el piso de las oficinas, y a qué opción?"`,
    visor: `Visor 3D (modelo del proyecto, simulación 4D, exploración o nube de puntos; actúa sobre el que esté abierto):
[[vista acción]] acciones: superior, inferior, frontal, posterior, lateral_derecha, lateral_izquierda, isometrica, girar_derecha 45, girar_izquierda 90, inclinar_arriba 20, inclinar_abajo 20, acercar, alejar, mover_izquierda, mover_derecha, mover_arriba, mover_abajo, restablecer, auto_rotacion (solo nube)
[[elemento texto]] busca y selecciona un elemento del modelo (p. ej., cubierta, caseta, muro); [[elemento]] sin texto lista lo visible
"De frente", "desde atrás", "de lado", "desde arriba", "en isométrico" siempre se refieren a la vista del visor 3D: no preguntes, usa [[vista ...]].
Simulación 4D: el avance de obra es la semana; el gasto acumulado es el "% financiero" del DETALLE (no es igual al % de tiempo): monto = % financiero × estimación total.
Capas del modelo (botones Cubierta, Tapial… del MAPA; SELECCIONADO = visible): para ocultar o mostrar una, [[clic N | Cubierta]]; Restaurar ↺ vuelve a mostrar todo. [[elemento]] solo selecciona, no oculta.
Ejemplos: "muéstramelo desde arriba" → "Te lo muestro en planta. [[vista superior]]" · "acércate a la cubierta" → "Ubico la cubierta y me acerco. [[elemento cubierta]] [[vista acercar]]" · "pon el corte X al 30%" (MAPA: [41] barra · Posición del corte X = 50) → "Muevo el corte X al 30%. [[ajustar 41 | Posición del corte X = 30]]"`,
    mapa: `Mapa de Google (en "Solicitar levantamiento"; se abre solo si hace falta):
[[mapa buscar = lugar o dirección]] · [[mapa resultado = 2]] · [[mapa zoom = 18]] · [[mapa acercar]] · [[mapa alejar]] · [[mapa tipo = satélite|híbrido|calles|relieve]] · [[mapa mover = norte 100]] · [[mapa rectangulo = 120 x 80]] (terreno de frente x fondo en m, centrado en el mapa; agrega "girado 30" si lo indica) · [[mapa punto = centro]] · [[mapa terminar]] · [[mapa deshacer]] · [[mapa limpiar]] · [[mapa ubicacion]]
Ejemplo: "busca el parque industrial Querétaro y delimita un terreno de 150 por 90" → "Busco el lugar y delimito el terreno. [[mapa buscar = Parque Industrial Querétaro]] [[mapa rectangulo = 150 x 90]]"`,
    experto: `Experiencia GCPeasa (catálogo de conceptos; usa los códigos de CONCEPTOS DEL CATÁLOGO):
[[concepto código = activar]] o [[concepto código = desactivar]] · [[area_frente código = m²]] · [[resaltar código]]
Ejemplo: "activa la pintura vinílica de la nave" (CONCEPTOS: 131808 Pintura Vinílica Precolados / Tilt-Up · inactivo) → "Activo la pintura vinílica. [[concepto 131808 = activar]]"`,
  };
  function reglasControl(consulta, detalle, pantalla) {
    const t = `${consulta || ''} ${detalle || ''} ${pantalla || ''}`;
    const p = [REGLAS.base];
    if (/Visor 3D activo|vista|gir|rot[ae]|acerc|alej|modelo|nube|3d|planta|elemento|cubierta|ejemplo 3d|corte|simulaci|explora/i.test(t)) p.push(REGLAS.visor);
    if (/Mapa de Google|levantamiento|mapa|ubica|busca|delimit|direcci|coordenad|sat[eé]lite|google|pol[ií]gono|predio/i.test(t)) p.push(REGLAS.mapa);
    if (/Experiencia GCPeasa|concepto|partida|subpartida|cat[aá]logo|c[oó]digo|\b\d{4,6}\b|frente|resalta/i.test(t)) p.push(REGLAS.experto);
    return p.join('\n');
  }

  // Separa los comandos [[...]] del texto que se muestra y se habla (en streaming)
  class FiltroAcciones {
    constructor() { this.buf = ''; this.acciones = []; }
    agregar(d) {
      this.buf += d; let out = '';
      for (;;) {
        const i = this.buf.indexOf('[[');
        if (i < 0) {
          if (this.buf.endsWith('[')) { out += this.buf.slice(0, -1); this.buf = '['; } else { out += this.buf; this.buf = ''; }
          break;
        }
        out += this.buf.slice(0, i);
        const j = this.buf.indexOf(']]', i);
        if (j < 0) { this.buf = this.buf.slice(i); if (this.buf.length > 400) { out += this.buf; this.buf = ''; } break; }
        this.acciones.push(this.buf.slice(i + 2, j).trim());
        this.buf = this.buf.slice(j + 2);
      }
      return out;
    }
    terminar() { const r = this.buf; this.buf = ''; return r.startsWith('[') ? '' : r; }
  }

  function parsearAccion(crudo) {
    const r = parsearAccion_(crudo); if (r) r.raw = String(crudo).trim(); return r;
  }
  function parsearAccion_(s) {
    let m; s = String(s).trim();
    if ((m = s.match(/^dato\s*:?\s*([\wáéíóúñ ]+?)\s*[=:]\s*(.+)$/i))) return { tipo: 'dato', clave: m[1].trim(), valor: m[2].trim().replace(/^["'“]|["'”]$/g, '') };
    if ((m = s.match(/^opci[oó]n\s*:?\s*([\wáéíóúñ ]+?)\s*[=:]\s*(.+)$/i))) return { tipo: 'opcion', grupo: m[1].trim(), valor: m[2].trim().replace(/^["'“]|["'”]$/g, '') };
    if ((m = s.match(/^ir\s*(?:a|al)?\s*(?:paso)?\s*:?\s*([\wáéíóúñ]+)\s*$/i))) return { tipo: 'ir', paso: m[1] };
    const objetivo = (resto) => { const t = (resto || '').replace(/^\s*[|·:\-]\s*/, '').trim(); return t.replace(/^["'“«]|["'”»]$/g, ''); };
    const limpio = t => String(t || '').trim().replace(/^["'“«]|["'”»]$/g, '');
    const accVal = t => { const i = t.indexOf('='); return i < 0 ? [t.trim(), ''] : [t.slice(0, i).trim(), limpio(t.slice(i + 1))]; };
    if ((m = s.match(/^vista\s*:?\s*([\s\S]*)$/i))) { let [ac, v] = accVal(m[1].replace(/^(3d|modelo|nube)\s+/i, '')); if (!ac && v) { ac = v; v = ''; } const p = ac.match(/^(.*?)\s+(-?\d+(?:[.,]\d+)?)\s*(°|grados|%)?$/); return ac ? { tipo: 'vista', accion: p ? p[1] : ac, valor: v || (p ? p[2] + (p[3] === '%' ? '%' : '') : '') } : null; }
    if ((m = s.match(/^(elemento|identifica\w*|selecciona\w* elemento)\s*:?\s*([\s\S]*)$/i))) return { tipo: 'elemento', texto: limpio(m[2]) };
    if ((m = s.match(/^mapa\s*:?\s*([\s\S]+)$/i))) { let [ac, v] = accVal(m[1]); if (!v) { const k = ac.match(/^(\S+)\s+([\s\S]+)$/); if (k) { ac = k[1]; v = limpio(k[2]); } } return { tipo: 'mapa', accion: ac, valor: v }; }
    if ((m = s.match(/^concepto\s*:?\s*([\s\S]+)$/i))) { const [r, v] = accVal(m[1]); return { tipo: 'concepto', ref: limpio(r), valor: v || 'activar' }; }
    if ((m = s.match(/^(area_?frente|área_?frente|area de frente)\s*:?\s*([\s\S]+)$/i))) { const [r, v] = accVal(m[2]); return v ? { tipo: 'area', ref: limpio(r), valor: v } : null; }
    if ((m = s.match(/^resalta\w*\s*:?\s*([\s\S]+)$/i))) return { tipo: 'resaltar', ref: limpio(m[1]) };
    if ((m = s.match(/^tecla\s*:?\s*([\s\S]+)$/i))) return { tipo: 'tecla', valor: limpio(m[1]) };
    if ((m = s.match(/^(desplaza\w*|p[aá]gina|scroll)\s*:?\s*(arriba|abajo|inicio|fin|final|principio|sube|baja)\s*$/i))) return { tipo: 'pagina', valor: m[2] };
    if ((m = s.match(/^(ajusta\w*|desliza\w*|barra)\s*:?\s*#?\[?(\d+)?\]?\s*([\s\S]*)$/i))) {
      const resto = m[3].replace(/^\s*\|\s*/, ''), i = resto.lastIndexOf('=');
      if (i < 0) return null;
      const valor = limpio(resto.slice(i + 1)), texto = objetivo(resto.slice(0, i));
      return valor && (m[2] || texto) ? { tipo: 'ajustar', n: m[2] ? +m[2] : 0, texto, valor } : null;
    }
    if ((m = s.match(/^clic\w*\s*:?\s*#?\[?(\d+)?\]?\s*([\s\S]*)$/i))) {
      const texto = objetivo(m[2]); if (!m[1] && !texto) return null;
      return { tipo: 'clic', n: m[1] ? +m[1] : 0, texto };
    }
    if ((m = s.match(/^escrib\w*\s*:?\s*#?\[?(\d+)?\]?\s*([\s\S]*)$/i))) {
      const resto = m[2].replace(/^\s*\|\s*/, '');
      const i = Math.max(resto.lastIndexOf('='), resto.lastIndexOf(':'));
      if (i < 0) return null;
      const valor = resto.slice(i + 1).trim().replace(/^["'“]|["'”]$/g, '');
      const texto = objetivo(resto.slice(0, i));
      if (!valor || (!m[1] && !texto)) return null;
      return { tipo: 'escribir', n: m[1] ? +m[1] : 0, texto, valor };
    }
    if ((m = s.match(/^(ver|desplaza\w*|muestra\w*)\s*:?\s*#?\[?(\d+)?\]?\s*([\s\S]*)$/i))) {
      const texto = objetivo(m[3]); if (!m[2] && !texto) return null;
      return { tipo: 'ver', n: m[2] ? +m[2] : 0, texto };
    }
    if (/^segu/i.test(s)) return { tipo: 'seguir' };
    if ((m = s.match(/^recorda\w*\s*[:|]?\s*([\s\S]+)$/i))) return { tipo: 'recordar', valor: m[1].trim() };
    if ((m = s.match(/^olvida\w*\s*[:|]?\s*([\s\S]+)$/i))) return { tipo: 'olvidar', valor: m[1].trim() };
    return null;
  }

  /* ===================================================================
     9. MEMORIA A LARGO PLAZO (solo en este navegador)
     =================================================================== */
  const norm = t => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9ñ ]+/g, ' ').replace(/\s+/g, ' ').trim();
  const Memoria = {
    ocupado: false, alCambiar: null,
    d() { return Object.assign({ hechos: [], resumenes: [], activa: true, hasta: 0 }, store.get('vvz-memoria', {}) || {}); },
    guardar(d) { store.set('vvz-memoria', d); if (this.alCambiar) this.alCambiar(); },
    agregar(t) {
      t = String(t).replace(/\s+/g, ' ').trim().slice(0, 200); if (!t) return;
      const d = this.d();
      if (!d.hechos.some(h => norm(h.t) === norm(t))) d.hechos.push({ t, f: Date.now(), manual: true });
      d.hechos = d.hechos.slice(-40); this.guardar(d);
    },
    olvidar(t) {
      const pal = norm(t).split(' ').filter(w => w.length > 3);
      const d = this.d(), antes = d.hechos.length;
      d.hechos = d.hechos.filter(h => { const n = norm(h.t); const c = pal.filter(w => n.includes(w)).length; return !(pal.length && c / pal.length >= 0.6); });
      this.guardar(d); return antes - d.hechos.length;
    },
    quitar(i) { const d = this.d(); d.hechos.splice(i, 1); this.guardar(d); },
    quitarResumen(i) { const d = this.d(); d.resumenes.splice(i, 1); this.guardar(d); },
    borrarTodo() { const d = this.d(); this.guardar({ hechos: [], resumenes: [], activa: d.activa, hasta: Date.now() }); },
    setActiva(b) { const d = this.d(); d.activa = !!b; if (!b) d.hasta = Date.now(); this.guardar(d); },
    contexto() { const d = this.d(); if (!d.hechos.length && !d.resumenes.length) return null; return { hechos: d.hechos.map(h => h.t), resumenes: d.resumenes.slice(-4).map(r => r.t) }; },
    pendientes(historial) { const d = this.d(); return d.activa ? historial.filter(m => (m.ts || 0) > d.hasta) : []; },
    nombre() { const h = this.d().hechos.find(x => /se llama|su nombre es/i.test(x.t)); const m = h && h.t.match(/(?:se llama|su nombre es)\s+([A-ZÁÉÍÓÚÑ][\wáéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]+)?)/); return m ? m[1] : ''; },
    async consolidar(historial, keepalive) {
      if (this.ocupado) return;
      const nuevos = this.pendientes(historial);
      if (!nuevos.some(m => m.role === 'user')) return;
      this.ocupado = true;
      try {
        const d = this.d();
        const r = await fetch(CFG.endpoint + '/memoria', {
          method: 'POST', keepalive: !!keepalive, headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ hechos: d.hechos.map(h => h.t), mensajes: nuevos.slice(-30).map(m => ({ role: m.role, content: m.content })), modelo: store.get('vvz-modelo', '') }),
        });
        const j = await r.json();
        if (!j || j.error || !Array.isArray(j.hechos)) return;
        const d2 = this.d();
        const previos = new Map(d2.hechos.map(h => [norm(h.t), h]));
        const nuevosH = j.hechos.map(t => previos.get(norm(t)) || { t, f: Date.now() });
        for (const h of d2.hechos) if (h.manual && !nuevosH.some(x => norm(x.t) === norm(h.t))) nuevosH.push(h);
        d2.hechos = nuevosH.slice(-40);
        if (j.resumen) { d2.resumenes.push({ t: j.resumen, f: Date.now() }); d2.resumenes = d2.resumenes.slice(-30); }
        d2.hasta = Math.max(d2.hasta, ...nuevos.map(m => m.ts || 0));
        this.guardar(d2);
      } catch (_) { /* sin conexión: se intentará después */ } finally { this.ocupado = false; }
    },
  };

  const totalVector = () => { try { const t = window.GCPEASA_VECTOR_CONFIG_API && GCPEASA_VECTOR_CONFIG_API.getSnapshot().total; return Number.isFinite(t) ? t : null; } catch (_) { return null; } };
  const dinero = v => '$' + Math.round(v).toLocaleString('es-MX');
  const dineroVoz = v => v >= 1e6 ? `${(v / 1e6).toLocaleString('es-MX', { maximumFractionDigits: 1 })} millones de pesos` : `${Math.round(v).toLocaleString('es-MX')} pesos`;
  function contextoVector(mapa) {
    const c = {};
    try { if (window.GCPEASA_VECTOR_CONFIG_API && GCPEASA_VECTOR_CONFIG_API.getSnapshot) c.vector = GCPEASA_VECTOR_CONFIG_API.getSnapshot(); } catch (_) {}
    try { if (window.GCPEASA_SURVEY_API && GCPEASA_SURVEY_API.getSnapshot) c.sitio = GCPEASA_SURVEY_API.getSnapshot(); } catch (_) {}
    c.pantalla = Control.pantalla();
    if (mapa) { c.mapa = mapa; c.catalogo = catalogoTexto(); const d = detallePantalla(Control.consulta || ''); if (d) c.detalle = d; }
    c.reglas = reglasControl(Control.consulta || '', c.detalle || '', c.pantalla || '');
    const g = estadoGuiada(); if (g) c.guiada = g;
    // La guía de opciones solo cuando se pregunta algo (ahorra cuota en las órdenes)
    if (App.tareaActual === 'pregunta' || /qu[eé] (es|significa|implica|incluye|diferencia)|diferencia|conviene|recomiendas|cu[aá]l (es )?mejor/i.test(Control.consulta || '')) c.guia = guiaTexto();
    if (App.tareaActual === 'pregunta' || /precio|costo|cuesta|cu[aá]nto|vale|\$|pesos|m2|m²|metro|presupuest|import|estimaci|car[oa]|barat|econ[oó]mic|ahorr|optimiz|reduc|recort|baj[ae]r? (el )?(costo|precio)|sub(e|i[oó]|ir)|aument|conviene|alternativ|qu[eé] pasa si|diferencia/i.test(Control.consulta || '')) { const pr = preciosTexto(); if (pr) c.precios = pr; }
    const mem = Memoria.contexto(); if (mem) c.memoria = mem;
    return c;
  }

  /* ===================================================================
     10. MODO DEMOSTRACIÓN (si el backend no responde)
     =================================================================== */
  function respuestaDemo(texto) {
    const t = texto.toLowerCase();
    const ctx = contextoVector().vector;
    if (/estimaci|total|cu[aá]nto|costo|mi proyecto/.test(t) && ctx) {
      return `Ahora mismo tu estimación en Vector va en $${Math.round(ctx.total || 0).toLocaleString('es-MX')} con ${(ctx.fronts || []).length} frentes activos. Recuerda que es una estimación de orden de magnitud, no un presupuesto oficial.`;
    }
    if (/5d|cinco d/.test(t)) return 'BIM 5D es vincular el costo a los elementos del modelo: cada elemento se relaciona con un concepto del catálogo y su precio unitario, así el presupuesto se actualiza cuando el modelo cambia.';
    return 'Estoy en modo de demostración porque no logro conectarme con mi servidor. Revisa tu conexión e inténtalo de nuevo.';
  }

  /* ===================================================================
     11. INTERFAZ Y ORQUESTACIÓN
     =================================================================== */
  const ESTADOS = { reposo: 'Lista para conversar', escuchando: 'Escuchando…', pensando: 'Pensando…', hablando: 'Hablando', actuando: 'Trabajando en Vector…' };
  const SUGERENCIAS = [
    'Llévame al paso Nave',
    'Explícame mi estimación actual',
    '¿Qué LOD necesito para cuantificar desde el modelo?',
    '¿Cómo se integra un análisis de precio unitario?',
  ];

  const App = {
    estado: 'reposo', abierto: false, demo: false, controlador: null, compacto: false, pendiente: null,
    historial: (store.get('vvz-historial', []) || []).filter(m => m && m.role && m.content),
    vozActiva: store.get('vvz-voz', CFG.vozActiva),
    continua: store.get('vvz-continua', CFG.conversacionContinua),
    origen: 'texto', ultimoFoco: null,

    montar() {
      const host = document.createElement('div');
      host.id = 'vector-voz'; host.style.cssText = 'all:initial;position:static';
      const sr = host.attachShadow({ mode: 'open' });
      this.sr = sr;
      const st = document.createElement('style'); st.textContent = CSS; sr.appendChild(st);
      const raiz = document.createElement('div'); raiz.className = 'vvz'; raiz.dataset.estado = 'reposo';
      raiz.innerHTML = `
        ${CFG.lanzador ? `<button class="vvz-launch" type="button" aria-haspopup="dialog" aria-label="Hablar con ${esc(CFG.nombre)}, asistente de costos y BIM 5D (${esc(CFG.atajo)})">
            <canvas aria-hidden="true"></canvas><span class="vvz-tip">Hablar con ${esc(CFG.nombre)} · ${esc(CFG.atajo)}</span></button>` : ''}
        <div class="vvz-foco" aria-hidden="true"><i>Vera</i></div>
        <div class="vvz-backdrop" aria-hidden="true">
          <section class="vvz-modal" role="dialog" aria-modal="true" aria-labelledby="vvz-titulo">
            <header class="vvz-head">
              <div>
                <div class="vvz-kicker"><i></i><span>Asistente con IA<span class="vvz-k2"> · Costos y BIM 5D</span></span></div>
                <h2 class="vvz-title" id="vvz-titulo">${esc(CFG.nombre)} <span>· GCPeasa Vector</span></h2>
              </div>
              <div class="vvz-head-actions">
                <button class="vvz-icon-btn vvz-btn-mem" type="button" aria-label="Lo que Vera recuerda" title="Lo que Vera recuerda">${ICON.memoria}</button>
                <button class="vvz-chip-btn vvz-nuevo" type="button" title="Nueva conversación">${ICON.nuevo}<span>Nueva conversación</span></button>
                <button class="vvz-icon-btn vvz-btn-tam" type="button"></button>
                <button class="vvz-icon-btn vvz-cerrar" type="button" aria-label="Cerrar asistente">${ICON.cerrar}</button>
              </div>
            </header>
            <div class="vvz-body">
              <div class="vvz-stage">
                <canvas class="vvz-orb" aria-label="Núcleo de ${esc(CFG.nombre)}. Tócalo para hablar o interrumpir." role="button" tabindex="-1"></canvas>
                <div class="vvz-status" aria-live="polite"><i></i><span>${ESTADOS.reposo}</span></div>
                <div class="vvz-demo" hidden>Modo demostración · sin conexión con el servidor</div>
                <p class="vvz-caption tenue">Toca el micrófono y pídeme lo que necesites.</p>
                <div class="vvz-controls">
                  <button class="vvz-ctrl vvz-btn-voz" type="button"></button>
                  <button class="vvz-mic" type="button" aria-pressed="false" aria-label="Hablar">${ICON.mic}</button>
                  <button class="vvz-ctrl vvz-btn-cont" type="button" title="Conversación continua: vuelvo a escucharte al terminar de hablar">${ICON.loop}</button>
                </div>
                <div class="vvz-hint">Pídeme que opere Vector por ti · Interrúmpeme hablando o tocando el núcleo</div>
              </div>
              <div class="vvz-chat">
                <div class="vvz-log" role="log" aria-live="polite" aria-label="Conversación"></div>
                <form class="vvz-input" autocomplete="off">
                  <textarea rows="1" placeholder="Escribe una pregunta o una instrucción, p. ej. «captura 5,000 m² de nave»" aria-label="Mensaje para ${esc(CFG.nombre)}"></textarea>
                  <button class="vvz-send" type="submit" aria-label="Enviar" disabled>${ICON.enviar}</button>
                </form>
                <p class="vvz-foot">Las estimaciones de Vector son orientativas y no constituyen un presupuesto oficial.</p>
              </div>
            </div>
            <div class="vvz-mem" role="dialog" aria-label="Lo que Vera recuerda">
              <header><div><h3>Lo que ${esc(CFG.nombre)} recuerda</h3><p>Se guarda solo en este navegador y lo usa para conocerte mejor.</p></div>
                <button class="vvz-icon-btn vvz-mem-cerrar" type="button" aria-label="Cerrar memoria">${ICON.cerrar}</button></header>
              <div class="vvz-mem-cuerpo">
                <form class="vvz-mem-add"><input type="text" maxlength="200" placeholder="Agrega algo para que lo recuerde…" aria-label="Nuevo dato para recordar"><button type="submit">Agregar</button></form>
                <div class="vvz-mem-sec">Sobre ti y tus proyectos</div><ul class="vvz-mem-hechos"></ul>
                <div class="vvz-mem-sec">Conversaciones recientes</div><ul class="vvz-mem-res"></ul>
              </div>
              <div class="vvz-mem-pie">
                <label><input type="checkbox" class="vvz-mem-activa"> Aprender de mis conversaciones</label>
                <button type="button" class="vvz-mem-act">Actualizar ahora</button>
                <button type="button" class="peligro vvz-mem-borrar">Borrar memoria</button>
              </div>
            </div>
            <div class="vvz-toast" role="status"></div>
          </section>
        </div>`;
      sr.appendChild(raiz);
      document.body.appendChild(host);
      Control.raiz = raiz;
      const $ = s => raiz.querySelector(s);
      this.el = {
        raiz, launch: $('.vvz-launch'), back: $('.vvz-backdrop'), modal: $('.vvz-modal'), log: $('.vvz-log'), form: $('.vvz-input'),
        ta: $('.vvz-input textarea'), send: $('.vvz-send'), mic: $('.vvz-mic'), btnVoz: $('.vvz-btn-voz'), btnCont: $('.vvz-btn-cont'), btnTam: $('.vvz-btn-tam'),
        status: $('.vvz-status span'), caption: $('.vvz-caption'), demo: $('.vvz-demo'), toast: $('.vvz-toast'), orbCv: $('.vvz-orb'),
        mem: $('.vvz-mem'), memHechos: $('.vvz-mem-hechos'), memRes: $('.vvz-mem-res'), memActiva: $('.vvz-mem-activa'), memBorrar: $('.vvz-mem-borrar'), foco: $('.vvz-foco'),
      };
      this.foco = {
        el: this.el.foco, t: 0,
        mostrar(target, etiqueta) {
          const r = target.getBoundingClientRect(), pad = 4;
          Object.assign(this.el.style, { left: (r.left - pad) + 'px', top: (r.top - pad) + 'px', width: (r.width + pad * 2) + 'px', height: (r.height + pad * 2) + 'px' });
          this.el.querySelector('i').textContent = etiqueta || 'Vera';
          this.el.classList.add('ver');
          clearTimeout(this.t); this.t = setTimeout(() => this.el.classList.remove('ver'), 1500);
        },
      };

      this.orbe = new Orbe(this.el.orbCv, { puntos: innerWidth < 700 ? 1900 : 3200, polvo: innerWidth < 700 ? 160 : 300 });
      if (this.el.launch) { this.mini = new Orbe(this.el.launch.querySelector('canvas'), { mini: true, puntos: 520, polvo: 0 }); this.mini.start(); }

      this.voz = new Voz({ inicioFrase: f => this._alHablarFrase(f), finTurno: () => this._alTerminarDeHablar() });
      this.oido = new OidoMixto({
        parcial: t => this._mostrarInterino(t),
        frase: t => { this._quitarInterino(); this.enviar(t, 'voz'); },
        error: msg => { this._quitarInterino(); this.setEstado('reposo'); this.toast(msg); },
        inactivo: () => { this._quitarInterino(); this.setEstado('reposo'); this.caption('Toca el micrófono cuando quieras seguir.', true); },
      });
      Memoria.alCambiar = () => this._pintarMemoria();

      this._eventos();
      this._pintarBotones();
      this._renderHistorial();
      this._pintarMemoria();
      this._detectarBackend();
      this._bucleAudio();
      // Consolida lo que haya quedado pendiente de visitas anteriores
      setTimeout(() => { const ult = this.historial[this.historial.length - 1]; if (ult && Date.now() - (ult.ts || 0) > 90_000) Memoria.consolidar(this.historial); }, 5000);
    },

    _eventos() {
      const E = this.el;
      if (E.launch) E.launch.addEventListener('click', () => this.abrir());
      E.back.addEventListener('mousedown', ev => { if (ev.target === E.back && !this.compacto) this.cerrar(); });
      E.modal.querySelector('.vvz-cerrar').addEventListener('click', () => this.cerrar());
      E.modal.querySelector('.vvz-nuevo').addEventListener('click', () => this.nueva());
      E.btnTam.addEventListener('click', () => this.setCompacto(!this.compacto));
      E.modal.querySelector('.vvz-btn-mem').addEventListener('click', () => this.verMemoria(true));
      E.modal.querySelector('.vvz-mem-cerrar').addEventListener('click', () => this.verMemoria(false));
      E.mic.addEventListener('click', () => this.alternarMic());
      E.orbCv.addEventListener('click', () => this.alternarMic());
      E.btnVoz.addEventListener('click', () => {
        this.vozActiva = !this.vozActiva; store.set('vvz-voz', this.vozActiva);
        if (!this.vozActiva) { this.voz.detener(); if (this.estado === 'hablando') this.setEstado('reposo'); }
        this._pintarBotones();
        this.toast(this.vozActiva ? 'Respuestas habladas activadas' : 'Voz silenciada: te responderé por escrito y con más detalle');
      });
      E.btnCont.addEventListener('click', () => {
        this.continua = !this.continua; store.set('vvz-continua', this.continua); this._pintarBotones();
        this.toast(this.continua ? 'Conversación continua: te escucho al terminar de hablar' : 'Conversación continua desactivada');
      });
      E.ta.addEventListener('input', () => { E.send.disabled = !E.ta.value.trim(); E.ta.style.height = 'auto'; E.ta.style.height = Math.min(120, E.ta.scrollHeight) + 'px'; });
      E.ta.addEventListener('keydown', ev => { if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); E.form.requestSubmit(); } });
      E.ta.addEventListener('focus', () => { if (this.estado === 'escuchando') { this.oido.detener(); this._quitarInterino(); this.setEstado('reposo'); } });
      E.form.addEventListener('submit', ev => {
        ev.preventDefault();
        const t = E.ta.value.trim(); if (!t) return;
        E.ta.value = ''; E.ta.style.height = 'auto'; E.send.disabled = true;
        this.enviar(t, 'texto');
      });
      E.log.addEventListener('click', ev => {
        const b = ev.target.closest('.vvz-sug'); if (b) { this.enviar(b.textContent, 'texto'); return; }
        const c = ev.target.closest('.vvz-conf button'); if (c) this._resolverConfirmacion(c.classList.contains('si'));
      });
      // memoria
      const m = E.mem;
      m.querySelector('.vvz-mem-add').addEventListener('submit', ev => { ev.preventDefault(); const i = ev.target.querySelector('input'); if (i.value.trim()) { Memoria.agregar(i.value); i.value = ''; this.toast('Lo recordaré'); } });
      m.addEventListener('click', ev => {
        const q = ev.target.closest('[data-quitar]'); if (q) { Memoria.quitar(+q.dataset.quitar); return; }
        const r = ev.target.closest('[data-quitar-res]'); if (r) { Memoria.quitarResumen(+r.dataset.quitarRes); }
      });
      E.memActiva.addEventListener('change', () => { Memoria.setActiva(E.memActiva.checked); this.toast(E.memActiva.checked ? 'Aprenderé de nuestras conversaciones' : 'Dejaré de aprender de las conversaciones'); });
      m.querySelector('.vvz-mem-act').addEventListener('click', async ev => { const b = ev.currentTarget; b.disabled = true; b.textContent = 'Actualizando…'; await Memoria.consolidar(this.historial); b.disabled = false; b.textContent = 'Actualizar ahora'; this.toast('Memoria actualizada'); });
      E.memBorrar.addEventListener('click', () => {
        if (!E.memBorrar.dataset.seguro) { E.memBorrar.dataset.seguro = '1'; E.memBorrar.textContent = '¿Seguro? Toca otra vez'; setTimeout(() => { delete E.memBorrar.dataset.seguro; E.memBorrar.textContent = 'Borrar memoria'; }, 4000); return; }
        delete E.memBorrar.dataset.seguro; E.memBorrar.textContent = 'Borrar memoria';
        Memoria.borrarTodo(); this.toast('Memoria borrada');
      });
      document.addEventListener('keydown', ev => {
        if (this.abierto && ev.key === 'Escape') { ev.preventDefault(); if (this.el.mem.classList.contains('ver')) this.verMemoria(false); else this.cerrar(); return; }
        if (this.abierto && !this.compacto && ev.key === 'Tab') this._atraparFoco(ev);
        if (coincideAtajo(ev, CFG.atajo)) { ev.preventDefault(); this.abierto ? this.cerrar() : this.abrir(); }
      });
      window.addEventListener('resize', () => this.orbe.resize());
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          if (this.estado === 'escuchando') { this.oido.detener(); this.setEstado('reposo'); }
          if (Memoria.pendientes(this.historial).filter(m => m.role === 'user').length >= 2) Memoria.consolidar(this.historial, true);
        }
      });
    },

    async _detectarBackend() {
      try {
        const r = await fetch(CFG.endpoint + '/estado', { headers: { accept: 'application/json' } });
        if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) throw new Error('sin backend');
        const d = await r.json();
        this.demo = !d.llm;
        this.voz.modo = d.tts && d.tts !== 'navegador' ? 'servidor' : 'navegador';
        this.oido.servidor = d.stt === 'voxtral';
      } catch (_) { this.demo = true; this.voz.modo = 'navegador'; }
      this.el.demo.hidden = !this.demo;
    },

    abrir() {
      if (this.abierto) return;
      this.abierto = true; this.ultimoFoco = document.activeElement;
      const E = this.el;
      E.back.classList.add('abierto'); E.back.setAttribute('aria-hidden', 'false');
      if (E.launch) E.launch.classList.add('oculto');
      if (this.mini) this.mini.stop();
      requestAnimationFrame(() => { this.orbe.resize(); this.orbe.start(); });
      Audio.asegurar();
      setTimeout(() => (this.compacto || matchMedia('(pointer:coarse)').matches ? E.mic : E.ta).focus(), 60);
      this._scroll();
    },
    cerrar() {
      if (!this.abierto) return;
      this.abierto = false;
      this.interrumpir(); this.oido.detener(); this._quitarInterino(); Audio.cerrarMic();
      this.setEstado('reposo'); this.verMemoria(false);
      const E = this.el;
      E.back.classList.remove('abierto'); E.back.setAttribute('aria-hidden', 'true');
      if (E.launch) { E.launch.classList.remove('oculto'); this.mini && this.mini.start(); }
      setTimeout(() => this.orbe.stop(), 300);
      if (this.ultimoFoco && this.ultimoFoco.focus) this.ultimoFoco.focus();
      Memoria.consolidar(this.historial);
    },
    nueva() {
      this.interrumpir(); this.oido.detener(); this._quitarInterino();
      Memoria.consolidar(this.historial.slice());
      this.historial = []; this._guardarHistorial(); this.pendiente = null;
      this._renderHistorial(); this.setEstado('reposo');
      this.caption('Empecemos de nuevo. ¿En qué te ayudo?', true);
    },
    setCompacto(b, auto) {
      this.compacto = !!b;
      this.el.raiz.classList.toggle('compacto', this.compacto);
      this.el.modal.setAttribute('aria-modal', String(!this.compacto));
      this._pintarBotones();
      setTimeout(() => this.orbe.resize(), 330);
      if (!auto) this._scroll();
    },
    verMemoria(b) { this.el.mem.classList.toggle('ver', !!b); if (b) { this._pintarMemoria(); this.el.mem.querySelector('.vvz-mem-cerrar').focus(); } },

    setEstado(e) {
      this.estado = e;
      this.el.raiz.dataset.estado = e === 'actuando' ? 'pensando' : e;
      this.el.status.textContent = ESTADOS[e];
      this.orbe.setModo(e === 'actuando' ? 'pensando' : e);
      const oyendo = e === 'escuchando', ocupada = e === 'hablando' || e === 'pensando' || e === 'actuando';
      this.el.mic.setAttribute('aria-pressed', String(oyendo));
      this.el.mic.innerHTML = ocupada ? ICON.stop : ICON.mic;
      this.el.mic.setAttribute('aria-label', oyendo ? 'Dejar de escuchar' : ocupada ? 'Interrumpir' : 'Hablar');
    },

    alternarMic() {
      if (this.estado === 'hablando' || this.estado === 'pensando' || this.estado === 'actuando') { this.interrumpir(); this.escuchar(); return; }
      if (this.estado === 'escuchando') { this.oido.detener(); this._quitarInterino(); this.setEstado('reposo'); return; }
      this.escuchar();
    },
    escuchar() {
      if (!this.oido.disponible) { this.toast('Tu navegador no permite dictado por voz. Usa Chrome o Edge, o escribe tu pregunta.'); if (!this.compacto) this.el.ta.focus(); return; }
      Audio.asegurar();
      this.setEstado('escuchando');
      this.caption('Te escucho…', true);
      this.oido.iniciar();
      Audio.abrirMic();
    },
    interrumpir() {
      if (this.controlador) { this.controlador.abort(); this.controlador = null; }
      this.voz.detener();
      const ult = this.el.log.querySelector('.vvz-msg.bot.vivo');
      if (ult) { ult.classList.remove('vivo'); const c = ult.querySelector('.vvz-cursor'); c && c.remove(); }
      if (this.estado !== 'escuchando') this.setEstado('reposo');
    },

    _agregarMsg(m) { m.ts = Date.now(); this.historial.push(m); this._guardarHistorial(); return m; },
    _guardarHistorial() {
      this.historial = this.historial.slice(-80);
      if (!store.set('vvz-historial', this.historial)) store.set('vvz-historial', this.historial.slice(-30));
    },
    _mensajesModelo() {
      // El resultado real de cada turno viaja como nota de la app en el siguiente mensaje del usuario (así la IA no lo imita en sus respuestas)
      const h = this.historial.slice(-24);
      return h.map((m, i) => {
        const prev = h[i - 1];
        const nota = m.role === 'user' && prev && prev.role === 'assistant' && prev.nota ? `[Nota de la app sobre lo que pasó en el turno anterior: ${prev.nota.replace(/^\(Resultado:\s*|\)$/g, '')}]\n` : '';
        return { role: m.role, content: nota + m.content + (m.comandos && m.comandos.length ? ' ' + m.comandos.map(c => '[[' + c + ']]').join(' ') : '') };
      });
    },

    async enviar(texto, origen) {
      texto = String(texto || '').trim(); if (!texto) return;
      this.interrumpir(); this.oido.detener();
      this.origen = origen;
      this._vaciarIntro();
      this._agregarMsg({ role: 'user', content: texto, via: origen });
      this._burbuja('user', texto, origen);
      // ¿Respuesta a una confirmación pendiente?
      if (this.pendiente && texto.length < 40) {
        if (AFIRMA.test(texto)) { await this._resolverConfirmacion(true); return; }
        if (NIEGA.test(texto)) { await this._resolverConfirmacion(false); return; }
      }
      this.pendiente = null; this._quitarConfirmaciones();
      await this._turno(texto, true);
    },

    // Un turno puede tener varias vueltas: responder → actuar → mirar la pantalla nueva → continuar
    async _turno(textoUsuario, conMapa) {
      const burbuja = this._burbuja('bot', '', 'ia');
      burbuja.classList.add('vivo');
      const cuerpo = burbuja.querySelector('.vvz-texto');
      cuerpo.innerHTML = '<span class="vvz-cursor"></span>';
      this.setEstado('pensando'); this.caption('Pensando…', true); this.orbe.impulso('ola', .8);
      const hablar = this.vozActiva;
      if (hablar) this.voz.iniciarTurno();
      const ctrl = new AbortController(); this.controlador = ctrl;
      const pintar = t => { t = sinNotas(t); cuerpo.innerHTML = markdown(t) + (burbuja.classList.contains('vivo') ? '<span class="vvz-cursor"></span>' : ''); this._marcarFrase(burbuja); this._scroll(); };
      let visibleTxt = '', mapaEnviado = !!conMapa, vuelta = 0, mapaListo = '', reintento = false, primero = '', primeroFijado = false;
      // Si el usuario pidió una acción, no se habla nada hasta verificar que la respuesta trae comandos reales
      const soloPregunta = ES_PREGUNTA.test(textoUsuario) && !ORDEN_FUERTE.test(textoUsuario) && !PUEDES.test(textoUsuario);
      Control.consulta = textoUsuario;
      this.tareaActual = soloPregunta ? 'pregunta' : 'orden';
      const esOrden = (COMANDO.test(textoUsuario) || PUEDES.test(textoUsuario) || DICE_PROYECTO.test(textoUsuario)) && !soloPregunta;
      const transit = [], hechas = [], comandos = []; let porVozFinal = '', totalInicial = null;
      try {
        if (/alternativ|ahorr|m[aá]s barat|econ[oó]mic|optimiz|qu[eé] me conviene/i.test(textoUsuario)) await Control.abrirAlternativas();
        for (;;) {
          if (mapaEnviado && !mapaListo) await Control.despejarAyuda();
          const mapa = mapaEnviado ? (mapaListo || Control.mapa()) : '';
          mapaListo = '';
          const filtro = new FiltroAcciones();
          const porHablar = [];
          // En órdenes solo se habla la intención (primera respuesta) y el resultado final, no los intentos intermedios
          const troz = new Troceador(f => { if (!hablar) return; if (esOrden) porHablar.push(f); else this.voz.decir(f); });
          const hablarAhora = () => { porHablar.splice(0).forEach(f => this.voz.decir(f)); };
          const prefijo = primero ? primero + ' ' : '';
          let parte = '', crudo = '';
          const emitir = d => { crudo += d; const l = filtro.agregar(d); if (l) { parte = espaciar(parte + l); troz.agregar(l); pintar(prefijo + parte); } };
          if (this.demo) await this._streamDemo(textoUsuario, emitir, ctrl.signal);
          else await this._streamBackend(emitir, ctrl.signal, hablar ? 'voz' : 'texto', transit, mapa);
          if (ctrl.signal.aborted) return;
          const resto = filtro.terminar(); if (resto) { parte = espaciar(parte + resto); troz.agregar(resto); }
          troz.terminar();
          visibleTxt = sinNotas(prefijo + parte).trim(); pintar(visibleTxt);

          const acciones = filtro.acciones.map(parsearAccion).filter(Boolean);
          // La memoria solo se toca cuando el usuario lo pide ("recuerda que…", "olvida…")
          const pideMemoria = /recuerd|acu[eé]rdate|record(ar|ar[aá]s)|guarda (en|que)|anota|apunta|memoria|olvid/i.test(textoUsuario);
          for (const a of acciones) {
            if (!pideMemoria) continue;
            if (a.tipo === 'recordar') { Memoria.agregar(a.valor); this._chip(burbuja, { ok: true, txt: 'Lo guardé en mi memoria' }); }
            if (a.tipo === 'olvidar') { const n = Memoria.olvidar(a.valor); this._chip(burbuja, { ok: !!n, txt: n ? 'Lo borré de mi memoria' : 'No encontré ese dato en mi memoria' }); }
          }
          let ui = acciones.filter(a => ['clic', 'escribir', 'ver', 'ir', 'dato', 'opcion', 'ajustar', 'tecla', 'pagina', 'vista', 'elemento', 'mapa', 'concepto', 'area', 'resaltar'].includes(a.tipo));
          corregirOpciones(ui, textoUsuario);
          ui = quitarExtras(ui, textoUsuario);
          // [[dato]] y [[opcion]] ya navegan solos: un [[ir]] extra solo se respeta si el usuario pidió cambiar de paso
          if (ui.some(a => a.tipo === 'dato' || a.tipo === 'opcion') && !PIDE_IR.test(textoUsuario)) ui = ui.filter(a => a.tipo !== 'ir');
          if (soloPregunta) ui = []; // a una pregunta se responde, no se actúa
          // Si la IA pide confirmación con sus palabras, no actúa todavía (la app confirma con botones cuando hay comando)
          if (/¿\s*(confirm|quieres que|deseas que|lo env[ií]o|la env[ií]o|procedo|est[aá]s seguro|lo borro|la borro)/i.test(parte)) ui = [];
          const seguir0 = acciones.some(a => a.tipo === 'seguir');
          // Verificación: pidió una acción, la respuesta no trae comandos y no es una pregunta → corrige una vez
          if (esOrden && !reintento && !this.ultimoError && !ui.length && !seguir0 && !/[?¿]\s*\)?\s*$/.test(parte.trim())) {
            reintento = true; vuelta++;
            transit.push({ role: 'assistant', content: crudo.trim() }, { role: 'user', content: '(Mensaje automático de la app: tu respuesta NO incluyó comandos [[...]], así que NO se hizo nada en la app. Si el usuario pidió una acción, responde de nuevo con una frase corta y los comandos correctos usando el MAPA DE PANTALLA. Si esa acción borra información y el usuario no la ha confirmado, solo pregunta si confirma. Si de verdad no hay nada que hacer, explícalo sin decir que lo hiciste.)' });
            visibleTxt = ''; pintar('');
            continue;
          }
          if (!primeroFijado) { primeroFijado = true; primero = parte.trim(); hablarAhora(); }
          // El modelo gratuito a veces avanza de paso por iniciativa propia: solo se permite si el usuario lo pidió
          if (!PIDE_AVANZAR.test(textoUsuario)) ui = ui.filter(a => !(a.tipo === 'clic' && AVANZAR.test(Control.etiqueta(Control.resolver(a)))));
          // Aplicar una alternativa del Resultado cambia el proyecto: solo si el usuario pidió aplicarla o cambiarla
          if (!PIDE_APLICAR.test(textoUsuario)) ui = ui.filter(a => !(a.tipo === 'clic' && /cambiar a esta opci|aplicar alternativa/i.test(Control.etiqueta(Control.resolver(a)))));
          // Nunca busca en el mapa un lugar que el usuario no dijo (la IA a veces copia el ejemplo)
          ui = ui.filter(a => { if (a.tipo !== 'mapa' || !/^busca/.test(norm(a.accion || ''))) return true; const t = norm(textoUsuario + ' ' + this.historial.slice(-6).filter(m => m.role === 'user').map(m => m.content).join(' ')); return norm(a.valor || '').split(' ').filter(w => w.length >= 4).some(w => t.includes(w)); });
          // Tampoco mueve la cámara del visor si el usuario no pidió ver algo
          if (!PIDE_VER.test(norm(textoUsuario))) ui = ui.filter(a => a.tipo !== 'vista' && a.tipo !== 'elemento');
          const seguir = acciones.some(a => a.tipo === 'seguir');
          if (!ui.length) {
            if (seguir && !mapaEnviado && vuelta < 3) {
              mapaEnviado = true; vuelta++;
              transit.push({ role: 'assistant', content: crudo.trim() || 'Va. [[seguir]]' }, { role: 'user', content: '(Mensaje automático de la app: aquí está el MAPA DE PANTALLA. Continúa con la instrucción del usuario.)' });
              continue;
            }
            hablarAhora();
            break;
          }
          // Acciones que borran información: solo con confirmación explícita
          const peligrosas = ui.filter(a => riesgo(a));
          if (peligrosas.length && CONFIRMA_EN_TEXTO.test(textoUsuario)) peligrosas.forEach(a => { a.confirmado = true; });
          else if (peligrosas.length) {
            this.pendiente = { acciones: ui, burbuja, refs: Control.refs.slice(), etiquetas: Control.etiquetas.slice(), tipos: Control.tipos.slice() };
            const msgConf = this._mostrarConfirmacion(burbuja, peligrosas.map(a => riesgo(a)));
            visibleTxt = msgConf; // "Envío…" o "Borro…" sonaría a hecho: se muestra la pregunta de confirmación
            hablarAhora();
            break;
          }
          if (!this.compacto) this.setCompacto(true, true);
          this.setEstado('actuando');
          const total0 = totalVector();
          if (totalInicial == null) totalInicial = total0;
          for (const a of ui) {
            if (ctrl.signal.aborted) return;
            const r = await Control.ejecutar(a, this.foco);
            hechas.push(r); this._chip(burbuja, r);
            if (r.ok && a.raw) comandos.push(a.raw);
          }
          // Cómo cambió la estimación con lo que se hizo (dato útil para el usuario y para la IA)
          const total1 = totalVector();
          if (total0 != null && total1 != null && Math.abs(total1 - total0) >= 1) {
            const d = total1 - total0;
            this._chip(burbuja, { ok: true, txt: `Estimación: ${dinero(total1)} (${d > 0 ? '+' : '−'}${dinero(Math.abs(d))})` });
            if (hablar && !seguir) porVozFinal = `La estimación quedó en ${dineroVoz(total1)}.`;
          }
          // Cada aviso de Vector se muestra una sola vez por sesión (no en cada orden)
          const avisosTurno = Control.avisos.splice(0).filter(x => !Control.avisosVistos.has(x));
          avisosTurno.forEach(x => { Control.avisosVistos.add(x); this._chip(burbuja, { ok: true, txt: 'Aviso de Vector: ' + x.split(':')[0].slice(0, 80) }); });
          const leer = hechas.slice(-ui.length).some(r => r.leer);
          if ((!seguir && !leer) || vuelta >= 3) { if (seguir) this._chip(burbuja, { ok: false, txt: 'Me detuve tras 3 intentos; dime cómo seguir' }); hablarAhora(); break; }
          vuelta++; mapaEnviado = true;
          await espera(750);
          this.setEstado('pensando');
          await Control.despejarAyuda();
          mapaListo = Control.mapa();
          const res = hechas.slice(-ui.length).map(r => (r.ok ? '✓ ' : '✗ ') + r.txt + (r.detalle ? '\n  ' + r.detalle : '')).join('\n') + (total0 != null && total1 != null && total1 !== total0 ? `\nEstimación: ${dinero(total0)} → ${dinero(total1)}` : '');
          const dlg = (Control.dialogo ? '\nATENCIÓN: hay un diálogo abierto en la pantalla; el mapa solo muestra sus botones. Resuélvelo según lo que pidió el usuario antes de decir que terminaste.' : '') +
            (avisosTurno.length ? '\nAvisos que mostró Vector (ya cerrados; menciónalos si son útiles): ' + avisosTurno.join(' | ') : '');
          transit.push({ role: 'assistant', content: crudo.trim() }, { role: 'user', content: `RESULTADO DE ACCIONES:\n${res}\nPantalla ahora: ${Control.pantalla()}${dlg}\n(Mensaje automático de la app: continúa SOLO con lo que pidió el usuario usando el MAPA DE PANTALLA actualizado. No narres intentos ni errores. Si ya terminaste, di el resultado en UNA frase corta sin comandos.)` });
        }
        burbuja.classList.remove('vivo');
        if (porVozFinal && hablar) this.voz.decir(porVozFinal);
        if (!visibleTxt && hechas.length) visibleTxt = hechas.every(r => r.ok) ? 'Listo.' : 'No pude completar todo.';
        // Pidió una acción, la IA no dio comandos ni en el reintento: se dice claro que no se cambió nada
        if (esOrden && reintento && !hechas.length && !this.pendiente && !/[?¿]/.test(visibleTxt)) this._chip(burbuja, { ok: false, txt: 'No hice ningún cambio en la pantalla' });
        pintar(visibleTxt);
        if (!visibleTxt.trim() && !hechas.length) throw new Error('vacío');
        // Resultado real del turno (para que la IA no invente cuánto cambió la estimación)
        const totalFinal = totalVector();
        const nota = hechas.length ? `(Resultado: ${hechas.map(r => (r.ok ? '' : 'NO SE PUDO: ') + r.txt).join('; ').slice(0, 300)}${totalInicial != null && totalFinal != null ? `; estimación ${dinero(totalInicial)} → ${dinero(totalFinal)}` : ''})` : '';
        this._agregarMsg({ role: 'assistant', content: visibleTxt, nota, comandos, acciones: hechas.map(r => ({ ok: r.ok, txt: r.txt })) });
        this.controlador = null;
        if (hablar) this.voz.cerrarTurno();
        else { this.setEstado('reposo'); this.caption(resumen(visibleTxt), false); this._siguienteTurno(); }
        if (this.estado === 'actuando') this.setEstado('reposo');
        if (Memoria.pendientes(this.historial).filter(m => m.role === 'user').length >= 4) Memoria.consolidar(this.historial);
      } catch (e) {
        if (ctrl.signal.aborted) return;
        this.controlador = null;
        burbuja.classList.remove('vivo'); burbuja.classList.add('error');
        cuerpo.innerHTML = markdown(visibleTxt ? visibleTxt + '\n\n_(La respuesta se interrumpió.)_' : /chat 5\d\d/.test(String(e && e.message)) ? 'El servicio de Vera tuvo un problema momentáneo. Inténtalo de nuevo en unos segundos.' : 'No pude conectarme con el asistente en este momento. Revisa tu conexión e inténtalo de nuevo.');
        this.voz.detener(); this.setEstado('reposo'); this.caption('Hubo un problema de conexión.', true);
      }
    },

    async _streamBackend(emitir, signal, modo, transit, mapa) {
      const r = await fetch(CFG.endpoint + '/chat', {
        method: 'POST', signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: this._mensajesModelo().concat(transit || []), modo, contexto: contextoVector(mapa), modelo: store.get('vvz-modelo', ''), tarea: this.tareaActual || 'orden' }),
      });
      this.ultimoError = '';
      if (!r.ok || !r.body) throw new Error('chat ' + r.status);
      this.ultimoModelo = r.headers.get('x-vera-modelo') || '';
      this.ultimoError = r.headers.get('x-vera-error') || '';
      const lector = r.body.getReader(), dec = new TextDecoder();
      for (;;) { const { done, value } = await lector.read(); if (done) break; const d = dec.decode(value, { stream: true }); if (d) emitir(d); }
    },
    async _streamDemo(texto, emitir, signal) {
      await espera(500, signal);
      for (const pal of respuestaDemo(texto).match(/\S+\s*/g)) { if (signal.aborted) return; emitir(pal); await espera(28 + Math.random() * 40, signal); }
    },

    _mostrarConfirmacion(burbuja, etiquetas) {
      const d = document.createElement('div'); d.className = 'vvz-conf';
      d.innerHTML = `<button type="button" class="si">Sí, ${esc(etiquetas[0].replace(/^[^\wÁÉÍÓÚáéíóú]+/, '').toLowerCase().slice(0, 40))}</button><button type="button">Cancelar</button>`;
      burbuja.appendChild(d);
      const msg = etiquetas.some(t => ENVIO.test(t)) ? 'Eso envía tu solicitud a GCPeasa. ¿La envío?' : 'Eso borra información. ¿Lo confirmas?';
      // Siempre se pregunta claro (aunque la IA haya escrito "Envío…" o "Borro…")
      burbuja.querySelector('.vvz-texto').textContent = msg; this._confTxt = msg;
      this._scroll();
      return msg;
    },
    _quitarConfirmaciones() { this.el.log.querySelectorAll('.vvz-conf').forEach(n => n.remove()); },
    async _resolverConfirmacion(si) {
      const p = this.pendiente; this.pendiente = null; this._quitarConfirmaciones();
      if (!p) return;
      if (!si) { this._respuestaLocal('Va, no lo hago.'); return; }
      Control.refs = p.refs; Control.etiquetas = p.etiquetas; Control.tipos = p.tipos;
      if (!this.compacto) this.setCompacto(true, true);
      this.setEstado('actuando');
      const hechas = [];
      const cmds = [];
      p.acciones.forEach(a => { a.confirmado = true; });
      for (const a of p.acciones) { const r = await Control.ejecutar(a, this.foco); hechas.push(r); this._chip(p.burbuja, r); if (r.ok && a.raw) cmds.push(a.raw); }
      this._respuestaLocal(hechas.every(r => r.ok) ? 'Listo, ya quedó.' : 'No pude completar todo, revisa la pantalla.', hechas, cmds);
    },
    _respuestaLocal(texto, acciones, comandos) {
      const b = this._burbuja('bot', texto, 'ia');
      (acciones || []).forEach(r => this._chip(b, r));
      this._agregarMsg({ role: 'assistant', content: texto, comandos: comandos || [], acciones: (acciones || []).map(r => ({ ok: r.ok, txt: r.txt })) });
      if (this.vozActiva) { this.voz.iniciarTurno(); this.voz.decir(texto); this.voz.cerrarTurno(); }
      else { this.setEstado('reposo'); this.caption(texto, false); }
    },
    _chip(burbuja, r) {
      let box = burbuja.querySelector('.vvz-acc');
      if (!box) { box = document.createElement('div'); box.className = 'vvz-acc'; burbuja.insertBefore(box, burbuja.querySelector('.vvz-conf')); }
      const s = document.createElement('span'); if (!r.ok) s.className = 'mal';
      s.innerHTML = (r.ok ? ICON.clic : '') + esc(r.txt);
      s.querySelector('svg') && Object.assign(s.querySelector('svg').style, { width: '13px', height: '13px' });
      box.appendChild(s); this._scroll();
    },

    _alHablarFrase(frase) {
      if (this.estado !== 'hablando' && this.estado !== 'actuando') this.setEstado('hablando');
      this.fraseActual = frase;
      this.caption(frase.replace(/[*_`#]/g, ''), false);
      const it = intencion(frase), o = this.orbe;
      if (it.pregunta) o.impulso('tilt', 1);
      if (it.cifras) o.impulso('spike', 1);
      if (it.enfasis) o.impulso('burst', 1);
      if (it.lista) o.impulso('ola', .7);
      const bots = this.el.log.querySelectorAll('.vvz-msg.bot');
      if (bots.length) this._marcarFrase(bots[bots.length - 1]);
    },
    _alTerminarDeHablar() {
      this.fraseActual = null;
      this._limpiarMarcas(this.el.log);
      if (this.controlador) return; // aún hay vueltas de trabajo en curso
      if (this.estado === 'hablando' || this.estado === 'pensando' || this.estado === 'actuando') this.setEstado('reposo');
      this._siguienteTurno();
    },
    _siguienteTurno() {
      if (this.abierto && this.continua && this.origen === 'voz' && !this.controlador) setTimeout(() => { if (this.estado === 'reposo' && this.abierto) this.escuchar(); }, 350);
    },
    _marcarFrase(burbuja) {
      this._limpiarMarcas(burbuja);
      if (!this.fraseActual) return;
      const frase = esc(this.fraseActual.trim());
      const nodos = burbuja.querySelectorAll('.vvz-texto p, .vvz-texto li');
      for (const n of nodos) {
        const i = n.innerHTML.indexOf(frase);
        if (i >= 0) { n.innerHTML = n.innerHTML.slice(0, i) + '<mark class="vvz-mk">' + frase + '</mark>' + n.innerHTML.slice(i + frase.length); return; }
      }
      const objetivo = this.fraseActual.replace(/[*_`#]/g, '').trim().slice(0, 40);
      for (const n of nodos) { if (n.textContent.includes(objetivo)) { n.classList.add('vvz-hablando'); return; } }
    },
    _limpiarMarcas(raiz) {
      raiz.querySelectorAll('mark.vvz-mk').forEach(m => m.replaceWith(...m.childNodes));
      raiz.querySelectorAll('.vvz-hablando').forEach(n => n.classList.remove('vvz-hablando'));
    },

    _bucleAudio() {
      let sobreUmbral = 0, piso = .02, ult = performance.now();
      const paso = now => {
        const dt = (now - ult) / 1000; ult = now;
        if (this.abierto) {
          let e = null;
          if (this.estado === 'hablando') e = (this.voz.fuente && Audio.medir(Audio.salida)) || this.voz.simulada(now / 1000);
          else if (this.estado === 'escuchando') e = Audio.medir(Audio.mic);
          this.orbe.entrada = e || { nivel: 0, bajos: 0, medios: 0, altos: 0 };
          if (CFG.interrumpirConVoz && this.estado === 'hablando' && Audio.mic && this.origen === 'voz') {
            const m = Audio.medir(Audio.mic);
            if (m.nivel < piso * 2.5) piso = piso * .98 + m.nivel * .02;
            if (m.nivel > Math.max(.16, piso * 4)) sobreUmbral += dt; else sobreUmbral = Math.max(0, sobreUmbral - dt * 2);
            if (sobreUmbral > .32) { sobreUmbral = 0; this.interrumpir(); this.escuchar(); }
          } else sobreUmbral = 0;
        }
        requestAnimationFrame(paso);
      };
      requestAnimationFrame(paso);
    },

    _mostrarInterino(texto) {
      this._vaciarIntro();
      let b = this.el.log.querySelector('.vvz-msg.user.interino');
      if (!b) { b = this._burbuja('user', '', 'voz'); b.classList.add('interino'); }
      b.querySelector('.vvz-texto').textContent = texto;
      this.caption(texto, false);
      this.orbe.impulso('ola', .35);
      this._scroll();
    },
    _quitarInterino() { const b = this.el.log.querySelector('.vvz-msg.user.interino'); if (b) b.remove(); },

    _burbuja(rol, texto, via) {
      const d = document.createElement('div');
      d.className = 'vvz-msg ' + (rol === 'user' ? 'user' : 'bot');
      const etiqueta = rol === 'user' ? (via === 'voz' ? ICON.onda + 'Tú · por voz' : ICON.teclado + 'Tú') : esc(CFG.nombre);
      d.innerHTML = `<div class="vvz-meta">${etiqueta}</div><div class="vvz-texto"></div>`;
      const c = d.querySelector('.vvz-texto');
      if (rol === 'user') c.textContent = texto; else c.innerHTML = markdown(texto);
      this.el.log.appendChild(d);
      this._scroll();
      return d;
    },
    _renderHistorial() {
      const L = this.el.log; L.innerHTML = '';
      if (!this.historial.length) {
        const nombre = Memoria.nombre();
        L.innerHTML = `<div class="vvz-empty"><h3>${nombre ? `Hola, ${esc(nombre)}.` : `Hola, soy ${esc(CFG.nombre)}.`}</h3>
          <p>Soy tu especialista en costos y BIM 5D. Pregúntame lo que necesites o pídeme que opere Vector por ti: navegar los pasos, capturar áreas, elegir opciones o activar partidas.</p>
          <div class="vvz-sugs">${SUGERENCIAS.map(s => `<button class="vvz-sug" type="button">${esc(s)}</button>`).join('')}</div></div>`;
        return;
      }
      for (const m of this.historial.slice(-40)) {
        const b = this._burbuja(m.role === 'user' ? 'user' : 'bot', m.content, m.via);
        (m.acciones || []).forEach(r => this._chip(b, r));
      }
    },
    _pintarMemoria() {
      if (!this.el) return;
      const d = Memoria.d();
      const fecha = f => f ? new Date(f).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
      this.el.memHechos.innerHTML = d.hechos.length
        ? d.hechos.map((h, i) => `<li><span>${esc(h.t)}<small>${h.manual ? 'Lo pediste tú · ' : ''}${fecha(h.f)}</small></span><button type="button" data-quitar="${i}" aria-label="Olvidar este dato">${ICON.basura}</button></li>`).join('')
        : `<p class="vvz-mem-vacio">Todavía no sé nada de ti. Conforme platiquemos iré recordando tus proyectos e intereses.</p>`;
      const res = d.resumenes.slice().reverse().slice(0, 12);
      this.el.memRes.innerHTML = res.length
        ? res.map(r => `<li><span>${esc(r.t)}<small>${fecha(r.f)}</small></span><button type="button" data-quitar-res="${d.resumenes.indexOf(r)}" aria-label="Quitar">${ICON.basura}</button></li>`).join('')
        : `<p class="vvz-mem-vacio">Aún no hay conversaciones resumidas.</p>`;
      this.el.memActiva.checked = d.activa;
    },
    _vaciarIntro() { const e = this.el.log.querySelector('.vvz-empty'); if (e) e.remove(); },
    _scroll() { const L = this.el.log; requestAnimationFrame(() => { L.scrollTop = L.scrollHeight; }); },
    _pintarBotones() {
      const E = this.el;
      E.btnVoz.innerHTML = this.vozActiva ? ICON.voz : ICON.mute;
      E.btnVoz.classList.toggle('off', !this.vozActiva);
      E.btnVoz.setAttribute('aria-label', this.vozActiva ? 'Silenciar voz' : 'Activar voz');
      E.btnVoz.title = this.vozActiva ? 'Silenciar voz (respuestas solo escritas)' : 'Activar respuestas habladas';
      E.btnCont.setAttribute('aria-pressed', String(this.continua));
      E.btnCont.setAttribute('aria-label', 'Conversación continua');
      E.btnTam.innerHTML = this.compacto ? ICON.expandir : ICON.compacto;
      E.btnTam.setAttribute('aria-label', this.compacto ? 'Ver conversación completa' : 'Hacer pequeña la ventana y ver Vector');
      E.btnTam.title = this.compacto ? 'Ver conversación completa' : 'Hacer pequeña la ventana y ver Vector';
      E.btnTam.classList.add('vvz-btn-tam');
    },
    caption(t, tenue) { const c = this.el.caption; c.textContent = t; c.classList.toggle('tenue', !!tenue); },
    toast(msg) {
      const t = this.el.toast; t.textContent = msg; t.classList.add('ver');
      clearTimeout(this._tt); this._tt = setTimeout(() => t.classList.remove('ver'), 3200);
    },
    _atraparFoco(ev) {
      const f = [...this.el.modal.querySelectorAll('button:not([disabled]),textarea,input,[tabindex="0"]')].filter(x => x.offsetParent);
      if (!f.length) return;
      const i = f.indexOf(this.sr.activeElement);
      if (ev.shiftKey && i <= 0) { ev.preventDefault(); f[f.length - 1].focus(); }
      else if (!ev.shiftKey && i === f.length - 1) { ev.preventDefault(); f[0].focus(); }
    },
  };

  function espera(ms, signal) { return new Promise(res => { const t = setTimeout(res, ms); signal && signal.addEventListener('abort', () => { clearTimeout(t); res(); }, { once: true }); }); }
  function resumen(t) { const s = t.replace(/[*_`#>-]/g, '').replace(/\s+/g, ' ').trim(); return s.length > 140 ? s.slice(0, 137) + '…' : s; }
  function coincideAtajo(ev, atajo) {
    if (!atajo) return false;
    const partes = atajo.toLowerCase().split('+'); const tecla = partes.pop();
    const okTecla = tecla.length === 1 && /[a-z]/.test(tecla) ? ev.code === 'Key' + tecla.toUpperCase() : (ev.key || '').toLowerCase() === tecla;
    return okTecla && !!ev.altKey === partes.includes('alt') && !!ev.ctrlKey === partes.includes('ctrl') && !!ev.shiftKey === partes.includes('shift') && !!ev.metaKey === partes.includes('meta');
  }

  MapaG.enganchar();
  instalarCaptura3D(); window.addEventListener('load', instalarCaptura3D);
  window.VectorVoz = {
    version: 3,
    abrir: () => App.abrir(),
    cerrar: () => App.cerrar(),
    preguntar: texto => { App.abrir(); App.enviar(texto, 'texto'); },
    memoria: () => Memoria.d(),
    _depurar: () => ({ App, Control, Memoria, Visor3D, MapaG, Experto, Extra, Gestos, parsearAccion, Habil, GUIADA, DATOS, REGLAS, ALIAS, catalogoTexto, guiaTexto, preciosTexto, estadoGuiada, reglasControl, contextoVector, corregirOpciones, quitarExtras, sinNotas, PIDE_VER, ORDEN_FUERTE, ES_PREGUNTA, norm }),
    get estado() { return App.estado; },
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => App.montar());
  else App.montar();
})();
