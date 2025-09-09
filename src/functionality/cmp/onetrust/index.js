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

	log.debug(
		'Initializing OneTrust alterations.',
		window._CMLS_CMP.oneTrustOptions
	);

	if (!document.getElementById('onetrust-sdk-styles')) {
		import(
			/* webpackMode: "eager" */
			/* webpackChunkName: "functionality/cmp/onetrust/styles" */
			'./styles.scss'
		).then((style) => {
			style.default.use();
		});
	}

	const injectFooterLink = () => {
		log.info('Injecting footer link');

		let linkText = 'Cookie Preferences';
		if (window.OneTrust?.GetDomainData) {
			const domainData = window.OneTrust.GetDomainData();
			if (
				domainData?.CookieSettingButtonText &&
				domainData.CookieSettingButtonText !== linkText
			) {
				log.debug(
					'Using custom link text',
					domainData.CookieSettingButtonText
				);
				linkText = domainData.CookieSettingButtonText;
			}
		}

		const footerNav = document.querySelector(
			'#playerFooter .footer-links ul,' + '#theFooter .footer-nav ul'
		);
		if (footerNav) {
			footerNav.append(
				<li>
					<a
						href="javascript:void(0)"
						class="nav-item-parent hover-effect"
					>
						<span class="hover-effect ot-sdk-show-settings">
							{linkText}
						</span>
					</a>
				</li>
			);
		} else {
			document.body.append(
				<div id="ot-footer-msg">
					<div class="inner">
						<a
							href="javascript:void(0)"
							class="ot-sdk-show-settings"
						>
							{linkText}
						</a>
					</div>
				</div>
			);
		}
	};

	if (window._CMLS_CMP.oneTrustOptions.injectFooterLink) {
		waitFor(() => window.OneTrust?.GetDomainData, 1000).then(() => {
			injectFooterLink();
		});
	} else {
		log.debug(
			'Not injecting footer link, oneTrustOptions.injectFooterLink is false'
		);
	}

	if (window._CMLS_CMP.oneTrustOptions.hideFloatingButton) {
		function hideFloatingButton() {
			if (!document.body) return;
			document.body.classList.remove('ot-show-floating-button');
			document.body.classList.add('ot-hide-floating-button');
		}
		function showFloatingButton() {
			if (!document.body) return;
			document.body.classList.remove('ot-hide-floating-button');
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
						log.debug(
							'Overlay not dismissed before timeout, hiding floating OT button.'
						);
						hideFloatingButton();
					})
					.finally(() => {
						log.info(
							'Overlay dismissed, hiding floating OT button.'
						);
						hideFloatingButton();
					});
			}
		});
	}
})(window.self);
