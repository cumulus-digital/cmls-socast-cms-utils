import config from './config.json';

const { h, Logger, domReady, waitFor } = window.__CMLSINTERNAL.libs;
const { scriptName, nameSpace, version, defaultOptions } = config;
const log = new window.__CMLSINTERNAL.Logger(`${scriptName} Loader ${version}`);

((window, undefined) => {
	if (window?._CMLS_CMP_DISABLE_OT_OPT) {
		log.warn(
			'TrustArc custom handling disabled by _CMLS_CMP_DISABLE_OT_OPT'
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
		'Initializing TrustArc customizations.',
		window._CMLS_CMP.oneTrustOptions
	);

	if (!document.getElementById('trustarc-sdk-styles')) {
		import(
			/* webpackMode: "eager" */
			/* webpackChunkName: "functionality/cmp/trustarc/styles" */
			'./styles.scss'
		).then((style) => {
			style.default.use();
		});
	}

	const injectFooterLink = () => {
		log.debug('Injecting footer link');

		const footerNav = document.querySelector(
			'#playerFooter .footer-links ul,' + '#theFooter .footer-nav ul'
		);
		if (footerNav) {
			footerNav.append(
				<li>
					<span
						id="teconsent"
						class="nav-item-parent hover-effect"
					></span>
				</li>
			);
		} else {
			document.body.append(
				<div id="te-footer-msg">
					<div class="inner">
						<span id="teconsent"></span>
					</div>
				</div>
			);
		}
	};

	const injectBanner = () => {
		log.debug('Injecting banner placeholder');
		if (!window.document.getElementById('consent-banner')) {
			window.document.body.append(<div id="consent-banner"></div>);
		}
	};

	if (window._CMLS_CMP.oneTrustOptions.injectFooterLink) {
		if (!window.document.getElementById('teconsent')) {
			injectFooterLink();
		}
	} else {
		log.info(
			'Not injecting footer link, oneTrustOptions.injectFooterLink is false'
		);
	}
	if (!window.document.getElementById('consent-banner')) {
		injectBanner();
	} else {
		log.info('Banner already exists in HTML.');
	}

    if (window._CMLS_CMP.oneTrustOptions.reloadAfterConsent) {
		// Handle reloading the page after user chooses preference
		window.addEventListener(
			'message',
			function (ev) {
				var data = null;
				try {
					data = JSON.parse(ev.data);
				} catch (e) {
					return;
				}
				if (
					data &&
					data.source === 'preference_manager' &&
					data.message === 'submit_preferences'
				) {
					setTimeout(function () {
						window.location.reload();
					}, 500);
				}
			},
			false
		);
		document.body.addEventListener('click', function (ev) {
			if (ev && ev.target && ev.target.id === 'truste-consent-button') {
				setTimeout(function () {
					window.location.reload();
				}, 500);
			}
		});
	}
})(window.self);
