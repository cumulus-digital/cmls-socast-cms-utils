/**
 * Auto-refresh ads.
 *
 * Refreshes GPT ad slots on a per-slot timer, and separately re-requests
 * slots that came back empty.
 *
 * Two passes run on every tick (`config.tickInterval`):
 *
 * 1) Refresh pass - any slot that passes `SlotData.canRefresh()` is given a
 *    fire time `config.defaultRefreshInMinutes` in the future. Once that time
 *    is reached the slot is refreshed and its timer is cleared.
 * 2) Force-refresh pass - slots that rendered empty and have not delivered a
 *    viewable impression since their last request are re-requested once
 *    `config.refreshUndeliveredInMilliseconds` (capped at the refresh
 *    interval) has elapsed since that request, provided they would be
 *    viewable if GPT had not collapsed them. Each force refresh counts
 *    against the slot, and a viewable impression resets the count. After 3
 *    force refreshes without one, the slot waits the full refresh interval
 *    between attempts instead.
 *
 * A slot is excluded from both passes when any of the following is true:
 * - its div id is in `window._CMLS.autoRefreshAdsExclusion`
 * - it carries `never_refresh` targeting, or `refresh` targeting with a
 *   falsy value or the literal value `never_refresh`
 *
 * Slots carrying `always_refresh` targeting, or a `pos` value listed in
 * `config.ALWAYS_REFRESH_POS`, refresh regardless of viewability.
 *
 * Neither pass runs while the page is in a background tab, and time spent
 * hidden is added back to every armed timer, so a tab left open for an hour
 * does not come back and refresh every slot at once.
 *
 * Public interface (all optional):
 * - `window.DISABLE_AUTO_REFRESH_ADS` - truthy disables the module
 * - `window._CMLS.autoRefreshAdsInterval` - refresh interval in minutes, or 0
 *   to disable. Read once, at construction, and floored at 30 seconds.
 * - `window._CMLS.autoRefreshAdsExclusion` - array of div ids to skip. Read
 *   on every tick, so it can be appended to at any point in the page life.
 * - `window.__CMLSINTERNAL.autoRefreshAds` - the live AdRefresher instance,
 *   exposing pause/unpause/disable/enable/destroy.
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
	fallbackSlotHeight,
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

/**
 * Per-slot bookkeeping for a single googletag.Slot.
 *
 * Holds the slot's refresh timer and the event timestamps the refresh
 * decisions are made from. Instances live in `AdRefresher.slots`, keyed by
 * `SlotData.generateDataId()`.
 */
class SlotData {
	adRefresher = null;
	slot = null;

	// Last time GPT requested this slot, including our own refreshes.
	_lastRequest = null;

	_lastResponse = null;

	_lastRendered = null;

	// Last time GPT reported a viewable impression on this slot.
	_lastViewableImpression = null;

	// Cached viewability. Kept current by the slotVisibilityChanged listener;
	// computed on first read for slots that have not fired that event yet.
	_viewable = null;

	// When this slot is next due to refresh, or null if no timer is armed.
	nextRefresh = null;

	// Last computed value of the matching getter. Not used as a cache - the
	// getters recompute every call so late targeting and exclusion-list
	// changes take effect - but kept as an escape hatch for reading the last
	// known value without paying for the recompute.
	_alwaysRefresh = null;
	_neverRefresh = null;

	// Whether the last render came back without a creative. Defaults to true
	// so a slot that never renders at all is still eligible for the
	// force-refresh pass.
	empty = true;

