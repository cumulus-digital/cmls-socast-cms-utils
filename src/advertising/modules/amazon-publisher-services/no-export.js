if (!window?.cmlsAds?.apsInit) {
	window._apsInitialized = false;
	window.cmlsAds = window.cmlsAds || {};

	window.cmlsAds.apsInit = () => {
		window.googletag = window.googletag || {};
		window.googletag.cmd = window.googletag.cmd || [];
		window.googletag.cmd.push(() => {
			window.googletag.pubads().disableInitialLoad();
		});

		import(
			/* webpackChunkName: "advertising/amazon-publisher-services/init" */
			/* webpackMode: "lazy-once" */
			'./init.js'
		).then((m) => m.default());
	};
	console.log('window.cmlsAds.apsInit created.');

	if (!window?.cmlsAds?.apsLoad) {
		window.cmlsAds = window.cmlsAds || {};
		window.cmlsAds.apsLoad = (...args) => {
			import(
				/* webpackChunkName: "advertising/amazon-publisher-services/load" */
				/* webpackMode: "lazy-once" */
				'./load.js'
			).then((m) => {
				m.default(...args);
			});
		};
	}
}
