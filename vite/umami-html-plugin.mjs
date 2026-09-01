/**
 * Build-time Umami inject: only when both VITE_UMAMI_SCRIPT_URL and
 * VITE_UMAMI_WEBSITE_ID are set. Leave empty for local/dev builds.
 */
export function umamiHtmlPlugin() {
    return {
        name: 'umami-html',
        transformIndexHtml(html) {
            const url = (process.env.VITE_UMAMI_SCRIPT_URL || '').trim();
            const id = (process.env.VITE_UMAMI_WEBSITE_ID || '').trim();
            if (!url || !id) return html;
            if (!/^https:\/\//i.test(url)) {
                throw new Error('VITE_UMAMI_SCRIPT_URL must be an https:// URL');
            }
            const tag = `<script defer src="${url}" data-website-id="${id}" data-domains="hyunlix.top,www.hyunlix.top"></script>`;
            return html.replace('</head>', `    ${tag}\n</head>`);
        },
    };
}
