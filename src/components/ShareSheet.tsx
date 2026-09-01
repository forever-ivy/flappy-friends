import { useEffect, useMemo, useState } from 'react';
import { Download, Share2, X } from 'lucide-react';
import { useI18n } from '../i18n';
import { buildShareUrl, downloadBlob, shareImageFile, shareOrCopy } from '../services/share';
import { renderShareCard, ShareCardMode, ShareCardScoreInput } from '../services/shareCard';

export interface ShareSheetProps {
    mode: ShareCardMode;
    score?: ShareCardScoreInput;
    onClose: () => void;
    onToast: (message: string) => void;
}

export function ShareSheet({ mode, score, onClose, onToast }: ShareSheetProps) {
    const { t } = useI18n();
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [blob, setBlob] = useState<Blob | null>(null);
    const [busy, setBusy] = useState(true);
    const [error, setError] = useState(false);
    const [sharing, setSharing] = useState(false);

    const title = mode === 'score' ? t.shareScoreTitle : t.shareGameTitle;
    const caption = useMemo(() => {
        if (mode === 'score' && score) {
            return t.shareScoreText(score.totalScore, score.characterName, score.hit143);
        }
        return t.shareGameText;
    }, [mode, score, t]);
    const url = buildShareUrl(mode);

    useEffect(() => {
        let cancelled = false;
        setBusy(true);
        setError(false);
        setPreviewUrl(null);
        setFile(null);
        setBlob(null);
        void renderShareCard({
            mode,
            score,
            siteUrl: 'https://hyunlix.top',
            labels: {
                subtitle: t.gameSubtitle,
                site: t.shareSite,
                tagline: t.shareTagline,
                pipesLabel: t.sharePipes,
                rewardsLabel: t.shareRewards,
                asLabel: t.shareAs,
            },
        }).then((result) => {
            if (cancelled) return;
            setPreviewUrl(result.dataUrl);
            setFile(result.file);
            setBlob(result.blob);
            setBusy(false);
        }).catch(() => {
            if (cancelled) return;
            setError(true);
            setBusy(false);
            onToast(t.shareFailed);
        });
        return () => { cancelled = true; };
        // Intentionally key off mode/score fields + locale strings, not whole `t` / onToast identity.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        mode,
        score?.totalScore,
        score?.pipeCount,
        score?.rewardCount,
        score?.characterId,
        score?.characterName,
        score?.hit143,
        t.gameSubtitle,
        t.shareSite,
        t.shareTagline,
        t.sharePipes,
        t.shareRewards,
        t.shareAs,
        t.shareFailed,
        onToast,
    ]);

    const onShare = async () => {
        if (!file || sharing) return;
        setSharing(true);
        try {
            const outcome = await shareImageFile({ file, title, text: caption, url });
            if (outcome === 'copied') onToast(t.shareCopied);
            else if (outcome === 'failed') onToast(t.shareFailed);
        } finally {
            setSharing(false);
        }
    };

    const onSave = () => {
        if (!blob || !file) return;
        downloadBlob(blob, file.name);
        onToast(t.shareSaved);
    };

    const onCopyCaption = async () => {
        const outcome = await shareOrCopy({ title, text: caption, url });
        if (outcome === 'copied' || outcome === 'shared') onToast(t.shareCopied);
        else if (outcome === 'failed') onToast(t.shareFailed);
    };

    return (
        <div className="dialog-backdrop share-backdrop" role="presentation" onClick={onClose}>
            <section
                className="dialog share-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="share-dialog-title"
                onClick={(event) => event.stopPropagation()}
            >
                <button className="dialog-close" type="button" onClick={onClose} aria-label={t.close}>
                    <X size={18} />
                </button>
                <p className="eyebrow">{mode === 'score' ? t.shareScore : t.shareGame}</p>
                <h2 id="share-dialog-title">{title}</h2>

                <div className="share-preview-frame" aria-busy={busy}>
                    {busy && <p className="share-preview-status">{t.shareGenerating}</p>}
                    {error && !busy && <p className="share-preview-status">{t.shareFailed}</p>}
                    {previewUrl && (
                        <img className="share-preview-image" src={previewUrl} alt="" />
                    )}
                </div>

                <div className="share-dialog-actions">
                    <button
                        className="primary-button"
                        type="button"
                        disabled={!file || sharing || busy}
                        onClick={() => void onShare()}
                        aria-label={t.shareAction}
                    >
                        <Share2 size={18} /> {t.shareAction}
                    </button>
                    <button
                        className="secondary-button"
                        type="button"
                        disabled={!blob || busy}
                        onClick={onSave}
                        aria-label={t.shareSave}
                    >
                        <Download size={18} /> {t.shareSave}
                    </button>
                </div>
                <button
                    className="share-caption-link"
                    type="button"
                    disabled={busy}
                    onClick={() => void onCopyCaption()}
                >
                    {t.shareCaption}
                </button>
            </section>
        </div>
    );
}
