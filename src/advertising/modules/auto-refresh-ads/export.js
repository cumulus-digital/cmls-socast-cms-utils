/**
 * Auto-refresh ads.
 *
 * Auto-refresh ads on a per-slot basis. Also refreshes slots which
 * did not deliver an impression.
 *
 * Each slot has its own refresh fire time, set if one or both of
 * the following conditions are met:
 * 1) impressionViewable event has previously fired on the slot
 * 2) Slot's pos targeting value is in the ALWAYS_REFRESH_POS list
 */

import config from './config.json';
import { includesTruthy, includesFalsy } from 'Utils/truth';

const {
	scriptName,
	nameSpace,
	version,
	defaultRefreshInMinutes,
	testForViewability,
	viewabilityRatio,
	tickInterval,
	excludeFromForcedRefresh,
} = config;
let ALWAYS_REFRESH_POS = [];
if (config.ALWAYS_REFRESH_POS) {
	ALWAYS_REFRESH_POS = config.ALWAYS_REFRESH_POS;
}

const { Logger } = window.__CMLSINTERNAL.libs;
const log = new Logger(`${scriptName} ${version}`);

/**
 * Public access exclusion from refresh
 *
 * Allows adding a div IDs to an exclusion list. Those divs will not
 * be refreshed.
 */
