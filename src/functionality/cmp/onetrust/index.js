import config from './config.json';

const { h, Logger, domReady, waitFor } = window.__CMLSINTERNAL.libs;
const { scriptName, nameSpace, version, defaultOptions } = config;
const log = new window.__CMLSINTERNAL.Logger(`${scriptName} Loader ${version}`);

((window, undefined) => {
	if (window?._CMLS_CMP_DISABLE_OT_OPT) {
		log.warn(
			'OneTrust custom handling disabled by _CMLS_CMP_DISABLE_OT_OPT'
		);
		return;
	}

	window._CMLS_CMP = window._CMLS_CMP || {};
	if (typeof window._CMLS_CMP?.oneTrustOptions === 'object') {
		window._CMLS_CMP.oneTrustOptions = Object.assign(
			config.defaultOptions,
			window._CMLS_CMP.oneTrustOptions
		);
	} else {
		window._CMLS_CMP.oneTrustOptions = config.defaultOptions;
	}

	log.info(
		'Initializing OneTrust alterations.',
		window._CMLS_CMP.oneTrustOptions
	);

	if (!document.getElementById('onetrust-sdk-styles')) {
		import('./styles.scss').then((style) => {
			style.default.use();
		});
	}

	if (window._CMLS_CMP.oneTrustOptions.injectFooterLink) {
		domReady(() => {
			log.info('Injecting footer link');
			if (!document.querySelector('.ot-sdk-show-settings')) {
				const footerNav = document.querySelector(
					'#playerFooter .footer-links ul,' +
						'#theFooter .footer-nav ul'
				);
				const footer_link = (
					<li>
						<a
							href="javascript:void(0)"
							class="nav-item-parent hover-effect"
						>
							<span class="hover-effect ot-sdk-show-settings">
								Cookie Preferences
							</span>
						</a>
					</li>
				);
				if (footerNav) {
					footerNav.append(footer_link);
				} else {
					document.body.append(
						<div id="ot-footer-msg">
							<div class="inner">
								<a class="ot-sdk-show-settings">
									Cookie Preferences
								</a>
							</div>
						</div>
					);
				}
			}
		});

		if (window._CMLS_CMP.oneTrustOptions.hideFloatingButton) {
			function hideFloatingButton() {
				if (!document.body) return;
				document.body.classList.remove('ot-show-floating-button');
				document.body.classList.add('ot-no-floating-button');
			}
			function showFloatingButton() {
				if (!document.body) return;
				document.body.classList.remove('ot-no-floating-button');
				document.body.classList.add('ot-show-floating-button');
			}

			hideFloatingButton();

			domReady(() => {
				hideFloatingButton();

				if (document.querySelector('#playerOverlay')) {
					showFloatingButton();
					log.info('Waiting for overlay to be dismissed.');
					waitFor(
						() => !document.querySelector('#playerOverlay'),
						9999999999,
						250
					)
						.catch(() => {
							log.debug('Overlay not dismissed.');
							hideFloatingButton();
						})
						.finally(() => {
							log.info('Overlay dismissed.');
							hideFloatingButton();
						});
				}
			});
		}
	}
})(window.self);
