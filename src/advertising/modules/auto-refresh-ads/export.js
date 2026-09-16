/**
 * Auto-refresh ads.
 *
 * Two cadences, by what the slot is doing:
 * - filled and viewable - `config.defaultRefreshInMinutes`, counted from the
 *   viewable impression, so a creative is never replaced mid-impression
 * - came back empty - a shorter `config.refreshUndeliveredInMilliseconds`,
 *   counted from the request, since an unfilled slot has nothing to earn
 *
 * Either slows down when the slot stops delivering, and recovers on the signal
 * it was failing: a fill clears the empty backoff, a viewable impression
 * clears the viewability one.
 *
 * One timer for the whole module, the `config.tickInterval` loop, and none
 * per slot. A slot is due when `now - refreshCycleStart` exceeds its
 * `minimumGap`, both derived on demand, so nothing can go stale when either
 * changes. `SlotData` answers may-it-refresh (`canRefresh()`,
 * `canForceRefresh()`) and is-it-due (`isDue()`), each rule documented on the
 * member that answers it; `AdRefresher.tick()` collects what is due and
 * refreshes it as one batch.
 *
 * Per-slot control is by targeting: `never_refresh`, or a falsy `refresh`,
 * opts a slot out; `always_refresh` opts it past the viewability checks but
 * not the timing. See the `neverRefresh` and `alwaysRefresh` getters.
 *
 * Public interface (all optional):
 * - `window.DISABLE_AUTO_REFRESH_ADS` - truthy disables the module
 * - `window._CMLS.autoRefreshAdsInterval` - interval in minutes, or 0 to
 *   disable; numeric strings accepted. The interval is read once at
 *   construction and floored at 30 seconds, the 0 on every tick. Re-enabling
 *   after a late 0 needs `enable()`.
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
	largeAdViewability,
	fallbackSlotHeight,
	unfilledRefresh,
	viewlessRefresh,
	returnFromHiddenDelayInMilliseconds,
	tickInterval,
	excludeFromForcedRefresh,
} = config;
let ALWAYS_REFRESH_POS = [];
if (config.ALWAYS_REFRESH_POS) {
	ALWAYS_REFRESH_POS = config.ALWAYS_REFRESH_POS;
}

// GAM throttles ad requests made less than 30 seconds apart. This is the hard
// floor every computed gap is held to, and the guard against anyone lowering
// `window._CMLS.autoRefreshAdsInterval` past what the policy allows.
const GAM_MINIMUM_REFRESH_GAP = 30000;

// Added to the floor to absorb network latency between our refresh call and
// GAM receiving it, so a gap that is legal here is still legal there.
const REFRESH_LATENCY_PAD = 5000;

/**
 * Reads `window._CMLS.autoRefreshAdsInterval`, in minutes.
 *
 * Parsed in one place so the "is it zero" and "is it a usable interval"
 * questions cannot disagree about the same value. These globals are typically
 * set from a CMS template, where a number can arrive as a string, so a numeric
 * string is accepted as readily as a number - a literal `"0"` failing to
 * disable refreshing is the kind of thing nobody notices.
 *
 * Anything that is not a usable number - absent, null, empty, non-numeric -
 * reads as "not set" rather than as zero, since only an explicit 0 means
 * disable.
 *
 * @returns {number|null} Minutes, or null when not set.
 */
