window.__CMLSINTERNAL = window.__CMLSINTERNAL || {};

window.cmlsAds = window.cmlsAds || {};
window.cmlsAds.queue = window.cmlsAds.queue || [];

window.cmlsAds.queue.forEach((f) => typeof f === 'function' && f());
window.cmlsAds.queue._push = window.cmlsAds.queue.push;
window.cmlsAds.queue.push = (f) => typeof f === 'function' && f();