	unfilledRefreshes = 0;

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
			element: document.getElementById(this.slot.getSlotElementId()),
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
			unfilledRefreshes: this.unfilledRefreshes,
		};
	}

	/**
	 * Whether this slot refreshes regardless of viewability, either from
	 * `always_refresh` targeting or from its `pos` appearing in
	 * `config.ALWAYS_REFRESH_POS`.
	 *
	 * @returns {boolean}
	 */
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

	/**
	 * Whether this slot is excluded from refreshing, by the public exclusion
	 * list or by targeting.
	 *
	 * Deliberately recomputed on every call rather than cached: the exclusion
	 * list is public and may be appended to long after the slot is first seen.
	 * `_neverRefresh` only suppresses repeat logging.
	 *
	 * @returns {boolean}
	 */
	get neverRefresh() {
		const alreadyKnown = this._neverRefresh === true;
		const id = this.slot.getSlotElementId();

		// Check if excluded
		if (window._CMLS?.autoRefreshAdsExclusion?.includes(id)) {
			if (!alreadyKnown) {
				this.adRefresher.log.debug(() => [
					'Slot excluded from refresh by public exclusion',
					this.summary,
				]);
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
			t.includes(AdRefresher.TARGET_NEVER_REFRESH_KEY) ||
			t.includes(AdRefresher.TARGET_FALSE)
		) {
			if (!alreadyKnown) {
				this.adRefresher.log.debug(() => [
					'Slot excluded from refresh by targeting',
					this.summary,
				]);
			}
			this._neverRefresh = true;
			return true;
		}

		this._neverRefresh = false;
		return false;
	}

	/**
	 * Cached viewability, seeded from a geometry test the first time it is
	 * read and kept current thereafter by the slotVisibilityChanged listener.
	 *
	 * @returns {boolean}
	 */
	get viewable() {
		if (this._viewable === null) {
			this._viewable = SlotData.testViewability(this.slot);
		}
		return this._viewable;
	}
	set viewable(val = false) {
		this._viewable = !!val;
	}

	// The timestamp setters below all default to "now" when passed a falsy
	// value, so callers can write `slotData.lastRequest = null` to stamp it.

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

	/**
	 * Reads and writes the slot's `refresh` targeting on the live GPT slot.
	 *
	 * The getter returns googletag's raw array; in practice the key only ever
	 * carries a single value. The setter takes that single value.
	 */
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
	 * The largest size this slot could render at the current viewport.
	 *
	 * Tallest wins, widest breaks a tie: height is what decides whether a
	 * creative crosses the fold, and the largest candidate is the worst case
	 * for viewability, which is the one worth gating a refresh on.
	 *
	 * @param slot googletag.Slot
	 * @returns {{width: number, height: number}|null} null for a slot with no
	 *          fixed size, such as an out-of-page or fluid-only slot.
	 */
	static getLargestSlotSize(slot = null) {
		if (
			!SlotData.isGoogleSlot(slot) ||
			typeof slot.getSizes !== 'function'
		) {
			return null;
		}

		// Viewport dimensions are passed explicitly so that a slot carrying a
		// size mapping resolves here the same way it does when GPT requests
		// it, rather than depending on what GPT last measured.
		const sizes =
			slot.getSizes(window.innerWidth, window.innerHeight) || [];

		let largest = null;
		sizes.forEach((size) => {
			// `width`/`height` is the shape the rest of the ad stack reads
			// these with; see interfaces/aps-gpt.js. The numeric guard is what
			// drops the 'fluid' string and any zero-area entry.
			const width = size?.width;
			const height = size?.height;
			if (!Number.isFinite(width) || !Number.isFinite(height)) return;
			if (width <= 0 || height <= 0) return;
			if (
				!largest ||
				height > largest.height ||
				(height === largest.height && width > largest.width)
			) {
				largest = { width, height };
			}
		});

		return largest;
	}

	/**
	 * The assumed creative height for a slot that reports no size of its own.
	 *
	 * Out-of-page and fluid slots return nothing usable from `getSizes()`,
	 * which would leave the viewability test with no box to measure and drop it
	 * back to bare viewport intersection - where a collapsed slot one pixel
	 * above the fold counts as viewable. A conservative minimum height stands
	 * in instead: still a guess, but one that requires roughly half of it to be
	 * on screen rather than a single pixel.
	 *
	 * Height only. A block-level slot reports its container's width even when
	 * collapsed, so the element's own measurement beats anything guessed here.
	 *
	 * Evaluated per call rather than cached so a rotation or resize is picked
	 * up. `config.fallbackSlotHeight` may be null to disable the fallback.
	 *
	 * @returns {number} 0 when no fallback is configured.
	 */
	static getFallbackHeight() {
		if (!fallbackSlotHeight) {
			return 0;
		}
		if (
			fallbackSlotHeight.matchMedia &&
			window.matchMedia(fallbackSlotHeight.matchMedia).matches
		) {
			return fallbackSlotHeight.matched || 0;
		}
		return fallbackSlotHeight.default || 0;
	}

	/**
	 * The box a delivered creative would occupy, for a slot that does not
	 * currently have a measurable one.
	 *
	 * A collapsed slot has no height, so its own geometry says nothing about
	 * how much of the viewport a creative would cover - measuring it directly
	 * would treat a slot one pixel above the fold as fully viewable, when the
	 * creative that arrives would hang almost entirely below it. Any zero
	 * dimension is therefore replaced with the slot's largest configured size.
	 *
	 * The projection grows down and to the right from the element's current
	 * top-left corner. A collapsed div is out of flow, so that corner is where
	 * a creative would be inserted: it pushes the content below it down and
	 * leaves everything above it where it is. That does not hold for a slot
	 * centred by a flex or grid parent, or absolutely positioned, where the
	 * box would instead grow around the element.
	 *
	 * Each dimension is filled in independently, from the slot's own sizes
	 * where GPT reports them and from `getFallbackHeight()` where it does not,
	 * so a slot that measures in one axis but not the other keeps the real
	 * measurement for the axis it has.
	 *
	 * @param slot googletag.Slot
	 * @param rect The element's current DOMRect
	 * @returns {{top: number, left: number, right: number, bottom: number,
	 *           width: number, height: number}|null} null when neither the
	 *          element, the slot's sizes, nor the configured fallback yield a
	 *          dimension.
	 */
	static projectSlotBox(slot = null, rect = null) {
		if (!rect) {
			return null;
		}

		// Already measurable, nothing to project.
		if (rect.width > 0 && rect.height > 0) {
			return rect;
		}

		let width = rect.width;
		let height = rect.height;

		const size = SlotData.getLargestSlotSize(slot);
		if (size) {
			if (width <= 0) width = size.width;
			if (height <= 0) height = size.height;
		}

		if (height <= 0) {
			height = SlotData.getFallbackHeight();
		}

		// Last resort for a slot with no measurable width at all, which a
		// block-level element in flow should never be. Viewport width makes the
		// horizontal term of the area ratio neutral rather than inventing a
		// clipping edge that is not there.
		if (width <= 0) {
			width = window.innerWidth;
		}

		if (width <= 0 || height <= 0) {
			return null;
		}

		return {
			top: rect.top,
			left: rect.left,
			right: rect.left + width,
			bottom: rect.top + height,
			width,
			height,
		};
	}

	/**
	 * Checks if a provided slot is within the viewport by at
	 * least `config.viewabilityRatio`
	 *
	 * When GPT fails to fill a slot it collapses the div with an inline
	 * `display: none`, which leaves the element with no box to measure. Pass
	 * `reveal` to un-hide the div for the duration of the measurement and
	 * restore it afterwards, answering "would this slot be viewable if GPT had
	 * not collapsed it". The restore runs in a `finally` so the div is never
	 * left visible if an early return or a throw happens mid-measure.
	 *
	 * Revealing the div does not give it a height, since there is no creative
	 * inside it to give it one, so the dimensions measured against the
	 * viewport come from `SlotData.projectSlotBox()` rather than straight from
	 * the element.
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
			const box = SlotData.projectSlotBox(slot, rect);

			if (!box) {
				// Nothing to measure and nothing to stand in for it, which
				// means `config.fallbackSlotHeight` has been disabled. Bare
				// intersection with the viewport is then the most that can
				// honestly be said about a slot of unknowable size.
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
				Math.min(box.right, window.innerWidth) - Math.max(box.left, 0)
			);
			const overlapHeight = Math.max(
				0,
				Math.min(box.bottom, window.innerHeight) - Math.max(box.top, 0)
			);

			// Calculate the total area vs visible area
			const elementArea = box.width * box.height;
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

	/**
	 * Whether the refresh pass should consider this slot on this tick.
	 *
	 * Note this is the gate for the normal refresh pass only; the
	 * force-refresh pass in `AdRefresher.tick` applies its own conditions.
	 *
	 * @returns {boolean}
	 */
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

	increaseUnfilledRefreshCount() {
		this.unfilledRefreshes++;
		if (this.unfilledRefreshes > 3) {
			this.adRefresher.log.warn(
				`SlotData.increaseUnfilledRefreshCount: Unfilled refresh count for ${this.summary.elementId} has exceeded 3.`,
				this.summary
			);
		}
	}

	decreaseUnfilledRefreshCount() {
		if (this.unfilledRefreshes > 0) {
			this.unfilledRefreshes--;
		}
	}

	zeroUnfilledRefreshCount() {
		this.unfilledRefreshes = 0;
	}
}

