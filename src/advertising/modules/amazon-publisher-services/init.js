import waitFor from 'Utils/waitFor';
import Logger from 'Utils/Logger';

import config from './config.json';
const log = new Logger('APS / Init');

window.cmlsAds = window.cmlsAds || {};

export default function apsInit() {
	if (window.apstag) {
		log.error('APS library already loaded!');
		return;
	}

	// load the apstag.js library
	// prettier-ignore
	!function (a9, a, p, s, t, A, g) { if (a[a9]) return; function q(c, r) { a[a9]._Q.push([c, r]) } a[a9] = { init: function () { q("i", arguments) }, fetchBids: function () { q("f", arguments) }, setDisplayBids: function () { }, targetingKeys: function () { return [] }, _Q: [] }; A = p.createElement(s); A.async = !0; A.src = t; g = p.getElementsByTagName(s)[0]; g.parentNode.insertBefore(A, g) }("apstag", window, document, "script", "//c.amazon-adsystem.com/aax2/apstag.js");

	const apsInitData = {
		pubID: config.pubId,
		adServer: config.adServer,
		bidTimeout: config.bidTimeout,
		simplerGPT: config.simplerGPT,
	};

	// Initial load MUST be disabled.
	window.googletag = window.googletag || {};
	window.googletag.cmd = window.googletag.cmd || [];
	window.googletag.cmd.push(() => {
		window.googletag.pubads().disableInitialLoad();
	});

	function finalize(apsInitData) {
		if (!window.apstag) {
			log.error('APS library did not load before initialization!');
			return;
		}
		log.info('Initializing APS', apsInitData);
		if (
			window.__CMLSINTERNAL.adTag &&
			window.__CMLSINTERNAL.adTag?.identity !== 'APS-GPT'
		) {
			log.info('Destroying old interface');
			window.__CMLSINTERNAL.adTag.destroy();
			window.__CMLSINTERNAL.adTag =
				new window.__CMLSINTERNAL.adTagInterfaces['APS-GPT']();
			window.__CMLSINTERNAL.adTag.identity =
				window.__CMLSINTERNAL.adTagInterfaces['APS-GPT'].identity;
		}
		window.apstag.init(apsInitData, () => {
			log.info('Initialized.');
			window._apsInitialized = true;
		});
	}

	waitFor(() => {
		return !!(window.__tcfapi || window.__gpp || window.__uspapi);
	}, 2000).then(
		// Privacy API available
		() => {
			// If using USP without GPP, we need to get the privacy
			// string ourselves and pass it to APS.
			if (window.__uspapi && typeof window?.__gpp === 'undefined') {
				log.info('Using USP API, getting privacy string');
				let uspString = '';
				window.__uspapi('getUSPData', 1, function (uspData, success) {
					if (uspData?.uspString) {
						log.info(
							'Setting USP string in APS config',
							uspData.uspString
						);
						uspString = uspData.uspString;
					} else {
						log.info('No USP string found!', uspData);
					}
				});
				// Wait 1.5 seconds for USP API to provide string
				waitFor(() => {
					return uspString;
				}, 1500)
					.then(
						() => {
							if (uspString) {
								apsInitData.params = apsInitData.params || {};
								apsInitData.params.us_privacy = uspString;
							}
						},
						() => {
							log.info(
								'Did not receive USP data before timeout.'
							);
						}
					)
					.finally(() => {
						finalize(apsInitData);
					});
			} else {
				// GPP and TCF are handled by APS directly
				log.info('CMP Loaded, initializing APS');
				finalize(apsInitData);
			}
		},
		// No privacy API found in 1.5 seconds.
		() => {
			log.warn('Privacy API not available within timeout.');
			finalize(apsInitData);
		}
	);
}

window.cmlsAds.apsInit = apsInit;
