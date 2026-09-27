// Place at: src/app/videos/page.tsx
//
// RoadVerdict's own videos (lib/videos.ts), each streamed from our own
// domain. Each video has an anchor - /videos#<slug> - so a notification
// or a post can link straight to one.
import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/seo/pageMetadata';
import { VIDEOS } from '@/lib/videos';

export const metadata: Metadata = pageMetadata({
  title: 'Videos',
  description: 'Short videos showing what RoadVerdict does - like logging your bike or car’s history just by talking to it.',
  path: '/videos',
});

export default function VideosPage() {
  return (
    <div className="hero">
      <h1>Videos</h1>
      {VIDEOS.map((video) => (
        <section key={video.slug} id={video.slug} style={{ marginBottom: '2rem' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', margin: '0 0 0.8rem', color: 'var(--asphalt)' }}>
            {video.title}
          </h2>
          {/* #t=0.1 makes phones show the opening frame before play,
              rather than an empty black box. */}
          <video
            src={`/api/video/${video.slug}#t=0.1`}
            controls
            playsInline
            preload="metadata"
            aria-label={video.title}
            style={{
              display: 'block',
              width: '100%',
              aspectRatio: `${video.width} / ${video.height}`,
              borderRadius: '12px',
              background: '#000',
              marginBottom: '1.2rem',
            }}
          />
          {video.paragraphs.map((paragraph, i) => (
            <p key={i} style={{ maxWidth: 'none', margin: '0 0 1rem' }}>
              {paragraph}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}
