/**
 * Adtag interface detection
 *
 * All interfaces must inherit from the DefaultInterface
 */

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

	const runDetectors = (detectLoop = 0) => {
		if (window.__CMLSINTERNAL.adTag) {
			return;
		}
		if (detectLoop > 100) {
			log.warn('Infinite loop detected, no interface found!');
			return;
		}
		log.debug(`Running registered detectors (Loop: ${detectLoop})`);
		let detected = false;
		for (const TagInterface of registeredDetectors) {
			if (!TagInterface.identity || !TagInterface.detectTag) {
				log.error('Invalid interface', TagInterface);
				break;
			}
			log.debug('Checking registered detector', TagInterface.identity);
			if (TagInterface.detectTag()) {
				detected = true;
				window.__CMLSINTERNAL.adTag = new TagInterface();
				window.__CMLSINTERNAL.adTag.identity = TagInterface.identity;
				break;
			}
		}
		if (detected) {
			log.info(
				'Interface detected',
				window.__CMLSINTERNAL.adTag.identity,
				window.__CMLSINTERNAL.adTag
			);
			triggerEvent(window, 'cmls-adtag-loaded', true);
			return;
		}
		log.warn('No interface detected, re-running detection in 0.15 seconds');
		setTimeout(() => runDetectors(detectLoop + 1), 50);
	};

	domReady(() => {
		log.info('Initializing.');
		runDetectors();
	});
})(window.self);
