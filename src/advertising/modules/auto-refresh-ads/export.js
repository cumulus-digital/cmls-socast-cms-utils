/**
 * Auto-refresh ads.
 *
 * Each slot has its own refresh fire time, set if one or both of
 * the following conditions are met:
 * 1) impressionViewable event has previously fired on the slot
 * 2) Slot's pos targeting value is in the ALWAYS_REFRESH_POS list
 */

import config from './config.json';

((window, undefined) => {
	const {
		scriptName,
		nameSpace,
		version,
		viewablePercent,
		defaultRefreshInMinutes,
		ALWAYS_REFRESH_POS,
	} = config;
	if (!ALWAYS_REFRESH_POS) {
		ALWAYS_REFRESH_POS = [];
	}
	const { Logger } = window.__CMLSINTERNAL.libs;
	const log = new Logger(`${scriptName} ${version}`);

	// Public access exclusion from refresh
	if (!window.__CMLSINTERNAL?.initAutoRefreshAdsExclusion) {
		window.__CMLSINTERNAL.initAutoRefreshAdsExclusion = () => {
			window._CMLS.autoRefreshAdsExclusion =
				window._CMLS?.autoRefreshAdsExclusion || [];

			// Prevent duplicates from being added to the public exclusion list
			if (!window._CMLS.autoRefreshAdsExclusion?._push) {
				window._CMLS.autoRefreshAdsExclusion._push =
					window._CMLS.autoRefreshAdsExclusion.push;
				window._CMLS.autoRefreshAdsExclusion.push = function (...args) {
					args.forEach((item) => {
						if (!this.includes(item)) {
							log.info('New ID added to exclusion list', item);
							Array.prototype.push.apply(this, [item]);
						} else {
							log.warn(
								'Attempted to add duplicate item to autoRefreshAdsExclusion list.',
								item
							);
						}
					});
					return this.length;
				};
			}
		};
	}
	window.__CMLSINTERNAL.initAutoRefreshAdsExclusion();
	window.__CMLSINTERNAL.clearAutoRefreshAdsExclusion = () => {
		delete window._CMLS.autoRefreshAdsExclusion;
		window.__CMLSINTERNAL.initAutoRefreshAdsExclusion();
	};

	const init = () => {
		class adRefresher {
			log = log;

			// Time in minutes to refresh
			every = defaultRefreshInMinutes;

			// Global state conditions
			globalConditions = {
				DISABLED: 'Auto-Refresh-Ads is disabled.',
				PAUSED: 'Auto-Refresh-Ads is paused.',
				RUNNING: 'Auto-Refresh-Ads is running.',
			};

			// Slot conditions
			slotConditions = {
				OK: 'Slot is good to refresh.',
				NEVER: 'Slot is set to never refresh.',
				TARGET_NEVER: `Slot has ${this.TARGET_NEVER_REFRESH} targeting.`,
				ALWAYS: 'Slot is set to always refresh.',
				TARGET_ALWAYS: `Slot has ${this.TARGET_ALWAYS_REFRESH} targeting.`,
				EXCLUDED: 'Slot is excluded by autoRefreshAdsExclusion.',
				DISABLED: 'Refresh is disabled for this slot.',
				HIDDEN: 'Slot is not currently viewable.',
			};

			// Targeting key set for slots which should refresh on the next cycle
			TARGET_REFRESH_KEY = config.refreshKey;

			// Targeting key set for slots which ALWAYS refresh
			TARGET_ALWAYS_REFRESH_KEY = config.refreshAlwaysKey;

			// Targeting key set for slots which NEVER refresh
			TARGET_NEVER_REFRESH_KEY = config.refreshNeverKey;

			TARGET_TRUE = config.refreshAllowedValue;

			// Holds timers for slots
			timers = new Map();

			// Holds the interval
			interval = null;

			constructor(minutes = defaultRefreshInMinutes) {
				if (window?._CMLS?.autoRefreshAdsInterval > 0) {
					this.every = window._CMLS.autoRefreshAdsInterval;
				} else {
					this.every = minutes;
				}

				if (
					this.checkGlobalConditions() !==
					this.globalConditions.RUNNING
				) {
					return false;
				}

				const adTag = window.__CMLSINTERNAL.adTag;

				log.debug(
					'Adding impressionViewable listener. Refresh timer will be set per-slot once an impression is delivered.'
				);
				adTag.addListener('impressionViewable', (e) => {
					const slot = e.slot;
					log.debug(
						'Impression viewable',
						slot.getTargeting('pos'),
						slot.getSlotElementId(),
						slot.getTargeting(this.TARGET_REFRESH_KEY)
					);
					if (this.slotIsExcluded(slot)) {
						return;
					}
					if (!this.slotHasRefreshKey(slot)) {
						this.initSlotTimer(slot);
					}
				});

				// Certain slots will always refresh if they
				// are explicitly set in the ALWAYS_REFRESH_POS array,
				// are not excluded, and have not already received an
				// impression which set the refresh key.
				const checkAlwaysRefresh = (slot) => {
					if (
						this.slotHasRefreshKey(slot) ||
						this.slotIsExcluded(slot) ||
						!this.slotIsAlwaysRefresh(slot)
					) {
						return false;
					}
					log.debug(
						`Slot with div id ${slot.getSlotElementId()} will always refresh`,
						window.__CMLSINTERNAL.adTag.listSlotData(slot)
					);
					return true;
				};

				// Check existing slots for always refreshers and already returned impressions
				adTag.getSlots().forEach((slot) => {
					if (this.slotIsExcluded(slot)) {
						return;
					}
					if (checkAlwaysRefresh(slot)) {
						this.initSlotTimer(slot);
					}
					const responseInfo = slot.getResponseInformation();
					if (responseInfo) {
						this.initSlotTimer(slot);
					}
				});

				// Check future slots for always refreshers
				adTag.addListener('slotRenderEnded', (e) => {
					const slot = e.slot;
					if (checkAlwaysRefresh(slot)) {
						this.initSlotTimer(slot);
					}
				});

				this.interval = setInterval(() => {
					this.tick.call(this);
				}, 1000);

				return this;
			}

			/**
			 * Checks the state of the page and browser to determine if ads should refresh
			 */
			checkGlobalConditions() {
				const { DISABLED, PAUSED, RUNNING } = this.globalConditions;
				const autoReloadPage = window.__CMLSINTERNAL?.autoReload;
				if (window.DISABLE_AUTO_REFRESH_ADS) {
					log.warn(
						'window.DISABLE_AUTO_REFRESH_ADS is set. Ads will not refresh.'
					);
					return DISABLED;
				}
				if (window?._CMLS?.autoRefreshAdsInterval === 0) {
					log.warn(
						'Auto refresh ads disabled by window._CMLS.autoRefreshAdsInterval = 0'
					);
					return DISABLED;
				}
				if (
					autoReloadPage?.active &&
					autoReloadPage.settings.timeout < this.every * 2
				) {
					log.warn(
						'Auto-Reload-Page timer is less than 2x Auto-Refresh-Ads timer. Ads will not refresh'
					);
					return DISABLED;
				}

				return RUNNING;
			}

			slotIsExcluded(slot) {
				if (
					typeof window._CMLS.autoRefreshAdsExclusion === 'undefined'
				) {
					window.__CMLSINTERNAL?.initAutoRefreshAdsExclusion();
				}

				const id = slot.getSlotElementId();
				if (window._CMLS.autoRefreshAdsExclusion.includes(id)) {
					return this.slotConditions.EXCLUDED;
				}

				if (
					slot
						.getTargeting(this.TARGET_REFRESH_KEY)
						.includes(this.TARGET_NEVER_REFRESH_KEY)
				) {
					return this.slotConditions.EXCLUDED;
				}

				return false;
			}

			slotIsAlwaysRefresh(slot) {
				const { ALWAYS, TARGET_ALWAYS } = this.slotConditions;
				const pos = slot.getTargeting('pos');
				const targetedAlways = slot
					.getTargeting(this.TARGET_ALWAYS_REFRESH_KEY)
					.includes(this.TARGET_TRUE);
				if (targetedAlways) {
					return TARGET_ALWAYS;
				}
				return ALWAYS_REFRESH_POS.some((check) => pos.includes(check))
					? ALWAYS
					: false;
			}

			slotHasRefreshKey(slot) {
				return slot
					.getTargeting(this.TARGET_REFRESH_KEY)
					.includes(this.TARGET_TRUE);
			}

			initSlotTimer(slot) {
				const id = slot.getSlotElementId();
				const pos = slot.getTargeting('pos');
				const now = new Date();
				// Round timer to seconds
				now.setSeconds(
					now.getSeconds() + Math.max(now.getMilliseconds() / 1000)
				);
				const fireTime = new Date(now.getTime() + this.every * 60000);
				const hasTimer = this.timers.has(slot);

				if (hasTimer) {
					return;
				}

				log.debug(
					`Setting ${this.every} minute refresh timer on slot.`,
					{ pos, id },
					fireTime.toLocaleString()
				);
				this.timers.set(slot, fireTime);
				slot.setTargeting(this.TARGET_REFRESH_KEY, this.TARGET_TRUE);
			}

			deleteTimer(slot) {
				if (this.timers.has(slot)) {
					this.timers.delete(slot);
				}
			}

			tick() {
				const now = new Date();
				if (now.getTime() % ((this.every * 60000) / 4) < 1000) {
					log.debug('Tick', now.toLocaleString());
				}

				const refreshSlots = [];
				this.timers.forEach((fireTime, slot) => {
					const id = slot.getSlotElementId();
					const pos = slot.getTargeting('pos');
					if (now >= fireTime) {
						log.debug('Queueing for refresh', { pos, id });
						this.deleteTimer(slot);
						if (slot.getTargeting(this.TARGET_REFRESH_KEY)) {
							slot.clearTargeting(this.TARGET_REFRESH_KEY);
						}
						refreshSlots.push(slot);
						//window._CMLS.adTag.refresh(slot);
					}
				});
				if (refreshSlots.length) {
					refreshSlots.forEach((rSlot) => {
						log.info(
							`${new Date().toLocaleString()} Refreshing slot in div id ${rSlot.getSlotElementId()}`,
							window.__CMLSINTERNAL.adTag.listSlotData(rSlot)
						);
					});
					window.__CMLSINTERNAL.adTag.refresh(refreshSlots);
				}
			}

			destroy() {
				if (this.interval) {
					clearInterval(this.interval);
					this.interval = null;
				}
			}
		}

		window.__CMLSINTERNAL[nameSpace] = new adRefresher();
		log.debug('Initialized.');
	};

	if (window.__CMLSINTERNAL.adTag) {
		window.__CMLSINTERNAL.adTag.queue(() => {
			init();
		});
	} else {
		window.addEventListener('cmls-adtag-loaded', () => {
			window.__CMLSINTERNAL.adTag.queue(() => {
				init();
			});
		});
	}
})(window.self);
