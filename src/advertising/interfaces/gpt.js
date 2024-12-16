/**
 * Googletag interface
 */
import DefaultInterface from './DefaultInterface';

export default class GPTInterface extends DefaultInterface {
	scriptName = 'GPT INTERFACE';
	version = '0.2';
	log = null;

	listeners = {};

	static identity = 'GPT';

	static detectTag() {
		if (window.self.googletag?.pubadsReady) {
			return true;
		}
	}

	initialRequestKey = 'initial-request-made';
	inViewPercentage = 50;

	constructor() {
		super();
		this.log = new window.__CMLSINTERNAL.Logger(
			`${this.scriptName} v${this.version}`
		);

		// To prevent doInitialLoad from re-loading an ad that's already loaded,
		// we'll track all initial loads with a targeting parameter.
		const me = this;
		me.addListener('slotRequested', (e) => {
			if (
				!e.slot._cm_displayed ||
				!e.slot.getTargeting(me.initialRequestKey)?.length
			) {
				me.log.debug(
					'Setting initial request key',
					me.listSlotData(e.slot),
					e
				);
				e.slot._cm_displayed = true;
				e.slot.setTargeting(me.initialRequestKey, true);
			}
		});

		me.addListener('slotRenderEnded', (e) => {
			me.log.debug('Rendered', e);
		});

		// Track slot visbility
		me.addListener('slotVisibilityChanged', (e) => {
			const perc = e.inViewPercentage || 0;
			e.slot._cm_visiblePercent = perc;
			e.slot._cm_visible = perc >= this.inViewPercentage;
			/*
			me.log.debug(
				e.slot._cm_visible ? 'Slot is VIEWABLE' : 'Slot is HIDDEN',
				me.listSlotData(e.slot)
			);
			*/
		});
		me.addListener('impressionViewable', (e) => {
			me.log.debug('Slot is VIEWABLE', me.listSlotData(e.slot));
			e.slot._cm_visible = true;
		});
	}

	destroy() {
		for (const e in this.listeners) {
			this.listeners[e].forEach((func) => {
				this.removeListener(e, func);
			});
		}
	}

	rawInterface() {
		return window.self?.googletag;
	}

	addListener(e, func) {
		const me = this;
		this.queue(() => {
			me.listeners[e] = me.listeners[e] || [];
			me.listeners[e].push(func);
			me.pubads().addEventListener(e, func);
		});
	}

	removeListener(e, func) {
		if (this.listeners?.[e]?.includes(func)) {
			this.listeners[e].splice(this.listeners[e].indexOf(func), 1);
		}
		return this.pubads().removeEventListener(e, func);
	}

	getTargeting(key) {
		return this.pubads().getTargeting(key);
	}

	setTargeting(key, val) {
		return this.pubads().setTargeting(key, val);
	}

	/**
	 * Detect if initial load is disabled
	 * @returns {boolean}
	 */
	isInitialLoadDisabled() {
		return this.pubads().isInitialLoadDisabled();
	}

	/**
	 * Returns true if the interface is ready
	 */
	isReady() {
		return this.rawInterface().pubadsReady;
	}

