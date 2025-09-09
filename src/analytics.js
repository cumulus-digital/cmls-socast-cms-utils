import waitFor from 'Utils/waitFor';

window._CMLS = window._CMLS || {};
window._CMLS.libsLoaded = window._CMLS.libsLoaded || [];
if (
	window._CMLS.libsLoaded?.length &&
	window._CMLS.libsLoaded.indexOf('analytics') > -1
) {
	throw new Error('Analytics library already loaded!');
}

if (window._CMLS.libsLoaded.includes('main')) {
	require('./analytics/index');
} else {
	waitFor(() => window._CMLS.libsLoaded.indexOf('main') > -1).then(
		() => {
			require('./analytics/index');
		},
		() => {
			console.warn(
				'CMLS Analytics Support: Timed out waiting for main library.'
			);
		}
	);
}
