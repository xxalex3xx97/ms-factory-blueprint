// Mobile <-> desktop view switch. Pref in localStorage "msfbp.view" ("m"|"d"); the redirect itself is the inline script in each page's <head>.
(()=>{const mob=document.documentElement.classList.contains("mob"),lbl=mob?"Desktop view":"Mobile view",sh=document.getElementById("mMenu");
  const go=()=>{try{localStorage.setItem("msfbp.view",mob?"d":"m")}catch(_){}location.href=(mob?"index.html":"m.html")+location.search+location.hash};
  const b=document.createElement("button");b.type="button";b.textContent=lbl;b.onclick=go;
  if(mob){if(!sh)return;const h=document.createElement("h4"),g=document.createElement("div");h.textContent="View";g.className="mgrid";g.appendChild(b);sh.append(h,g)}
  else{b.id="vwSw";b.title="Open the touch-friendly layout";b.style.cssText="position:fixed;left:8px;bottom:8px;z-index:20;font-size:11px;padding:3px 8px;opacity:.7";document.body.appendChild(b)}})();