function readIntervalOverride() {
	const raw = window._CMLS?.autoRefreshAdsInterval;
	if (typeof raw !== 'number' && typeof raw !== 'string') {
		return null;
	}
	if (typeof raw === 'string' && raw.trim() === '') {
		return null;
	}
	const minutes = Number(raw);
	return Number.isFinite(minutes) ? minutes : null;
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
 * Owns both refresh questions - whether a slot may refresh, and whether it is
 * due - along with the event timestamps those answers are derived from. It
 * never triggers a refresh itself; `AdRefresher` collects due slots and
 * refreshes them as one batch. Instances live in `AdRefresher.slots`, keyed by
 * `SlotData.generateDataId()`.
 */
class SlotData {
	/**
	 * `canForceRefresh()` reasons worth surfacing in the log. Everything else
	 * it can return - not due, off screen, delivering normally - is a slot
	 * behaving as designed, and logging those would bury the ones that matter.
	 */
	static LOGGED_SKIP_REASONS = [
		'notEmpty',
		'notRequested',
		'excluded',
		'neverRefresh',
	];

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

	// Pixel size of the creative currently in the slot, as `[width, height]`
	// from slotRenderEnded. Null for an empty slot or a fluid creative, which
	// reports a string rather than dimensions. Used to pick the right
	// viewability threshold for the size actually delivered.
	renderedSize = null;

	// Refreshes that came back without a creative. Reset by a fill, the signal
	// it tracks - not by a viewable impression, or a slot that started filling
	// again would stay penalised for a fill problem it no longer has.
	unfilledRefreshes = 0;

	// Refreshes of a *filled* creative that GPT never reported a viewable
	// impression for. Reset by a viewable impression, the signal it tracks.
	// Empty slots are counted by `unfilledRefreshes` instead, so the two never
	// double-count the same refresh.
	viewlessRefreshes = 0;

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
			renderedSize: this.renderedSize,
			viewable: this.viewable,
			lastRequest: this.lastRequest,
			lastResponse: this.lastResponse,
			lastRendered: this.lastRendered,
			lastViewableImpression: this.lastViewableImpression,
			refreshCycleStart: this.refreshCycleStart,
			nextRefresh: this.nextRefresh,
			unfilledRefreshes: this.unfilledRefreshes,
			viewlessRefreshes: this.viewlessRefreshes,
		};
	}

	/**
	 * Whether this slot refreshes regardless of viewability, either from
	 * `always_refresh` targeting or from its `pos` appearing in
	 * `config.ALWAYS_REFRESH_POS`.
	 *
	 * An escape hatch for slots that need to bypass our checks. It bypasses
	 * the checks only - never the timing: `isDue()` and `minimumGap` still
	 * apply, so an always-refresh slot cannot breach the request-rate floor.
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
	 * The share of a creative's area that has to be in view for GAM to count
	 * it viewable.
	 *
	 * 50% for a standard display ad, but 30% once the creative is large enough
	 * to fall under the MRC large-ad threshold - see `config.largeAdViewability`.
	 * 970x250 is exactly at that cutoff and is the smallest common size that
	 * qualifies; a 300x600 cube is 180000px, well under it, and stays at 50%.
	 *
	 * An unknown area (0) yields the standard ratio, which is the stricter of
	 * the two, so guessing wrong never counts a slot viewable that GAM would
	 * not.
	 *
	 * @param area Creative area in square pixels
	 * @returns {number} Ratio between 0 and 1
	 */
	static viewabilityRatioForArea(area = 0) {
		if (
			largeAdViewability?.minimumArea &&
			Number.isFinite(area) &&
			area >= largeAdViewability.minimumArea
		) {
			return largeAdViewability.ratio ?? viewabilityRatio;
		}
		return viewabilityRatio;
	}

	/**
	 * Area of the creative currently in the slot, in square pixels, or 0 when
	 * no fixed-size creative is rendered.
	 *
	 * @returns {number}
	 */
	get renderedArea() {
		if (!Array.isArray(this.renderedSize)) {
			return 0;
		}
		const [width, height] = this.renderedSize;
		if (!Number.isFinite(width) || !Number.isFinite(height)) {
			return 0;
		}
		return width * height;
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

			// Threshold comes from the projected area, since a large creative
			// needs a smaller share of itself on screen than a standard one.
			const isVisible =
				elVisibility >= SlotData.viewabilityRatioForArea(elementArea);

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
	 * Whether the refresh pass may consider this slot at all. Says nothing
	 * about whether it is due - see `isDue()`.
	 *
	 * This is the gate for the normal refresh pass only; the force-refresh
	 * pass has its own in `canForceRefresh()`.
	 *
	 * @returns {boolean}
	 */
	canRefresh() {
		if (this.neverRefresh) {
			return false;
		}

		if (this.alwaysRefresh) {
			return true;
		}

		return !testForViewability || this.viewable;
	}

	/**
	 * How long this slot must wait after a request before it may be requested
	 * again.
	 *
	 * Every backoff that applies is resolved here and the longest one wins, so
	 * a slot in more than one degraded state is slowed to its slowest rate
	 * rather than whichever rate happens to be checked first. Both refresh
	 * passes read this, which is what keeps them from disagreeing.
	 *
	 * - An empty slot uses the shorter undelivered gap, so a slot that failed
	 *   to fill gets another chance sooner than a full refresh interval.
	 * - `unfilledRefreshes` at the limit gives up on that shorter gap.
	 * - `viewlessRefreshes` at the limit multiplies the interval, for a slot
	 *   our geometry thinks is on screen and GPT does not.
	 *
	 * @returns {number} Milliseconds
	 */
	get minimumGap() {
		const { every, undeliveredRefreshTime } = this.adRefresher;

		let gap = this.empty ? undeliveredRefreshTime : every;

		if (
			unfilledRefresh?.limit &&
			this.unfilledRefreshes >= unfilledRefresh.limit
		) {
			gap = Math.max(gap, every);
		}

		if (
			viewlessRefresh?.limit &&
			this.viewlessRefreshes >= viewlessRefresh.limit
		) {
			gap = Math.max(gap, every * (viewlessRefresh.backoff || 1));
		}

		return gap;
	}

	/**
	 * The moment this slot's current refresh cycle started, or null if it has
	 * never been requested.
	 *
	 * The viewable impression, when there is one for the creative currently in
	 * the slot, otherwise the request itself.
	 *
	 * Counting from the impression rather than the request is what stops a slot
	 * from being refreshed out from under an impression it is in the middle of
	 * earning. GPT credits a viewable impression only after one *continuous*
	 * second at 50%, while `slotVisibilityChanged` flips `viewable` the instant
	 * the slot crosses that threshold. A below-fold slot has usually been due
	 * for minutes by the time it is scrolled into view, so counting from the
	 * request would refresh it on the very next tick - landing inside that
	 * one-second window about half the time and discarding the creative before
	 * ActiveView ever credits it. The served impression stays in the
	 * denominator and never reaches the numerator.
	 *
	 * Falling back to `lastRequest` matters too: a slot that never earns a
	 * viewable impression would otherwise never become due. It keeps refreshing
	 * on the normal interval, and `viewlessRefreshes` is what slows it down.
	 *
	 * @returns {Date|null}
	 */
	get refreshCycleStart() {
		if (!this.lastRequest) {
			return null;
		}
		if (
			this.lastViewableImpression &&
			this.lastViewableImpression > this.lastRequest
		) {
			return this.lastViewableImpression;
		}
		return this.lastRequest;
	}

	/**
	 * When this slot next becomes due, or null if it has never been requested.
	 *
	 * Derived rather than stored: the slot holds no fire time of its own, so
	 * there is nothing to go stale when `minimumGap` or `refreshCycleStart`
	 * changes underneath it. Exposed for logging and debugging.
	 *
	 * @returns {Date|null}
	 */
	get nextRefresh() {
		const start = this.refreshCycleStart;
		if (!start) {
			return null;
		}
		return new Date(start.getTime() + this.minimumGap);
	}

	/**
	 * Whether this slot's refresh cycle has run its course and it may be
	 * requested again. Says nothing about whether it *should* be - see
	 * `canRefresh()` and `canForceRefresh()`.
	 *
	 * Measured from `refreshCycleStart`, which is never earlier than
	 * `lastRequest`, so the gap between two actual ad requests is always at
	 * least `minimumGap` and usually longer. The request-rate floor therefore
	 * gets more conservative here, never less.
	 *
	 * @param now Date
	 * @returns {boolean}
	 */
	isDue(now = new Date()) {
		const start = this.refreshCycleStart;
		if (!start) {
			return false;
		}
		return now.getTime() - start.getTime() >= this.minimumGap;
	}

	/**
	 * Whether GPT has reported a viewable impression on the creative that is
	 * in this slot right now.
	 *
	 * Compared against `lastRequest` rather than merely checking for absence,
	 * so a slot that was viewable on an earlier creative but not on this one
	 * still answers false.
	 *
	 * @returns {boolean}
	 */
	hasViewableImpressionSinceRequest() {
		if (!this.lastViewableImpression || !this.lastRequest) {
			return false;
		}
		return this.lastViewableImpression >= this.lastRequest;
	}

	/**
	 * Whether the force-refresh pass should re-request this slot, and if not,
	 * why.
	 *
	 * Returning a reason rather than a bare false lets the caller bucket the
	 * skips for logging without knowing the conditions. Reasons in
	 * `SlotData.LOGGED_SKIP_REASONS` are worth investigating; the rest are a
	 * slot behaving exactly as designed.
	 *
	 * @param now Date
	 * @returns {string|null} null when the slot should be force-refreshed.
	 */
	canForceRefresh(now = new Date()) {
		if (!this.empty) {
			return 'notEmpty';
		}
		if (!this.lastRequest) {
			return 'notRequested';
		}
		if (excludeFromForcedRefresh.includes(this.slot.getSlotElementId())) {
			return 'excluded';
		}
		if (this.neverRefresh) {
			return 'neverRefresh';
		}

		// A viewable impression since the last request means the slot is
		// delivering after all. Compared against `lastRequest` rather than
		// merely checking for absence, so a slot that filled once and later
		// went empty is still picked up.
		if (this.hasViewableImpressionSinceRequest()) {
			return 'recentlyViewable';
		}
		if (!this.isDue(now)) {
			return 'notDue';
		}

		// Only ever force-refresh slots that would be on screen. Revealed,
		// because GPT has collapsed the div and it has no box to measure.
		//
		// Deliberately last: revealing writes to el.style and then reads
		// getBoundingClientRect(), which forces a synchronous reflow. Keeping it
		// behind isDue() means that cost is paid only for slots actually due,
		// not for every empty slot on every tick.
		if (!this.testViewability(true)) {
			return 'offScreen';
		}

		return null;
	}

	/**
	 * Marks the slot as having a refresh pending, in targeting only.
	 *
	 * Written the first time a slot is eligible rather than on every tick, so
	 * GAM sees the same `refresh: set` transition it saw when this was stamped
	 * by an arming step.
	 */
	markRefreshPending() {
		if (this.refreshKey.includes(AdRefresher.TARGET_SET)) {
			return;
		}
		this.refreshKey = AdRefresher.TARGET_SET;
	}

	/**
	 * Records that this slot has just been re-requested.
	 *
	 * Called for every slot in a refresh batch, before GPT is asked to fetch.
	 * Stamping `lastRequest` is what starts the next cycle, so this is also
	 * the last moment at which the outgoing creative can be judged.
	 */
	onRefreshed() {
		// Both counters are incremented here, the one place a refresh is
		// actually spent, so they cannot drift apart. They are mutually
		// exclusive by construction - a slot is either empty or it is not - and
		// an empty slot cannot earn a viewable impression to be judged on.
		if (this.empty) {
			this.increaseUnfilledRefreshCount();
		} else if (!this.hasViewableImpressionSinceRequest()) {
			// A filled creative that never earned a viewable impression is one
			// our geometry believes is on screen and GPT does not.
			this.increaseViewlessRefreshCount();
		}

		// Targeting moves from "pending" to "has refreshed". Slots that never
		// carried the key are left alone.
		const currentRefreshKey = this.refreshKey;
		if (
			currentRefreshKey.includes(AdRefresher.TARGET_SET) ||
			currentRefreshKey.includes(AdRefresher.TARGET_TRUE)
		) {
			this.refreshKey = AdRefresher.TARGET_TRUE;
		}

		this.lastRequest = new Date();
	}

	increaseUnfilledRefreshCount() {
		this.unfilledRefreshes++;
		// Warns once, on the refresh that crosses the limit, rather than on
		// every refresh after it.
		if (this.unfilledRefreshes === unfilledRefresh?.limit) {
			this.adRefresher.log.warn(
				`SlotData.increaseUnfilledRefreshCount: ${this.summary.elementId} has come back unfilled ${this.unfilledRefreshes} times, backing off.`,
				this.summary
			);
		}
	}

	zeroUnfilledRefreshCount() {
		this.unfilledRefreshes = 0;
	}

	increaseViewlessRefreshCount() {
		this.viewlessRefreshes++;
		// Warns once, on the refresh that crosses the limit, rather than on
		// every refresh after it.
		if (this.viewlessRefreshes === viewlessRefresh?.limit) {
			this.adRefresher.log.warn(
				`SlotData.increaseViewlessRefreshCount: ${this.summary.elementId} has refreshed ${this.viewlessRefreshes} times without a viewable impression, backing off.`,
				this.summary
			);
		}
	}

	zeroViewlessRefreshCount() {
		this.viewlessRefreshes = 0;
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

	// When the page most recently became visible, or null while it is hidden.
	// Tracked in `tick()` rather than from a visibilitychange listener, since
	// the tick already runs often enough to spot the transition.
	visibleSince = null;

	boundListeners = {};

	/**
	 * @param milliseconds Refresh interval. Overridden by
	 *                     `window._CMLS.autoRefreshAdsInterval`, which is
	 *                     expressed in minutes.
	 */
	constructor(milliseconds = defaultRefreshInMinutes * 60000) {
		// Allows a global override of the refresh time. A zero is handled by
		// checkGlobalConditions() as "disable", not as an interval.
		const overrideMinutes = readIntervalOverride();
		if (overrideMinutes > 0) {
			this.every = overrideMinutes * 60000;
		} else {
			this.every = milliseconds;
		}

		// Floor the interval, so a mistyped override cannot put us under the
		// policy minimum.
		if (this.every < GAM_MINIMUM_REFRESH_GAP) {
			this.log.warn(
				`Refresh interval of ${this.every}ms is below the ${GAM_MINIMUM_REFRESH_GAP / 1000}s floor, clamping.`
			);
			this.every = GAM_MINIMUM_REFRESH_GAP;
		}

		// Undelivered slots should not wait longer than a normal refresh. Held
		// above the padded floor even so: `refreshUndeliveredInMilliseconds`
		// sits deliberately over the policy minimum to absorb latency, and
		// capping it to an `every` that has just been clamped would strip that
		// margin on the one path that most needs it.
		if (this.undeliveredRefreshTime > this.every) {
			this.undeliveredRefreshTime = Math.max(
				this.every,
				GAM_MINIMUM_REFRESH_GAP + REFRESH_LATENCY_PAD
			);
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

		this.initInterval();

		this.log.info('Auto-Refresh-Ads is running.');
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

		// Re-read on every call rather than cached, so on-page code can disable
		// refreshing at any point in the page life.
		if (readIntervalOverride() === 0) {
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
		const creating = !newSlot;
		if (creating) {
			newSlot = new SlotData(this, slot);
		}
		Object.assign(newSlot, newData);
		this.slots.set(newSlot.id, newSlot);
		this.log.debug(() => [
			`${creating ? 'Creating' : 'Setting'} slot data for ${newSlot.id}`,
			newSlot.summary,
			newData,
		]);
		return this.getSlotData(slot);
	}

	/**
	 * A generic googletag.events.Event listener. Ensures a lastRequest
	 * timestamp exists, and stamps lastResponse for slotResponseReceived.
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
	 * and delivering, so it clears both backoff counters - a slot that is being
	 * seen has neither a fill problem nor a viewability one.
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
		slotData.zeroUnfilledRefreshCount();
		slotData.zeroViewlessRefreshCount();
	}

	listenForSlotRequested(e) {
		const slot = e.slot;
		let slotData = this.setSlotData(slot);
		slotData.lastRequest = new Date();
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
		// Only a fixed size is useful here; a fluid creative reports a string.
		slotData.renderedSize = Array.isArray(e.size) ? e.size : null;
		if (e.isEmpty) {
			slotData.empty = true;
		} else {
			slotData.empty = false;
			// Each counter resets on the signal it actually tracks. A fill is
			// what `unfilledRefreshes` was counting the absence of, so it
			// clears here rather than waiting on a viewable impression - a
			// slot that fills but sits below the fold has a viewability
			// problem, not a fill problem, and `viewlessRefreshes` is what
			// should be holding it.
			slotData.zeroUnfilledRefreshCount();
		}
		this.log.debug(() => ['Slot rendered', slotData.summary, e]);
	}

	/**
	 * Keeps `SlotData.viewable` current from GPT's own viewport reporting,
	 * which is cheaper and more accurate than re-measuring on every tick.
	 *
	 * This is the one place the delivered creative's size is known exactly, so
	 * the large-ad threshold applies without having to infer a size.
	 */
	listenForSlotViewable(e) {
		const slot = e.slot;
		let slotData = this.setSlotData(slot);
		if (!slotData.lastRequest) {
			slotData.lastRequest = new Date();
		}
		// GPT measures the creative that is actually rendered, so the threshold
		// can come from the delivered size rather than a guess. Falls back to
		// the standard ratio when nothing fixed-size is rendered.
		const required =
			SlotData.viewabilityRatioForArea(slotData.renderedArea) * 100;
		slotData.viewable = e.inViewPercentage >= required;
	}

	/**
	 * Ticks run every `config.tickInterval` but are only logged every
	 * `tickLogInterval`, to keep the console usable. Evaluate this once per tick
	 * and reuse the result, since the first log updates `lastTickLogged`.
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
	 * Whether the page has been visible long enough to start refreshing.
	 *
	 * A tab coming back from the background may still be settling - layout,
	 * scroll restoration, lazy content - so refreshing on the very first tick
	 * risks measuring viewability against a page that is about to move. GAM
	 * only asks that requests be at least 30s apart, not that a slot has been
	 * viewable for any length of time, so this is a short settle pause rather
	 * than a viewability guard.
	 *
	 * Also holds for the same delay on first load, where nothing can be due
	 * yet anyway.
	 *
	 * @returns {boolean}
	 */
	hasSettled() {
		if (!this.visibleSince) {
			return false;
		}
		return (
			Date.now() - this.visibleSince >=
			returnFromHiddenDelayInMilliseconds
		);
	}

	/**
	 * The refresh cycle. Runs every `config.tickInterval` milliseconds.
	 *
	 * Eligibility and timing both belong to `SlotData`; this drives the loop
	 * and batches the result. Collecting due slots and refreshing them in one
	 * `adTag.refresh()` call matters - GPT turns a batch into a single ad
	 * request, so refreshing slots one at a time would cost fill and latency.
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
		// refresh here would only spend one. Both passes are skipped wholesale,
		// including always-refresh slots, which otherwise bypass the
		// viewability check entirely.
		if (document.hidden) {
			this.visibleSince = null;
			return;
		}
		if (!this.visibleSince) {
			this.visibleSince = Date.now();
		}
		if (!this.hasSettled()) {
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

		// Refresh pass. Marks every eligible slot as pending in targeting and
		// collects the ones that are due. Doubles as our garbage collection:
		// slots whose div has left the DOM are dropped here.
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
			slotData.markRefreshPending();
			if (slotData.isDue(now)) {
				refreshSlots.push(slotData.slot);
			}
		});

		if (refreshSlots.length) {
			this.refreshSlots(refreshSlots);
		}

		// Force-refresh pass. Slots that came back empty never fire an
		// impressionViewable, and GPT has collapsed the div, so the pass above
		// can never consider them. Give them another request once their gap has
		// elapsed, as long as they would be on screen if not collapsed.
		const forceRefreshSlots = [];

		// Why a slot was passed over, collected so logging ticks emit one line
		// for the whole pass rather than one per slot. Only the reasons worth
		// investigating are kept; see `SlotData.LOGGED_SKIP_REASONS`.
		const notForcedRefreshSlots = {};
		this.slots.forEach((slotData) => {
			if (refreshSlots.includes(slotData.slot)) {
				// Already refreshed by the pass above
				return;
			}

			const reason = slotData.canForceRefresh(now);
			if (reason === null) {
				forceRefreshSlots.push(slotData.slot);
				return;
			}
			if (!SlotData.LOGGED_SKIP_REASONS.includes(reason)) {
				return;
			}
			notForcedRefreshSlots[reason] = notForcedRefreshSlots[reason] || [];
			notForcedRefreshSlots[reason].push(
				slotData.slot.getSlotElementId()
			);
		});

		let notForcedRefreshCount = 0;
		for (const ids of Object.values(notForcedRefreshSlots)) {
			notForcedRefreshCount += ids.length;
		}

		// Logged on change rather than on the tick-log timer: these buckets only
		// move on slot events, so a transition is the only thing worth seeing.
		// Recorded unconditionally so an empty tick still counts as a change and
		// the same skip list is reported again if it returns.
		const notForcedRefreshKey = JSON.stringify(notForcedRefreshSlots);
		const notForcedRefreshChanged =
			notForcedRefreshKey !== this.lastNotForcedRefresh;
		this.lastNotForcedRefresh = notForcedRefreshKey;

		if (notForcedRefreshCount && notForcedRefreshChanged) {
			this.log.debug(
				`Force-refresh check skips ${notForcedRefreshCount} slots:`,
				notForcedRefreshSlots
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
		slots.forEach((slot) => this.getSlotData(slot).onRefreshed());
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
	 * immediately. Slots keep their timestamps, so anything that came due while
	 * paused refreshes on the first tick after resuming.
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
