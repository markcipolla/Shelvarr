'use client';

import { useState, type CSSProperties, type ReactNode } from 'react';
import Image from 'next/image';

// The look lives in app/covers.css; this only lays out the pieces it styles.

interface BookCoverProps {
  /** Without one, or once it fails to load, a typographic cover stands in. */
  src?: string | null;
  title: string;
  author?: string | null;
  /** Comics are thinner, a little narrower, and have no spine to turn to. */
  variant?: 'book' | 'comic';
  /** Load through next/image at these sizes, for remote covers worth resizing. */
  sizes?: string;
  /** Wash the cover out, for books that aren't in the library. */
  muted?: boolean;
  /** Badges and progress, drawn on the cover so they turn with it. */
  children?: ReactNode;
  /** Controls laid flat over the cover, which hold still while it turns and aren't clipped by it. */
  overlay?: ReactNode;
  className?: string;
}

/**
 * A cover drawn as a physical book (or comic) that turns on hover. Hovering
 * anything marked `book-cover-trigger` around it — a whole card, say — turns
 * it too.
 */
export function BookCover({
  src,
  title,
  author,
  variant = 'book',
  sizes,
  muted,
  children,
  overlay,
  className,
}: BookCoverProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const image = src && src !== failedSrc ? src : null;

  // Drawn three times — cover, spine and glow — through the same loader, so
  // the browser only fetches it once.
  const renderImage = (imageSrc: string, imageClass: string | undefined, decorative: boolean) => {
    const fail = () => setFailedSrc(imageSrc);
    const common = {
      src: imageSrc,
      alt: decorative ? '' : title,
      className: imageClass,
      'aria-hidden': decorative || undefined,
      onError: decorative ? undefined : fail,
      // A server-rendered image can fail before hydration attaches onError.
      ref: decorative
        ? undefined
        : (img: HTMLImageElement | null) => {
            if (img?.complete && img.naturalWidth === 0) fail();
          },
    };
    return sizes ? (
      <Image {...common} fill sizes={sizes} />
    ) : (
      <img {...common} loading="lazy" />
    );
  };

  const classes = [
    'book-cover',
    `book-cover--${variant}`,
    !image && 'book-cover--plain',
    muted && 'book-cover--muted',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={{ '--bc-hue': hueFor(title) } as CSSProperties}>
      <div className="book-cover__glow" aria-hidden="true">
        {image && renderImage(image, undefined, true)}
      </div>
      <div className="book-cover__body">
        {variant === 'book' && (
          <div className="book-cover__spine" data-title={title} aria-hidden="true">
            {image && renderImage(image, undefined, true)}
          </div>
        )}
        {variant === 'comic' && <div className="book-cover__pages" aria-hidden="true" />}
        <div className="book-cover__front">
          {image ? (
            renderImage(image, 'book-cover__img', false)
          ) : (
            <div
              className="book-cover__plain"
              data-title={title}
              data-author={author || ''}
              role="img"
              aria-label={title}
            />
          )}
          <div className="book-cover__shine" aria-hidden="true" />
          {children}
        </div>
      </div>
      {overlay && <div className="book-cover__overlay">{overlay}</div>}
    </div>
  );
}

/**
 * The Read button's book: a small copy of the cover that falls open, pages
 * fanning, when the `flip-book-trigger` around it is hovered.
 */
export function FlipBook({ src, title }: { src?: string | null; title: string }) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className="flip-book"
      style={{ '--bc-hue': hueFor(title) } as CSSProperties}
      aria-hidden="true"
    >
      <span className="flip-book__back" />
      {[6, 5, 4, 3, 2, 1].map((page) => (
        <span key={page} className="flip-book__page" />
      ))}
      <span className="flip-book__front">
        {src && !failed && <img src={src} alt="" onError={() => setFailed(true)} />}
      </span>
    </span>
  );
}

// A steady colour per title, so plain covers differ from one another but not
// from one visit to the next.
function hueFor(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 360;
}
