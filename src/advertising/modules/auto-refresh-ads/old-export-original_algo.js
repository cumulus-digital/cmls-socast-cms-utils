/**
 * Refreshes VISIBLE ads on a timer
 */
((window, undefined) => {
	const ALWAYS_REFRESH_POS = [
		'wallpaper-ad',
		...(window._CMLS?.ALWAYS_REFRESH_POS || []),
	];
	const NEVER_REFRESH_POS = [
		'pushdown',
		...(window._CMLS?.NEVER_REFRESH_POS || []),
	];

	const { isVisible: isTabVisible, addVisibilityListener } =
		window._CMLS.libs.tabVisibility;

	const scriptName = 'AUTO REFRESH ADS';
	const nameSpace = 'autoRefreshAds';
	const version = '0.4';

	const log = new window._CMLS.Logger(`${scriptName} ${version}`);

	if (window.location.search.includes('cmlsDisableAdRefresh')) {
		log.info('Disabled by cmlsDisableAdRefresh query');
		return;
	}

	if (window.DISABLE_AUTO_REFRESH_ADS) {
		log.info('Disabled locally with window.DISABLE_AUTO_REFRESH_ADS');
		return;
	}

	// Time to refresh ads in minutes
	window._CMLS.autoRefreshAdsTimer = window._CMLS?.autoRefreshAdsTimer || 1;

	// Global refresh exclusions
	window._CMLS.autoRefreshAdsExclusion =
		window._CMLS?.autoRefreshAdsExclusion || [];

	// Prevent duplicates being added to the exclusion list
	window._CMLS.autoRefreshAdsExclusion.push = function () {
		[...arguments].forEach((item) => {
			if (!this.includes(item)) {
				log.debug('New ID added to exclusion list', item);
				Array.prototype.push.apply(this, [item]);
			} else {
				log.warn(
					'Attempt to add duplicate item to autoRefreshAdsExclusion list.',
					item
				);
			}
		});
		return this.length;
	};

	function init() {
		class AutoRefreshAds {
			tabVisible = true;
			timer = null;
			fireTime = null;
			state = 'off';

			constructor(fireTime) {
				if (fireTime && fireTime instanceof Date) {
					this.fireTime = fireTime;
					this.start(this.fireTime);
				}
				const me = this;
				addVisibilityListener(() => {
					// Handle unloading
					if (isTabVisible() === -1) {
						me.tabVisible = false;
					}
					log.debug(
						'Caught visibility change',
						me.tabVisible,
						isTabVisible()
					);
					// Pase timer if tab goes away
					if (me.tabVisible && !isTabVisible() === true) {
						me.tabVisible = false;
					}
					// Restart timer if tab returns
					if (!me.tabVisible && isTabVisible() === true) {
						me.tabVisible = true;
					}
				});
				this.tabVisible = isTabVisible() === true ? true : false;
			}

			checkConditions() {
				if (window?.top?._CMLS?.autoReload?.active) {
					if (
						!window.top._CMLS.autoReload?.settings?.timeout ||
						!window.top._CMLS.autoReload?.timeout
					) {
						log.warn(
							'Could not determine AutoReloadPAGE settings, ads will not refresh.'
						);
						return -1;
					}
					// Make sure reload page timer is significant
					if (
						window.top._CMLS.autoReload.settings.timeout <
						window._CMLS.autoRefreshAdsTimer * 2
					) {
						log.warn(
							'AutoReloadPAGE timer is less than 2x our timer, ads will not refresh.'
						);
						return -1;
					}
					// Make sure we're not going to refresh the page before we can refresh ads
					if (
						this.fireTime?.getTime &&
						window.top._CMLS.autoReload.timeout?.getTime
					) {
						const diffBetweenAdsAndPageReload =
							window.top._CMLS.autoReload.timeout.getTime() -
							this.fireTime?.getTime();
						// Padding the ads timer to ensure an ad refresh doesn't
						// occur just before a page refresh
						const buffer =
							window._CMLS.autoRefreshAdsTimer * 60000 * 1.15;
						if (diffBetweenAdsAndPageReload < buffer) {
							log.info(
								'AutoReloadPAGE will fire before we will, ads will not refresh'
							);
							return -1;
						}
					}
				}
				if (window.DISABLE_AUTO_REFRESH_ADS) {
					log.info(
						'window.DISABLE_AUTO_REFRESH_ADS has been set, ads will not refresh.'
					);
					return -1;
				}
				if (!this.tabVisible) {
					log.debug('Tab is hidden.');
					return 0;
				}
				return 1;
			}

			checkTimer() {
				const condition = this.checkConditions();
				if (condition === 1) {
					const now = new Date();
					if (now.getTime() % 10000 < 1000) {
						log.debug({
							headerLength: Infinity,
							message: [
								'Checking timer',
								`Fire time: ${this.fireTime.toLocaleString()}`,
								`Now: ${now.toLocaleString()}`,
							],
						});
					}
					if (now >= this.fireTime) {
						this.fire();
						return;
					}
				}
				if (condition === -1) {
					this.stop();
					return;
				}

				this.timer = setTimeout(() => this.checkTimer(), 1000);
			}

			isElVisible(el) {
				if (!el) {
					return false;
				}
				if (typeof jQuery === 'function' && el instanceof jQuery) {
					el = el[0];
				}

				// GPT may collapse an ad we want to refresh and get a new ad from
				// So we'll quickly make it visible to get a read on it
				const styleCache = el.getAttribute('style');
				if (window.getComputedStyle(el).display === 'none') {
					el.setAttribute(
						'style',
						'display:block; width:1px; height:1px'
					);
				}
				const rect = el.getBoundingClientRect();

				el.setAttribute('style', styleCache);

				if (rect?.width > 0 && rect?.height > 0) {
					rect.width = rect?.right - rect?.left;
					rect.height = rect?.bottom - rect?.top;

					if (!rect.width || !rect.height) {
						return false;
					}

					const quarterHeight = rect.height * 0.25;
					const quarterWidth = rect.width * 0.25;

					const check = {
						top: rect?.top + quarterHeight,
						right: rect?.right - quarterWidth,
						bottom: rect?.bottom - quarterHeight,
						left: rect?.left + quarterWidth,
					};

					const winHeight =
						window.innerHeight ||
						window.document.documentElement.clientHeight;
					const winWidth =
						window.innerWidth ||
						window.document.documentElement.clientWidth;

					return (
						check.bottom >= 0 &&
						check.top <= winHeight &&
						check.right >= 0 &&
						check.left <= winWidth
					);
				}

				return false;
			}

			fire() {
				const me = this;
				if (this.checkConditions() === 1) {
					window._CMLS.adTag.queue(() => {
						log.info('Refreshing viewable page ads.');
						me.resetFireTime();

						try {
							const ads = window._CMLS.adTag.getSlots();
							const visibleSlots = ads.filter((slot) => {
								const ID = slot.getSlotElementId();
								const el = window.document.getElementById(ID);
								const pos = slot.getTargeting('pos');

								let shouldReturn = slot;

								if (
									NEVER_REFRESH_POS.every((check) =>
										pos.includes(check)
									)
								) {
									return false;
								}

								if (
									pos &&
									pos.length &&
									ALWAYS_REFRESH_POS.every((check) =>
										pos.includes(check)
									)
								) {
									shouldReturn = slot;
								}

								/*
								if (!el) {
									log.info('Element not found in page', ID);
									return false;
								}
								*/
								if (slot._cm_visible) {
									shouldReturn = slot;
								}
								if (el && me.isElVisible(el)) {
									shouldReturn = slot;
								}

								if (
									window._CMLS.autoRefreshAdsExclusion.includes(
										ID
									)
								) {
									log.info(
										'ID excluded by _CMLS.autoRefreshAdsExclusion',
										ID
									);
									return false;
								}

								return shouldReturn;
							});

							if (visibleSlots.length) {
								visibleSlots.forEach((slot) => {
									log.debug({
										pos: slot.getTargeting('pos'),
										element: slot.getSlotElementId(),
										ad_id: slot.getSlotId(),
										path: slot.getAdUnitPath(),
										sizes: slot.getSizes(),
										slot: slot,
									});
								});
								window._CMLS.adTag.refresh(visibleSlots);
							} else {
								log.info('No slots visible.');
							}
						} catch (e) {
							log.warn('Failed to refresh ads', e);
						}

						me.start();
					});
					return;
				}

				log.debug('Conditions not met, skipping this cycle.');
				me.start();
			}

			checkState() {
				return this.state;
			}

			stop() {
				log.debug('Stopping timer.');
				clearTimeout(this.timer);
				this.timer = null;
				this.fireTime = null;
				this.state = false;
			}

			pause() {
				log.debug('Pausing timer.', this.fireTime);
				clearTimeout(this.timer);
				this.timer = null;
			}

			restart() {
				log.debug('Restarting timer', this.fireTime);
				this.checkTimer();
			}

			start(fireTime) {
				this.stop();

				if (this.checkConditions() === 1) {
					if (fireTime && fireTime instanceof Date) {
						log.debug(
							'Start called with an initial fire time',
							fireTime
						);
						this.fireTime = fireTime;
					} else {
						this.resetFireTime();
					}

					log.info(
						'Starting timer, will fire at ' +
							this.fireTime.toLocaleString()
					);
					this.checkTimer();
					this.state = true;
				}

				return this;
			}

			destroy() {
				this.stop();
			}

			getFireTime() {
				return this.fireTime;
			}

			resetFireTime() {
				this.fireTime = new Date(
					new Date().getTime() +
						window._CMLS.autoRefreshAdsTimer * 60000
				);
			}
		}

		try {
			window.parent._CMLS[nameSpace].destroy();
			window._CMLS[nameSpace].destroy();
		} catch (e) {}

		window._CMLS[nameSpace] = new AutoRefreshAds();
		window._CMLS[nameSpace].start();
	}

	if (window?._CMLS?.adPath) {
		init();
	} else {
		window.addEventListener('cmls-adpath-discovered', () => init());
	}
})(window.self);
