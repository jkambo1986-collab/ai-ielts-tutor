/**
 * @file Certificate of Practice card (X3). Calls /analytics/certificate;
 * if not yet eligible, surfaces what's needed.
 */

import React, { useState } from 'react';
import { uxService } from '../../services/uxService';
import { tokenStore, apiConfig } from '../../services/apiClient';
import { useToast } from '../ui/Toast';
import { Section } from './cards';

const CertificateCard: React.FC = () => {
    const { toast } = useToast();
    const [busy, setBusy] = useState(false);

    const download = async () => {
        setBusy(true);
        try {
            const resp = await fetch(uxService.certificateUrl(), {
                headers: {
                    Authorization: `Bearer ${tokenStore.getAccess() ?? ''}`,
                    'X-Institute-Slug': apiConfig.instituteSlug,
                },
            });
            if (resp.status === 400) {
                const data = await resp.json().catch(() => ({}));
                toast({
                    title: 'Not yet eligible',
                    body: `Reach band ${data.target ?? 7.0} on ${data.required ?? 3} consecutive writing sessions to unlock.`,
                    kind: 'warning',
                });
                return;
            }
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const blob = await resp.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'ielts-certificate.pdf';
            a.click();
            URL.revokeObjectURL(url);
            toast({ title: 'Certificate downloaded', kind: 'success' });
        } catch (e) {
            toast({ title: 'Download failed', body: e instanceof Error ? e.message : '', kind: 'error' });
        } finally {
            setBusy(false);
        }
    };

    return (
        <Section title="Certificate of Practice" subtitle="Awarded when your last 3 writing sessions all meet your target band.">
            <button
                onClick={download}
                disabled={busy}
                className="text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 disabled:opacity-50 px-4 py-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500"
            >
                {busy ? 'Generating…' : 'Download certificate (PDF)'}
            </button>
            <p className="text-[11px] text-slate-500 mt-2">
                Useful for visa applications, instructor handoffs, or LinkedIn.
            </p>
        </Section>
    );
};

export default CertificateCard;
