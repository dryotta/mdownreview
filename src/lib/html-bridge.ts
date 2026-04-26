/**
 * HTML preview commenting bridge.
 *
 * The HTML preview is rendered in a sandboxed iframe (cross-origin srcdoc).
 * To let the user select/click content and turn it into a comment anchor we
 * inject a tiny IIFE that posts events back via `postMessage`. The host
 * filters by `event.source` and a per-mount `nonce`.
 *
 * Pure helpers — no React, no DOM. The script string is constructed but
 * never evaluated here; it runs inside the iframe at load time.
 */

export interface BuildBridgeOptions {
  /** Per-mount nonce. The host validates incoming messages against this. */
  nonce: string;
}

/**
 * Returns a `<script>…</script>` block to splice into the iframe srcdoc.
 * Behavior:
 *   - On `mouseup` with non-empty selection → posts a `selection` event with
 *     a CSS selector path of the selection's anchor element + offsets.
 *   - On `click` with no selection → posts a `click` event with the target's
 *     selector path, tag, and a short text preview.
 *   - Suppressed entirely when `document.body.dataset.mdrCommentMode !== "true"`.
 *   - Skipped on form/button/input targets (preserve native behavior).
 *
 * Selector path: `nth-of-type` chain capped at 5 levels (e.g.
 *   `body > div:nth-of-type(2) > section > p:nth-of-type(3)`).
 */
export function buildBridgeScript(opts: BuildBridgeOptions): string {
  const nonce = JSON.stringify(opts.nonce);
  // The IIFE is a single string so it serializes deterministically into srcdoc.
  return `<script>(function(){
  var NONCE=${nonce};
  function path(el){
    if(!el||el.nodeType!==1) return "";
    var parts=[],n=el,depth=0;
    while(n&&n.nodeType===1&&n!==document.documentElement&&depth<5){
      var name=n.tagName.toLowerCase();
      var p=n.parentElement;
      if(p){
        var same=0,idx=0,i;
        for(i=0;i<p.children.length;i++){
          var c=p.children[i];
          if(c.tagName===n.tagName){same++;if(c===n) idx=same;}
        }
        if(same>1) name+=":nth-of-type("+idx+")";
      }
      parts.unshift(name);
      n=p; depth++;
    }
    return parts.join(" > ");
  }
  function active(){return document.body&&document.body.dataset&&document.body.dataset.mdrCommentMode==="true";}
  function isFormTarget(t){
    if(!t||!t.tagName) return false;
    var tag=t.tagName.toLowerCase();
    return tag==="input"||tag==="textarea"||tag==="button"||tag==="select"||tag==="option";
  }
  document.addEventListener("mouseup",function(e){
    if(!active()) return;
    if(isFormTarget(e.target)) return;
    var sel=window.getSelection&&window.getSelection();
    if(!sel) return;
    var text=sel.toString();
    if(!text||!text.length) return;
    var range=sel.rangeCount>0?sel.getRangeAt(0):null;
    if(!range) return;
    var anchor=range.startContainer;
    var anchorEl=anchor&&anchor.nodeType===1?anchor:(anchor&&anchor.parentElement);
    parent.postMessage({
      source:"mdr-html-bridge",nonce:NONCE,type:"selection",
      selectorPath:path(anchorEl),
      startOffset:range.startOffset,endOffset:range.endOffset,
      selectedText:text.slice(0,256),
      clientX:e.clientX,clientY:e.clientY
    },"*");
  },true);
  document.addEventListener("click",function(e){
    if(!active()) return;
    if(isFormTarget(e.target)) return;
    var sel=window.getSelection&&window.getSelection();
    if(sel&&sel.toString().length>0) return;
    var t=e.target;
    if(!t||t.nodeType!==1) return;
    parent.postMessage({
      source:"mdr-html-bridge",nonce:NONCE,type:"click",
      selectorPath:path(t),
      tag:t.tagName.toLowerCase(),
      textPreview:(t.textContent||"").slice(0,80),
      clientX:e.clientX,clientY:e.clientY
    },"*");
  },true);
})();</script>`;
}

/**
 * Splices `script` into `html` immediately before `</body>`. If no `</body>`
 * is present (fragment input), appends to the end. Case-insensitive match.
 */
export function injectBridgeScript(html: string, script: string): string {
  const m = html.match(/<\/body\s*>/i);
  if (!m || m.index === undefined) return html + script;
  const i = m.index;
  return html.slice(0, i) + script + html.slice(i);
}
