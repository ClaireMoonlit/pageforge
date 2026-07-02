/**
 * PageForge 交互运行时 —— 零依赖 vanilla JS
 *
 * 生成一段自执行 IIFE 字符串，嵌入导出 HTML 的 <script> 标签中。
 * 负责处理：动画 CSS 注入、悬停效果、点击事件、滚动/加载动画、链接包裹。
 */

export function generateInteractionRuntime(): string {
  return `;(function() {
  'use strict';

  /* ═══════════════════════════════════════════════
     1. 注入动画 CSS
     ═══════════════════════════════════════════════ */
  (function injectAnimations() {
    var style = document.createElement('style');
    style.textContent = [
      '@keyframes pf-fade-in{from{opacity:0}to{opacity:1}}',
      '@keyframes pf-slide-up{from{opacity:0;transform:translateY(40px)}to{opacity:1;transform:translateY(0)}}',
      '@keyframes pf-slide-down{from{opacity:0;transform:translateY(-40px)}to{opacity:1;transform:translateY(0)}}',
      '@keyframes pf-slide-left{from{opacity:0;transform:translateX(40px)}to{opacity:1;transform:translateX(0)}}',
      '@keyframes pf-slide-right{from{opacity:0;transform:translateX(-40px)}to{opacity:1;transform:translateX(0)}}',
      '@keyframes pf-zoom-in{from{opacity:0;transform:scale(0.85)}to{opacity:1;transform:scale(1)}}',
      '@keyframes pf-bounce{0%{opacity:0;transform:scale(0.3)}50%{transform:scale(1.05)}70%{transform:scale(0.95)}100%{opacity:1;transform:scale(1)}}',
      '.pf-animate-fade-in{animation:pf-fade-in var(--pf-duration,600ms) var(--pf-delay,0ms) var(--pf-easing,ease) both}',
      '.pf-animate-slide-up{animation:pf-slide-up var(--pf-duration,600ms) var(--pf-delay,0ms) var(--pf-easing,ease) both}',
      '.pf-animate-slide-down{animation:pf-slide-down var(--pf-duration,600ms) var(--pf-delay,0ms) var(--pf-easing,ease) both}',
      '.pf-animate-slide-left{animation:pf-slide-left var(--pf-duration,600ms) var(--pf-delay,0ms) var(--pf-easing,ease) both}',
      '.pf-animate-slide-right{animation:pf-slide-right var(--pf-duration,600ms) var(--pf-delay,0ms) var(--pf-easing,ease) both}',
      '.pf-animate-zoom-in{animation:pf-zoom-in var(--pf-duration,600ms) var(--pf-delay,0ms) var(--pf-easing,ease) both}',
      '.pf-animate-bounce{animation:pf-bounce var(--pf-duration,600ms) var(--pf-delay,0ms) var(--pf-easing,ease) both}'
    ].join('\\n');
    document.head.appendChild(style);
  })();

  /* ═══════════════════════════════════════════════
     2. 生成悬停 CSS
     ═══════════════════════════════════════════════ */
  (function injectHoverStyles() {
    var hoverEls = document.querySelectorAll('[data-pf-hover]');
    if (!hoverEls.length) return;

    var rules = [];
    for (var i = 0; i < hoverEls.length; i++) {
      var el = hoverEls[i];
      var hoverId = el.getAttribute('data-pf-hover-id');
      if (!hoverId) continue;

      try {
        var config = JSON.parse(el.getAttribute('data-pf-hover'));
      } catch (e) { continue; }

      var effect = config.effect;
      var duration = config.duration || 200;
      var rule = '';

      // 设置 transition
      el.style.transition = 'all ' + duration + 'ms ease';

      // 生成 :hover 规则
      var selector = '.pf-hover-' + hoverId + ':hover';
      switch (effect) {
        case 'scale':
          rule = selector + '{transform:scale(' + (config.scale || 1.05) + ')}';
          break;
        case 'shadow':
          var shadows = {light:'0 4px 12px rgba(0,0,0,0.1)',medium:'0 8px 24px rgba(0,0,0,0.15)',heavy:'0 12px 32px rgba(0,0,0,0.2)'};
          rule = selector + '{box-shadow:' + (shadows[config.shadowIntensity] || shadows.medium) + '}';
          break;
        case 'color-shift':
          rule = selector + '{background-color:' + (config.hoverColor || '#e0e7ff') + '}';
          break;
        case 'glow':
          var glowColor = config.hoverColor || '#6366f1';
          rule = selector + '{box-shadow:0 0 16px ' + glowColor + ',0 0 32px ' + glowColor + '}';
          break;
      }
      if (rule) {
        rules.push(rule);
        // 给元素添加 hover class
        el.classList.add('pf-hover-' + hoverId);
      }
    }

    if (rules.length) {
      var style = document.createElement('style');
      style.textContent = rules.join('\\n');
      document.head.appendChild(style);
    }
  })();

  /* ═══════════════════════════════════════════════
     3. 点击事件处理
     ═══════════════════════════════════════════════ */
  (function bindClickHandlers() {
    var els = document.querySelectorAll('[data-pf-interaction]');
    for (var i = 0; i < els.length; i++) {
      (function(el) {
        try {
          var config = JSON.parse(el.getAttribute('data-pf-interaction'));
        } catch (e) { return; }
        if (!config || config.action === 'none') return;

        el.style.cursor = 'pointer';
        el.addEventListener('click', function(e) {
          switch (config.action) {
            case 'navigate':
              if (config.url) {
                if (config.newTab) {
                  window.open(config.url, '_blank');
                } else {
                  window.location.href = config.url;
                }
              }
              break;
            case 'scroll-to':
              if (config.targetId) {
                var target = document.getElementById(config.targetId);
                if (target) {
                  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
              }
              break;
            case 'toggle':
              if (config.targetId) {
                var t = document.getElementById(config.targetId);
                if (t) {
                  t.style.display = t.style.display === 'none' ? '' : 'none';
                }
              }
              break;
            case 'show':
              if (config.targetId) {
                var s = document.getElementById(config.targetId);
                if (s) s.style.display = '';
              }
              break;
            case 'hide':
              if (config.targetId) {
                var h = document.getElementById(config.targetId);
                if (h) h.style.display = 'none';
              }
              break;
            case 'submit-form':
              e.preventDefault();
              var form = el.closest('form') || el.querySelector('form');
              if (form) {
                var data = new FormData(form);
                var entries = [];
                data.forEach(function(v, k) { entries.push(k + '=' + encodeURIComponent(v)); });
                // 显示成功提示
                var msg = document.createElement('div');
                msg.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;font-size:14px;z-index:99999;box-shadow:0 4px 12px rgba(0,0,0,0.15)';
                msg.textContent = '\\u2714 提交成功！';
                document.body.appendChild(msg);
                setTimeout(function() { msg.remove(); }, 3000);
              }
              break;
          }
        });
      })(els[i]);
    }
  })();

  /* ═══════════════════════════════════════════════
     4. 滚动动画（IntersectionObserver）
     ═══════════════════════════════════════════════ */
  (function scrollAnimations() {
    var els = document.querySelectorAll('[data-pf-animate][data-pf-trigger="scroll"]');
    if (!els.length) return;

    if (!('IntersectionObserver' in window)) {
      // 降级：直接显示
      for (var i = 0; i < els.length; i++) {
        var c = els[i].getAttribute('data-pf-animate');
        els[i].classList.add(c);
        clearTransformAfterAnim(els[i]);
      }
      return;
    }

    var observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        if (entry.isIntersecting) {
          var el = entry.target;
          var animClass = el.getAttribute('data-pf-animate');
          var delay = parseInt(el.getAttribute('data-pf-delay')) || 0;
          if (animClass) {
            if (delay > 0) {
              setTimeout(function() { el.classList.add(animClass); clearTransformAfterAnim(el); }, delay);
            } else {
              el.classList.add(animClass);
              clearTransformAfterAnim(el);
            }
          }
          observer.unobserve(el);
        }
      });
    }, { threshold: 0.1 });

    for (var i = 0; i < els.length; i++) {
      // 读取每个元素的阈值配置
      var threshold = parseFloat(els[i].getAttribute('data-pf-threshold')) || 0.1;
      // 重新 observe 以使用自定义 threshold（创建一个 per-element observer）
      (function(el, t) {
        var obs = new IntersectionObserver(function(entries) {
          entries.forEach(function(entry) {
            if (entry.isIntersecting) {
              var animClass = el.getAttribute('data-pf-animate');
              var delay = parseInt(el.getAttribute('data-pf-delay')) || 0;
              if (animClass) {
                if (delay > 0) {
                  setTimeout(function() { el.classList.add(animClass); clearTransformAfterAnim(el); }, delay);
                } else {
                  el.classList.add(animClass);
                  clearTransformAfterAnim(el);
                }
              }
              obs.unobserve(el);
            }
          });
        }, { threshold: t });
        obs.observe(el);
      })(els[i], threshold);
    }
  })();

  /* ═══════════════════════════════════════════════
     5. 加载动画（DOMContentLoaded）
     ═══════════════════════════════════════════════ */
  (function loadAnimations() {
    var els = document.querySelectorAll('[data-pf-animate][data-pf-trigger="load"]');
    for (var i = 0; i < els.length; i++) {
      (function(el) {
        var animClass = el.getAttribute('data-pf-animate');
        var delay = parseInt(el.getAttribute('data-pf-delay')) || 0;
        if (!animClass) return;
        if (delay > 0) {
          setTimeout(function() { el.classList.add(animClass); clearTransformAfterAnim(el); }, delay);
        } else {
          el.classList.add(animClass);
          clearTransformAfterAnim(el);
        }
      })(els[i]);
    }
  })();

  /** 动画结束后清除 transform，避免影响 position:absolute 元素的最终位置 */
  function clearTransformAfterAnim(el) {
    el.addEventListener('animationend', function() {
      el.style.transform = 'none';
    }, { once: true });
  }

  /* ═══════════════════════════════════════════════
     6. 链接包裹
     ═══════════════════════════════════════════════ */
  (function wrapLinks() {
    var els = document.querySelectorAll('[data-pf-link]');
    for (var i = 0; i < els.length; i++) {
      (function(el) {
        try {
          var link = JSON.parse(el.getAttribute('data-pf-link'));
        } catch (e) { return; }
        if (!link || !link.href) return;

        // 如果元素已经包含 <a> 子元素（导出端已包裹），跳过避免重复包裹
        if (el.querySelector('a')) return;

        var a = document.createElement('a');
        a.href = link.href;
        if (link.target === '_blank') {
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
        }
        a.style.cssText = 'text-decoration:underline;text-decoration-color:#6366f1;text-underline-offset:2px;cursor:pointer;color:inherit;display:inherit';
        // 将原元素的内容移到 <a> 中
        while (el.firstChild) {
          a.appendChild(el.firstChild);
        }
        el.appendChild(a);
      })(els[i]);
    }
  })();

})();`
}