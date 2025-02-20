/**
 * Adtag interface detection
 *
 * All interfaces must inherit from the DefaultInterface
 */

import waitFor from 'Utils/waitFor';
import APSInterface from './aps-gpt';
import GPTInterface from './gpt';

window.__CMLSINTERNAL = window.__CMLSINTERNAL || {};
window.__CMLSINTERNAL.adTagInterfaces = {
	[APSInterface.identity]: APSInterface,
	[GPTInterface.identity]: GPTInterface,
};

// Detectors must be registered in order for their detection to be run.
// The first successful detector wins.
const registeredDetectors = [APSInterface, GPTInterface];

((window, undefined) => {
	const scriptName = 'ADTAG DETECTION',
		nameSpace = 'adTagDetection',
		version = '0.1';

	const { Logger, triggerEvent, domReady } = window.__CMLSINTERNAL.libs;
	const log = new Logger(`${scriptName} ${version}`);

	log.time('Time to detect interface');
	waitFor(
		(loop) => {
			if (window.__CMLSINTERNAL.adTag) {
				return true;
			}
			log.debug(`Running registered detectors (Loop: ${loop})`);
			for (const TagInterface of registeredDetectors) {
				if (!TagInterface.identity || !TagInterface.detectTag) {
					log.error('Invalid interface', TagInterface);
					break;
				}
				log.debug(
					'Checking registered detector',
					TagInterface.identity
				);
				if (TagInterface.detectTag()) {
					return TagInterface;
				}
			}
			log.debug(
				'No interface detected, re-running detection in 0.05 seconds'
			);
		},
		5000,
		50
	)
		.then(
			(TagInterface) => {
				if (TagInterface) {
					log.info('Interface detected', TagInterface.identity);
					window.__CMLSINTERNAL.adTag = new TagInterface();
					triggerEvent(window, 'cmls-adtag-loaded', true);
				} else {
					log.error(
						'Detection resolved, but Tag Interface not provided!'
					);
				}
			},
			(error) => {
				log.error('Detection failed', error);
			}
		)
		.finally(() => {
			log.timeEnd('Time to detect interface');
		});
})(window.self);
