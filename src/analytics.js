import waitFor from 'Utils/waitFor';

window._CMLS = window._CMLS || {};
window._CMLS.libsLoaded = window._CMLS.libsLoaded || [];
if (
	window._CMLS.libsLoaded?.length &&
	window._CMLS.libsLoaded.indexOf('analytics') > -1
) {
	throw new Error('Analytics library already loaded!');
}

waitFor(() => window._CMLS.libsLoaded.indexOf('main') > -1).then(
	() => {
		const log = new window.__CMLSINTERNAL.Logger('ANALYTICS');

		log.info({
			message: `
                      __
 ______ ____ _  __ __/ /_ _____
/ __/ // /  ' \\/ // / / // (_-<
\\__/\\_,_/_/_/_/\\_,_/_/\\_,_/___/
 ANALYTICS LIBRARY LOADED
 BUILD DATE: ${__BUILDDATE__}`,
			headerLength: Infinity,
		});

		require('./analytics/index');

		// Log that analytics has been loaded
		window._CMLS.libsLoaded.push('analytics');
	},
	() => {
		console.warn(
			'CMLS Analytics Support: Timed out waiting for main library.'
		);
	}
);