/**
 * Drives the refresh cycle for every slot on the page.
 *
 * One instance is created per page load and published at
 * `window.__CMLSINTERNAL[config.nameSpace]`. It discovers the slots that
 * already exist, listens for later ones, and runs `tick()` on an interval.
 */
class AdRefresher {
	// Generate a random instance string. Logged with every line so overlapping
	// instances are distinguishable if one is ever left running.
	instance = Math.ceil(Math.random() * 10000);

	log = new Logger(`${scriptName} ${version} [${this.instance}]`);

	every = defaultRefreshInMinutes * 60000;
	undeliveredRefreshTime = config.refreshUndeliveredInMilliseconds;

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

	// Serialized force-refresh skip list from the last tick, so that line is
	// logged on change rather than on a timer.
	lastNotForcedRefresh = null;

	// When the page was last hidden, or null while it is visible. Used to push
	// armed refresh timers forward by however long the tab spends backgrounded.
	hiddenSince = null;

	boundListeners = {};

	// Held separately from `boundListeners`: those are googletag events removed
	// through the adTag interface, this one is a DOM event on `document`.
	boundVisibilityListener = null;

	/**
	 * @param milliseconds Refresh interval. Overridden by
	 *                     `window._CMLS.autoRefreshAdsInterval`, which is
	 *                     expressed in minutes.
	 */
	constructor(milliseconds = defaultRefreshInMinutes * 60000) {
		// Allows a global override of the refresh time
		if (window?._CMLS?.autoRefreshAdsInterval > 0) {
			this.every = window._CMLS.autoRefreshAdsInterval * 60000;
		} else {
			this.every = milliseconds;
		}

		// Floor the interval. Anything at or below the tick rate would refresh
		// on every tick, so a mistyped override cannot run away.
		if (this.every < 30000) {
			this.log.warn(
				`Refresh interval of ${this.every}ms is below the 30s floor, clamping.`
			);
			this.every = 30000;
		}

		// Undelivered refresh time cannot be longer than the refresh interval
		if (this.undeliveredRefreshTime > this.every) {
			this.undeliveredRefreshTime = this.every;
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

			if (adTag.wasSlotRequested(slot)) {
				slotData.lastRequest = new Date();
			}

			// If the slot has been filled, assume it has been viewable
			if (slot.getResponseInformation()) {
				slotData.lastViewableImpression = new Date();
				slotData.empty = false;
			}

			// Check for always-refresh slots and set their timer immediately.
			// Gated on lastRequest so we never stamp refresh targeting onto a
			// slot's initial request - the tick skips unrequested slots anyway,
			// and the slotRequested listener arms them once they are requested.
			if (slotData.alwaysRefresh && slotData.lastRequest) {
				this.log.debug(
					`Slot ${slot.getSlotElementId()} is set to always refresh. Setting timer immediately`,
					slotData.summary
				);
				this.setSlotTimer(slot);
			}
		});

