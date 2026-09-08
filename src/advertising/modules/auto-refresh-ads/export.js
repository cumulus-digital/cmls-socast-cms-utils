/**
 * Auto-refresh ads.
 *
 * Each slot has its own refresh fire time, set if one or both of
 * the following conditions are met:
 * 1) impressionViewable event has previously fired on the slot
 * 2) Slot's pos targeting value is in the ALWAYS_REFRESH_POS list
 */

import config from './config.json';
import { isTruthy, includesTruthy, includesFalsy } from 'Utils/truth';

const {
	scriptName,
	nameSpace,
	version,
	defaultRefreshInMinutes,
	testForViewability,
	viewabilityRatio,
	tickInterval,
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

class AdRefresher {
	// Generate a random instance string
	instance = Math.ceil(Math.random() * 10000);

	log = null;

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
		TARGET_NEVER: `Slot has ${this.TARGET_NEVER_REFRESH_KEY} targeting.`,
		ALWAYS: 'Slot is set to always refresh.',
		TARGET_ALWAYS: `Slot has ${this.TARGET_ALWAYS_REFRESH_KEY} targeting.`,
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
	TARGET_FALSE = config.refreshNotAllowedValue;
	TARGET_SET = config.refreshSetValue;

	// Holds timers for slots
	timers = new Map();

	// Holds the interval
	interval = null;

	// Tick logging interval
	tickLogInterval = 5000;

	// Hold time of last tick log
	lastTickLogged = null;

	discoveredSlots = new Map();

	constructor(minutes = defaultRefreshInMinutes) {
		this.log = new Logger(`${scriptName} v${version} [${this.instance}]`);

		if (window?._CMLS?.autoRefreshAdsInterval > 0) {
			this.every = window._CMLS.autoRefreshAdsInterval;
		} else {
			this.every = minutes;
		}

		if (this.checkGlobalConditions() !== this.globalConditions.RUNNING) {
			log.info('Global condition check failed, will not refresh ads.');
			return false;
		}

		const adTag = window.__CMLSINTERNAL.adTag;

		this.log.debug('Gathering existing slots.');
		adTag.getSlots().forEach((slot) => {
			// Assume the slot has been requested
			this.updateLastRequested(slot);
			// If the slot has been filled, assume it has been viewable
			if (slot.getResponseInformation()) {
				this.updateLastViewableImpression(slot);
			}
		});

		this.log.debug(
			'Adding impressionViewable listener. Refresh timer will be set per-slot ' +
				'once an impression is delivered.'
		);
		adTag.addListener(
			'impressionViewable',
			this.viewableImpressionListener.bind(this)
		);
		adTag.addListener(
			'slotRequested',
			this.slotRequestedListener.bind(this)
		);

		// Check for always-refresh slots
		adTag.getSlots().forEach((slot) => {
			if (this.slotIsExcluded(slot)) {
				return;
			}
			if (
				this.slotIsAlwaysRefresh(slot) &&
				!this.slotHasRefreshSetKey(slot) &&
				!this.slotHasTimer(slot)
			) {
				this.log.debug(
					`Slot with div id ${slot.getSlotElementId()} will always refresh`,
					window.__CMLSINTERNAL.adTag.listSlotData(slot)
				);
				this.setSlotTimer(slot);
			}
		});

		adTag.addListener('slotRenderEnded', (e) => {
			const slot = e.slot;
			// Check future slots for always refreshers
			if (
				this.slotIsAlwaysRefresh(slot) &&
				!this.slotHasRefreshSetKey(slot) &&
				!this.slotHasTimer(slot)
			) {
				this.setSlotTimer(slot);
			}
		});

		this.interval = setInterval(() => {
			this.tick.call(this);
		}, tickInterval);
		this.log.debug(
			`Ticks are logged every ${this.tickLogInterval / 1000} seconds, actual tick interval is ${tickInterval / 1000} seconds.`
		);
		this.log.info('Auto-Refresh-Ads is running.');

		return this;
	}

	isTruthy(value) {
		return isTruthy(value);
	}

	includesTruthy(arr) {
		return includesTruthy(arr);
	}

	/**
	 * Checks the state of the page and browser to determine if ads should refresh
	 */
	checkGlobalConditions() {
		const { DISABLED, PAUSED, RUNNING } = this.globalConditions;
		const autoReloadPage = window.__CMLSINTERNAL?.autoReload;
		if (window.DISABLE_AUTO_REFRESH_ADS) {
			this.log.warn(
				'window.DISABLE_AUTO_REFRESH_ADS is set. Ads will not refresh.'
			);
			return DISABLED;
		}
		if (window?._CMLS?.autoRefreshAdsInterval === 0) {
			this.log.warn(
				'Auto refresh ads disabled by window._CMLS.autoRefreshAdsInterval = 0'
			);
			return DISABLED;
		}
		if (
			autoReloadPage?.active &&
			autoReloadPage.settings.timeout < this.every * 2
		) {
			this.log.warn(
				'Auto-Reload-Page timer is less than 2x Auto-Refresh-Ads timer. Ads will not refresh'
			);
			return DISABLED;
		}

		return RUNNING;
	}

	viewableImpressionListener(e) {
		const slot = e.slot;
		this.log.debug('Impression viewable', {
			elementId: slot.getSlotElementId(),
			pos: slot.getTargeting('pos'),
			refresh: slot.getTargeting(this.TARGET_REFRESH_KEY),
		});
		if (this.slotIsExcluded(slot)) {
			return;
		}
		if (!this.slotHasRefreshSetKey(slot) && !this.slotHasTimer(slot)) {
			this.setSlotTimer(slot);
		}
		this.updateLastViewableImpression(slot);
	}

	slotRequestedListener(e) {
		const slot = e.slot;
		this.log.debug('Slot requested', {
			elementId: slot.getSlotElementId(),
			pos: slot.getTargeting('pos'),
			refresh: slot.getTargeting(this.TARGET_REFRESH_KEY),
		});
		this.updateLastRequested(slot);
	}

	request;

	updateDiscoveredSlotData(slot, data = {}) {
		if (this.discoveredSlots.has(slot)) {
			data = { ...this.discoveredSlots.get(slot), ...data };
		}
		this.discoveredSlots.set(slot, data);
	}

	getDiscoveredSlotData(slot) {
		return this.discoveredSlots.get(slot);
	}

	updateLastViewableImpression(slot) {
		this.updateDiscoveredSlotData(slot, { lastViewable: new Date() });
	}

	updateLastRequested(slot) {
		this.updateDiscoveredSlotData(slot, { lastRequested: new Date() });
	}

	updateRequestWasForced(slot) {
		this.updateDiscoveredSlotData(slot, { requestWasForced: true });
	}

	isSlotViewable(slot) {
		if (!slot) return false;

		const id = slot.getSlotElementId();
		const el = document.getElementById(id);

		if (!el || el.offsetParent === null) return false;

		const rect = el.getBoundingClientRect();
		const elementWidth = rect.width;
		const elementHeight = rect.height;

		if (elementWidth === 0 || elementHeight === 0) {
			return (
				rect.top < window.innerHeight &&
				rect.bottom > 0 &&
				rect.left < window.innerWidth &&
				rect.right > 0
			);
		}

		// Calculate the overlapping dimensions between the slot and the viewport boundaries
		const overlapWidth = Math.max(
			0,
			Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0)
		);
		const overlapHeight = Math.max(
			0,
			Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
		);

		// Calculate the total area vs visible area
		const elementArea = elementWidth * elementHeight;
		const visibleArea = overlapWidth * overlapHeight;
		const elVisibility = visibleArea / elementArea;

		// Returns true only if 50% or more of the element's area is visible
		return elVisibility >= viewabilityRatio;
	}

	wouldSlotBeViewable(slot) {
		if (!slot) return false;

		const id = slot.getSlotElementId();
		const el = document.getElementById(id);

		const isDisplayNone = el.style.display === 'none';
		const isHidden = el.style.visibility === 'hidden';

		if (isDisplayNone) {
			el.style.display = 'block';
		}
		if (isHidden) {
			el.style.visibility = 'visible';
		}

		const isVisible = this.isSlotViewable(slot);

		if (isDisplayNone) {
			el.style.display = 'none';
		}
		if (isHidden) {
			el.style.visibility = 'hidden';
		}

		return isVisible;
	}

	/**
	 * Check if slot has the refresh allowed key
	 * @returns {boolean}
	 */
	slotHasRefreshKey(slot) {
		const t = slot.getTargeting(this.TARGET_REFRESH_KEY);
		return includesTruthy(t);
	}

	/**
	 * Check if slot has the refresh set key
	 * @returns {boolean}
	 */
	slotHasRefreshSetKey(slot) {
		const t = slot.getTargeting(this.TARGET_REFRESH_KEY);
		return includesTruthy(t);
	}

	/**
	 * Check if slot should always refresh
	 * @returns {boolean}
	 */
	slotIsAlwaysRefresh(slot) {
		const { ALWAYS, TARGET_ALWAYS } = this.slotConditions;
		const pos = slot.getTargeting('pos');
		const targetedAlways = includesTruthy(
			slot.getTargeting(this.TARGET_ALWAYS_REFRESH_KEY)
		);
		if (targetedAlways) {
			return TARGET_ALWAYS;
		}
		return ALWAYS_REFRESH_POS.some((check) => pos.includes(check))
			? ALWAYS
			: false;
	}

	/**
	 * Check if slot is excluded from auto-refresh
	 * @returns {boolean}
	 */
	slotIsExcluded(slot) {
		if (typeof window._CMLS.autoRefreshAdsExclusion === 'undefined') {
			window.__CMLSINTERNAL?.initAutoRefreshAdsExclusion();
		}

		const id = slot.getSlotElementId();
		if (window._CMLS.autoRefreshAdsExclusion.includes(id)) {
			return this.slotConditions.EXCLUDED;
		}

		const t = slot.getTargeting(this.TARGET_REFRESH_KEY);
		if (
			includesFalsy(t) ||
			includesTruthy(slot.getTargeting(this.TARGET_NEVER_REFRESH_KEY)) ||
			slot
				.getTargeting(this.TARGET_REFRESH_KEY)
				.includes(this.TARGET_NEVER_REFRESH_KEY)
		) {
			return this.slotConditions.EXCLUDED;
		}

		return false;
	}

	/**
	 * Check if a timer is already set for slot
	 * @returns {boolean}
	 */
	slotHasTimer(slot) {
		return this.timers.has(slot);
	}

	setSlotTimer(slot, fireTime = null) {
		const id = slot.getSlotElementId();
		const pos = slot.getTargeting('pos');
		const now = new Date();
		// Round timer to seconds
		now.setSeconds(
			now.getSeconds() + Math.max(now.getMilliseconds() / 1000)
		);
		if (fireTime === null) {
			fireTime = new Date(now.getTime() + this.every * 60000);
			this.log.debug(
				`Setting ${this.every} minute refresh timer on slot.`,
				{ pos, id },
				fireTime.toLocaleString()
			);
		}

		this.deleteSlotTimer(slot);
		this.timers.set(slot, fireTime);
		//slot.setTargeting(this.TARGET_REFRESH_KEY, this.TARGET_SET);
		slot.setConfig({
			targeting: { [this.TARGET_REFRESH_KEY]: this.TARGET_SET },
		});
	}

	deleteSlotTimer(slot) {
		if (this.timers.has(slot)) {
			clearTimeout(this.timers.get(slot));
			this.timers.delete(slot);
			if (
				this.slotHasRefreshSetKey(slot) ||
				this.slotHasRefreshKey(slot)
			) {
				//slot.setTargeting(this.TARGET_REFRESH_KEY, this.TARGET_TRUE);
				slot.setConfig({
					targeting: { [this.TARGET_REFRESH_KEY]: this.TARGET_TRUE },
				});
			}
		}
	}

	tick() {
		const now = new Date();
		if (!this.lastTickLogged) this.lastTickLogged = now;
		let logTick = false;

		// Log tick every 5 seconds
		if (
			now.getTime() >
			this.lastTickLogged.getTime() + this.tickLogInterval
		) {
			logTick = true;
			this.log.debug('Tick', now.toLocaleString(), this.instance);
			this.lastTickLogged = now;
		}

		const refreshSlots = [];
		const slotData = [];
		this.timers.forEach((fireTime, slot) => {
			if (this.slotIsExcluded(slot)) {
				this.deleteSlotTimer(slot);
				return;
			}
			if (now >= fireTime) {
				const id = slot.getSlotElementId();
				const pos = slot.getTargeting('pos');
				const isInViewport = this.isSlotViewable(slot);
				if (testForViewability && !isInViewport) {
					if (logTick) {
						this.log.debug('Not in viewport', { pos, id });
					}
					this.setSlotTimer(
						slot,
						new Date(fireTime.getTime() + 1000)
					);
				} else {
					this.log.debug('Queueing for refresh', { pos, id });
					this.deleteSlotTimer(slot);
					refreshSlots.push(slot);
					slotData.push(
						window.__CMLSINTERNAL.adTag.listSlotData(slot)
					);
				}
			}
		});

		if (refreshSlots.length) {
			this.log.info(
				`${new Date().toLocaleString()} Refreshing ${refreshSlots.length} slots`,
				slotData
			);
			window.__CMLSINTERNAL.adTag.refresh(refreshSlots);
		}

		// Check slots which haven't delivered yet
		const forceLaggingSlots = [];
		this.discoveredSlots.forEach((data, slot) => {
			const id = slot.getSlotElementId();
			if (data.lastRequested && !data.lastViewable) {
				if (
					now.getTime() >=
					data.lastRequested.getTime() + this.every * 60000
				) {
					if (this.wouldSlotBeViewable(slot)) {
						this.log.debug('Slot would be viewable', { id });
						forceLaggingSlots.push(slot);
					}
				}
			}
		});
		if (forceLaggingSlots.length) {
			forceLaggingSlots.forEach((slot) => {
				this.log.warn(
					'Forcing lagging slot',
					window.__CMLSINTERNAL.adTag.listSlotData(slot)
				);
				this.updateLastRequested(slot);
			});
			window.__CMLSINTERNAL.adTag.refresh(forceLaggingSlots);
		}
	}

	destroy() {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
		this.timers.forEach((fireTime, slot) => {
			this.deleteSlotTimer(slot);
		});
	}
}

function init() {
	window.__CMLSINTERNAL[nameSpace] = new AdRefresher();
	log.debug('Initialized.');
}

if (window.__CMLSINTERNAL.adTag) {
	init();
} else {
	window.addEventListener('cmls-adtag-loaded', () => {
		init();
	});
}
