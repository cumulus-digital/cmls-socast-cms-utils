"use strict";(self.cmlsAmpUtils=self.cmlsAmpUtils||[]).push([[812],{8324:function(e,t,s){s.r(t),s(4114),s(8992),s(3215),s(3949),s(7550);var i=s(8533);(e=>{const{vD:t,k5:s,rE:o,V_:n,no:l,pU:r}=i;r||(r=[]);const{Logger:E}=e.__CMLSINTERNAL.libs,a=new E(`${t} ${o}`);e.__CMLSINTERNAL?.initAutoRefreshAdsExclusion||(e.__CMLSINTERNAL.initAutoRefreshAdsExclusion=()=>{e._CMLS.autoRefreshAdsExclusion=e._CMLS?.autoRefreshAdsExclusion||[],e._CMLS.autoRefreshAdsExclusion?._push||(e._CMLS.autoRefreshAdsExclusion._push=e._CMLS.autoRefreshAdsExclusion.push,e._CMLS.autoRefreshAdsExclusion.push=function(...e){return e.forEach((e=>{this.includes(e)?a.warn("Attempted to add duplicate item to autoRefreshAdsExclusion list.",e):(a.info("New ID added to exclusion list",e),Array.prototype.push.apply(this,[e]))})),this.length})}),e.__CMLSINTERNAL.initAutoRefreshAdsExclusion(),e.__CMLSINTERNAL.clearAutoRefreshAdsExclusion=()=>{delete e._CMLS.autoRefreshAdsExclusion,e.__CMLSINTERNAL.initAutoRefreshAdsExclusion()};const d=()=>{e.__CMLSINTERNAL[s]=new class{log=a;every=l;globalConditions={DISABLED:"Auto-Refresh-Ads is disabled.",PAUSED:"Auto-Refresh-Ads is paused.",RUNNING:"Auto-Refresh-Ads is running."};slotConditions={OK:"Slot is good to refresh.",NEVER:"Slot is set to never refresh.",TARGET_NEVER:`Slot has ${this.TARGET_NEVER_REFRESH} targeting.`,ALWAYS:"Slot is set to always refresh.",TARGET_ALWAYS:`Slot has ${this.TARGET_ALWAYS_REFRESH} targeting.`,EXCLUDED:"Slot is excluded by autoRefreshAdsExclusion.",DISABLED:"Refresh is disabled for this slot.",HIDDEN:"Slot is not currently viewable."};TARGET_REFRESH_KEY=i.F3;TARGET_ALWAYS_REFRESH_KEY=i.Ck;TARGET_NEVER_REFRESH_KEY=i.rH;TARGET_TRUE=i.Jk;timers=new Map;interval=null;constructor(t=l){if(this.every=e?._CMLS?.autoRefreshAdsInterval>0?e._CMLS.autoRefreshAdsInterval:t,this.checkGlobalConditions()!==this.globalConditions.RUNNING)return!1;const s=e.__CMLSINTERNAL.adTag;a.debug("Adding impressionViewable listener. Refresh timer will be set per-slot once an impression is delivered."),s.addListener("impressionViewable",(e=>{const t=e.slot;a.debug("Impression viewable",t.getTargeting("pos"),t.getSlotElementId(),t.getTargeting(this.TARGET_REFRESH_KEY)),this.slotIsExcluded(t)||this.slotHasRefreshKey(t)||this.initSlotTimer(t)}));const i=t=>!(this.slotHasRefreshKey(t)||this.slotIsExcluded(t)||!this.slotIsAlwaysRefresh(t)||(a.debug(`Slot with div id ${t.getSlotElementId()} will always refresh`,e.__CMLSINTERNAL.adTag.listSlotData(t)),0));return s.getSlots().forEach((e=>{i(e)&&this.initSlotTimer(e),e.getResponseInformation()&&this.initSlotTimer(e)})),s.addListener("slotRenderEnded",(e=>{const t=e.slot;i(t)&&this.initSlotTimer(t)})),this.interval=setInterval((()=>{this.tick.call(this)}),1e3),this}checkGlobalConditions(){const{DISABLED:t,PAUSED:s,RUNNING:i}=this.globalConditions,o=e.__CMLSINTERNAL?.autoReload;return e.DISABLE_AUTO_REFRESH_ADS?(a.warn("window.DISABLE_AUTO_REFRESH_ADS is set. Ads will not refresh."),t):0===e?._CMLS?.autoRefreshAdsInterval?(a.warn("Auto refresh ads disabled by window._CMLS.autoRefreshAdsInterval = 0"),t):o?.active&&o.settings.timeout<2*this.every?(a.warn("Auto-Reload-Page timer is less than 2x Auto-Refresh-Ads timer. Ads will not refresh"),t):i}slotIsExcluded(t){void 0===e._CMLS.autoRefreshAdsExclusion&&e.__CMLSINTERNAL?.initAutoRefreshAdsExclusion();const s=t.getSlotElementId();return(e._CMLS.autoRefreshAdsExclusion.includes(s)||!!t.getTargeting(this.TARGET_REFRESH_KEY).includes(this.TARGET_NEVER_REFRESH_KEY))&&this.slotConditions.EXCLUDED}slotIsAlwaysRefresh(e){const{ALWAYS:t,TARGET_ALWAYS:s}=this.slotConditions,i=e.getTargeting("pos");return e.getTargeting(this.TARGET_ALWAYS_REFRESH_KEY).includes(this.TARGET_TRUE)?s:!!r.some((e=>i.includes(e)))&&t}slotHasRefreshKey(e){return e.getTargeting(this.TARGET_REFRESH_KEY).includes(this.TARGET_TRUE)}initSlotTimer(e){const t=e.getSlotElementId(),s=e.getTargeting("pos"),i=new Date;i.setSeconds(i.getSeconds()+Math.max(i.getMilliseconds()/1e3));const o=new Date(i.getTime()+6e4*this.every);this.timers.has(e)||(a.debug(`Setting ${this.every} minute refresh timer on slot.`,{pos:s,id:t},o.toLocaleString()),this.timers.set(e,o),e.setTargeting(this.TARGET_REFRESH_KEY,this.TARGET_TRUE))}deleteTimer(e){this.timers.has(e)&&this.timers.delete(e)}tick(){const t=new Date;t.getTime()%(6e4*this.every/4)<1e3&&a.debug("Tick",t.toLocaleString());const s=[];this.timers.forEach(((e,i)=>{const o=i.getSlotElementId(),n=i.getTargeting("pos");t>=e&&(a.debug("Queueing for refresh",{pos:n,id:o}),this.deleteTimer(i),i.getTargeting(this.TARGET_REFRESH_KEY)&&i.clearTargeting(this.TARGET_REFRESH_KEY),s.push(i))})),s.length&&(s.forEach((t=>{a.info(`${(new Date).toLocaleString()} Refreshing slot in div id ${t.getSlotElementId()}`,e.__CMLSINTERNAL.adTag.listSlotData(t))})),e.__CMLSINTERNAL.adTag.refresh(s))}destroy(){this.interval&&(clearInterval(this.interval),this.interval=null)}},a.debug("Initialized.")};e.__CMLSINTERNAL.adTag?e.__CMLSINTERNAL.adTag.queue((()=>{d()})):e.addEventListener("cmls-adtag-loaded",(()=>{e.__CMLSINTERNAL.adTag.queue((()=>{d()}))}))})(window.self)}}]);