		this.log.debug('Setting up listeners...');
		this.boundListeners = {
			impressionViewable: this.listenForViewableImpressions.bind(this),
			slotOnload: this.genericSlotListener.bind(this, 'slotOnload'),
			slotRenderEnded: this.listenForSlotRenderEnded.bind(this),
			slotRequested: this.listenForSlotRequested.bind(this),
			slotResponseReceived: this.genericSlotListener.bind(
				this,
				'slotResponseReceived'
			),
			slotVisibilityChanged: this.listenForSlotViewable.bind(this),
		};
		Object.entries(this.boundListeners).forEach(([e, fn]) =>
			adTag.addListener(e, fn)
		);

		this.boundVisibilityListener =
			this.listenForVisibilityChange.bind(this);
		document.addEventListener(
			'visibilitychange',
			this.boundVisibilityListener
		);
		// The page may already be in a background tab by the time we load, in
		// which case no visibilitychange fires until it is brought forward.
		if (document.hidden) {
			this.hiddenSince = new Date();
		}

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

	/**
	 * Starts the tick interval, unless the global conditions refuse.
	 *
	 * Callers must set `this.state` before calling: `checkGlobalConditions()`
	 * both reads and writes it, so a stale PAUSED or DISABLED value here would
	 * silently prevent the interval from starting.
	 */
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

