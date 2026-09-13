// Place at: src/app/dashboard/VaultDocumentPreviewModal.tsx
//
// The "click a Vault document's thumbnail to see it enlarged" lightbox.
// A true page-covering modal is the right call here (unlike
// VaultAuthModal, which used to wrongly reuse this same overlay for
// content that belongs in-flow) - this genuinely is a temporary
// overlay the user dismisses, same shape as DeleteAccountModal: fixed
// backdrop, click-away or the close button to dismiss, inner content
// stops the click from bubbling to the backdrop.
//
// Always points at the un-watermarked /preview route, never
// /download - the embedded preview is explicitly spec'd to show no
// watermark, only a downloaded copy carries one.
'use client';

import styles from './dashboard.module.css';

interface Props {
  documentId: string;
  fileName: string;
  fileType: 'application/pdf' | 'image/jpeg' | 'image/png';
  onClose: () => void;
}

export function VaultDocumentPreviewModal({ documentId, fileName, fileType, onClose }: Props) {
  const previewUrl = `/api/vault/documents/${documentId}/preview`;
  const isImage = fileType === 'image/jpeg' || fileType === 'image/png';

  return (
    <div role="dialog" aria-modal="true" aria-label={fileName} className={styles.reviewQueueOverlay} onClick={onClose}>
      <div
        className={styles.reviewQueueModal}
        style={{ maxWidth: '90vw', width: isImage ? 'auto' : '800px', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <strong>{fileName}</strong>
          <button type="button" className={styles.iconBtn} onClick={onClose}>
            Close
          </button>
        </div>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt={fileName} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', display: 'block' }} />
        ) : (
          <iframe src={previewUrl} title={fileName} style={{ width: '100%', height: '80vh', border: '1px solid var(--border)' }} />
        )}
      </div>
    </div>
  );
}
