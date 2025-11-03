export default () => {
	const { h, Fragment, Logger } = window.__CMLSINTERNAL.libs;
	const scriptName = 'PAID CONTENT INJECTOR / AROUNDTHEWEB';
	const version = '0.2';
	const log = new Logger(`${scriptName} ${version}`);

	if (!window.document.body.className.includes('newsmax')) {
		log.debug('Not newsmax content, exiting.');
		return;
	}

	if (window.self.NO_NEWSMAX || window.parent.NO_NEWSMAX) {
		log.info('NO_NEWSMAX found, refusing injection.');
		return;
	}

	let url =
		'//static.newsmaxfeednetwork.com/web-clients/bootloaders/jtPvahXLC0BvyCYESN3Fgu/bootloader.js';
	// Mobile script
	if (window.matchMedia('only screen and (max-width: 760px)').matches) {
		url =
			'//static.newsmaxfeednetwork.com/web-clients/bootloaders/Jx44GJqslQrQU3ZULtFwdD/bootloader.js';
		log.debug('Using mobile widget');
	}

	const div = <div></div>;
	div.attachShadow({ mode: 'open' });

	function addScript(e) {
		const iframe = content.querySelector('iframe');
		iframe.contentWindow.document.body.innerHTML =
			'<style>html,body { margin: 0; padding: 0; }</style>';
		const scr = (
			<script
				src={url}
				data-version="3"
				data-url={window.document.location.href}
				data-zone="[ZONE]"
				data-display-within-iframe="true"
				async
			/>
		);
		iframe.contentWindow.document.body.append(scr);
		function getIFrameHeight(iframe) {
			if (!iframe?.contentWindow?.document) return false;
			function getComputedBodyStyle(prop) {
				return parseInt(
					iframe.contentWindow.getComputedStyle(
						iframe.contentWindow.document.body
					)[prop],
					10
				);
			}

			return (
				iframe.contentWindow.document.body.offsetHeight +
				getComputedBodyStyle('marginTop') +
				getComputedBodyStyle('marginBottom')
			);
		}
		let setHeight = setInterval(() => {
			const height = getIFrameHeight(iframe);
			if (height === false) {
				clearInterval(setHeight);
				setHeight = null;
				return false;
			}
			iframe.setAttribute('height', height);
		}, 500);
	}

	const content = (
		<div>
			<iframe
				id="newsmax-paid-content"
				src="about:blank"
				frameborder={0}
				scrolling="no"
				width="100%"
				height="300px"
				onLoad={addScript}
			></iframe>
		</div>
	);

	div.shadowRoot.append(content);
	log.info('Injected.');
	return div;
};
