/** Browser share helper: Web Share API → clipboard fallback. */

export type ShareOutcome = 'shared' | 'copied' | 'aborted' | 'failed';

export function buildShareUrl(kind: 'game' | 'score'): string {
    const origin = typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://hyunlix.top';
    const url = new URL(origin.endsWith('/') ? origin : `${origin}/`);
    url.searchParams.set('from', 'share');
    url.searchParams.set('kind', kind);
    return url.toString();
}

export function canShareFiles(): boolean {
    try {
        return typeof navigator !== 'undefined'
            && typeof navigator.share === 'function'
            && typeof navigator.canShare === 'function'
            && navigator.canShare({ files: [new File(['x'], 't.png', { type: 'image/png' })] });
    } catch {
        return false;
    }
}

export async function shareOrCopy(payload: {
    title: string;
    text: string;
    url: string;
}): Promise<ShareOutcome> {
    const { title, text, url } = payload;
    const fullText = text.includes(url) ? text : `${text}\n${url}`;

    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
            await navigator.share({ title, text: fullText, url });
            return 'shared';
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return 'aborted';
            // fall through to clipboard
        }
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(fullText);
            return 'copied';
        }
    } catch {
        // fall through
    }

    try {
        const area = document.createElement('textarea');
        area.value = fullText;
        area.setAttribute('readonly', '');
        area.style.position = 'fixed';
        area.style.left = '-9999px';
        document.body.appendChild(area);
        area.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(area);
        return ok ? 'copied' : 'failed';
    } catch {
        return 'failed';
    }
}

export async function shareImageFile(payload: {
    file: File;
    title: string;
    text: string;
    url: string;
}): Promise<ShareOutcome> {
    const { file, title, text, url } = payload;
    const fullText = text.includes(url) ? text : `${text}\n${url}`;

    if (canShareFiles()) {
        try {
            await navigator.share({ title, text: fullText, url, files: [file] });
            return 'shared';
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') return 'aborted';
        }
    }

    // No file share: still try text share, else clipboard
    return shareOrCopy({ title, text, url });
}

export function downloadBlob(blob: Blob, fileName: string) {
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = href;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => URL.revokeObjectURL(href), 1500);
}
