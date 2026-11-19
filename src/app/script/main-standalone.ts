/**
 * by bitbof (bitbof.com)
 */

import './bb/base/polyfills';
import { KlApp } from './app/kl-app';
import { TKlProject } from './klecks/kl-types';
import { initLANG } from './language/language';
import './theme/theme';
import { initIconCss } from './icon/icon';

function showInitError(e: Error): void {
    const el = document.createElement('div');
    el.style.textAlign = 'center';
    el.style.background = '#fff';
    el.style.padding = '20px';
    el.innerHTML = '<h1>App failed to initialize</h1>';
    const errorMsg = document.createElement('div');
    errorMsg.textContent = 'Error: ' + (e.message ? e.message : '' + e);
    el.append(errorMsg);
    document.body.append(el);
    console.error(e);
}

(async () => {
    try {
        initIconCss();
        await initLANG();

        // Startup tab auto-recovery is disabled: creators always enter via the capture gate
        // so cached canvases from prior sessions cannot leak into a new work.
        const loadingScreenEl = document.getElementById('loading-screen');
        loadingScreenEl?.remove();

        const klApp = new KlApp({});
        document.body.append(klApp.getElement());
    } catch (e) {
        showInitError(e as Error);
    }
})();
