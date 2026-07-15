import config from './config.json';

const { h, Logger, domReady, waitFor } = window.__CMLSINTERNAL.libs;
const { scriptName, nameSpace, version, defaultOptions } = config;
const log = new window.__CMLSINTERNAL.Logger(`${scriptName} Loader ${version}`);

((window, undefined) => {
	log.info('Initializing TrustArc');
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
		'Initializing TrustArc alterations.',
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
		log.info('Injecting footer link');

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

	if (window._CMLS_CMP.oneTrustOptions.injectFooterLink) {
		if (!window.document.getElementById('teconsent')) {
			injectFooterLink();
		}
	} else {
		log.info(
			'Not injecting footer link, oneTrustOptions.injectFooterLink is false'
		);
	}
})(window.self);
