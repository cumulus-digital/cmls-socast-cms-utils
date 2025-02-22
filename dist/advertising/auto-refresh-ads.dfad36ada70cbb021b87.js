"use strict";(self.cmlsSocastUtils=self.cmlsSocastUtils||[]).push([[812],{1287:function(e,t,s){s(4114),s(8111),s(1148),s(7588),s(3579);var i=s(8533);function o(e){for(let t in["true","yes","1"])if(t===String(e).toLowerCase())return!0;return!1}function n(e){return Array.isArray(e)||(e=[e]),e.some((e=>o(e)))}const{vD:r,k5:l,rE:d,no:E,pU:a}=i;a||(a=[]);const{Logger:h}=window.__CMLSINTERNAL.libs,R=new h(`${r} ${d}`);window.__CMLSINTERNAL?.initAutoRefreshAdsExclusion||(window.__CMLSINTERNAL.initAutoRefreshAdsExclusion=()=>{window._CMLS.autoRefreshAdsExclusion=window._CMLS?.autoRefreshAdsExclusion||[],window._CMLS.autoRefreshAdsExclusion?._push||(window._CMLS.autoRefreshAdsExclusion._push=window._CMLS.autoRefreshAdsExclusion.push,window._CMLS.autoRefreshAdsExclusion.push=function(...e){return e.forEach((e=>{this.includes(e)?R.warn("Attempted to add duplicate item to autoRefreshAdsExclusion list.",e):(R.info("New ID added to exclusion list",e),Array.prototype.push.apply(this,[e]))})),this.length})}),window.__CMLSINTERNAL.initAutoRefreshAdsExclusion(),window.__CMLSINTERNAL.clearAutoRefreshAdsExclusion=()=>{delete window._CMLS.autoRefreshAdsExclusion,window.__CMLSINTERNAL.initAutoRefreshAdsExclusion()};class A{log=R;every=E;globalConditions={DISABLED:"Auto-Refresh-Ads is disabled.",PAUSED:"Auto-Refresh-Ads is paused.",RUNNING:"Auto-Refresh-Ads is running."};slotConditions={OK:"Slot is good to refresh.",NEVER:"Slot is set to never refresh.",TARGET_NEVER:`Slot has ${this.TARGET_NEVER_REFRESH_KEY} targeting.`,ALWAYS:"Slot is set to always refresh.",TARGET_ALWAYS:`Slot has ${this.TARGET_ALWAYS_REFRESH_KEY} targeting.`,EXCLUDED:"Slot is excluded by autoRefreshAdsExclusion.",DISABLED:"Refresh is disabled for this slot.",HIDDEN:"Slot is not currently viewable."};TARGET_REFRESH_KEY=i.F3;TARGET_ALWAYS_REFRESH_KEY=i.Ck;TARGET_NEVER_REFRESH_KEY=i.rH;TARGET_TRUE=i.Jk;TARGET_FALSE=i.kz;TARGET_SET=i.Xv;timers=new Map;interval=null;constructor(e=E){if(window?._CMLS?.autoRefreshAdsInterval>0?this.every=window._CMLS.autoRefreshAdsInterval:this.every=e,this.checkGlobalConditions()!==this.globalConditions.RUNNING)return R.info("Global condition check failed, will not refresh ads."),!1;const t=window.__CMLSINTERNAL.adTag;return R.debug("Adding impressionViewable listener. Refresh timer will be set per-slot once an impression is delivered."),t.addListener("impressionViewable",this.impressionListener.bind(this)),t.getSlots().forEach((e=>{this.slotIsExcluded(e)||!this.slotIsAlwaysRefresh(e)||this.slotHasRefreshSetKey(e)||this.slotHasTimer(e)||(R.debug(`Slot with div id ${e.getSlotElementId()} will always refresh`,window.__CMLSINTERNAL.adTag.listSlotData(e)),this.setSlotTimer(e))})),t.addListener("slotRenderEnded",(e=>{const t=e.slot;!this.slotIsAlwaysRefresh(t)||this.slotHasRefreshSetKey(t)||this.slotHasTimer(t)||this.setSlotTimer(t)})),this.interval=setInterval((()=>{this.tick.call(this)}),1e3),this}isTruthy(e){return o(e)}includesTruthy(e){return n(e)}checkGlobalConditions(){const{DISABLED:e,PAUSED:t,RUNNING:s}=this.globalConditions,i=window.__CMLSINTERNAL?.autoReload;return window.DISABLE_AUTO_REFRESH_ADS?(R.warn("window.DISABLE_AUTO_REFRESH_ADS is set. Ads will not refresh."),e):0===window?._CMLS?.autoRefreshAdsInterval?(R.warn("Auto refresh ads disabled by window._CMLS.autoRefreshAdsInterval = 0"),e):i?.active&&i.settings.timeout<2*this.every?(R.warn("Auto-Reload-Page timer is less than 2x Auto-Refresh-Ads timer. Ads will not refresh"),e):s}impressionListener(e){const t=e.slot;R.debug("Impression viewable",{elementId:t.getSlotElementId(),pos:t.getTargeting("pos"),refresh:t.getTargeting(this.TARGET_REFRESH_KEY)}),this.slotIsExcluded(t)||this.slotHasRefreshSetKey(t)||this.slotHasTimer(t)||this.setSlotTimer(t)}slotHasRefreshKey(e){return n(e.getTargeting(this.TARGET_REFRESH_KEY))}slotHasRefreshSetKey(e){return n(e.getTargeting(this.TARGET_REFRESH_KEY))}slotIsAlwaysRefresh(e){const{ALWAYS:t,TARGET_ALWAYS:s}=this.slotConditions,i=e.getTargeting("pos");return n(e.getTargeting(this.TARGET_ALWAYS_REFRESH_KEY))?s:!!a.some((e=>i.includes(e)))&&t}slotIsExcluded(e){void 0===window._CMLS.autoRefreshAdsExclusion&&window.__CMLSINTERNAL?.initAutoRefreshAdsExclusion();const t=e.getSlotElementId();return window._CMLS.autoRefreshAdsExclusion.includes(t)?this.slotConditions.EXCLUDED:(s=e.getTargeting(this.TARGET_REFRESH_KEY),Array.isArray(s)||(s=[s]),!!(s.some((e=>function(e){for(let t in["false","no","0"])if(t===String(e).toLowerCase())return!0;return!1}(e)))||n(e.getTargeting(this.TARGET_NEVER_REFRESH_KEY))||e.getTargeting(this.TARGET_REFRESH_KEY).includes(this.TARGET_NEVER_REFRESH_KEY))&&this.slotConditions.EXCLUDED);var s}slotHasTimer(e){return this.timers.has(e)}setSlotTimer(e){const t=e.getSlotElementId(),s=e.getTargeting("pos"),i=new Date;i.setSeconds(i.getSeconds()+Math.max(i.getMilliseconds()/1e3));const o=new Date(i.getTime()+6e4*this.every);R.debug(`Setting ${this.every} minute refresh timer on slot.`,{pos:s,id:t},o.toLocaleString()),this.deleteSlotTimer(e),this.timers.set(e,o),e.setTargeting(this.TARGET_REFRESH_KEY,this.TARGET_SET)}deleteSlotTimer(e){this.timers.has(e)&&(clearTimeout(this.timers.get(e)),this.timers.delete(e),(this.slotHasRefreshSetKey(e)||this.slotHasRefreshKey(e))&&e.setTargeting(this.TARGET_REFRESH_KEY,this.TARGET_TRUE))}tick(){const e=new Date;e.getTime()%(6e4*this.every/4)<1e3&&R.debug("Tick",e.toLocaleString());const t=[],s=[];this.timers.forEach(((i,o)=>{if(this.slotIsExcluded(o))this.deleteSlotTimer(o);else if(e>=i){const e=o.getSlotElementId(),i=o.getTargeting("pos");R.debug("Queueing for refresh",{pos:i,id:e}),this.deleteSlotTimer(o),t.push(o),s.push(window.__CMLSINTERNAL.adTag.listSlotData(o))}})),t.length&&(R.debug(`${(new Date).toLocaleString()} Refreshing ${t.length} slots`,s),window.__CMLSINTERNAL.adTag.refresh(t))}destroy(){this.interval&&(clearInterval(this.interval),this.interval=null),this.timers.forEach(((e,t)=>{this.deleteSlotTimer(t)}))}}function u(){window.__CMLSINTERNAL[l]=new A,R.debug("Initialized.")}window.__CMLSINTERNAL.adTag?u():window.addEventListener("cmls-adtag-loaded",(()=>{u()}))}}]);