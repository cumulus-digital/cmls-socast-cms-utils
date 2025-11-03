import './interfaces';
import './modules/register-adpath/no-export.js';
import './modules/amazon-publisher-services/no-export.js';

import shouldImportAutoRefreshAds from './modules/auto-refresh-ads/shouldImport';
import shouldImportWallpaper from './modules/wallpaper/shouldImport';
import shouldImportSidewalls from './modules/sidewalls/shouldImport';
import shouldImportPaidContent from './modules/paid-content/shouldImport';

window._CMLS = window._CMLS || {};
window._CMLS.libsLoaded = window._CMLS.libsLoaded || [];
if (
	window._CMLS.libsLoaded?.length &&
	window._CMLS.libsLoaded.indexOf('advertising') > -1
) {
	throw new Error('Advertising library already loaded!');
}

const log = new window.__CMLSINTERNAL.Logger('ADVERTISING');

log.info({
	message: `
					__
______ ____ _  __ __/ /_ _____
/ __/ // /  ' \\/ // / / // (_-<
\\__/\\_,_/_/_/_/\\_,_/_/\\_,_/___/
SoCast ADVERTISING LIBRARY LOADED
BUILD DATE: ${__BUILDDATE__}`,
	headerLength: Infinity,
});

// Log that lib has been loaded
window._CMLS.libsLoaded.push('advertising');

const imports = [
	{
		name: 'advertising/auto-refresh-ads',
		check: shouldImportAutoRefreshAds,
		loadImmediately: true,
		loaderOptions: { async: false, defer: false },
	},
	{
		name: 'advertising/wallpaper',
		check: shouldImportWallpaper,
	},
	{
		name: 'advertising/sidewalls',
		check: shouldImportSidewalls,
	},
	{
		name: 'advertising/paid-content',
		check: shouldImportPaidContent,
	},
];
window.__CMLSINTERNAL.libs.doDynamicImports(imports);

import './modules/queue/no-export.js';
