/**
 * Optional Google Search Console verification meta tag.
 * Set VITE_GOOGLE_SITE_VERIFICATION to the console content value only.
 */
export function googleVerificationHtmlPlugin() {
    return {
        name: 'google-site-verification-html',
        transformIndexHtml(html) {
            const token = (process.env.VITE_GOOGLE_SITE_VERIFICATION || '').trim();
            if (!token) return html;
            if (!/^[A-Za-z0-9_-]+$/.test(token)) {
                throw new Error('VITE_GOOGLE_SITE_VERIFICATION has invalid characters');
            }
            const tag = `<meta name="google-site-verification" content="${token}" />`;
            return html.replace('</head>', `    ${tag}\n</head>`);
        },
    };
}