	/**
	 * In our GPT-specific defineSlot, we handle sizeMapping a little
	 * differently. GPT does not properly discover the viewport size
	 * inside an iframe, so we manually resolve a given sizeMap against
	 * the real viewport and set the winning map to the base size of the
	 * slot definition.
	 *
	 * @typedef {import('./DefaultInterface.js').DefineSlotOptions} DefineSlotOptions
	 * @param {DefineSlotOptions} options
	 * @returns {object|boolean}
	 */
	defineSlot(options) {
		const me = this;
		const settings = Object.assign(
			this.defaultDefineSlotOptions(),
			options
		);

		/*
		const { h, domReady } = window.__CMLSINTERNAL.libs;

		domReady(() => {
			window.self.document
				.querySelector('.wrapper-content')
				.prepend(<div id="testing-oop" />);
			googletag.cmd.push(() => {
				// /6717/cd.WLEV.FM/testing
				googletag
					.defineOutOfPageSlot('/6717/cd.gram.fM/testing', 'testing-oop')
					.addService(googletag.pubads())
					.setTargeting('pos', 'whatever');
			});
		});

		return;
		*/

		// Allow defining an out of page slot
		let slot = false;
		if (settings.interstitial) {
			slot = this.rawInterface().defineOutOfPageSlot(
				settings.adUnitPath,
				this.rawInterface().enums.OutOfPageFormat.INTERSTITIAL
			);
		} else if (settings.outOfPage) {
			slot = this.rawInterface().defineOutOfPageSlot(
				settings.adUnitPath,
				settings.div
			);
		} else {
			const isIframed = window.self !== window.parent;

			// Allow defining sizeMapping here. GPT sizeMapping
			// does not properly discover viewport size in an
			// iframe, so we need to map sizeMapping to the
			// base slot size.
			let winningMap = settings?.size;
			if (isIframed && settings?.sizeMap?.length) {
				let sizeMap = settings.sizeMap;
				if (!Array.isArray(sizeMap)) {
					sizeMap = [sizeMap];
				}
				sizeMap.some((map) => {
					if (map.length < 2 || map[0].length < 2) {
						log.debug('Invalid map', map);
						return;
					}
					if (
						matchMedia(
							`(min-width: ${map[0][0]}px) and (min-height: ${map[0][1]}px)`
						).matches
					) {
						winningMap = map[1];
						return true;
					}
				});
			}

			if (!winningMap) {
				this.log.error(
					'defineSlot must be provided with a size property.'
				);
				return false;
			}

			this.log.debug('Winning sizemap', settings.div, winningMap);

			slot = this.rawInterface().defineSlot(
				settings.adUnitPath,
				winningMap,
				settings.div
			);

			//  If we're not in an iframe, use GPT sizeMapping if defined
			if (slot && !isIframed && settings?.sizeMap?.length) {
				slot.defineSizeMapping(settings.sizeMap);
			}
		}

		if (!slot && settings.interstitial) {
			this.log.warn('Interstitial slot did not return', settings, slot);
			return false;
		} else if (!slot) {
			this.log.error('Failed to create slot!', settings);
			return false;
		} else {
			this.log.debug('Slot created', this.listSlotData(slot));
		}

		if (settings.hasOwnProperty('collapse')) {
			if (!Array.isArray(settings.collapse)) {
				settings.collapse = [settings.collapse];
			}
			slot = slot.setCollapseEmptyDiv.apply(slot, settings.collapse);
		}

		if (settings.init) {
			slot = slot.addService(this.pubads());
		}

		settings.targeting = Array.isArray(settings.targeting)
			? settings.targeting
			: [settings.targeting];
		settings.targeting.forEach((target) => {
			for (const k in target) {
				if (target?.hasOwnProperty(k)) {
					slot = slot.setTargeting(k, target[k]);
				}
			}
		});

		this.log.debug('Defined slot', {
			slot: this.listSlotData(slot).shift(),
			settings: settings,
		});
		window.GPT_SITE_SLOTS = window.GPT_SITE_SLOTS || {};
		window.GPT_SITE_SLOTS[slot.getSlotElementId()] = slot;

		return slot;
	}

	/**
	 * Destroy given slot(s)
	 * @param {Slot[]} slots
	 * @return {boolean}
	 */
	destroySlots(slots) {
		return this.rawInterface().destroySlots(slots);
	}

	/**
	 * Return an array of all defined Slots
	 * @return {array}
	 */
	getSlots() {
		return this.pubads().getSlots();
	}

	/**
	 * Queues the display of a given slot ID
	 * @param {string|Node|object} ID div ID for ad slot, a DOM node, or the slot itself
	 * @param {Boolean|Slot} forceLoad force a call to refresh() on the slot
	 */
	display(ID, forceLoad = false) {
		const me = this;
		this.queue(() => {
			me.log.debug('Calling display', ID, forceLoad);
			me.rawInterface().display(ID);
			if (forceLoad) {
				me.log.debug('Forceload enabled for this display call');

				// Handle when ID is a DOM node for shadow DOM
				let elId = null;
				if (typeof ID === 'string') {
					elId = ID;
				} else if (ID instanceof Node) {
					elId = ID.id;
				} else if (
					typeof ID === 'object' &&
					ID?.getSlotElementId &&
					ID !== null
				) {
					elId = ID.getSlotElementId();
				}

				if (!elId) {
					me.log.warn(
						'Attempted to force initial load, but ID could not be discovered',
						{ ID, forceLoad }
					);
					return;
				}

				let slot = false;
				if (window.GPT_SITE_SLOTS?.[elId]?.getSlotElementId) {
					slot = window.GPT_SITE_SLOTS[elId];
				} else {
					const allSlots = me.getSlots();
					if (!allSlots?.length) {
						me.log.warn('No slots defined!');
						return;
					}
					allSlots.some((aslot) => {
						if (aslot.getSlotElementId() === elId) {
							slot = aslot;
							return true;
						}
					});
				}

				if (slot) {
					me.log.debug('Forcing initial load', {
						id: slot?.getSlotElementId
							? slot.getSlotElementId()
							: 'unknown!',
						slot,
					});
					me.doInitialLoad(slot);
				} else {
					me.log.warn(
						'Attempted to force initial load but slot was not defined!',
						{
							ID,
							forceLoad,
							slot,
						}
					);
				}
			}
		});
	}

