import './interfaces';
import './modules/register-adpath/no-export.js';
import './modules/amazon-publisher-services/no-export.js';

import shouldImportAutoRefreshAds from './modules/auto-refresh-ads/shouldImport';
import shouldImportWallpaper from './modules/wallpaper/shouldImport';
import shouldImportSidewalls from './modules/sidewalls/shouldImport';

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
];
window.__CMLSINTERNAL.libs.doDynamicImports(imports);

import './modules/queue/no-export.js';
