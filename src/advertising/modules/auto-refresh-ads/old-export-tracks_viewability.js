/**
 * Refresh viewable ads
 */

import config from './config.json';

((window, undefined) => {
	const {
		scriptName,
		nameSpace,
		version,
		viewablePercent,
		defaultRefreshInMinutes,
	} = config;
	const log = new window._CMLS.Logger(`${scriptName} ${version}`);

	const { isVisible: isTabVisible, addVisibilityListener } =
		window._CMLS.libs.tabVisibility;

	const ALWAYS_REFRESH_POS = [
		'wallpaper-ad',
		...(window._CMLS?.ALWAYS_REFRESH_POS || []),
	];
	const NEVER_REFRESH_POS = [
		'pushdown',
		'w7m',
		...(window._CMLS?.NEVER_REFRESH_POS || []),
	];

	// Public access exclusion from refresh
	window._CMLS.autoRefreshAdsExclusion =
		window._CMLS?.autoRefreshAdsExclusion || [];

	// Prevent duplicates from being added to the exclusion list
	window._CMLS.autoRefreshAdsExclusion.push = (...args) => {
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

	const init = () => {
		class AdRefresher {
			log = log;

			// Time in minutes to refresh
			every = defaultRefreshInMinutes;

			// State
			state = false;

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

			// Targeting key for noting slots that should refresh
			TARGET_REFRESH_KEY = 'refresh';

			// Targeting key for noting slots have a refresh
			TARGET_AWAITING_KEY = 'awaiting_refresh';

			// Targeting key for slots that must always refresh
			TARGET_ALWAYS_REFRESH = 'always_refresh';

			// Targeting key for slots that must never refresh
			TARGET_NEVER_REFRESH = 'never_refresh';

			// Targeting key for slots which are not viewable
			TARGET_HIDDEN_KEY = 'not_viewable';

			TARGET_TRUE = 'true';

			// Holds timers for slots
			timers = new Map();

			// Holds the interval
			interval = null;

			constructor(minutes = defaultRefreshInMinutes) {
				this.every = minutes;

				if (
					this.checkGlobalConditions() !==
					this.globalConditions.RUNNING
				) {
					log.info(
						'Initial condition check failed. Ads will not refresh.'
					);
					return false;
				}

				const adTag = window._CMLS.adTag;

				// Set slots viewable by impression event
				adTag.addListener('impressionViewable', (e) => {
					const slot = e.slot;
					if (!this.slotHasRefreshKey(slot)) {
						log.debug(
							'Slot is VIEWABLE (imp)',
							slot.getTargeting('pos'),
							slot.getSlotElementId()
						);
						this.chainTimeout(
							slot,
							this.setSlotKeyAndInitTimer,
							this.removeSlotHiddenKey
						);
					}
				});

				// Set slots viewable by actual visibility event
				adTag.addListener('slotVisibilityChanged', (e) => {
					const slot = e.slot;
					const was = slot.getTargeting(this.TARGET_REFRESH_KEY);
					const perc = e.inViewPercentage || 0;
					if (perc >= viewablePercent && !was.includes('true')) {
						log.debug(
							'Slot is VIEWABLE',
							slot.getTargeting('pos'),
							slot.getSlotElementId()
						);
						this.chainTimeout(
							slot,
							this.setSlotKeyAndInitTimer,
							this.removeSlotHiddenKey
						);
					} else if (this.slotHasRefreshKey(slot)) {
						log.debug(
							'Slot is HIDDEN',
							slot.getTargeting('pos'),
							slot.getSlotElementId()
						);
						this.chainTimeout(
							slot,
							this.removeSlotRefreshKey,
							this.removeSlotHiddenKey
						);
					}
				});

				// Check existing slots for always refreshers
				adTag.getSlots().forEach((slot) => {
					if (this.slotIsNeverRefresh(slot)) {
						this.removeSlotRefreshKey(slot);
						return;
					}
					if (this.slotIsAlwaysRefresh(slot)) {
						this.setSlotKeyAndInitTimer(slot);
						return;
					}
					if (
						!this.slotIsExcluded(slot) &&
						!slot.getResponseInformation()
					) {
						this.setSlotKeyAndInitTimer(slot, { doubleTime: true });
						return;
					}
					if (this.isSlotConditionGood(slot, { log: true })) {
						this.initTimer(slot);
					} else {
						this.removeSlotRefreshKey(slot);
					}
				});

				// Check future slots for always refreshers
				adTag.addListener('slotRenderEnded', (e) => {
					const slot = e.slot;
					const isNeverRefresh = this.slotIsNeverRefresh(slot);
					if (this.slotIsNeverRefresh(slot)) {
						this.removeSlotRefreshKey(slot);
					} else if (this.slotIsAlwaysRefresh(slot)) {
						this.setSlotKeyAndInitTimer(slot);
					} else if (!this.slotIsExcluded(slot) && e.isEmpty) {
						this.setSlotKeyAndInitTimer(slot, { doubleTime: true });
					} else {
						this.removeSlotRefreshKey(slot);
					}
				});

				this.interval = setInterval(() => {
					this.tick.call(this);
				}, 1000);

				return this;
			}

			/**
			 * Call a series of functions against a slot
			 * using setTimeout to "guarantee" a tick
			 * between calls.
			 *
			 * @param {Object} slot
			 * @param  {...function[]} calls
			 */
			chainTimeout(slot, ...calls) {
				setTimeout(() => {
					calls[0].call(this, slot);
					if (calls.length > 1) {
						this.chainTimeout.call(this, slot, ...calls.slice(1));
					}
				}, 0);
			}

			checkGlobalConditions() {
				const { DISABLED, PAUSED, RUNNING } = this.globalConditions;
				const autoReloadPage = window._CMLS?.autoReload;
				if (autoReloadPage?.active) {
					if (
						!autoReloadPage?.timeout ||
						!autoReloadPage?.settings?.timeout
					) {
						log.warn(
							'Auto-Reload-Page is active, but settings could not be found. Ads will not refresh'
						);
						return DISABLED;
					}
					if (autoReloadPage.settings.timeout < this.every * 2) {
						log.warn(
							'Auto-Reload-Page timer is less than 2x Auto-Refresh-Ads timer. Ads will not refresh.'
						);
						return DISABLED;
					}
					if (
						this.fireTime.getTime &&
						autoReloadPage.timeout?.getTime
					) {
						const diff =
							autoReloadPage.timeout.getTime() -
							this.fireTime.getTime();
						// Ensure an ad refresh doesn't occur just before a page refresh
						const buffer = this.every * 60000 + 30000;
						if (diff < buffer) {
							log.info(
								'Auto-Reload-Page will fire before we will. Ads will not refresh.'
							);
							return DISABLED;
						}
					}
				}
				if (window.DISABLE_AUTO_REFRESH_ADS) {
					log.info(
						'window.DISABLE_AUTO_REFRESH_ADS is set. Ads will not refresh.'
					);
					return DISABLED;
				}
				if (!isTabVisible()) {
					log.debug('Tab is hidden. Ad refresh is paused.');
					return PAUSED;
				}

				return RUNNING;
			}

			setSlotRefreshKey(slot) {
				if (
					!this.slotIsNeverRefresh(slot) &&
					!this.slotIsExcluded(slot)
				) {
					//log.debug('setSlotRefreshKey', slot.getTargeting('pos'));
					slot.setTargeting(
						this.TARGET_REFRESH_KEY,
						this.TARGET_TRUE
					);
				}
			}
			removeSlotRefreshKey(slot) {
				if (
					this.slotHasRefreshKey(slot) &&
					!this.slotIsAlwaysRefresh(slot)
				) {
					slot.clearTargeting(
						this.TARGET_REFRESH_KEY,
						this.TARGET_TRUE
					);
				}
			}
			slotHasRefreshKey(slot) {
				return slot
					.getTargeting(this.TARGET_REFRESH_KEY)
					.includes(this.TARGET_TRUE);
			}

			setSlotHiddenKey(slot) {
				slot.setTargeting(this.TARGET_HIDDEN_KEY, this.TARGET_TRUE);
			}
			removeSlotHiddenKey(slot) {
				if (this.slotHasHiddenKey(slot)) {
					slot.clearTargeting(
						this.TARGET_HIDDEN_KEY,
						this.TARGET_TRUE
					);
				}
			}
			slotHasHiddenKey(slot) {
				return slot
					.getTargeting(this.TARGET_HIDDEN_KEY)
					.includes(this.TARGET_TRUE);
			}

			setSlotKeyAndInitTimer(slot, options) {
				//log.debug('setSlotKeyAndInitTimer', slot.getTargeting('pos'));
				this.chainTimeout(slot, this.setSlotRefreshKey, (slot) =>
					this.initTimer.call(this, slot, options)
				);
			}

			slotIsNeverRefresh(slot) {
				const { NEVER, TARGET_NEVER } = this.slotConditions;
				const pos = slot.getTargeting('pos');
				const targetedNever = slot
					.getTargeting(this.TARGET_NEVER_REFRESH)
					.includes(this.TARGET_TRUE);
				if (targetedNever) {
					return TARGET_NEVER;
				}
				return NEVER_REFRESH_POS.some((check) => pos.includes(check))
					? NEVER
					: false;
			}

			slotIsAlwaysRefresh(slot) {
				const { ALWAYS, TARGET_ALWAYS } = this.slotConditions;
				const pos = slot.getTargeting('pos');
				const targetedAlways = slot
					.getTargeting(this.TARGET_ALWAYS_REFRESH)
					.includes(this.TARGET_TRUE);
				if (targetedAlways) {
					return TARGET_ALWAYS;
				}
				return ALWAYS_REFRESH_POS.some((check) => pos.includes(check))
					? ALWAYS
					: false;
			}

			slotIsExcluded(slot) {
				const { EXCLUDED } = this.slotConditions;
				return window._CMLS.autoRefreshAdsExclusion.includes(
					slot.getSlotElementId()
				)
					? EXCLUDED
					: false;
			}

			checkSlotConditions(slot, options = {}) {
				const { checkKey = true, log = false } = options;
				const id = slot.getSlotElementId();
				const pos = slot.getTargeting('pos');
				const hasHiddenKey = this.slotHasHiddenKey(slot);
				const hasRefreshKey = this.slotHasRefreshKey(slot);

				const { OK, DISABLED, HIDDEN } = this.slotConditions;

				if (checkKey && hasHiddenKey) {
					return HIDDEN;
				}

				if (checkKey && !hasRefreshKey) {
					return DISABLED;
				}

				const isNeverRefresh = this.slotIsNeverRefresh(slot);
				const isAlwaysRefresh = this.slotIsAlwaysRefresh(slot);
				const isExcluded = this.slotIsExcluded(slot);

				const logBundle = {
					pos,
					id,
					hasRefreshKey,
					isAlwaysRefresh,
					isNeverRefresh,
					isExcluded,
				};

				if (isNeverRefresh) {
					log && this.log.debug(isNeverRefresh, logBundle);
					return isNeverRefresh;
				}

				if (isAlwaysRefresh) {
					return isAlwaysRefresh;
				}

				if (isExcluded) {
					log && this.log.debug(isExcluded, logBundle);
					return isExcluded;
				}

				if (!checkKey || hasRefreshKey) {
					return OK;
				}

				log &&
					this.log.debug(
						'Slot does not match refresh conditions.',
						logBundle
					);
				return false;
			}

			isSlotConditionGood(slot, options = {}) {
				const condition = this.checkSlotConditions(slot, options);
				const good = [
					this.slotConditions.OK,
					this.slotConditions.ALWAYS,
					this.slotConditions.TARGET_ALWAYS,
				];

				if (good.includes(condition)) {
					return condition;
				}
				return false;
			}

			initTimer(slot, options = {}) {
				const { doubleTime = false, log = true } = options;
				const id = slot.getSlotElementId();
				const pos = slot.getTargeting('pos');
				const hasTimer = this.timers.has(slot);

				if (hasTimer) {
					//log.debug('Already has a timer!', slot.getTargeting('pos'));
					// This slot already has a timer
					return;
				}
				//log.debug('initTimer', slot.getTargeting('pos'));

				let multiplier = 1;

				// Double time increases with every refresh
				if (doubleTime) {
					multiplier = 2;
					const curTime = slot.getTargeting('cm_double_time').pop();
					if (curTime) {
						multiplier = parseInt(curTime) + 0.25;
					}
					slot.setTargeting('cm_double_time', multiplier);
				}

				if (this.isSlotConditionGood(slot, log)) {
					const fireTime = new Date(
						new Date().getTime() + this.every * multiplier * 60000
					);
					this.log.info(
						'Setting refresh timer.',
						{ pos, id, multiplier },
						fireTime.toLocaleString()
					);
					this.timers.set(slot, fireTime);
				}
			}

			deleteTimer(slot) {
				if (this.timers.has(slot)) {
					this.timers.delete(slot);
				}
			}

			resetTimer(slot) {
				this.chainTimeout(slot, this.deleteTimer, this.initTimer);
			}

			tick() {
				const now = new Date();
				if (now.getTime() % 20000 < 1000) {
					log.debug('Tick', `Now: ${now.toLocaleString()}`);
				}
				if (
					this.checkGlobalConditions() ===
					this.globalConditions.RUNNING
				) {
					this.timers.forEach((fireTime, slot) => {
						const id = slot.getSlotElementId();
						const pos = slot.getTargeting('pos');
						if (now >= fireTime) {
							const condCheck = this.isSlotConditionGood(slot, {
								log: false,
							});
							if (condCheck) {
								log.info('FIRING', { pos, id });
								this.deleteTimer(slot);
								window._CMLS.adTag.refresh(slot);
							} else {
								if (
									now.getTime() % (this.every * 60000) <
									1000
								) {
									const cond = this.checkSlotConditions(slot);
									log.debug(cond, { pos, id });
								}
							}
						}
					});
				}
			}

			destroy() {
				if (this.interval) {
					clearInterval(this.interval);
					this.interval = null;
				}
			}
		}

		/*
		// Try to destroy any other instances
		let win = window.self;
		while (win) {
			try {
				win._CMLS[nameSpace].destroy();
			} catch (ignore) {}
			if (win === window.top) {
				break;
			}
			win = win.parent;
		}
		*/

		//window._CMLS[nameSpace] = new AutoRefreshAds().start();
		window._CMLS[nameSpace] = new AdRefresher();
	};

	if (window._CMLS.adPath) {
		init();
	} else {
		window.addEventListener('cmls-adpath-discovered', () => init());
	}
})(window.self);
