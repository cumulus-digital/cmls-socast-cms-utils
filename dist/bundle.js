!function(){var e,t,n,i={5236:function(e,t,n){"use strict";n.r(t),n(4114);var i=n(448);if(window._CMLS=window._CMLS||{},window._CMLS.libsLoaded=window._CMLS.libsLoaded||[],window._CMLS.libsLoaded?.length&&window._CMLS.libsLoaded.indexOf("advertising")>-1)throw new Error("Advertising library already loaded!");(0,i.A)((()=>window._CMLS.libsLoaded.indexOf("main")>-1)).then((()=>{new window.__CMLSINTERNAL.Logger("ADVERTISING").info({message:"\n                      __\n ______ ____ _  __ __/ /_ _____\n/ __/ // /  ' \\/ // / / // (_-<\n\\__/\\_,_/_/_/_/\\_,_/_/\\_,_/___/\n SoCast ADVERTISING LIBRARY LOADED\n BUILD DATE: Mon Dec 16 2024 23:23:29 GMT-0500 (Eastern Standard Time)",headerLength:1/0}),n(2738),window._CMLS.libsLoaded.push("advertising")}),(()=>{console.warn("CMLS Advertising Support: Timed out waiting for main library!")}))},2738:function(e,t,n){"use strict";n(4114),n(8992),n(3949),n(1454),n(7550);class i{scriptName="DEFAULT ADTAG INTERFACE";nameSpace="defaultAdtagInterface";parentNameSpace="adTagDetection";version="x";static identity="DEFAULT";static detectTag(){}constructor(){this.log=new window.__CMLSINTERNAL.Logger(`${this.scriptName} v${this.version}`)}rawInterface(){}queue(e){return this.rawInterface().cmd.push(e)}pubads(){return this.rawInterface().pubads()}getTargeting(e){}setTargeting(e,t){}isInitialLoadDisabled(){return!1}isReady(){return!1}defaultDefineSlotOptions(){return{adUnitPath:null,size:[],sizeMap:null,div:null,collapse:!0,targeting:[],init:!0,prebid:!1,outOfPage:!1,interstitial:!1}}defineSlot(e){return{}}destroySlots(e){}getSlots(){return[]}display(e,t=!1){}refresh(e,t={}){}wasSlotRequested(e){return!1}doInitialLoad(e){}filterSlots(e){if(e)return Array.isArray(e)||(e=[e]),e;this.log.warn("Filter called without slots",e)}listSlotData(e){return[]}addListener(){}removeListener(){}}class o extends i{scriptName="GPT INTERFACE";version="0.2";log=null;listeners={};static identity="GPT";static detectTag(){if(window.self.googletag?.pubadsReady)return!0}initialRequestKey="initial-request-made";inViewPercentage=50;constructor(){super(),this.log=new window.__CMLSINTERNAL.Logger(`${this.scriptName} v${this.version}`);const e=this;e.addListener("slotRequested",(t=>{t.slot._cm_displayed&&t.slot.getTargeting(e.initialRequestKey)?.length||(e.log.debug("Setting initial request key",e.listSlotData(t.slot),t),t.slot._cm_displayed=!0,t.slot.setTargeting(e.initialRequestKey,!0))})),e.addListener("slotRenderEnded",(t=>{e.log.debug("Rendered",t)})),e.addListener("slotVisibilityChanged",(e=>{const t=e.inViewPercentage||0;e.slot._cm_visiblePercent=t,e.slot._cm_visible=t>=this.inViewPercentage})),e.addListener("impressionViewable",(t=>{e.log.debug("Slot is VIEWABLE",e.listSlotData(t.slot)),t.slot._cm_visible=!0}))}destroy(){for(const e in this.listeners)this.listeners[e].forEach((t=>{this.removeListener(e,t)}))}rawInterface(){return window.self?.googletag}addListener(e,t){const n=this;this.queue((()=>{n.listeners[e]=n.listeners[e]||[],n.listeners[e].push(t),n.pubads().addEventListener(e,t)}))}removeListener(e,t){return this.listeners?.[e]?.includes(t)&&this.listeners[e].splice(this.listeners[e].indexOf(t),1),this.pubads().removeEventListener(e,t)}getTargeting(e){return this.pubads().getTargeting(e)}setTargeting(e,t){return this.pubads().setTargeting(e,t)}isInitialLoadDisabled(){return this.pubads().isInitialLoadDisabled()}isReady(){return this.rawInterface().pubadsReady}defineSlot(e){const t=Object.assign(this.defaultDefineSlotOptions(),e);let n=!1;if(t.interstitial)n=this.rawInterface().defineOutOfPageSlot(t.adUnitPath,this.rawInterface().enums.OutOfPageFormat.INTERSTITIAL);else if(t.outOfPage)n=this.rawInterface().defineOutOfPageSlot(t.adUnitPath,t.div);else{const e=window.self!==window.parent;let i=t?.size;if(e&&t?.sizeMap?.length){let e=t.sizeMap;Array.isArray(e)||(e=[e]),e.some((e=>{if(!(e.length<2||e[0].length<2))return matchMedia(`(min-width: ${e[0][0]}px) and (min-height: ${e[0][1]}px)`).matches?(i=e[1],!0):void 0;log.debug("Invalid map",e)}))}if(!i)return this.log.error("defineSlot must be provided with a size property."),!1;this.log.debug("Winning sizemap",t.div,i),n=this.rawInterface().defineSlot(t.adUnitPath,i,t.div),n&&!e&&t?.sizeMap?.length&&n.defineSizeMapping(t.sizeMap)}return!n&&t.interstitial?(this.log.warn("Interstitial slot did not return",t,n),!1):n?(this.log.debug("Slot created",this.listSlotData(n)),t.hasOwnProperty("collapse")&&(Array.isArray(t.collapse)||(t.collapse=[t.collapse]),n=n.setCollapseEmptyDiv.apply(n,t.collapse)),t.init&&(n=n.addService(this.pubads())),t.targeting=Array.isArray(t.targeting)?t.targeting:[t.targeting],t.targeting.forEach((e=>{for(const t in e)e?.hasOwnProperty(t)&&(n=n.setTargeting(t,e[t]))})),this.log.debug("Defined slot",{slot:this.listSlotData(n).shift(),settings:t}),window.GPT_SITE_SLOTS=window.GPT_SITE_SLOTS||{},window.GPT_SITE_SLOTS[n.getSlotElementId()]=n,n):(this.log.error("Failed to create slot!",t),!1)}destroySlots(e){return this.rawInterface().destroySlots(e)}getSlots(){return this.pubads().getSlots()}display(e,t=!1){const n=this;this.queue((()=>{if(n.log.debug("Calling display",e,t),n.rawInterface().display(e),t){n.log.debug("Forceload enabled for this display call");let i=null;if("string"==typeof e?i=e:e instanceof Node?i=e.id:"object"==typeof e&&e?.getSlotElementId&&null!==e&&(i=e.getSlotElementId()),!i)return void n.log.warn("Attempted to force initial load, but ID could not be discovered",{ID:e,forceLoad:t});let o=!1;if(window.GPT_SITE_SLOTS?.[i]?.getSlotElementId)o=window.GPT_SITE_SLOTS[i];else{const e=n.getSlots();if(!e?.length)return void n.log.warn("No slots defined!");e.some((e=>{if(e.getSlotElementId()===i)return o=e,!0}))}o?(n.log.debug("Forcing initial load",{id:o?.getSlotElementId?o.getSlotElementId():"unknown!",slot:o}),n.doInitialLoad(o)):n.log.warn("Attempted to force initial load but slot was not defined!",{ID:e,forceLoad:t,slot:o})}}))}refresh(e,t={}){if(!e)return void this.log.warn("Refresh called without slots");Array.isArray(e)||(e=[e]);const n=this.filterSlots(e);if(n?.length)return this.log.debug("Refresh called for slots",this.listSlotData(n)),this.pubads().refresh(n,t);this.log.debug("No slots found for refreshing after filtering.")}wasSlotRequested(e){const t=this;if(e?._displayed||e.getTargeting(t.initialRequestKey)?.length)return t.log.debug("Has initial request key",t.listSlotData(e)),!0;if(e.getResponseInformation())return t.log.debug("Has response info",t.listSlotData(e)),!0;const n=window.self.document.getElementById(e.getSlotElementId());return!!n?.getAttribute("data-google-query-id")&&(t.log.debug("Has data attribute",t.listSlotData(e)),!0)}doInitialLoad(e){const t=this;e?(Array.isArray(e)||(e=[e]),t.isInitialLoadDisabled()&&(t.log.debug("Initial load requested while initial load is disabled, this will be delayed",t.listSlotData(e)),setTimeout((()=>{const n=[],i=[];e.forEach((e=>{t.wasSlotRequested(e)?i.push(e):n.push(e)})),n.length&&(t.log.debug("Delayed initial load firing",t.listSlotData(n)),t.refresh(n)),i.length&&t.log.debug("Slots were already requested",t.listSlotData(i))}),500))):t.log.warn("doInitialLoad called without slots")}filterSlots(e){if(!e)return void this.log.warn("Filter called without slots",e);Array.isArray(e)||(e=[e]);const t=[];return e.forEach((e=>{e?.getSlotElementId()&&t.push(e)})),!!t.length&&t}listSlotData(e){Array.isArray(e)||(e=[e]);const t=[];return e.forEach((e=>{const n={_cm_displayed:e?._displayed?"yes":"no",div:e?.getSlotElementId?e.getSlotElementId():"unknown!",pos:e?.getTargeting?e.getTargeting("pos"):"unknown!",adUnitPath:e?.getAdUnitPath?e.getAdUnitPath():"unknown!",sizes:e?.getSizes?e.getSizes():"unknown!",targeting:[],slot:e},i=e?.getTargetingKeys();if(i?.length)for(let t of i)n.targeting.push({[t]:e?.getTargeting(t)});t.push(n)})),t}}const r=["120x240","120x600","160x600","250x250","300x50","300x100","300x1050","300x300","300x75","300x250","300x600","320x50","320x100","336x280","400x300","468x60","728x90","970x250","970x90"];class s extends o{scriptName="APS-GPT INTERFACE";version="0.2";log=null;static identity="APS-GPT";static detectTag(){if(super.detectTag()&&window?.apstag)return!0}constructor(){super(),this.log=new window.__CMLSINTERNAL.Logger(`${this.scriptName} v${this.version}`)}defineSlot(e){const t=Object.assign(this.defaultDefineSlotOptions(),e);return!1!==t?.prebid||t?.targeting?.noprebid||(t.targeting.noprebid="noprebid"),super.defineSlot(t)}filterPrebidSlots(e){const t=this;if(!e)return void t.log.warn("filterPrebidSlots called without slots");Array.isArray(e)||(e=[e]);const n={prebid:[],noprebid:[],all:e=t.filterSlots(e)};return e.forEach((e=>{t.log.debug("Checking",e.getSlotElementId());let i=!1;const o=e.getSizes();if(o?.length?o.some((e=>{if(r.includes(`${e.width}x${e.height}`))return i=!0,!0})):i=!1,e.getTargeting("noprebid")?.length&&(i=!1),i)try{n.prebid.push(e)}catch(e){console.error(e)}else n.noprebid.push(e)})),n}refresh(e,t={}){const n=this;if(!e)return void n.log.warn("Refresh called without slots");Array.isArray(e)||(e=[e]),n.log.debug("Refresh requested for slots",n.listSlotData(e));const i=n.filterPrebidSlots(e);if(i?.all?.length){if(i?.noprebid?.length&&(n.log.debug("Refreshing noprebid slots",n.listSlotData(i.noprebid),i.noprebid),n.pubads().refresh(i.noprebid)),i?.prebid?.length){n.log.debug(`🏷 Requesting bids for ${i.prebid.length} prebid slots`,this.listSlotData(i.prebid));const e=[];i.prebid.forEach((t=>{e.push({slotID:t.getSlotElementId(),slotName:t.getAdUnitPath(),sizes:t.getSizes().map((e=>[e.width,e.height]))})})),o={slots:e,timeout:2e3,params:{adRefresh:"1"}},window.apstag.fetchBids(o,(e=>{n.queue((()=>{window.apstag.setDisplayBids(),n.log.debug("🏷 Refreshing prebid slots after bids received",n.listSlotData(i.prebid),e,i.prebid),n.pubads().refresh(i.prebid,t)}))}))}}else n.log.debug("No slots found for refreshing after filtering.");var o}wasSlotRequested(e){return!!super.wasSlotRequested(e)||!!e.getTargeting("amznbid")?.length&&(this.log.debug("Has amznbid targeting",this.listSlotData(e)),!0)}}window.__CMLSINTERNAL=window.__CMLSINTERNAL||{},window.__CMLSINTERNAL.adTagInterfaces={[s.identity]:s,[o.identity]:o};const a=[s,o];(e=>{const{Logger:t,triggerEvent:n,domReady:i}=e.__CMLSINTERNAL.libs,o=new t("ADTAG DETECTION 0.1"),r=(t=0)=>{if(e.__CMLSINTERNAL.adTag)return;if(t>100)return void o.warn("Infinite loop detected, no interface found!");o.debug(`Running registered detectors (Loop: ${t})`);let i=!1;for(const t of a){if(!t.identity||!t.detectTag){o.error("Invalid interface",t);break}if(o.debug("Checking registered detector",t.identity),t.detectTag()){i=!0,e.__CMLSINTERNAL.adTag=new t,e.__CMLSINTERNAL.adTag.identity=t.identity;break}}if(i)return o.info("Interface detected",e.__CMLSINTERNAL.adTag.identity,e.__CMLSINTERNAL.adTag),void n(e,"cmls-adtag-loaded",!0);o.warn("No interface detected, re-running detection in 0.15 seconds"),setTimeout((()=>r(t+1)),50)};i((()=>{o.info("Initializing."),r()}))})(window.self);var d=JSON.parse('{"vD":"REGISTER-AD-PATH","rE":"0.4","eY":"6717"}');(e=>{const{Logger:t,triggerEvent:n}=e.__CMLSINTERNAL.libs,{vD:i,rE:o,eY:r}=d,s=new t(`${i} ${o}`);function a(){function t(t){const i=t.match(/^(\/[0-9]+\/[^\/]+).*/);return i?.length>1&&(t=i[1]),e._CMLS=e._CMLS||{},e._CMLS.adPath=t,e.__CMLSINTERNAL.adPath=t,s.info("Ad path discovered",e.__CMLSINTERNAL.adPath),n(e,"cmls-adpath-discovered",e.__CMLSINTERNAL.adPath),!0}if(e.GPT_SITE_ID)return s.info("Using GPT_SITE_ID",e.GPT_SITE_ID),t(e.GPT_SITE_ID);const i=e.__CMLSINTERNAL.adTag;s.debug("Checking for ad path");const o=i.getSlots();s.debug(`Testing ${o.length} slots`),o.length?o.some((e=>{const n=e?.getAdUnitPath();if(n&&n.indexOf(`/${r}/`)>-1)return s.debug("Found in-network slot",e.getSlotElementId(),n),t(n)})):s.warn("Found no slots!")}e?.__CMLSINTERNAL?.adTag?.isReady()?a():e.addEventListener("cmls-adtag-loaded",(()=>a()))})(window.self),window?.cmlsAds?.apsInit||(window._apsInitialized=!1,window.cmlsAds=window.cmlsAds||{},window.cmlsAds.apsInit=()=>{window.googletag=window.googletag||{},window.googletag.cmd=window.googletag.cmd||[],window.googletag.cmd.push((()=>{window.googletag.pubads().disableInitialLoad()})),n.e(595).then(n.bind(n,3202)).then((e=>e.default()))},console.log("window.cmlsAds.apsInit created."),window?.cmlsAds?.apsLoad||(window.cmlsAds=window.cmlsAds||{},window.cmlsAds.apsLoad=(...e)=>{n.e(469).then(n.bind(n,1600)).then((t=>{t.default(...e)}))}));var l=n(8533);const{vD:c,k5:g,rE:u}=l;window.__CMLSINTERNAL=window.__CMLSINTERNAL||{},window.cmlsAds=window.cmlsAds||{},window.cmlsAds.queue=window.cmlsAds.queue||[],window.cmlsAds.queue.forEach((e=>"function"==typeof e&&e())),window.cmlsAds.queue._push=window.cmlsAds.queue.push,window.cmlsAds.queue.push=e=>"function"==typeof e&&e();const w=[{name:"advertising/auto-refresh-ads",check:()=>{const e=new window.__CMLSINTERNAL.Logger(`${c} Loader ${u}`);return new Promise(((t,i)=>{(window.self.location.search.includes("cmlsDisableAdRefresh")||window.self.DISABLE_AUTO_REFRESH_ADS)&&(e.warn("Disabled for this site.",{"window.DISABLE_AUTO_REFRESH_ADS set":!!window.self.DISABLE_AUTO_REFRESH_ADS,"cmlsDisableAdRefresh in URL":window.self.location.search.includes("cmlsDisableAdRefresh")}),t(!1)),t((()=>{Promise.all([n.e(96),n.e(812)]).then(n.bind(n,8324))}))}))},loadImmediately:!0,loaderOptions:{async:!1,defer:!1}}];window.__CMLSINTERNAL.libs.doDynamicImports(w)},3160:function(e,t,n){n(8500),n(5236)},8500:function(e,t,n){"use strict";var i={};n.r(i),n.d(i,{dataLayerNames:function(){return h},push:function(){return f}});var o={};n.r(o),n.d(o,{addVisibilityListener:function(){return S},api:function(){return m},isVisible:function(){return _},removeVisibilityListener:function(){return L}}),n(4114);var r=n(8314),s=n(7350),a=n.n(s),d=n(8221),l=n.n(d);n(8992),n(3949);const c=window.self.document,g={el:(e,t={})=>{const n=c.createElement(e);if(null!==t&&("function"==typeof t||"object"==typeof t))for(const e in t)n.setAttribute(e,t[e]);return n},script:(e,t={})=>(t=Object.assign(t,{type:"text/javascript",async:!0,src:e}),g.el("script",t)),iframe:(e={},t="")=>{var n=g.el("iframe",e);return n.onload=()=>{n.onload=!1;const e=n.contentWindow.document;e.open(),e.write(t),e.close()},n}};var u=g;const w=(e,t)=>{Array.isArray(t)?t.forEach((t=>w(e,t))):e.appendChild(t?.nodeType?t:document.createTextNode(t))},h=["dataLayer","sharedContainerDataLayer","corpDataLayer"],f=e=>{h.forEach((t=>{window.self[t]=window.self[t]||[],window.self[t].push(e)}))},p={hidden:"hidden",event:"visibilitychange"};void 0!==window.document.mozHidden?Object.assign(p,{hidden:"mozHidden",event:"mozvisibilitychange"}):void 0!==window.document.msHidden?Object.assign(p,{hidden:"msHidden",event:"msvisibilitychange"}):void 0!==window.document.webkitHidden?Object.assign(p,{hidden:"webkitHidden",event:"webkitvisibilitychange"}):void 0!==window.document.oHidden&&Object.assign(p,{hidden:"oHidden",event:"ovisibilitychange"});const m=p;let b=!1;function _(){let e=!0;return e=window.document.visibilityState?!("hidden"===window.document.visibilityState):!window.document[p.hidden],!e&&b?-1:e}function S(e,t={}){return window.document.addEventListener(p.event,e,t)}function L(e){return window.document.removeEventListener(p.event,e)}if(window.addEventListener("beforeunload",(()=>{b=!0})),window._CMLS=window._CMLS||{},window.self._CMLS.debug=window.self._CMLS.debug||window.location.search.indexOf("cmlsDebug")>-1||window.document.cookie.indexOf("cmlsDebug")>-1,window._CMLS.libsLoaded=window._CMLS.libsLoaded||[],window.__CMLSINTERNAL=window.__CMLSINTERNAL||{},window._CMLS.libsLoaded?.length&&window._CMLS.libsLoaded.indexOf("main")>-1)throw new Error("Main library already loaded!");if(window.location.search.includes("cmlsDisabled"))throw new Error("cmlsDisabled in location string.");window.__CMLSINTERNAL.Logger=r.Ay,window.__CMLSINTERNAL.commonLog=new window.__CMLSINTERNAL.Logger("COMMON");const y=document.currentScript.src;window.__CMLSINTERNAL.scriptUrl=y,y.replace("/main.js",""),window.__CMLSINTERNAL.scriptUrlBase=window.__CMLSINTERNAL.scriptUrl.replace("/main.js",""),window.__CMLSINTERNAL.libs={Logger:r.Ay,doDynamicImports:e=>{window.__CMLSINTERNAL.scriptUrlBase;const t=new window.__CMLSINTERNAL.Logger("DYNAMIC IMPORT"),n=[],i=[];e.forEach((e=>{e?.loadImmediately?i.push(e):n.push(e)})),i.forEach((async e=>{if(e.hasOwnProperty("check")){const n=await e.check();n&&(t.debug("Loading",e?.name||e.check?.name||e),n())}})),n.length&&window.__CMLSINTERNAL.libs.domReady((()=>{n.forEach((async e=>{if(e.hasOwnProperty("check")){const n=await e.check();n&&(t.debug("Loading (DR)",e?.name||e.check?.name||e),n())}}))}))},createElement:u,h:(e,t,...n)=>{const i=document.createElement(e);return Object.entries(t||{}).forEach((([e,t])=>{e.startsWith("on")&&e.toLowerCase()in window?i.addEventListener(e.toLowerCase().substring(2),t):i.setAttribute(e,"boolean"==typeof t?t:"string"==typeof t?new String(t).toString():t)})),n.forEach((e=>{w(i,e)})),i},Fragment:(e,...t)=>t,domReady:e=>{"loading"!==window.self.document.readyState?e():window.self.document.addEventListener("DOMContentLoaded",e)},GTM:i,tabVisibility:o,triggerEvent:function(e,t,n){let i;window.document.createEvent?(i=window.document.createEvent("CustomEvent"),i.initCustomEvent(t,!0,!0,n)):i=new CustomEvent(t,{detail:n}),e.dispatchEvent(i)},lodash:{throttle:a(),debounce:l()}};const E=new URLSearchParams(window.location.search);E.has("cmlsDebug")&&(window._CMLS.debug=!0),E.has("cmlsEnableDebug")&&window.sessionStorage.setItem("cmlsDebug","yes"),E.has("cmlsDisableDebug")&&window.sessionStorage.removeItem("cmlsDebug"),window.__CMLSINTERNAL.commonLog.info({message:`\nURL BASE: ${window.__CMLSINTERNAL.scriptUrlBase}\n                      __\n ______ ____ _  __ __/ /_ _____\n/ __/ // /  ' \\/ // / / // (_-<\n\\__/\\_,_/_/_/_/\\_,_/_/\\_,_/___/\n SoCast MAIN LIBRARY LOADED\n BUILD DATE: Mon Dec 16 2024 23:23:29 GMT-0500 (Eastern Standard Time)`,headerLength:1/0}),window._CMLS.libsLoaded.push("main")},8314:function(e,t,n){"use strict";n.d(t,{Ay:function(){return o}}),n(4114),n(1454);const i={};class o{background=null;foreground=null;#e=null;constructor(e){i[e]?(this.background=i[e]?.background,this.foreground=i[e]?.foreground):(this.background=(()=>{const e=(e=256)=>Math.floor(Math.random()*e),t=e=>e.toString(16).padStart(2,"0");let n,i,o,r;do{n=e(),i=e(),o=e(),r=Math.sqrt((255-n)**2+(0-i)**2+(0-o)**2)}while(r<100);return`${t(n)}${t(i)}${t(o)}`})(),this.foreground=(e=>{const t=parseInt(e,16);return(t>>16&255)/255*.2126+(t>>8&255)/255*.7152+(255&t)/255*.0722>.6?"000000":"FFFFFF"})(this.background),i[e]={background:this.background,foreground:this.foreground}),this.header=[`CL %c ${e} %c`,`background: #${this.background}; color: #${this.foreground}`]}timestamp(){return(new Date)?.toISOString()||(new Date).toUTCString()}resolveMessage(e){let t=e,n=160;return Array.isArray(e)&&e.length>0&&e[0]?.message&&e[0]?.headerLength&&(t=e[0].message,n=e[0].headerLength),{message:t,headerLength:n}}smallString(e,t=160){return e?(e instanceof Element?e.innerHTML:e.toString()).substring(0,t):e}displayHeader(e,t,n=160){let i=[{debug:"🐞",info:"ℹ️",warn:"🚸",error:"🚨"}?.[e]];t&&(Array.isArray(t)?i.push(this.smallString(t.map((e=>{if("string"!=typeof e){const t=new WeakSet;return JSON.stringify(e,((e,n)=>{if("object"==typeof n&&null!==n){if(t.has(n))return;t.add(n)}return n}))}return e})).join(" || "),n)):i.push(this.smallString(t,n))),this.header.length>1?window.top.console.groupCollapsed.apply(window.top.console,[`${this.header[0]} %c${i.join(" ")}`,this.header[1],"",`color: ${{debug:"#777777",info:"inherit",warn:"darkgoldenrod",error:"darkred"}?.[e]}`,""]):window.top.console.groupCollapsed.apply(window.top.console,[...this.header,...i])}displayFooter(){window.top.console.debug("TIMESTAMP:",this.timestamp()),window.top.console.trace(),window.top.console.groupEnd()}logMessage(e,t,n=160){if("object"!=typeof console||!console.groupCollapsed)return!1;let i=!1;try{(/(1|true|yes)/i.test(window.sessionStorage.getItem("cmlsDebug"))||/cmlsDebug/i.test(window.document.cookie))&&(i=!0),window.location.search.indexOf("cmlsDebug")>=0&&(i=!0)}catch(e){}("debug"!==e||window?._CMLS?.debug||i)&&(this.displayHeader(e,t,n),window.top.console.debug(t),this.displayFooter())}info(...e){let{message:t,headerLength:n}=this.resolveMessage(e);this.logMessage("info",t,n)}debug(...e){let{message:t,headerLength:n}=this.resolveMessage(e);this.logMessage("debug",t,n)}warn(...e){let{message:t,headerLength:n}=this.resolveMessage(e);this.logMessage("warn",t,n)}error(...e){let{message:t,headerLength:n}=this.resolveMessage(e);this.logMessage("error",t,n)}}},448:function(e,t,n){"use strict";function i(e=e=>void 0!==e,t=1e4,n=20){const i=Date.now();return new Promise((function o(r,s){const a=e();a?r(a):Date.now()-i>=t?(console.trace("waitFor timeout",{check:e,timeout:t,interval:n}),s(new Error("Timed out waiting for ref"))):setTimeout(o.bind(this,r,s),n)}))}n.d(t,{A:function(){return i}})},8533:function(e){"use strict";e.exports=JSON.parse('{"vD":"AUTO REFRESH ADS","k5":"autoRefreshAds","rE":"0.5","V_":50,"no":1,"F3":"refresh","Ck":"always_refresh","rH":"never_refresh","Jk":"true","pU":[]}')}},o={};function r(e){var t=o[e];if(void 0!==t)return t.exports;var n=o[e]={exports:{}};return i[e].call(n.exports,n,n.exports,r),n.exports}r.m=i,r.c=o,e=[],r.O=function(t,n,i,o){if(!n){var s=1/0;for(c=0;c<e.length;c++){n=e[c][0],i=e[c][1],o=e[c][2];for(var a=!0,d=0;d<n.length;d++)(!1&o||s>=o)&&Object.keys(r.O).every((function(e){return r.O[e](n[d])}))?n.splice(d--,1):(a=!1,o<s&&(s=o));if(a){e.splice(c--,1);var l=i();void 0!==l&&(t=l)}}return t}o=o||0;for(var c=e.length;c>0&&e[c-1][2]>o;c--)e[c]=e[c-1];e[c]=[n,i,o]},r.n=function(e){var t=e&&e.__esModule?function(){return e.default}:function(){return e};return r.d(t,{a:t}),t},r.d=function(e,t){for(var n in t)r.o(t,n)&&!r.o(e,n)&&Object.defineProperty(e,n,{enumerable:!0,get:t[n]})},r.f={},r.e=function(e){return Promise.all(Object.keys(r.f).reduce((function(t,n){return r.f[n](e,t),t}),[]))},r.u=function(e){return{469:"advertising/amazon-publisher-services/load",595:"advertising/amazon-publisher-services/init",812:"advertising/auto-refresh-ads"}[e]+"."+{469:"a1bc4b799420474a7e2b",595:"77df3a21a72592d3b2c9",812:"0b4cc84b9b80bf7a4a49"}[e]+".js"},r.g=function(){if("object"==typeof globalThis)return globalThis;try{return this||new Function("return this")()}catch(e){if("object"==typeof window)return window}}(),r.o=function(e,t){return Object.prototype.hasOwnProperty.call(e,t)},t={},n="cmls-socast-cms-utils:",r.l=function(e,i,o,s){if(t[e])t[e].push(i);else{var a,d;if(void 0!==o)for(var l=document.getElementsByTagName("script"),c=0;c<l.length;c++){var g=l[c];if(g.getAttribute("src")==e||g.getAttribute("data-webpack")==n+o){a=g;break}}a||(d=!0,(a=document.createElement("script")).charset="utf-8",a.timeout=120,r.nc&&a.setAttribute("nonce",r.nc),a.setAttribute("data-webpack",n+o),a.src=e),t[e]=[i];var u=function(n,i){a.onerror=a.onload=null,clearTimeout(w);var o=t[e];if(delete t[e],a.parentNode&&a.parentNode.removeChild(a),o&&o.forEach((function(e){return e(i)})),n)return n(i)},w=setTimeout(u.bind(null,void 0,{type:"timeout",target:a}),12e4);a.onerror=u.bind(null,a.onerror),a.onload=u.bind(null,a.onload),d&&document.head.appendChild(a)}},r.r=function(e){"undefined"!=typeof Symbol&&Symbol.toStringTag&&Object.defineProperty(e,Symbol.toStringTag,{value:"Module"}),Object.defineProperty(e,"__esModule",{value:!0})},function(){r.S={};var e={},t={};r.I=function(n,i){i||(i=[]);var o=t[n];if(o||(o=t[n]={}),!(i.indexOf(o)>=0)){if(i.push(o),e[n])return e[n];r.o(r.S,n)||(r.S[n]={}),r.S[n];var s=[];return e[n]=s.length?Promise.all(s).then((function(){return e[n]=1})):1}}}(),function(){var e;r.g.importScripts&&(e=r.g.location+"");var t=r.g.document;if(!e&&t&&(t.currentScript&&"SCRIPT"===t.currentScript.tagName.toUpperCase()&&(e=t.currentScript.src),!e)){var n=t.getElementsByTagName("script");if(n.length)for(var i=n.length-1;i>-1&&(!e||!/^http(s?):/.test(e));)e=n[i--].src}if(!e)throw new Error("Automatic publicPath is not supported in this browser");e=e.replace(/#.*$/,"").replace(/\?.*$/,"").replace(/\/[^\/]+$/,"/"),r.p=e}(),function(){var e={23:0};r.f.j=function(t,n){var i=r.o(e,t)?e[t]:void 0;if(0!==i)if(i)n.push(i[2]);else{var o=new Promise((function(n,o){i=e[t]=[n,o]}));n.push(i[2]=o);var s=r.p+r.u(t),a=new Error;r.l(s,(function(n){if(r.o(e,t)&&(0!==(i=e[t])&&(e[t]=void 0),i)){var o=n&&("load"===n.type?"missing":n.type),s=n&&n.target&&n.target.src;a.message="Loading chunk "+t+" failed.\n("+o+": "+s+")",a.name="ChunkLoadError",a.type=o,a.request=s,i[1](a)}}),"chunk-"+t,t)}},r.O.j=function(t){return 0===e[t]};var t=function(t,n){var i,o,s=n[0],a=n[1],d=n[2],l=0;if(s.some((function(t){return 0!==e[t]}))){for(i in a)r.o(a,i)&&(r.m[i]=a[i]);if(d)var c=d(r)}for(t&&t(n);l<s.length;l++)o=s[l],r.o(e,o)&&e[o]&&e[o][0](),e[o]=0;return r.O(c)},n=self.cmlsAmpUtils=self.cmlsAmpUtils||[];n.forEach(t.bind(null,0)),n.push=t.bind(null,n.push.bind(n))}();var s=r.O(void 0,[96],(function(){return r(3160)}));s=r.O(s)}();