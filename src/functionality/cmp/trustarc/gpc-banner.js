import styles from './gpc-banner.scss?url';

const { h, Fragment, Logger, domReady, waitFor } = window.__CMLSINTERNAL.libs;

export const gpcBanner = () => {
	const STORAGE_KEY = 'cmls:gpc-notice-shown:v1';
	if (navigator.globalPrivacyControl !== true) return;

	try {
		if (localStorage.getItem(STORAGE_KEY) === '1') return;
	} catch {
		// Without storage, a first-visit-only guarantee is unavailable.
		// Keep the existing footer preferences link as the fallback.
		return;
	}

	function preferencesHandlerReady() {
		return typeof window.truste?.eu?.clickListener === 'function';
	}

	function showNoticeIfReady() {
		if (!preferencesHandlerReady()) return;

		try {
			if (localStorage.getItem(STORAGE_KEY) === '1') return;
		} catch {
			return;
		}

		const gpcBanner = (
			<div id="cmls-gpc-banner">
				<img
					src="https://consent.trustarc.com/v2/asset/21:47:53.828US General Link-&gt;Banner-&gt;Overlay_icon.svg"
					alt=""
				></img>
				<div class="cmls-gpc-banner-text">
					<h1>
						Your Global Privacy Control preference has been honored.
					</h1>
				</div>
				<div class="cmls-gpc-button">
					<button>Manage Preferences</button>
				</div>
				<button
					class="cmls-gpc-close"
					aria-label="Dismiss the Global Privacy Control message"
					title="Close"
				>
					&#x2715;
				</button>
			</div>
		);

		gpcBanner.addEventListener('click', (e) => {
			if (e.target.matches('.cmls-gpc-button button')) {
				window.truste?.eu?.clickListener();
				localStorage.setItem(STORAGE_KEY, '1');
				gpcBanner.remove();
			}
			if (e.target.matches('.cmls-gpc-close')) {
				localStorage.setItem(STORAGE_KEY, '1');
				gpcBanner.remove();
			}
		});

		// use shadow DOM to isolate the banner and append it to the body
		const div = (
			<aside style="all: unset; position: fixed; z-index: 2147483646"></aside>
		);
		div.attachShadow({ mode: 'open' });
		div.shadowRoot.append(
			<link rel="stylesheet" href={styles} />,
			gpcBanner
		);
		window.document.body.append(div);
	}

	domReady(() => {
		waitFor(preferencesHandlerReady).then(showNoticeIfReady);
	});
};
