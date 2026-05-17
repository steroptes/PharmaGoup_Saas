import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/context/AuthContext';
import {
  listMyPartnerSupplierSettings,
  listSuppliers,
  OrderFrequency,
  PartnerSupplierSetting,
  replaceMyPartnerSuppliers,
  Supplier,
} from '@/services/suppliers';

type PartnerRow = PartnerSupplierSetting & { supplier_name: string; supplier_nature: string };

const WEEK_DAYS = [
  { value: 1, label: 'LUN' },
  { value: 2, label: 'MAR' },
  { value: 3, label: 'MER' },
  { value: 4, label: 'JEU' },
  { value: 5, label: 'VEN' },
  { value: 6, label: 'SAM' },
  { value: 7, label: 'DIM' },
];
const MONTH_DAYS = Array.from({ length: 31 }, (_, index) => index + 1);

const frequencyLabel = (value: OrderFrequency) => {
  if (value === 'daily') return 'Journaliere';
  if (value === 'weekly') return 'Hebdomadaire';
  if (value === 'monthly') return 'Mensuelle';
  return 'Ponctuelle';
};

export const PharmacySettingsPage = () => {
  const { profile } = useAuth();
  const [allSuppliers, setAllSuppliers] = useState<Supplier[]>([]);
  const [partners, setPartners] = useState<PartnerRow[]>([]);
  const [selectedToAdd, setSelectedToAdd] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setFeedback(null);
      try {
        const [supplierRows, settings] = await Promise.all([
          listSuppliers(),
          listMyPartnerSupplierSettings(profile?.pharmacy_id),
        ]);

        const activeSuppliers = supplierRows.filter((item) => item.is_active);
        const supplierNameById = new Map(activeSuppliers.map((item) => [item.id, item.name]));
        const supplierNatureById = new Map(activeSuppliers.map((item) => [item.id, item.nature]));

        setAllSuppliers(activeSuppliers);
        setPartners(settings.map((setting) => ({
          ...setting,
          supplier_name: supplierNameById.get(setting.supplier_id) ?? 'Fournisseur',
          supplier_nature: (supplierNatureById.get(setting.supplier_id) ?? 'mixte').toUpperCase(),
        })));
      } catch (error) {
        setFeedback(error instanceof Error ? error.message : 'Chargement impossible.');
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, [profile?.pharmacy_id]);

  const availableToAdd = useMemo(() => {
    const selectedIds = new Set(partners.map((item) => item.supplier_id));
    return allSuppliers.filter((supplier) => !selectedIds.has(supplier.id));
  }, [allSuppliers, partners]);

  const visiblePartners = useMemo(() => {
    const q = search.trim().toLowerCase();
    return partners.filter((partner) => {
      if (!q) return true;
      return [partner.supplier_name, partner.supplier_nature].some((value) => value.toLowerCase().includes(q));
    });
  }, [partners, search]);

  const addPartner = () => {
    if (!selectedToAdd) return;
    const supplier = allSuppliers.find((item) => item.id === selectedToAdd);
    if (!supplier) return;

    setPartners((current) => [
      ...current,
      {
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        supplier_nature: supplier.nature.toUpperCase(),
        order_frequency: 'occasional',
        delivery_weekdays: [],
        delivery_month_days: [],
      },
    ]);
    setSelectedToAdd('');
  };

  const removePartner = (supplierId: string) => {
    setPartners((current) => current.filter((item) => item.supplier_id !== supplierId));
  };

  const setFrequency = (supplierId: string, frequency: OrderFrequency) => {
    setPartners((current) => current.map((item) => {
      if (item.supplier_id !== supplierId) return item;
      return {
        ...item,
        order_frequency: frequency,
        delivery_weekdays: frequency === 'weekly' ? item.delivery_weekdays : [],
        delivery_month_days: frequency === 'monthly' ? item.delivery_month_days : [],
      };
    }));
  };

  const toggleWeekday = (supplierId: string, day: number) => {
    setPartners((current) => current.map((item) => {
      if (item.supplier_id !== supplierId) return item;
      const hasDay = item.delivery_weekdays.includes(day);
      return {
        ...item,
        delivery_weekdays: hasDay
          ? item.delivery_weekdays.filter((value) => value !== day)
          : [...item.delivery_weekdays, day].sort((a, b) => a - b),
      };
    }));
  };

  const toggleMonthDay = (supplierId: string, day: number) => {
    setPartners((current) => current.map((item) => {
      if (item.supplier_id !== supplierId) return item;
      const hasDay = item.delivery_month_days.includes(day);
      return {
        ...item,
        delivery_month_days: hasDay
          ? item.delivery_month_days.filter((value) => value !== day)
          : [...item.delivery_month_days, day].sort((a, b) => a - b),
      };
    }));
  };

  const save = async () => {
    for (const item of partners) {
      if (item.order_frequency === 'weekly' && item.delivery_weekdays.length === 0) {
        setFeedback(`Selectionnez au moins un jour de semaine pour ${item.supplier_name}.`);
        return;
      }
      if (item.order_frequency === 'monthly' && item.delivery_month_days.length === 0) {
        setFeedback(`Selectionnez au moins un jour du mois pour ${item.supplier_name}.`);
        return;
      }
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      await replaceMyPartnerSuppliers(
        partners.map((item) => ({
          supplier_id: item.supplier_id,
          order_frequency: item.order_frequency,
          delivery_weekdays: item.delivery_weekdays,
          delivery_month_days: item.delivery_month_days,
        })),
        profile?.pharmacy_id,
      );
      setFeedback('Configuration des fournisseurs partenaires enregistree.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="grid">
      <Card>
        <h1>Parametres</h1>
        <p>Configurez vos preferences de compte pharmacie.</p>
        {feedback && <p style={{ marginTop: 10 }}>{feedback}</p>}
      </Card>

      <Card>
        <section className="grid" style={{ gap: 10 }}>
          <div>
            <h2 style={{ margin: 0 }}>Configuration des fournisseurs partenaires</h2>
            <p style={{ margin: '4px 0 0 0', color: '#667085', fontSize: 13 }}>
              Ajoutez les fournisseurs partenaires et definissez votre rythme de commande et vos jours de livraison.
            </p>
          </div>

          <div className="grid grid-2" style={{ gap: 10 }}>
            <Select value={selectedToAdd} onValueChange={setSelectedToAdd}>
              <SelectTrigger>
                <SelectValue placeholder="Choisir un fournisseur a ajouter" />
              </SelectTrigger>
              <SelectContent>
                {availableToAdd.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>{supplier.name} - {supplier.nature.toUpperCase()}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button onClick={addPartner} disabled={!selectedToAdd}>Ajouter fournisseur</Button>
          </div>

          <Input placeholder="Rechercher parmi les partenaires" value={search} onChange={(event) => setSearch(event.target.value)} />

          {isLoading && <p>Chargement...</p>}
          {!isLoading && visiblePartners.length === 0 && <p>Aucun fournisseur partenaire configure.</p>}

          {!isLoading && visiblePartners.length > 0 && (
            <div className="grid" style={{ gap: 10 }}>
              {visiblePartners.map((partner) => (
                <div key={partner.supplier_id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: 10, background: '#fff' }}>
                  <div className="toolbar" style={{ marginBottom: 8 }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700 }}>{partner.supplier_name}</p>
                      <p style={{ margin: '2px 0 0 0', fontSize: 12, color: '#64748b' }}>{partner.supplier_nature}</p>
                    </div>
                    <Button variant="danger" onClick={() => removePartner(partner.supplier_id)}>Retirer</Button>
                  </div>

                  <div className="grid" style={{ gap: 8 }}>
                    <div>
                      <p style={{ margin: '0 0 6px 0', fontSize: 13, color: '#334155' }}>Frequence de commande</p>
                      <Select value={partner.order_frequency} onValueChange={(value) => setFrequency(partner.supplier_id, value as OrderFrequency)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir la frequence" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Journaliere</SelectItem>
                          <SelectItem value="weekly">Hebdomadaire</SelectItem>
                          <SelectItem value="monthly">Mensuelle</SelectItem>
                          <SelectItem value="occasional">Ponctuelle</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {partner.order_frequency === 'weekly' && (
                      <div>
                        <p style={{ margin: '0 0 6px 0', fontSize: 13, color: '#334155' }}>Jours de livraison (semaine)</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {WEEK_DAYS.map((day) => {
                            const active = partner.delivery_weekdays.includes(day.value);
                            return (
                              <button
                                key={day.value}
                                type="button"
                                onClick={() => toggleWeekday(partner.supplier_id, day.value)}
                                style={{
                                  border: active ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                                  background: active ? '#eff6ff' : '#fff',
                                  color: active ? '#1d4ed8' : '#334155',
                                  borderRadius: 999,
                                  padding: '4px 10px',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                {day.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {partner.order_frequency === 'monthly' && (
                      <div>
                        <p style={{ margin: '0 0 6px 0', fontSize: 13, color: '#334155' }}>Jours de livraison (mois)</p>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 6 }}>
                          {MONTH_DAYS.map((day) => {
                            const active = partner.delivery_month_days.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() => toggleMonthDay(partner.supplier_id, day)}
                                style={{
                                  border: active ? '1px solid #1d4ed8' : '1px solid #cbd5e1',
                                  background: active ? '#eff6ff' : '#fff',
                                  color: active ? '#1d4ed8' : '#334155',
                                  borderRadius: 8,
                                  padding: '4px 0',
                                  fontSize: 12,
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                }}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {(partner.order_frequency === 'daily' || partner.order_frequency === 'occasional') && (
                      <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>
                        {frequencyLabel(partner.order_frequency)}: pas de selection de jours requise.
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div>
            <Button onClick={() => void save()} disabled={isSaving}>{isSaving ? 'Enregistrement...' : 'Enregistrer la configuration'}</Button>
          </div>
        </section>
      </Card>
    </div>
  );
};
