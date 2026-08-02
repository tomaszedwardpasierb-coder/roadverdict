// Place at: src/app/dashboard/AttachmentThumb.tsx
'use client';

import type { Attachment } from '@/lib/tracker/cosmosHelpers';
import styles from './dashboard.module.css';

export function AttachmentThumb({ attachment }: { attachment: Attachment }) {
  const url = `/api/tracker/attachment/${encodeURIComponent(attachment.blobName)}`;
  const isImage = attachment.fileType === 'image/jpeg' || attachment.fileType === 'image/png';

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener"
      className={styles.attachmentThumb}
      title={attachment.fileName}
    >
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={attachment.fileName} className={styles.attachmentThumbImg} />
      ) : (
        <span className={styles.attachmentThumbPdf}>PDF</span>
      )}
    </a>
  );
}
