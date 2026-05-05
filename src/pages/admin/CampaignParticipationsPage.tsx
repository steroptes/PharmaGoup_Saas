import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/input';
import { CampaignPhaseKey } from '@/services/campaigns';
import { getCampaignPhaseSubmissionDetail, listCampaignPhaseSubmissionSummaries, reviewCampaignPhaseSubmission } from '@/services/campaignParticipationForms';

const PHASE_OPTIONS: Array<{ key: CampaignPhaseKey; label: string }> = [
  { key: 'purchase_intentions', label: 'Intentions d\'achat' },
  { key: 'purchase_orders', label: 'Bons de commande' },
  { key: 'delivery_notes', label: 'Bons de livraison' },
];

const money = (value: number) => value.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export const CampaignParticipationsPage = () => {
  const { campaignId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const phase = (searchParams.get('phase') as CampaignPhaseKey | null) ?? 'purchase_intentions';

  const [rows, setRows] = useState<Awaited<ReturnType<typeof listCampaignPhaseSubmissionSummaries>>>([]);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getCampaignPhaseSubmissionDetail>> | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reviewNote, setReviewNote] = useState('');
  const [isReviewing, setIsReviewing] = useState(false);

  const load = async () => {
    if (!campaignId) return;
    setIsLoading(true);
    setFeedback(null);
    try {
      const data = await listCampaignPhaseSubmissionSummaries(campaignId, phase);
      setRows(data);
      const firstId = data[0]?.submission_id ?? null;
      setSelectedSubmissionId(firstId);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Chargement impossible.');
      setRows([]);
      setSelectedSubmissionId(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [campaignId, phase]);

  useEffect(() => {
    const loadDetail = async () => {
      if (!selectedSubmissionId) {
        setDetail(null);
        return;
      }
      try {
        const payload = await getCampaignPhaseSubmissionDetail(selectedSubmissionId);
        setDetail(payload);
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Detail indisponible.');
        setDetail(null);
      }
    };

    void loadDetail();
  }, [selectedSubmissionId]);

  const canReview = phase === 'purchase_intentions' || phase === 'purchase_orders';

  const review = async (action: 'accept' | 'request_correction') => {
    if (!selectedSubmissionId) return;
    setIsReviewing(true);
    setFeedback(null);
    try {
      await reviewCampaignPhaseSubmission({
        submissionId: selectedSubmissionId,
        action,
        note: reviewNote,
      });
      await load();
      setFeedback(action === 'accept' ? 'Soumission acceptee.' : 'Rectification demandee.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Action impossible.');
    } finally {
      setIsReviewing(false);
    }
  };

  const globalTotals = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.qty += row.total_quantity;
      acc.amount += row.total_amount_ht;
      return acc;
    }, { qty: 0, amount: 0 });
  }, [rows]);

  return (
    <div className="grid">
      <Card>
        <div className="toolbar">
          <div>
            <h1>Pilotage des participations</h1>
            <p>Suivi des formulaires participants et totaux consolides.</p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/admin/campaigns')}>Retour campagnes</Button>
        </div>
        <div className="toolbar" style={{ marginTop: 10 }}>
          <Select value={phase} onChange={(event) => setSearchParams({ phase: event.target.value })}>
            {PHASE_OPTIONS.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
          </Select>
          <p style={{ margin: 0, color: '#667085', fontSize: 13 }}>Total campagne phase: {globalTotals.qty} U - {money(globalTotals.amount)} HT</p>
        </div>
      </Card>

      {feedback && <section className="alert">{feedback}</section>}
      {isLoading && <Card><p style={{ margin: 0 }}>Chargement...</p></Card>}

      {!isLoading && (
        <div className="grid grid-2" style={{ alignItems: 'start' }}>
          <Card>
            <h2>Participants</h2>
            <div className="grid" style={{ gap: 8 }}>
              {rows.length === 0 && <p style={{ margin: 0 }}>Aucune soumission pour cette phase.</p>}
              {rows.map((row) => (
                <button
                  key={row.submission_id}
                  type="button"
                  onClick={() => setSelectedSubmissionId(row.submission_id)}
                  style={{
                    textAlign: 'left',
                    border: selectedSubmissionId === row.submission_id ? '1px solid #18181b' : '1px solid #e4e4e7',
                    background: '#fff',
                    borderRadius: 10,
                    padding: 10,
                    cursor: 'pointer',
                  }}
                >
                  <p style={{ margin: 0, fontWeight: 700 }}>{row.pharmacy_name}</p>
                  <p style={{ margin: '4px 0 0 0', color: '#475467', fontSize: 13 }}>{row.total_quantity} U - {money(row.total_amount_ht)} HT</p>
                  <p style={{ margin: '4px 0 0 0', color: '#667085', fontSize: 12 }}>Statut: {row.status}</p>
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h2>Detail formulaire</h2>
            {!detail && <p style={{ margin: 0 }}>Selectionnez une soumission.</p>}
            {detail && (
              <div className="grid" style={{ gap: 8 }}>
                <p style={{ margin: 0 }}><strong>{detail.pharmacy_name}</strong> - {detail.status}</p>
                <p style={{ margin: 0 }}>Total: {detail.total_quantity} U - {money(detail.total_amount_ht)} HT</p>
                {detail.admin_correction_note && <p style={{ margin: 0, color: '#475467' }}>Note admin: {detail.admin_correction_note}</p>}
                {canReview && (
                  <div className="grid" style={{ gap: 8 }}>
                    <Input placeholder="Note admin (optionnelle)" value={reviewNote} onChange={(event) => setReviewNote(event.target.value)} />
                    <div className="toolbar">
                      <Button
                        variant="secondary"
                        disabled={isReviewing || detail.status === 'accepted'}
                        onClick={() => void review('request_correction')}
                      >
                        Demander rectification
                      </Button>
                      <Button
                        disabled={isReviewing || detail.status === 'accepted'}
                        onClick={() => void review('accept')}
                      >
                        Accepter
                      </Button>
                    </div>
                  </div>
                )}
                <div style={{ borderTop: '1px solid #e4e4e7', paddingTop: 8 }}>
                  {detail.lines.map((line) => (
                    <div key={`${line.product_id}-${line.campaign_group_brand_id ?? 'root'}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, padding: '6px 0', borderBottom: '1px solid #f1f5f9' }}>
                      <span>{line.product_name}</span>
                      <span>{line.quantity} U</span>
                      <span>{money(line.line_total_ht)} HT</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
};
