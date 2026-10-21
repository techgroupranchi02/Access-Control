import React, { useState, useMemo } from 'react';

/**
 * Parses and extracts embed information from various video hosting platforms.
 * Supports: YouTube, Vimeo, Google Drive, direct HTML5 video files (mp4/webm).
 */
export function getEmbedVideoInfo(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const url = rawUrl.trim();
  if (!url) return null;

  // 1. YouTube (standard watch, youtu.be, embed, shorts)
  const ytMatch = url.match(
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([^"&?\/\s]{11})/i
  );
  if (ytMatch && ytMatch[1]) {
    const videoId = ytMatch[1];
    const timeMatch = url.match(/[?&](?:t|start)=(\d+)/);
    const startParam = timeMatch ? `&start=${timeMatch[1]}` : '';
    return {
      type: 'youtube',
      platformName: 'YouTube',
      badgeColor: '#ef4444',
      videoId,
      embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}?rel=0&modestbranding=1&playsinline=1${startParam}`,
      rawUrl: url,
    };
  }

  // 2. Vimeo (channels, groups, video id)
  const vimeoMatch = url.match(
    /(?:vimeo\.com\/(?:channels\/(?:\w+\/)?|groups\/([^\/]*)\/videos\/|album\/(\d+)\/video\/|video\/|)(\d+))/i
  );
  if (vimeoMatch && vimeoMatch[3]) {
    const vimeoId = vimeoMatch[3];
    return {
      type: 'vimeo',
      platformName: 'Vimeo',
      badgeColor: '#0ea5e9',
      videoId: vimeoId,
      embedUrl: `https://player.vimeo.com/video/${vimeoId}?title=0&byline=0&portrait=0&playsinline=1`,
      rawUrl: url,
    };
  }

  // 3. Google Drive video preview
  const gdriveMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (gdriveMatch && gdriveMatch[1]) {
    return {
      type: 'drive',
      platformName: 'Google Drive',
      badgeColor: '#10b981',
      videoId: gdriveMatch[1],
      embedUrl: `https://drive.google.com/file/d/${gdriveMatch[1]}/preview`,
      rawUrl: url,
    };
  }

  // 4. Direct video files (MP4, WebM, OGG, MOV)
  if (/\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(url)) {
    return {
      type: 'video',
      platformName: 'Direct HTML5 Stream',
      badgeColor: '#8b5cf6',
      embedUrl: url,
      rawUrl: url,
    };
  }

  // 5. Generic fallback URL
  return {
    type: 'generic',
    platformName: 'Web Screener',
    badgeColor: '#64748b',
    embedUrl: url,
    rawUrl: url,
  };
}

export default function ScreenerVideoPlayer({
  url,
  password,
  title = 'Film Screener',
  runtime,
  autoPlay = false,
  className = '',
  aspectRatio = '16 / 9',
}) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedPass, setCopiedPass] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const videoInfo = useMemo(() => getEmbedVideoInfo(url), [url]);

  const handleCopyLink = () => {
    if (!url) return;
    navigator.clipboard?.writeText?.(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleCopyPass = () => {
    if (!password) return;
    navigator.clipboard?.writeText?.(password);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2500);
  };

  return (
    <div className={`fc-screener-widget ${className}`} style={{ width: '100%' }}>
      {/* ── VIDEO PLAYER CONTAINER ─────────────────────────────────────── */}
      <div
        className="fc-screener-screen-box"
        style={{
          width: '100%',
          aspectRatio,
          backgroundColor: '#0a0a0c',
          borderRadius: '10px',
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
        }}
      >
        {videoInfo && !loadError ? (
          <>
            {/* Top metadata pill bar */}
            <div
              style={{
                position: 'absolute',
                top: '8px',
                left: '10px',
                right: '10px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                zIndex: 10,
                pointerEvents: 'none',
              }}
            >
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(4px)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: videoInfo.badgeColor,
                    display: 'inline-block',
                  }}
                />
                {videoInfo.platformName}
              </div>

              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.7)',
                  backdropFilter: 'blur(4px)',
                  padding: '3px 8px',
                  borderRadius: '4px',
                  fontSize: '10.5px',
                  fontWeight: 600,
                  color: '#fbbf24',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  border: '1px solid rgba(251, 191, 36, 0.3)',
                }}
              >
                🔒 DRM Protected
              </div>
            </div>

            {/* Embed Frame / Player */}
            {videoInfo.type === 'video' ? (
              <video
                controls
                playsInline
                preload="metadata"
                autoPlay={autoPlay}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={() => setLoadError(true)}
              >
                <source src={videoInfo.embedUrl} />
                Your browser does not support HTML5 video streaming.
              </video>
            ) : (
              <iframe
                src={videoInfo.embedUrl}
                title={`${title} Screener Player`}
                style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                allowFullScreen
                onError={() => setLoadError(true)}
              />
            )}
          </>
        ) : (
          /* Empty / No Screener Available Placeholder */
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '24px',
              textAlign: 'center',
              background: 'linear-gradient(135deg, #13141c 0%, #0d0e14 100%)',
              color: '#94a3b8',
            }}
          >
            <div
              style={{
                width: '46px',
                height: '46px',
                borderRadius: '50%',
                background: 'rgba(255, 255, 255, 0.06)',
                border: '1px solid rgba(255, 255, 255, 0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px',
                marginBottom: '10px',
                color: '#e2e8f0',
              }}
            >
              🎬
            </div>
            <strong style={{ fontSize: '13px', color: '#f1f5f9', marginBottom: '4px' }}>
              {loadError ? 'Playback Preview Unavailable' : 'No Watch Link Attached'}
            </strong>
            <p style={{ fontSize: '11.5px', color: '#94a3b8', margin: 0, maxWidth: '280px', lineHeight: 1.45 }}>
              {loadError
                ? 'The video host restricted embedding. Use the external link button below to view.'
                : 'No screener or watch link was attached to this project in the projects database.'}
            </p>
          </div>
        )}
      </div>

      {/* ── PLAYER TOOLBAR & PASSCODE ACCESS ───────────────────────────── */}
      <div
        className="fc-screener-toolbar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '8px',
          marginTop: '10px',
          padding: '6px 2px',
        }}
      >
        {/* Passcode (if configured on project) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
          <span style={{ color: 'var(--fc-text-secondary, #64748b)', fontWeight: 500 }}>
            Passcode:
          </span>
          {password ? (
            <button
              type="button"
              onClick={handleCopyPass}
              title="Click to copy passcode"
              style={{
                background: 'var(--fc-surface-hover, #f1f5f9)',
                border: '1px solid var(--fc-border, #cbd5e1)',
                color: 'var(--fc-text-main, #0f172a)',
                padding: '2px 8px',
                borderRadius: '5px',
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: '11.5px',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              <code>{password}</code>
              <span style={{ fontSize: '10px', opacity: 0.7 }}>{copiedPass ? '✓ Copied' : '📋'}</span>
            </button>
          ) : (
            <span style={{ color: 'var(--fc-text-muted, #94a3b8)', fontStyle: 'italic', fontSize: '11.5px' }}>
              None required
            </span>
          )}
        </div>

        {/* Action Buttons: Copy link & Open external */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="fc-btn fc-btn-sm"
              style={{
                background: 'var(--fc-surface-card, #ffffff)',
                border: '1px solid var(--fc-border, #cbd5e1)',
                color: 'var(--fc-text-main, #334155)',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
              }}
              title="Open video link in a new tab"
            >
              Watch External ↗
            </a>
          )}

          <button
            type="button"
            className="fc-btn fc-btn-outline fc-btn-sm"
            onClick={handleCopyLink}
            disabled={!url}
            style={{
              padding: '4px 10px',
              fontSize: '11.5px',
              fontWeight: 600,
              borderRadius: '6px',
              cursor: url ? 'pointer' : 'not-allowed',
              opacity: url ? 1 : 0.5,
            }}
          >
            {copiedLink ? '✓ Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </div>
  );
}