	/**
	 * @returns {SlotData|undefined} Existing data for the slot, if any.
	 */
	getSlotData(slot) {
		if (!SlotData.isGoogleSlot(slot)) {
			throw new Error('getSlotData must be passed a googletag.Slot');
		}
		return this.slots.get(SlotData.generateDataId(slot));
	}

	/**
	 * Creates the slot's data if it does not exist yet, applies `newData` to
	 * it, and returns it. Called with no `newData` purely to get-or-create.
	 *
	 * `newData` keys are assigned, so accessor-backed properties such as
	 * `lastRequest` and `refreshKey` run their setters.
	 *
	 * @returns {SlotData}
	 */
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

	/**
	 * A generic googletag.events.Event listener, used solely to ensure
	 * that a lastRequest timestamp is set.
	 *
	 * Logs the div id rather than a full summary: the listeners that actually
	 * act on an event already log the slot's state, and these two fire on
	 * every creative load.
	 *
	 * @param eventName Bound per event, since the handler is shared
	 * @param e googletag.events.Event
	 */
	genericSlotListener(eventName, e) {
		const slot = e.slot;
		let slotData = this.setSlotData(slot);
		if (!slotData.lastRequest) {
			slotData.lastRequest = new Date();
		}
		if (eventName === 'slotResponseReceived') {
			slotData.lastResponse = new Date();
		}
		this.log.debug(`Slot ${eventName}`, slot.getSlotElementId());
	}

	/**
	 * A viewable impression is the signal that a slot is genuinely on screen
	 * and filled, so it arms the refresh timer if nothing has armed it yet.
	 */
	listenForViewableImpressions(e) {
		const slot = e.slot;
		let slotData = this.setSlotData(slot);
		this.log.debug(() => ['Impression viewable', slotData.summary]);
		slotData.lastViewableImpression = new Date();
		if (!slotData.lastRequest) {
			slotData.lastRequest = new Date();
		}
		if (slotData.neverRefresh) {
			return;
		}
		if (!slotData.nextRefresh) this.setSlotTimer(slot);
		slotData.zeroUnfilledRefreshCount();
	}

	listenForSlotRequested(e) {
		const slot = e.slot;
		let slotData = this.setSlotData(slot);
		slotData.lastRequest = new Date();
		if (slotData.nextRefresh) this.setSlotTimer(slot);
		this.log.debug(() => ['Slot requested', slotData.summary]);
	}

