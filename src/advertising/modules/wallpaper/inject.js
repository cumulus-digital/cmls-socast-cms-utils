import config from './config.json';

const log = new window.__CMLSINTERNAL.Logger(
	`${config.scriptName} ${config.version}`
);

((window, undefined) => {
	const { h, domReady } = window.__CMLSINTERNAL.libs;

	class WallpaperAd {
		/** @type {Window} */
		context = window.self;

		pos = config.pos;
		divId = config.divId;
		containerId = `${config.divId}-container`;
		injectPoint = config.injectPoint;
		obstructions = config.obtructions;

		adTag;
		slot;

		/** @type {HTMLDivElement} */
		container;

		/** @type {HTMLDivElement} */
		slotDiv;

		nosidewalls;

		constructor() {
			log.info('Initializing wallpaper ad.');

			this.context = window.self;
			this.adTag = window.__CMLSINTERNAL.adTag;

			if (!this.testConditions()) {
				return false;
			}

			if (!this.context.matchMedia(config.matchMedia).matches) {
				log.info(
					'Device does not match restrictions, will not inject.'
				);
				return false;
			} else {
				domReady(() => this.generateSlot());
			}
		}

		testConditions() {
			let injectPoint = this.injectPoint;
			let injectBefore = false;
			if (this.injectPoint.includes('::before')) {
				injectBefore = true;
				injectPoint = injectPoint.replace('::before', '');
			}
			const hasInjectPoint =
				this.context.document.querySelector(injectPoint);
			if (!hasInjectPoint) {
				log.warn('Inject point not found!');
				return false;
			}

			if (this.slot) {
				log.warn('Slot already exists!');
				return false;
			}

			const hasExisting = this.adTag.getSlots().some((slot) => {
				return slot.getTargeting('pos').includes(this.pos);
			});
			if (hasExisting) {
				log.info(
					'In-page wallpaper slot already exists, will not inject.'
				);
				return false;
			}

			return true;
		}

		generateSlot() {
			let injectPoint = this.injectPoint;
			let injectBefore = false;
			if (this.injectPoint.includes('::before')) {
				injectBefore = true;
				injectPoint = injectPoint.replace('::before', '');
			}

			injectPoint = this.context.document.querySelector(injectPoint);

			if (!injectPoint) {
				log.warn('Inject point not found!');
				return false;
			}

			log.debug('Generating slot');
			const style = import(
				/* webpackChunkName: "advertising/wallpaper/oop" */
				'./style.scss'
			).then((style) => {
				if (style?.default?.use) {
					style.default.use({
						target: this.context.document.body,
					});
				}
			});

			this.container = <div id={`${this.containerId}`} />;
			this.slotDiv = <div id={`${this.divId}`} />;
			this.container.appendChild(this.slotDiv);
			if (injectBefore) {
				injectPoint.before(this.container);
			} else {
				injectPoint.prepend(this.container);
			}

			this.adTag.queue(() => {
				this.slot = this.adTag.defineSlot({
					outOfPage: true,
					adUnitPath: window.__CMLSINTERNAL.adPath + '/wallpaper',
					div: this.divId,
					size: [[1, 1]],
					collapse: true,
					targeting: {
						pos: this.pos,
						noprebid: 'noprebid',
					},
				});
				if (!this.slot) {
					log.error('Could not define slot!');
					return;
				}

				this.adTag.addListener('slotRenderEnded', (e) => {
					if (e.slot !== this.slot) return;
					if (e.isEmpty) {
						log.debug('Slot is empty.');
						this.hideAdSlot();
						return;
					}
					window._CMLS.autoRefreshAdsExclusion =
						window._CMLS.autoRefreshAdsExclusion || [];
					window._CMLS.autoRefreshAdsExclusion.push(
						this.slot.getSlotElementId()
					);

					this.handleCreative();
				});

				this.adTag.display(
					this.slotDiv,
					this.adTag.isInitialLoadDisabled()
				);
				log.info('Slot created.');
			});
		}

		hideAdSlot() {
			this.container.classList.remove('delivered');
			this.context.document.body.classList.remove('has-wallpaper-ad');
		}

		showAdSlot() {
			this.container.classList.add('delivered');
			this.context.document.body.classList.add('has-wallpaper-ad');
		}

		handleCreative() {
			const iframe = this.slotDiv.querySelector('iframe');
			if (!iframe) {
				log.warn('Could not find iframe in slot div!');
				this.hideAdSlot();
				return false;
			}

			const iDoc = iframe.contentWindow.document;
			if (!iDoc) {
				log.warn(
					'Could not access iframe document! Are you using a safeframe?'
				);
			} else {
				this.centerIframeContent(iframe);
				this.getBackgroundColorFromImage(iframe);
			}

			this.showAdSlot();
			this.clearObstructions();
		}

		clearObstructions() {
			this.context.NO_SIDEWALLS = true;
			if (window.__CMLSINTERNAL?.sidewallAds?.destroy) {
				log.debug('Destroying injected sidewall ads');
				window.__CMLSINTERNAL.sidewallAds.destroy();
			}

			if (!this.obstructions) return;

			const obstructions = this.context.document.querySelectorAll(
				this.obstructions
			);
			if (obstructions.length === 0) {
				return;
			}

			const ads = [];
			obstructions.forEach((obstruction) => {
				const adEls = obstruction.querySelectorAll(
					'[id^="div-gpt-ad"],[data-google-query-id],iframe[id^="google_ads_iframe"]'
				);
				if (adEls?.length) {
					adEls.forEach((adEl) => {
						let ad = adEl;
						if (ad.nodeName === 'iframe') {
							ad = adEl.parentNode;
						}
						ads.push(ad.id);
					});
				}
			});
			if (ads.length) {
				const slots = [];
				this.adTag.getSlots().forEach((slot) => {
					if (ads.includes(slot.getSlotElementId())) {
						slots.push(slot);
					}
				});
				if (slots.length) {
					log.debug('Destroying ads in obstructions', slots);
					this.adTag.destroySlots(slots);
				}
			}
			log.debug('Removing obstructions', obstructions);
			obstructions.forEach((obstruction) => {
				obstruction.remove();
			});
		}

		centerIframeContent(iframe) {
			const iDoc = iframe.contentWindow.document;
			if (!iDoc) {
				log.warn(
					'Could not access iframe document! Are you using a safeframe?'
				);
				return false;
			}

			const a = iDoc.querySelector('a[href*="/pcs/click"]');
			if (a) {
				a.style.display = 'flex';
				a.style.justifyContent = 'center';
				a.style.width = '100%';
				a.style.height = '100%';
			}
		}

		getBackgroundColorFromImage(iframe) {
			const iDoc = iframe.contentWindow.document;
			if (!iDoc) {
				log.warn(
					'Could not access iframe document! Are you using a safeframe?'
				);
				return false;
			}

			const a = iDoc.querySelector('a[href*="/pcs/click"]');
			if (
				a.style.backgroundColor &&
				a.style.backgroundColor !== 'none' &&
				a.style.backgroundColor !== 'transparent'
			) {
				log.info('Using background color from a tag.');
				iDoc.body.style.backgroundColor = a.style.backgroundColor;
				return;
			}

			// Check for a specified background color in the ad
			const bgColorEl = iDoc.querySelector('[data-bgcolor]');
			if (bgColorEl && bgColorEl.getAttribute('data-bgcolor')) {
				let bgColor = bgColorEl.getAttribute('data-bgcolor');
				log.info(
					'Using background color from creative data-bgcolor attribute.',
					bgColor
				);
				iDoc.body.style.backgroundColor = bgColor;
				return;
			}

			// Get color from center of image
			const slotImg = iDoc.querySelector(
				'.img_ad,img[src]:not([width="1"]):not([width="0"])'
			);
			if (!slotImg) {
				log.debug('Could not find .img_ad!');
				return;
			}

			log.debug('Attempting to discover color from image', slotImg);
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => {
				const canvas = <canvas />;
				const ctx = canvas.getContext('2d');
				const w = img.naturalWidth || img.offsetWidth || img.width;
				const h = img.naturalHeight || img.offsetHeight || img.height;
				const center = {
					x: w / 2,
					y: h / 2,
				};

				canvas.width = w;
				canvas.height = h;
				this.context.drawImage(img, 0, 0);

				const pixel = ctx.getImageData(center.x, center.y, 1, 1);
				if (!pixel.data) {
					log.debug('Could not get pixel data!');
					return;
				}

				const color = pixel.data.slice(0, 3);
				log.info('Setting background color from image', color);

				iDoc.body.style.backgroundColor = `rgb(${color.join(',')})`;
			};
			img.src = slotImg.src;
		}
	}

	if (window?.__CMLSINTERNAL?.adPath) {
		window.__CMLSINTERNAL[config.nameSpace] = new WallpaperAd();
	} else {
		window.addEventListener('cmls-adpath-discovered', () => {
			window.__CMLSINTERNAL[config.nameSpace] = new WallpaperAd();
		});
	}
})(window.self);
