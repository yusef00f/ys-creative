/* YS CREATIVE — fullscreen for video previews (works on iPhone, Android, iPad, desktop). */
(function(){
'use strict';
var ICON='<svg class="i-enter" viewBox="0 0 24 24"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg><svg class="i-exit" viewBox="0 0 24 24"><path d="M3 8h3a2 2 0 0 0 2-2V3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M21 16h-3a2 2 0 0 0-2 2v3"/></svg>';
var doc=document, body=doc.body;
var pfsEl=null, scrollY=0, pushed=false;

function fsElement(){return doc.fullscreenElement||doc.webkitFullscreenElement||null}
function canNativeFS(el){return !!(el.requestFullscreen||el.webkitRequestFullscreen)}
function isReel(card){return !!card.closest('#view-short')}

function lockLandscape(card){
  try{if(!isReel(card)&&screen.orientation&&screen.orientation.lock&&matchMedia('(pointer:coarse)').matches){screen.orientation.lock('landscape').catch(function(){})}}catch(e){}
}
function unlockOrientation(){try{if(screen.orientation&&screen.orientation.unlock)screen.orientation.unlock()}catch(e){}}

function enterPseudo(card){
  scrollY=window.pageYOffset;
  body.style.top='-'+scrollY+'px';
  body.classList.add('ys-fs-open');
  card.classList.add('ys-pfs','ys-is-fs');
  pfsEl=card;
  try{history.pushState({ysfs:1},'');pushed=true}catch(e){}
  lockLandscape(card);
}
function exitPseudo(fromPop){
  if(!pfsEl)return;
  pfsEl.classList.remove('ys-pfs','ys-is-fs');
  pfsEl=null;
  body.classList.remove('ys-fs-open');
  body.style.top='';
  window.scrollTo(0,scrollY);
  unlockOrientation();
  if(pushed&&!fromPop){pushed=false;try{history.back()}catch(e){}}
  pushed=false;
}

function enter(card){
  var video=card.querySelector('video');
  if(canNativeFS(card)){
    var p=(card.requestFullscreen||card.webkitRequestFullscreen).call(card);
    if(p&&p.catch)p.catch(function(){enterPseudo(card)});
    lockLandscape(card);
    return;
  }
  // iPhone Safari: native player for <video>, CSS fullscreen for iframes (Drive / Mega)
  if(video&&video.webkitEnterFullscreen){try{video.webkitEnterFullscreen();return}catch(e){}}
  enterPseudo(card);
}
function exit(card){
  if(pfsEl){exitPseudo();return}
  if(fsElement()){(doc.exitFullscreen||doc.webkitExitFullscreen).call(doc)}
}
function toggle(card){
  if(pfsEl===card||fsElement()===card)exit(card);else enter(card);
}

doc.addEventListener('fullscreenchange',sync);doc.addEventListener('webkitfullscreenchange',sync);
function sync(){
  var cur=fsElement();
  doc.querySelectorAll('.ys-is-fs').forEach(function(e){if(e!==cur&&e!==pfsEl)e.classList.remove('ys-is-fs')});
  if(cur&&cur.classList)cur.classList.add('ys-is-fs');
  if(!cur&&!pfsEl)unlockOrientation();
}
window.addEventListener('popstate',function(){if(pfsEl){pushed=false;exitPseudo(true)}});
doc.addEventListener('keydown',function(e){
  if(e.key==='Escape'&&pfsEl){exitPseudo()}
  else if((e.key==='f'||e.key==='F')&&!/INPUT|TEXTAREA/.test((doc.activeElement||{}).tagName||'')){
    var c=fsElement()||pfsEl||doc.querySelector('.work-preview.playing:hover,.featured-preview.playing:hover');
    if(c&&c.classList&&c.matches('.work-preview,.featured-preview'))toggle(c);
  }
});

function attach(card){
  if(card.querySelector('.ys-fs-btn'))return;
  var b=doc.createElement('span');
  b.className='ys-fs-btn';b.setAttribute('role','button');b.setAttribute('tabindex','0');
  b.setAttribute('aria-label','تمام‌صفحه');b.title='تمام‌صفحه (F)';
  b.innerHTML=ICON;
  function act(e){
    e.preventDefault();e.stopPropagation();
    if(!card.querySelector('iframe,video')){
      // not started yet: start the preview first, then go fullscreen (must stay inside the user gesture)
      card.click();
    }
    toggle(card);
  }
  b.addEventListener('click',act);
  b.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' ')act(e)});
  card.appendChild(b);
}
doc.querySelectorAll('.work-preview,.featured-preview').forEach(attach);

// Double-tap / double-click on a playing native <video> toggles fullscreen too.
doc.addEventListener('dblclick',function(e){
  var v=e.target&&e.target.closest&&e.target.closest('.work-preview video,.featured-preview video');
  if(v)toggle(v.parentElement);
});
})();