	/**
	 * Records whether the render delivered a creative. `e.isEmpty` is the
	 * authoritative signal that GPT is about to collapse the div, and is what
	 * the force-refresh pass keys off.
	 */
	listenForSlotRenderEnded(e) {
		const slot = e.slot;
		let slotData = this.setSlotData(slot);
		if (!slotData.lastRequest) {
			slotData.lastRequest = new Date();
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
		this.log.debug(() => ['Slot rendered', slotData.summary, e]);
	}

	/**
	 * Keeps `SlotData.viewable` current from GPT's own viewport reporting,
	 * which is cheaper and more accurate than re-measuring on every tick.
	 */
	listenForSlotViewable(e) {
		const slot = e.slot;
		let slotData = this.setSlotData(slot);
		if (!slotData.lastRequest) {
			slotData.lastRequest = new Date();
		}
		const viewable = e.inViewPercentage;
		if (viewable >= viewabilityRatio * 100) {
			slotData.viewable = true;
		} else {
			slotData.viewable = false;
		}
	}

	/**
	 * Keeps refresh timers honest across a backgrounded tab.
	 *
	 * Refresh timers are wall-clock, and nothing in a hidden tab can record a
	 * viewable impression. Left alone, a tab parked in the background would
	 * come back with every armed timer long expired and refresh the whole page
	 * at once - a burst of requests aimed at a reader who is still scrolling.
	 * Time spent hidden is added back to every armed timer instead, so each
	 * slot still gets a full interval of foreground time before it refreshes.
	 *
	 * Timers are only adjusted on the way back to visible, so the arithmetic
	 * happens once per background stint rather than once per tick.
	 */
	listenForVisibilityChange() {
		if (document.hidden) {
			if (!this.hiddenSince) {
				this.hiddenSince = new Date();
			}
			return;
		}

		if (!this.hiddenSince) {
			return;
		}

		const hiddenFor = Date.now() - this.hiddenSince.getTime();
		this.hiddenSince = null;

		if (hiddenFor <= 0) {
			return;
		}

		this.slots.forEach((slotData) => {
			if (!slotData.nextRefresh) return;
			slotData.nextRefresh = new Date(
				slotData.nextRefresh.getTime() + hiddenFor
			);
		});

		this.log.debug(
			`Page was hidden for ${Math.round(hiddenFor / 1000)}s, armed refresh timers pushed forward to match.`
		);
	}

	/**
	 * Arms the slot's refresh timer and marks it as pending in targeting.
	 *
	 * @param slot googletag.Slot
	 * @param fireTime When to refresh. Defaults to `this.every` from now.
	 */
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

	/**
	 * Disarms the slot's refresh timer and moves its targeting from "pending"
	 * to "has refreshed". Slots that never carried the key are left alone.
	 */
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

	/**
	 * Ticks run every second but are only logged every `tickLogInterval`, to
	 * keep the console usable. Evaluate this once per tick and reuse the
	 * result, since the first log updates `lastTickLogged`.
	 *
	 * @returns {boolean}
	 */
	tickShouldLog(now = new Date()) {
		if (!this.lastTickLogged) return true;
		return (
			now.getTime() > this.lastTickLogged.getTime() + this.tickLogInterval
		);
	}

	/**
	 * The refresh cycle. Runs every `config.tickInterval` milliseconds.
	 */
	tick() {
		if (this.isDestroyed()) return;

		if (this.state === this.globalStates.DISABLED) {
			return;
		}

		if (this.state === this.globalStates.PAUSED) {
			return;
		}

		if (this.checkGlobalConditions() !== this.globalStates.RUNNING) {
			return;
		}

		// A slot in a hidden tab cannot record a viewable impression, so a
		// refresh here would only spend one. Both passes below are skipped
		// wholesale, including the always-refresh slots that otherwise bypass
		// the viewability check. `listenForVisibilityChange` covers the gap.
		if (document.hidden) {
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

		// Refresh pass. Arms a timer on any slot eligible to refresh, and
		// collects the ones whose timer has come due. Doubles as our garbage
		// collection: slots whose div has left the DOM are dropped here.
		const refreshSlots = [];
		this.slots.forEach((slotData) => {
			if (
				document.getElementById(slotData.slot.getSlotElementId()) ===
				null
			) {
				this.slots.delete(slotData.id);
				return;
			}
			if (!slotData.lastRequest) {
				// Defined but never requested, nothing to refresh yet...
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

		// Force-refresh pass. Slots that came back empty never fire an
		// impressionViewable, and GPT has collapsed the div, which makes them
		// unviewable by definition - so the refresh pass above can never arm
		// them. Give them another request once the refresh interval has
		// elapsed, as long as they would be on screen if not collapsed.
		const forceRefreshSlots = [];

		// Why a slot was passed over, collected so logging ticks emit one line
		// for the whole pass rather than one per slot. Only tracks the reasons
		// worth investigating - a slot skipped because it is not yet due, was
		// already refreshed above, or is off screen is behaving as designed.
		const notForcedRefreshSlots = {
			notEmpty: [],
			notRequested: [],
			excluded: [],
			neverRefresh: [],
		};
		this.slots.forEach((slotData) => {
			if (!slotData.empty) {
				notForcedRefreshSlots.notEmpty.push(slotData);
				return;
			}
			if (!slotData.lastRequest) {
				notForcedRefreshSlots.notRequested.push(slotData);
				return;
			}
			if (refreshSlots.includes(slotData.slot)) {
				// Already refreshed by the pass above
				return;
			}
			if (
				excludeFromForcedRefresh.includes(
					slotData.slot.getSlotElementId()
				)
			) {
				notForcedRefreshSlots.excluded.push(slotData);
				return;
			}
			if (slotData.neverRefresh) {
				notForcedRefreshSlots.neverRefresh.push(slotData);
				return;
			}

			// Require that no viewable impression has landed since the last
			// request. Compared against lastRequest rather than merely checking
			// for absence, so a slot that filled once and later went empty is
			// still picked up here.
			if (
				slotData.lastViewableImpression &&
				slotData.lastViewableImpression >= slotData.lastRequest
			) {
				return;
			}

			// If the slot has been unfilled 3 times in a row, use the stanard
			// refresh time.
			let unfilledRefreshTime = this.undeliveredRefreshTime;
			if (slotData.unfilledRefreshes >= 3) {
				unfilledRefreshTime = this.every;
			}

			// Require that the last request was at least
			// config.refreshUndeliveredInMilliseconds ago
			if (
				now.getTime() - slotData.lastRequest.getTime() <=
				unfilledRefreshTime
			) {
				return;
			}

			// Only ever force-refresh slots that would be on screen
			if (!SlotData.testViewability(slotData.slot, true)) {
				return;
			}

			slotData.increaseUnfilledRefreshCount();
			forceRefreshSlots.push(slotData.slot);
		});
		// Div ids rather than full summaries: this line answers "which slots did
		// we pass over, and why", and the per-event listeners already log each
		// slot's full state.
		const notForcedRefreshSlotsSummary = {};
		let notForcedRefreshCount = 0;

		for (const [reason, slots] of Object.entries(notForcedRefreshSlots)) {
			if (!slots.length) continue;
			notForcedRefreshSlotsSummary[reason] = slots.map((slotData) =>
				slotData.slot.getSlotElementId()
			);
			notForcedRefreshCount += slots.length;
		}

		// Logged on change rather than on the tick-log timer: these buckets only
		// move on slot events, so a transition is the only thing worth seeing.
		// Recorded unconditionally so an empty tick still counts as a change and
		// the same skip list is reported again if it returns.
		const notForcedRefreshKey = JSON.stringify(
			notForcedRefreshSlotsSummary
		);
		const notForcedRefreshChanged =
			notForcedRefreshKey !== this.lastNotForcedRefresh;
		this.lastNotForcedRefresh = notForcedRefreshKey;

		if (notForcedRefreshCount && notForcedRefreshChanged) {
			this.log.debug(
				`Force-refresh check skips ${notForcedRefreshCount} slots:`,
				notForcedRefreshSlotsSummary
			);
		}
		if (forceRefreshSlots.length) {
			this.refreshSlots(
				forceRefreshSlots,
				`Force refreshing ${forceRefreshSlots.length} slots`
			);
		}
	}

	/**
	 * Refreshes the given slots and resets their bookkeeping.
	 *
	 * @param slots One googletag.Slot or an array of them
	 * @param logline Overrides the default log message
	 */
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

	/**
	 * Stops refreshing but leaves the interval running, so `unpause()` resumes
	 * immediately. Timers already armed keep their fire times.
	 */
	pause() {
		this.throwIfDestroyed();
		this.state = this.globalStates.PAUSED;
	}

	/**
	 * Resumes after `pause()`, restarting the interval if one is not already
	 * running. Assigns the state first: `initInterval()` re-checks the global
	 * conditions, which short-circuit on a stale PAUSED state.
	 */
	unpause() {
		this.throwIfDestroyed();
		this.state = this.globalStates.RUNNING;
		if (!this.interval) this.initInterval();
	}

	/**
	 * Stops refreshing and tears down the interval. Reversible via `enable()`,
	 * which re-checks the global conditions before restarting.
	 */
	disable() {
		this.throwIfDestroyed();
		this.state = this.globalStates.DISABLED;
		this.clearInterval();
	}

	/**
	 * Resumes after `disable()`, rebuilding the interval. Assigns the state
	 * before calling `initInterval()`, which may legitimately set it back to
	 * DISABLED if a global condition still refuses.
	 */
	enable() {
		this.throwIfDestroyed();
		this.state = this.globalStates.RUNNING;
		this.initInterval();
	}

	/**
	 * Permanently retires this instance: stops the interval and unregisters
	 * every listener. Idempotent, and every other lifecycle method throws
	 * afterwards. Listeners are removed by the same bound references they were
	 * added with, which is why `boundListeners` is held rather than rebound.
	 */
	destroy() {
		if (this.isDestroyed()) return;

		this.disable();
		this.state = this.globalStates.DESTROYED;

		const adTag = window.__CMLSINTERNAL.adTag;
		Object.entries(this.boundListeners).forEach(([e, fn]) =>
			adTag.removeListener(e, fn)
		);

		if (this.boundVisibilityListener) {
			document.removeEventListener(
				'visibilitychange',
				this.boundVisibilityListener
			);
			this.boundVisibilityListener = null;
		}
	}
}

/**
 * Replaces any existing instance, so a double include cannot leave two
 * refreshers ticking against the same slots.
 */
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