if (!window.__CMLSINTERNAL.initAutoRefreshAdsExclusion) {
	window.__CMLSINTERNAL.initAutoRefreshAdsExclusion = () => {
		window._CMLS = window._CMLS || {};
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

class SlotData {
	adRefresher = null;
	slot = null;

	_lastRequest = null;

	_lastResponse = null;

	_lastRendered = null;

	_lastViewableImpression = null;

	_viewable = null;

	nextRefresh = null;

	_alwaysRefresh = null;
	_neverRefresh = null;

	empty = true;

	constructor(adRefresher, slot) {
		if (!adRefresher) {
			throw new Error('SlotData must be constructed with an AdRefresher');
		}
		this.adRefresher = adRefresher;

		if (!SlotData.isGoogleSlot(slot)) {
			throw new Error(
				'SlotData must be constructed from a googletag.Slot'
			);
		}
		this.slot = slot;
	}

	get id() {
		return SlotData.generateDataId(this.slot);
	}

	get summary() {
		return {
			elementId: this.slot.getSlotElementId(),
			pos: this.slot.getTargeting('pos'),
			refresh: this.slot.getTargeting(AdRefresher.TARGET_REFRESH_KEY),
			empty: this.empty,
			viewable: this.viewable,
			lastRequest: this.lastRequest,
			lastResponse: this.lastResponse,
			lastRendered: this.lastRendered,
			lastViewableImpression: this.lastViewableImpression,
			nextRefresh: this.nextRefresh,
		};
	}

	get alwaysRefresh() {
		const pos = this.slot.getTargeting('pos');
		const targetedAlways = includesTruthy(
			this.slot.getTargeting(AdRefresher.TARGET_ALWAYS_REFRESH_KEY)
		);
		if (targetedAlways) {
			this._alwaysRefresh = true;
			return true;
		}
		this._alwaysRefresh = ALWAYS_REFRESH_POS.some((check) =>
			pos.includes(check)
		)
			? true
			: false;
		return this._alwaysRefresh;
	}

	get neverRefresh() {
		const alreadyKnown = this._neverRefresh === true;
		const id = this.slot.getSlotElementId();

		// Check if excluded
		if (window._CMLS?.autoRefreshAdsExclusion?.includes(id)) {
			if (!alreadyKnown) {
				this.adRefresher.log.debug(
					'Slot excluded from refresh by public exclusion',
					this.summary
				);
			}
			this._neverRefresh = true;
			return true;
		}

		const t = this.slot.getTargeting(AdRefresher.TARGET_REFRESH_KEY);
		if (
			includesFalsy(t) ||
			includesTruthy(
				this.slot.getTargeting(AdRefresher.TARGET_NEVER_REFRESH_KEY)
			) ||
			t.includes(AdRefresher.TARGET_NEVER_REFRESH_KEY)
		) {
			if (!alreadyKnown) {
				this.adRefresher.log.debug(
					'Slot excluded from refresh by targeting',
					this.summary
				);
			}
			this._neverRefresh = true;
			return true;
		}

		this._neverRefresh = false;
		return false;
	}

	get viewable() {
		if (this._viewable === null) {
			this._viewable = SlotData.testViewability(this.slot);
		}
		return this._viewable;
	}
	set viewable(val = false) {
		this._viewable = !!val;
	}

	get lastRequest() {
		return this._lastRequest;
	}
	set lastRequest(val = null) {
		if (!val) {
			val = new Date();
		}
		this._lastRequest = val;
	}

	get lastResponse() {
		return this._lastResponse;
	}
	set lastResponse(val = null) {
		this._lastResponse = val;
	}

	get lastRendered() {
		return this._lastRendered;
	}
	set lastRendered(val = null) {
		if (!val) {
			val = new Date();
		}
		this._lastRendered = val;
	}

	get lastViewableImpression() {
		return this._lastViewableImpression;
	}
	set lastViewableImpression(val = null) {
		if (!val) {
			val = new Date();
		}
		this._lastViewableImpression = val;
	}

	get refreshKey() {
		return this.slot.getTargeting(AdRefresher.TARGET_REFRESH_KEY);
	}
	set refreshKey(val = null) {
		this.slot.setConfig({
			targeting: {
				[AdRefresher.TARGET_REFRESH_KEY]: val,
			},
		});
	}

	static isGoogleSlot(slot) {
		return (
			slot &&
			typeof slot === 'object' &&
			typeof slot.getAdUnitPath === 'function' &&
			typeof slot.getSlotElementId === 'function'
		);
	}

	static generateDataId(slot = null) {
		if (!SlotData.isGoogleSlot(slot)) {
			throw new Error('generateDataId must be passed a googletag.Slot');
		}
		return `${slot.getSlotElementId()}__${slot.getAdUnitPath()}`;
	}
	generateDataId() {
		return SlotData.generateDataId(this.slot);
	}

	/**
	 * Checks if a provided slot is within the viewport by at
	 * least `config.viewabilityRatio`
	 *
	 * @param slot googletag.Slot
	 * @param reveal Force element to be visible before testing
	 * @returns {boolean}
	 */
	static testViewability(slot = null, reveal = false) {
		if (!SlotData.isGoogleSlot(slot)) {
			throw new Error(
				'SlotData.testViewability must be passed a googletag.Slot'
			);
		}

		const id = slot.getSlotElementId();
		const el = document.getElementById(id);

		if (!el) {
			return false;
		}

		const cachedDisplay = el.style.display;
		const cachedVisibility = el.style.visibility;
		const isDisplayNone = cachedDisplay === 'none';
		const isHidden = cachedVisibility === 'hidden';

		try {
			if (reveal === true) {
				if (isDisplayNone) {
					el.style.display = 'block';
				}
				if (isHidden) {
					el.style.visibility = 'visible';
				}
			}

			if (
				typeof el.checkVisibility === 'function' &&
				!el.checkVisibility()
			) {
				return false;
			}

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
				Math.min(rect.bottom, window.innerHeight) -
					Math.max(rect.top, 0)
			);

			// Calculate the total area vs visible area
			const elementArea = elementWidth * elementHeight;
			const visibleArea = overlapWidth * overlapHeight;
			const elVisibility = visibleArea / elementArea;

			// Returns true only if 50% or more of the element's area is visible
			const isVisible = elVisibility >= viewabilityRatio;

			return isVisible;
		} finally {
			if (reveal === true) {
				el.style.display = cachedDisplay;
				el.style.visibility = cachedVisibility;
			}
		}
	}
	testViewability(reveal = false) {
		return SlotData.testViewability(this.slot, reveal);
	}

	canRefresh() {
		if (this.neverRefresh) {
			this.nextRefresh = null;
			return false;
		}

		if (this.alwaysRefresh) {
			return true;
		}

		if (testForViewability && !this.viewable) {
			/*
			this.adRefresher.log.debug(
				'SlotData.canRefresh: Slot is not viewable',
				this.summary
			);
			*/
			return false;
		} else {
			/*
			this.adRefresher.log.debug(
				'SlotData.canRefresh: Slot is viewable',
				this.summary
			);
			*/
			return true;
		}
	}
}

class AdRefresher {
	// Generate a random instance string
	instance = Math.ceil(Math.random() * 10000);

	log = new Logger(`${scriptName} ${version} [${this.instance}]`);

	every = defaultRefreshInMinutes * 60000;

	// Global state of the ad refresher
	globalStates = {
		DESTROYED: 'This Auto-Refresh-Ads instance has been destroyed',
		DISABLED: 'Auto-Refresh-Ads is disabled',
		PAUSED: 'Auto-Refresh-Ads is paused',
		RUNNING: 'Auto-Refresh-Ads is running',
	};

	state = null;

	// Targeting key set for slots which should refresh on the next cycle
	static TARGET_REFRESH_KEY = config.refreshKey;

	// Targeting key set for slots which ALWAYS refresh
	static TARGET_ALWAYS_REFRESH_KEY = config.refreshAlwaysKey;

	// Targeting key set for slots which NEVER refresh
	static TARGET_NEVER_REFRESH_KEY = config.refreshNeverKey;

	static TARGET_TRUE = config.refreshAllowedValue;
	static TARGET_FALSE = config.refreshNotAllowedValue;
	static TARGET_SET = config.refreshSetValue;

	// Holds data on all discovered slots
	slots = new Map();

	// Holds our tick interval
	interval = null;

	// How often to log ticks, in milliseconds
	tickLogInterval = 5000;

	// Holds time of last tick log
	lastTickLogged = null;

	boundListeners = {};

	constructor(milliseconds = defaultRefreshInMinutes * 60000) {
		// Allows a global override of the refresh time
		if (window?._CMLS?.autoRefreshAdsInterval > 0) {
			this.every = window._CMLS.autoRefreshAdsInterval * 60000;
		} else {
			this.every = milliseconds;
		}

		if (this.checkGlobalConditions() !== this.globalStates.RUNNING) {
			log.info(
				'Global condition check failed, will not refresh ads.',
				this.state
			);
			return;
		}

		const adTag = window.__CMLSINTERNAL.adTag;

		// Get the existing slots
		this.log.debug('Gathering existing slots.');
		adTag.getSlots().forEach((slot) => {
			let slotData = this.setSlotData(slot);

			slotData.lastRequest = new Date();

			// If the slot has been filled, assume it has been viewable
			if (slot.getResponseInformation()) {
				slotData.lastViewableImpression = new Date();
				slotData.empty = false;
			}

			// Check for always-refresh slots and set their timer immediately
			if (slotData.alwaysRefresh) {
				this.log.debug(
					`Slot ${slot.getSlotElementId()} is set to always refresh. Setting timer immediately`,
					slotData.summary
				);
				this.setSlotTimer(slot);
			}
		});

		this.log.debug('Setting up listeners...');
		this.boundListeners = {
			slotRequested: this.listenForSlotRequested.bind(this),
			impressionViewable: this.listenForViewableImpressions.bind(this),
			slotRenderEnded: this.listenForSlotRenderEnded.bind(this),
			slotVisibilityChanged: this.listenForSlotViewable.bind(this),
		};
		Object.entries(this.boundListeners).forEach(([e, fn]) =>
			adTag.addListener(e, fn)
		);

		this.initInterval();

		this.log.info('Auto-Refresh-Ads is running.');

		return this;
	}

	clearInterval() {
		if (this.interval) {
			clearInterval(this.interval);
			this.interval = null;
		}
	}

	initInterval() {
		if (this.checkGlobalConditions() !== this.globalStates.RUNNING) {
			return;
		}
		this.clearInterval();
		this.interval = setInterval(this.tick.bind(this), tickInterval);
		this.log.debug(
			`Ticks are logged every ${this.tickLogInterval / 1000}s to reduce log noise, actual tick interval is ${tickInterval / 1000}s.`
		);
	}

	/**
	 * Checks the state of the page and browser to determine if ads should refresh
	 * @returns {string} matching this.globalStates
	 */
	checkGlobalConditions() {
		const { DISABLED, PAUSED, RUNNING } = this.globalStates;
		const autoReloadPage = window.__CMLSINTERNAL?.autoReload;

		if (window.DISABLE_AUTO_REFRESH_ADS) {
			this.log.warn(
				'window.DISABLE_AUTO_REFRESH_ADS is set. Ads will not refresh.'
			);
			this.state = DISABLED;
			return DISABLED;
		}

		if (window._CMLS?.autoRefreshAdsInterval === 0) {
			this.log.warn(
				'Auto refresh ads disabled by window._CMLS.autoRefreshAdsInterval = 0'
			);
			this.state = DISABLED;
			return DISABLED;
		}

		if (
			autoReloadPage?.active &&
			autoReloadPage.settings.timeout < this.every * 2
		) {
			this.log.warn(
				'Auto-Reload-Page timer is less than 2x Auto-Refresh-Ads timer. Ads will not refresh'
			);
			this.state = DISABLED;
			return DISABLED;
		}

		if (this.state === PAUSED) {
			return PAUSED;
		}

		this.state = RUNNING;
		return RUNNING;
	}

	getSlotData(slot) {
		if (!SlotData.isGoogleSlot(slot)) {
			throw new Error('getSlotData must be passed a googletag.Slot');
		}
		return this.slots.get(SlotData.generateDataId(slot));
	}

	setSlotData(slot, newData = {}) {
		if (!SlotData.isGoogleSlot(slot)) {
			throw new Error('setSlotData must be passed a googletag.Slot');
		}
		let newSlot = this.getSlotData(slot);
		if (!newSlot) {
			this.log.debug(
				`Creating slot data for ${SlotData.generateDataId(slot)}`,
				newData
			);
			newSlot = new SlotData(this, slot);
		} else {
			this.log.debug(`Setting slot data for ${newSlot.id}`, newData);
		}
		Object.assign(newSlot, newData);
		this.slots.set(newSlot.id, newSlot);
		return this.getSlotData(slot);
	}

	listenForSlotRequested(e) {
		const slot = e.slot;
		let slotData = this.setSlotData(slot);
		slotData.lastRequest = new Date();
		this.log.debug('Slot requested', slotData.summary);
	}

	listenForViewableImpressions(e) {
		const slot = e.slot;
		let slotData = this.setSlotData(slot);
		this.log.debug('Impression viewable', slotData.summary);
		slotData.lastViewableImpression = new Date();
		if (!slotData.lastRequest) {
			slotData.lastRequest = new Date();
		}
		if (slotData.neverRefresh) {
			return;
		}
		if (!slotData.nextRefresh) this.setSlotTimer(slot);
	}

	listenForSlotRenderEnded(e) {
		const slot = e.slot;
		let slotData = this.getSlotData(slot);
		if (!slotData) {
			slotData = this.setSlotData(slot, { lastRequest: new Date() });
		}
		slotData.lastRendered = new Date();
		if (e.isEmpty) {
			slotData.empty = true;
		} else {
			slotData.empty = false;
		}
		if (slotData.canRefresh() && !slotData.nextRefresh) {
			this.setSlotTimer(slot);
		}
		this.log.debug('Slot rendered', slotData.summary);
	}

	listenForSlotViewable(e) {
		const slot = e.slot;
		let slotData = this.getSlotData(slot);
		if (!slotData) {
			slotData = this.setSlotData(slot, { lastRequest: new Date() });
		}
		const viewable = e.inViewPercentage;
		if (viewable >= viewabilityRatio * 100) {
			slotData.viewable = true;
		} else {
			slotData.viewable = false;
		}
	}

	setSlotTimer(slot, fireTime = null) {
		const slotData = this.getSlotData(slot);

		const now = new Date();

		// Round timer to seconds
		now.setSeconds(
			now.getSeconds() + Math.ceil(now.getMilliseconds() / 1000)
		);
		now.setMilliseconds(0);

		if (fireTime === null) {
			fireTime = new Date(now.getTime() + this.every);
		}

		slotData.refreshKey = AdRefresher.TARGET_SET;
		slotData.nextRefresh = fireTime;
	}

	deleteSlotTimer(slot) {
		const slotData = this.getSlotData(slot);
		slotData.nextRefresh = null;
		const currentRefreshKey = slotData.refreshKey;
		if (
			currentRefreshKey.includes(AdRefresher.TARGET_SET) ||
			currentRefreshKey.includes(AdRefresher.TARGET_TRUE)
		) {
			slotData.refreshKey = AdRefresher.TARGET_TRUE;
		}
	}

	tickShouldLog(now = new Date()) {
		if (!this.lastTickLogged) return true;
		return (
			now.getTime() > this.lastTickLogged.getTime() + this.tickLogInterval
		);
	}

	tick() {
		if (this.isDestroyed()) return;

		if (this.state === this.globalStates.DISABLED) {
			return;
		}

		if (this.state === this.globalStates.PAUSED) {
			return;
		}

		const now = new Date();
		const logTick = this.tickShouldLog(now);
		if (!this.lastTickLogged) this.lastTickLogged = now;

		if (logTick) {
			this.log.debug(
				'Tick',
				now.toLocaleString(),
				`${this.slots.size} slots`
			);
			this.lastTickLogged = now;
		}

		const refreshSlots = [];
		this.slots.forEach((slotData) => {
			if (
				document.getElementById(slotData.slot.getSlotElementId()) ===
				null
			) {
				this.slots.delete(slotData.id);
				return;
			}
			if (!slotData.canRefresh()) {
				return;
			}
			if (!slotData.nextRefresh) {
				this.setSlotTimer(slotData.slot);
				return;
			}
			if (now >= slotData.nextRefresh) {
				refreshSlots.push(slotData.slot);
			}
		});

		if (refreshSlots.length) {
			this.refreshSlots(refreshSlots);
		}

		// Check for slots which haven't delivered creative past the refresh interval.
		// We look at their last request time, and if it's been longer than
		// the refresh interval, we refresh them.
		const forceRefreshSlots = [];
		this.slots.forEach((slotData) => {
			if (!slotData.empty) {
				if (logTick) {
					this.log.debug(
						'Slot is not empty, not forcing refresh',
						slotData.summary
					);
				}
				return;
			}
			if (!slotData.lastRequest) {
				if (logTick) {
					this.log.debug(
						'Slot has no last request, not forcing refresh',
						slotData.summary
					);
				}
				return;
			}
			if (refreshSlots.includes(slotData.slot)) {
				// Slot has already been refreshed
				return;
			}
			if (
				excludeFromForcedRefresh.includes(
					slotData.slot.getSlotElementId()
				)
			) {
				return;
			}
			if (slotData.neverRefresh) {
				if (logTick) {
					this.log.debug(
						'Slot is neverRefresh, not forcing refresh',
						slotData.summary
					);
				}
				return;
			}
			if (
				!slotData.lastViewableImpression ||
				slotData.lastViewableImpression < slotData.lastRequest
			) {
				// Slot has never delivered a viewable impression
				if (
					now.getTime() - slotData.lastRequest.getTime() >
					this.every
				) {
					// Only ever force-refresh viewable slots
					if (SlotData.testViewability(slotData.slot, true)) {
						forceRefreshSlots.push(slotData.slot);
					}
				}
			}
		});
		if (forceRefreshSlots.length) {
			this.refreshSlots(
				forceRefreshSlots,
				`Force refreshing ${forceRefreshSlots.length} slots`
			);
		}
	}

	refreshSlots(slots, logline = null) {
		if (!Array.isArray(slots)) {
			slots = [slots];
		}
		if (!slots.length) return;
		if (!logline) logline = `Refreshing ${slots.length} slots`;
		this.log.info(
			logline,
			new Date().toLocaleString(),
			slots.map((slot) => this.getSlotData(slot).summary)
		);
		slots.forEach((slot) => {
			this.deleteSlotTimer(slot);
			this.setSlotData(slot, {
				lastRequest: new Date(),
			});
		});
		window.__CMLSINTERNAL.adTag.refresh(slots);
	}

	isDestroyed() {
		return this.state === this.globalStates.DESTROYED;
	}

	throwIfDestroyed() {
		if (this.isDestroyed()) {
			throw new Error(this.globalStates.DESTROYED);
		}
	}

	pause() {
		this.throwIfDestroyed();
		this.state = this.globalStates.PAUSED;
	}

	unpause() {
		this.throwIfDestroyed();
		this.state = this.globalStates.RUNNING;
		if (!this.interval) this.initInterval();
	}

	disable() {
		this.throwIfDestroyed();
		this.state = this.globalStates.DISABLED;
		this.clearInterval();
	}

	enable() {
		this.throwIfDestroyed();
		this.state = this.globalStates.RUNNING;
		this.initInterval();
	}

	destroy() {
		if (this.isDestroyed()) return;

		this.disable();
		this.state = this.globalStates.DESTROYED;

		const adTag = window.__CMLSINTERNAL.adTag;
		Object.entries(this.boundListeners).forEach(([e, fn]) =>
			adTag.removeListener(e, fn)
		);
	}
}

function init() {
	window.__CMLSINTERNAL[nameSpace]?.destroy?.();
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
