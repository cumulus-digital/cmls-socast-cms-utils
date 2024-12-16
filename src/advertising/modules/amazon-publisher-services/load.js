import waitFor from 'Utils/waitFor';
import isInteractive from 'Utils/isInteractive';
import Logger from 'Utils/Logger';

import config from './config.json';

window.cmlsAds = window.cmlsAds || {};
export default function apsLoad() {
	const log = new Logger('APS / Load');

	window.googletag = window.googletag || {};
	window.googletag.cmd = window.googletag.cmd || [];

	const describeSlots = (slots) => {
		if (!Array.isArray(slots)) {
			slots = [slots];
		}
		const slotData = [];
		slots.forEach((slot) => {
			const thisSlot = {
				adUnitPath: slot?.getAdUnitPath(),
				div: slot?.getSlotElementId(),
				sizes: slot?.getSizes(),
				targeting: [],
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
	};

	const refreshSlots = (slots = undefined) => {
		if (!Array.isArray(slots)) {
			slots = [slots];
		}
		window.googletag.cmd.push(() => {
			window.googletag.pubads().refresh(slots);
		});
	};

	log.info('apsLoad called, waiting for initialization...');
	waitFor(() => window._apsInitialized, 5000)
		.then(
			() => {
				log.info('Waiting for ready state...');
				isInteractive(() => {
					function initialRefresh() {
						if (
							!window.__CMLSINTERNAL.adTag.isInitialLoadDisabled()
						) {
							log.error('APS requires initial load be disabled!');
							return;
						}

						const slots = window.__CMLSINTERNAL.adTag.getSlots();
						log.info(
							'Initial refresh called for slots',
							describeSlots(slots)
						);
						window.__CMLSINTERNAL.adTag.refresh(slots);
					}

					if (window.__CMLSINTERNAL.adTag) {
						window.__CMLSINTERNAL.adTag.queue(initialRefresh);
					} else {
						log.info('Waiting for interface...');
						window.addEventListener('cmls-adtag-loaded', () => {
							log.info('Queuing initial refresh...');
							window.__CMLSINTERNAL.adTag.queue(initialRefresh);
						});
					}
				});
			},
			() => {
				log.error('Timed out waiting for initialization');
				refreshSlots();
			}
		)
		.catch((e) => {
			log.error('APS load error', e);
			refreshSlots();
		});
}

window.cmlsAds.apsLoad = apsLoad;