	/**
	 * Refresh given slots
	 * @param {null|Slot[]} requestSlots
	 * @param {object?} options
	 */
	refresh(requestSlots, options = {}) {
		if (!requestSlots) {
			this.log.warn('Refresh called without slots');
			return;
		}
		if (!Array.isArray(requestSlots)) {
			requestSlots = [requestSlots];
		}
		const refreshSlots = this.filterSlots(requestSlots);
		if (!refreshSlots?.length) {
			this.log.debug('No slots found for refreshing after filtering.');
			return;
		}
		this.log.debug(
			'Refresh called for slots',
			this.listSlotData(refreshSlots)
		);
		return this.pubads().refresh(refreshSlots, options);
	}

	/**
	 * Check if a slot has been requested
	 * @param {object} slot
	 * @return {Boolean} Returns true if slot has already been requested
	 */
	wasSlotRequested(slot) {
		const me = this;
		if (
			slot?._displayed ||
			slot.getTargeting(me.initialRequestKey)?.length
		) {
			me.log.debug('Has initial request key', me.listSlotData(slot));
			return true;
		}
		if (slot.getResponseInformation()) {
			me.log.debug('Has response info', me.listSlotData(slot));
			return true;
		}
		const slotEl = window.self.document.getElementById(
			slot.getSlotElementId()
		);
		if (slotEl?.getAttribute('data-google-query-id')) {
			me.log.debug('Has data attribute', me.listSlotData(slot));
			return true;
		}
		return false;
	}

	/**
	 * Handle an initial ad load
	 * @param {object|array} requestSlots
	 */
	doInitialLoad(requestSlots) {
		const me = this;
		if (!requestSlots) {
			me.log.warn('doInitialLoad called without slots');
			return;
		}
		if (!Array.isArray(requestSlots)) {
			requestSlots = [requestSlots];
		}
		if (me.isInitialLoadDisabled()) {
			// We need to delay refresh for a bit in case an on-page refresh
			// has already handled it our slots...
			me.log.debug(
				'Initial load requested while initial load is disabled, this will be delayed',
				me.listSlotData(requestSlots)
			);
			setTimeout(() => {
				const notYetRequested = [],
					alreadyRequested = [];
				requestSlots.forEach((slot) => {
					if (me.wasSlotRequested(slot)) {
						alreadyRequested.push(slot);
					} else {
						notYetRequested.push(slot);
					}
				});
				if (notYetRequested.length) {
					me.log.debug(
						'Delayed initial load firing',
						me.listSlotData(notYetRequested)
					);
					me.refresh(notYetRequested);
				}
				if (alreadyRequested.length) {
					me.log.debug(
						'Slots were already requested',
						me.listSlotData(alreadyRequested)
					);
				}
			}, 500);
		} else {
			/*
			me.queue(() => {
				me.log.debug(
					'Instant initial load refresh',
					me.listSlotData(requestSlots)
				);
				me.refresh(requestSlots);
			});
			*/
		}
	}

	/**
	 * Filter given slots for those that return element IDs
	 * @param {array} requestSlots
	 */
	filterSlots(requestSlots) {
		if (!requestSlots) {
			this.log.warn('Filter called without slots', requestSlots);
			return;
		}
		if (!Array.isArray(requestSlots)) {
			requestSlots = [requestSlots];
		}
		const refreshSlots = [];
		requestSlots.forEach((slot) => {
			if (slot?.getSlotElementId()) {
				refreshSlots.push(slot);
			}
		});
		if (refreshSlots.length) {
			return refreshSlots;
		}
		return false;
	}

	/**
	 * Return API queried information about slots, good for logging
	 * @param {array|object} slots
	 * @returns {array}
	 */
	listSlotData(slots) {
		if (!Array.isArray(slots)) {
			slots = [slots];
		}
		const slotData = [];
		slots.forEach((slot) => {
			const thisSlot = {
				_cm_displayed: slot?._displayed ? 'yes' : 'no',
				div: slot?.getSlotElementId
					? slot.getSlotElementId()
					: 'unknown!',
				pos: slot?.getTargeting ? slot.getTargeting('pos') : 'unknown!',
				adUnitPath: slot?.getAdUnitPath
					? slot.getAdUnitPath()
					: 'unknown!',
				sizes: slot?.getSizes ? slot.getSizes() : 'unknown!',
				targeting: [],
				slot,
			};
			const targetingKeys = slot?.getTargetingKeys();
			if (targetingKeys?.length) {
				for (let k of targetingKeys) {
					thisSlot.targeting.push({
						[k]: slot?.getTargeting(k),
					});
				}
			}
			slotData.push(thisSlot);
		});
		return slotData;
	}
}
