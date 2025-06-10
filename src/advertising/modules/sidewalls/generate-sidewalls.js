/**
 * Injects "sidewall" ad units
 * Generates and injects two ad units which flank the content area when
 * the device width is large enough to display them.
 */
import { areSidewallsAllowed } from './shouldImport';
import config from './config.json';
//import './styles.scss';

((window, undefined) => {
	const { h, domReady, Logger } = window.__CMLSINTERNAL.libs;

	const {
		scriptName,
		nameSpace,
		version,
		injectPoint,
		spacingPoint,
		containerId,
		containerClass,
		sidewallClass,
		contentWidth,
	} = config;
	let { topPad, headerHeight } = config;

	const log = new Logger(`${scriptName} ${version}`);

	if (!window.__CMLSINTERNAL?.[nameSpace]) {
		window.__CMLSINTERNAL[nameSpace] = {
			container: null,
			slots: [],
			isDisabled: () => {
				if (!areSidewallsAllowed()) {
					return true;
				}

				const injectPointNode = injectPoint
					? window.document.querySelector(injectPoint)
					: null;

				if (!injectPointNode) {
					log.info('Injection point not found, exiting.');
					return true;
				}

				if (
					window.matchMedia(`(max-width: ${contentWidth + 320}px)`)
						.matches
				) {
					log.info('Device width is too narrow, exiting.');
					return true;
				}

				return false;
			},
			inject: () => {
				if (window.document.getElementById(containerId)) {
					log.info('Sidewall container already injected.');
					return;
				}

				if (window.__CMLSINTERNAL[nameSpace].isDisabled()) {
					return;
				}

				const injectPointNode = injectPoint
						? window.document.querySelector(injectPoint)
						: null,
					spacingPointNode = spacingPoint
						? window.document.querySelector(spacingPoint)
						: null,
					injectPointStyle = window.getComputedStyle(injectPointNode);

				if (!injectPointNode) {
					log.info('Injection point not found, exiting.');
					return;
				}

				// Get header height
				if (spacingPointNode) {
					const placeBox = spacingPointNode.getBoundingClientRect();
					if (
						placeBox.height &&
						placeBox.height > 0 &&
						placeBox.height < 100
					) {
						headerHeight = placeBox.height;
					}
				}

				log.debug('Injecting');

				if (
					!injectPointStyle?.position ||
					injectPointStyle.position.toLowerCase() === 'static'
				) {
					injectPointNode.style.position = 'relative';
				}

				import(
					/* webpackChunkName: 'advertising/sidewalls/style' */
					'./styles.scss'
				).then((style) => {
					if (style?.default?.use)
						style.default.use({ target: injectPointNode });
				});

				const wrapper = (
					<div
						id={containerId}
						style={`${topPad ? `--top_pad: ${topPad}px` : ''}; --header_height: ${headerHeight}px;`}
					>
						<div
							id={`${sidewallClass}-left`}
							class={sidewallClass}
						/>
						<div
							id={`${sidewallClass}-right`}
							class={sidewallClass}
						/>
					</div>
				);

				injectPointNode.appendChild(wrapper);

				log.info('Injected');
			},
			display: () => {
				if (window.__CMLSINTERNAL[nameSpace].isDisabled()) {
					return;
				}

				// Create slots!
				window.__CMLSINTERNAL.adTag.queue(() => {
					if (window.__CMLSINTERNAL[nameSpace].isDisabled()) {
						return;
					}

					let sizeMap = [
						// WidthxHeight can support up to 300x600
						[
							[contentWidth + 600, 0],
							[
								[160, 600],
								[300, 600],
							],
						],

						// WidthxHeight can only support 160x600
						[[contentWidth + 320, 0], [[160, 600]]],

						// Height can only support 300x250
						// Disabled for now...
						// [[contentWidth + 300, 0], [[300, 250]]],

						// No sidewalls otherwise.
						[[0, 0], []],
					];

					const slotCommon = {
						adUnitPath: `${window.__CMLSINTERNAL.adPath}/sidewallLeft`,
						size: [[160, 600]],
						sizeMap: sizeMap,
						div: 'cmls-sidewall-left',
						collapse: true,
						targeting: {
							pos: 'left',
						},
						prebid: true,
					};

					log.debug('Defining slot cmlsSidewallLeft');
					window.__CMLSINTERNAL[nameSpace].slots.push(
						window.__CMLSINTERNAL.adTag.defineSlot(slotCommon)
					);

					log.debug('Defining slot cmls-sidewall-right');
					window.__CMLSINTERNAL[nameSpace].slots.push(
						window.__CMLSINTERNAL.adTag.defineSlot({
							...slotCommon,
							adUnitPath: `${window.__CMLSINTERNAL.adPath}/sidewallRight`,
							div: 'cmls-sidewall-right',
							targeting: {
								pos: 'right',
							},
						})
					);

					if (window.GPT_SITE_SLOTS['cmls-sidewall-left']) {
						log.debug('Calling display for cmls-sidewall-left');
						window.__CMLSINTERNAL.adTag.display(
							'cmls-sidewall-left',
							window.__CMLSINTERNAL.adTag.isInitialLoadDisabled()
						);
					}
					if (window.GPT_SITE_SLOTS['cmls-sidewall-right']) {
						log.debug('Calling display for cmls-sidewall-right');
						window.__CMLSINTERNAL.adTag.display(
							'cmls-sidewall-right',
							window.__CMLSINTERNAL.adTag.isInitialLoadDisabled()
						);
					}
				});
			},
			destroy: () => {
				window.__CMLSINTERNAL.adTag.queue(() => {
					if (window.__CMLSINTERNAL[nameSpace]?.slots?.length) {
						log.info(
							'Destroying slots by request',
							window.__CMLSINTERNAL[nameSpace].slots
						);
						window.__CMLSINTERNAL.adTag.destroySlots(
							window.__CMLSINTERNAL[nameSpace].slots
						);
					}
				});
			},
			init: () => {
				domReady(() => {
					if (!window.__CMLSINTERNAL[nameSpace].isDisabled()) {
						if (window.__CMLSINTERNAL.adPath) {
							window.__CMLSINTERNAL[nameSpace].inject();
							window.__CMLSINTERNAL[nameSpace].display();
						} else {
							window.addEventListener(
								'cmls-adpath-discovered',
								() => {
									window.__CMLSINTERNAL[nameSpace].inject();
									window.__CMLSINTERNAL[nameSpace].display();
								}
							);
						}
					}
				});
			},
		};
	}

	window.__CMLSINTERNAL[nameSpace].init();
})(window.self);
