((window, undefined) => {
	const injectables = {
		TopicalFruit: './injectables/topical-fruit/topical-fruit.js',
		//revContent: './injectables/rev-content.js',
	};

	const scriptName = 'PAID CONTENT RUNNER';
	const nameSpace = 'paidContentRunner';
	const version = '0.1';

	const { h, domReady, getBasicPost, Logger } = window.__CMLSINTERNAL.libs;

	const log = new Logger(`${scriptName} ${version}`);

	domReady(() => {
		if (window.NO_PAIDCONTENT) {
			log.info('NO_PAIDCONTENT flag found, exiting.');
			return;
		}

		const entry = getBasicPost();
		log.debug('Entry', entry);

		if (!entry) {
			log.info('No post entry container found.');
		} else {
			const injectPoint = (
				<div
					id={`PAIDCONTENT-${Math.ceil(Math.random() * 6000000)}}`}
					class="injected-paid-content"
					style="position: relative !important; width: 100% !important; top: 0; overflow: hidden;"
				/>
			);

			entry.after(injectPoint);
		}

		for (const i in injectables) {
			let run = false;
			if (typeof injectables[i] === 'function') {
				log.debug('Running injectable', i);
				injectables[i]();
				run = true;
			} else if (typeof injectables[i] === 'string') {
				log.debug('Importing injectable', i);
				import(
					/* webpackChunkName: 'advertising/paid-content/[request]' */
					`${injectables[i]}`
				).then((injectable) => {
					if (typeof injectable?.default === 'function') {
						const content = injectable.default();
						if (content && entry) {
							log.info('Injecting', i);
							injectPoint.append(content);
						}
					}
				});
				run = true;
			}

			if (run) {
				log.info('Ran Injectable', i);
			}
		}
	});
})(window.self);
