/**
 * Amazon UAW/APS header bidder interface
 *
 * Based on GPT interface
 */
import GPTInterface from './gpt';

const allowedSizes = [
	'120x240',
	'120x600',
	'160x600',
	'250x250',
	'300x50',
	'300x100',
	'300x1050',
	'300x300',
	'300x75',
	'300x250',
	'300x600',
	'320x50',
	'320x100',
	'336x280',
	'400x300',
	'468x60',
	'728x90',
	'970x250',
	'970x90',
];
const bidTimeout = 2e3;

export default class APSInterface extends GPTInterface {
	scriptName = 'APS-GPT INTERFACE';
	version = '0.2';
	log = null;

	static identity = 'APS-GPT';

	static detectTag() {
		if (super.detectTag() && window?.apstag) {
			return true;
		}
	}

	constructor() {
		super();
		this.log = new window.__CMLSINTERNAL.Logger(
			`${this.scriptName} v${this.version}`
		);
	}

	/**
	 * @typedef {import('./DefaultInterface.js').DefineSlotOptions} DefineSlotOptions
	 */

	/**
	 * Define a slot and apply options, targeting, init, etc.
	 * @param {DefineSlotOptions} options Options for defineSlot
	 * @return {object}
	 */
	defineSlot(options) {
		const settings = Object.assign(
			this.defaultDefineSlotOptions(),
			options
		);
		if (settings?.prebid === false && !settings?.targeting?.noprebid) {
			settings.targeting.noprebid = 'noprebid';
		}
		const slot = super.defineSlot(settings);
		return slot;
	}

	/**
	 * @typedef {object} FilteredSlots
	 * @property {Slot[]} prebid Slots elligible for prebid
	 * @property {Slot[]} noprebid Slots should not be bidded
	 */

	/**
	 * Given an array of slots, return an object containing those
	 * that should or should not be elligible for prebid
	 * @param {Slot[]} slots
	 * @returns {FilteredSlots}
	 */
	filterPrebidSlots(slots) {
		const me = this;
		if (!slots) {
			me.log.warn('filterPrebidSlots called without slots');
			return;
		}
		if (!Array.isArray(slots)) {
			slots = [slots];
		}
		slots = me.filterSlots(slots);
		const filteredSlots = {
			prebid: [],
			noprebid: [],
			all: slots,
		};
		slots.forEach((slot) => {
			me.log.debug('Checking', slot.getSlotElementId());
			let isPrebid = false;

			// Only allow expected sizes in prebid
			const sizes = slot.getSizes();
			if (sizes?.length) {
				sizes.some((size) => {
					if (allowedSizes.includes(`${size.width}x${size.height}`)) {
						isPrebid = true;
						return true;
					}
				});
			} else {
				isPrebid = false;
			}

			// Exclude slots with 'noprebid' targeting parameters
			if (slot.getTargeting('noprebid')?.length) {
				isPrebid = false;
			}

			if (isPrebid) {
				try {
					filteredSlots.prebid.push(slot);
				} catch (e) {
					console.error(e);
				}
			} else {
				filteredSlots.noprebid.push(slot);
			}
		});

		return filteredSlots;
	}

	/**
	 * Refresh given slots, handling both prebid and noprebid slots
	 * @param {null|Slot[]} requestSlots
	 * @param {object?} options
	 */
	refresh(requestSlots, options = {}) {
		const me = this;
		if (!requestSlots) {
			me.log.warn('Refresh called without slots');
			return;
		}
		if (!Array.isArray(requestSlots)) {
			requestSlots = [requestSlots];
		}
		me.log.debug(
			'Refresh requested for slots',
			me.listSlotData(requestSlots)
		);

		const refreshSlots = me.filterPrebidSlots(requestSlots);
		if (!refreshSlots?.all?.length) {
			me.log.debug('No slots found for refreshing after filtering.');
			return;
		}

		if (refreshSlots?.noprebid?.length) {
			me.log.debug(
				'Refreshing noprebid slots',
				me.listSlotData(refreshSlots.noprebid),
				refreshSlots.noprebid
			);
			me.pubads().refresh(refreshSlots.noprebid);
		}

		if (refreshSlots?.prebid?.length) {
			me.log.debug(
				`🏷 Requesting bids for ${refreshSlots.prebid.length} prebid slots`,
				this.listSlotData(refreshSlots.prebid)
			);

			const apsSlots = [];
			refreshSlots.prebid.forEach((slot) => {
				apsSlots.push({
					slotID: slot.getSlotElementId(),
					slotName: slot.getAdUnitPath(),
					sizes: slot.getSizes().map((size) => {
						return [size.width, size.height];
					}),
				});
			});

			const apsconfig = {
				// Reformat GPT slot into what APS really wants
				slots: apsSlots,
				timeout: bidTimeout,
				params: {
					adRefresh: '1',
				},
			};

			const fetchBids = (apsconfig) => {
				window.apstag.fetchBids(apsconfig, (bids) => {
					me.queue(() => {
						window.apstag.setDisplayBids();
						me.log.debug(
							'🏷 Refreshing prebid slots after bids received',
							me.listSlotData(refreshSlots.prebid),
							bids,
							refreshSlots.prebid
						);
						me.pubads().refresh(refreshSlots.prebid, options);
					});
				});
			};

			fetchBids(apsconfig);
		}
	}

	/**
	 * Check if a slot has been requested
	 * @param {object} slot
	 * @return {Boolean} Returns true if slot has already been requested
	 */
	wasSlotRequested(slot) {
		const me = this;
		if (super.wasSlotRequested(slot)) {
			return true;
		}
		// Slots with an amznbid key are queued for refresh on-page already
		if (slot.getTargeting('amznbid')?.length) {
			me.log.debug('Has amznbid targeting', me.listSlotData(slot));
			return true;
		}
		return false;
	}
}
