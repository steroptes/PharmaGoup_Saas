import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Supplier,
  SupplierContact,
  SupplierNature,
  createSupplier,
  createSupplierContact,
  deleteSupplier,
  deleteSupplierContact,
  listSupplierContacts,
  listSuppliers,
  updateSupplier,
} from '@/services/suppliers';

const PAGE_SIZE = 10;
const EMPTY_FORM = { name: '', address: '', mobile_phone: '', landline_phone: '', nature: 'mixte' as SupplierNature };
const EMPTY_CONTACT = { first_name: '', last_name: '', function_title: '', phone: '' };

const toUpper = (value: string) => value.toUpperCase();
const normalizeTunisiaPhone = (value: string) => {
  const raw = value.trim().replace(/\s+/g, '');
  if (!raw) return '';
  if (raw.startsWith('+')) return `+${raw.slice(1).replace(/\D/g, '')}`;
  return raw.replace(/\D/g, '');
};
const isValidTunisiaPhone = (value: string) => /^(?:\+216)?\d{8}$/.test(value);

export const SuppliersPage = () => {
  const [rows, setRows] = useState<Supplier[]>([]);
  const [search, setSearch] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<SupplierContact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);

  const [contactForm, setContactForm] = useState(EMPTY_CONTACT);
  const [isSavingContact, setIsSavingContact] = useState(false);

  const load = async () => {
    setIsLoading(true);
    setFeedback(null);
    try {
      const data = await listSuppliers();
      setRows(data);
      if (!selectedSupplierId && data.length) setSelectedSupplierId(data[0].id);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Chargement des fournisseurs impossible.');
      setRows([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const selectedSupplier = useMemo(
    () => rows.find((row) => row.id === selectedSupplierId) ?? null,
    [rows, selectedSupplierId],
  );

  const loadContacts = async (supplierId: string) => {
    setIsLoadingContacts(true);
    try {
      setContacts(await listSupplierContacts(supplierId));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Chargement des vis-a-vis impossible.');
      setContacts([]);
    } finally {
      setIsLoadingContacts(false);
    }
  };

  useEffect(() => {
    if (!selectedSupplierId) {
      setContacts([]);
      return;
    }
    void loadContacts(selectedSupplierId);
  }, [selectedSupplierId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (!q) return true;
      return [row.name, row.address ?? '', row.mobile_phone ?? '', row.landline_phone ?? '', row.nature].some((value) =>
        value.toLowerCase().includes(q),
      );
    });
  }, [rows, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (supplier: Supplier) => {
    setEditingId(supplier.id);
    setForm({
      name: supplier.name ?? '',
      address: supplier.address ?? '',
      mobile_phone: supplier.mobile_phone ?? '',
      landline_phone: supplier.landline_phone ?? '',
      nature: supplier.nature,
    });
    setIsModalOpen(true);
  };

  const saveSupplier = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim()) {
      setFeedback('La denomination est obligatoire.');
      return;
    }

    const mobile = normalizeTunisiaPhone(form.mobile_phone);
    const landline = normalizeTunisiaPhone(form.landline_phone);

    if (mobile && !isValidTunisiaPhone(mobile)) {
      setFeedback('Telephone mobile invalide (Tunisie: 8 chiffres, option +216).');
      return;
    }
    if (landline && !isValidTunisiaPhone(landline)) {
      setFeedback('Telephone fixe invalide (Tunisie: 8 chiffres, option +216).');
      return;
    }

    setIsSaving(true);
    setFeedback(null);
    try {
      const payload = {
        ...form,
        name: toUpper(form.name),
        address: toUpper(form.address),
        mobile_phone: mobile,
        landline_phone: landline,
      };
      if (editingId) await updateSupplier(editingId, payload);
      else await createSupplier(payload);

      await load();
      setIsModalOpen(false);
      setFeedback(editingId ? 'Fournisseur mis a jour.' : 'Fournisseur cree.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Enregistrement impossible.');
    } finally {
      setIsSaving(false);
    }
  };

  const removeSupplier = async (id: string) => {
    try {
      await deleteSupplier(id);
      await load();
      if (selectedSupplierId === id) {
        const remaining = rows.filter((row) => row.id !== id);
        setSelectedSupplierId(remaining[0]?.id ?? null);
      }
      setFeedback('Fournisseur supprime.');
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Suppression impossible.');
    }
  };

  const saveContact = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSupplierId) return;

    if (!contactForm.first_name.trim() || !contactForm.last_name.trim()) {
      setFeedback('Nom et prenom du vis-a-vis sont obligatoires.');
      return;
    }

    const phone = normalizeTunisiaPhone(contactForm.phone);
    if (phone && !isValidTunisiaPhone(phone)) {
      setFeedback('Telephone vis-a-vis invalide (Tunisie: 8 chiffres, option +216).');
      return;
    }

    setIsSavingContact(true);
    setFeedback(null);
    try {
      await createSupplierContact({
        supplier_id: selectedSupplierId,
        first_name: toUpper(contactForm.first_name),
        last_name: toUpper(contactForm.last_name),
        function_title: toUpper(contactForm.function_title),
        phone,
      });
      setContacts(await listSupplierContacts(selectedSupplierId));
      setContactForm(EMPTY_CONTACT);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Ajout vis-a-vis impossible.');
    } finally {
      setIsSavingContact(false);
    }
  };

  const removeContact = async (contactId: string) => {
    if (!selectedSupplierId) return;
    try {
      await deleteSupplierContact(contactId);
      setContacts(await listSupplierContacts(selectedSupplierId));
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Suppression vis-a-vis impossible.');
    }
  };

  return (
    <div className="grid">
      <Card>
        <div className="toolbar">
          <div>
            <h1>Fournisseurs</h1>
            <p>Fiche fournisseur, vis-a-vis, et coordination commerciale.</p>
          </div>
          <Button onClick={openCreate}>Nouveau fournisseur</Button>
        </div>
        <Input
          style={{ marginTop: 10 }}
          placeholder="Rechercher denomination, nature, telephone"
          value={search}
          onChange={(event) => { setSearch(event.target.value); setPage(1); }}
        />
        {feedback && <p style={{ marginTop: 10 }}>{feedback}</p>}
      </Card>

      <div className="grid grid-2" style={{ alignItems: 'start' }}>
        <Card>
          {isLoading && <p>Chargement...</p>}
          {!isLoading && paginated.length === 0 && <p>Aucun fournisseur.</p>}
          {!isLoading && paginated.length > 0 && (
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeaderCell style={{ textAlign: 'left' }}>Denomination</TableHeaderCell>
                  <TableHeaderCell style={{ textAlign: 'left' }}>Nature</TableHeaderCell>
                  <TableHeaderCell style={{ textAlign: 'left' }}>Mobile</TableHeaderCell>
                  <TableHeaderCell style={{ textAlign: 'left' }}>Fixe</TableHeaderCell>
                  <TableHeaderCell style={{ textAlign: 'right' }}>Actions</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {paginated.map((supplier) => (
                  <TableRow
                    key={supplier.id}
                    onClick={() => setSelectedSupplierId(supplier.id)}
                    style={{
                      cursor: 'pointer',
                      background: selectedSupplierId === supplier.id ? '#f8fbff' : 'transparent',
                    }}
                  >
                    <TableCell style={{ textAlign: 'left', fontWeight: 600 }}>{supplier.name}</TableCell>
                    <TableCell style={{ textAlign: 'left' }}>{supplier.nature.toUpperCase()}</TableCell>
                    <TableCell style={{ textAlign: 'left' }}>{supplier.mobile_phone ?? '-'}</TableCell>
                    <TableCell style={{ textAlign: 'left' }}>{supplier.landline_phone ?? '-'}</TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <div onClick={(event) => event.stopPropagation()} style={{ display: 'inline-flex', gap: 8 }}>
                        <Button variant="secondary" onClick={() => openEdit(supplier)}>Modifier</Button>
                        <Button variant="danger" onClick={() => void removeSupplier(supplier.id)}>Supprimer</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ margin: 0 }}>Page {page} / {totalPages}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <Button variant="secondary" disabled={page === 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>Precedent</Button>
              <Button variant="secondary" disabled={page === totalPages} onClick={() => setPage((v) => Math.min(totalPages, v + 1))}>Suivant</Button>
            </div>
          </div>
        </Card>

        <Card>
          <h2>Vis-a-vis</h2>
          {!selectedSupplier && <p>Cliquez sur un fournisseur dans le tableau pour afficher ses vis-a-vis.</p>}
          {selectedSupplier && (
            <div className="grid" style={{ gap: 10 }}>
              <p style={{ margin: 0 }}><strong>{selectedSupplier.name}</strong></p>
              <form className="grid grid-2" onSubmit={saveContact}>
                <Input placeholder="Prenom" value={contactForm.first_name} onChange={(event) => setContactForm((c) => ({ ...c, first_name: toUpper(event.target.value) }))} />
                <Input placeholder="Nom" value={contactForm.last_name} onChange={(event) => setContactForm((c) => ({ ...c, last_name: toUpper(event.target.value) }))} />
                <Input placeholder="Fonction" value={contactForm.function_title} onChange={(event) => setContactForm((c) => ({ ...c, function_title: toUpper(event.target.value) }))} />
                <Input placeholder="Telephone (8 chiffres ou +216XXXXXXXX)" value={contactForm.phone} onChange={(event) => setContactForm((c) => ({ ...c, phone: normalizeTunisiaPhone(event.target.value) }))} />
                <div style={{ gridColumn: '1 / -1' }}>
                  <Button type="submit" disabled={isSavingContact}>{isSavingContact ? 'Ajout...' : 'Ajouter vis-a-vis'}</Button>
                </div>
              </form>

              {isLoadingContacts && <p>Chargement des vis-a-vis...</p>}
              {!isLoadingContacts && contacts.length === 0 && <p>Aucun vis-a-vis.</p>}
              {!isLoadingContacts && contacts.length > 0 && (
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell style={{ textAlign: 'left' }}>Nom complet</TableHeaderCell>
                      <TableHeaderCell style={{ textAlign: 'left' }}>Fonction</TableHeaderCell>
                      <TableHeaderCell style={{ textAlign: 'left' }}>Telephone</TableHeaderCell>
                      <TableHeaderCell style={{ textAlign: 'right' }}>Action</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {contacts.map((contact) => (
                      <TableRow key={contact.id}>
                        <TableCell style={{ textAlign: 'left' }}>{contact.first_name} {contact.last_name}</TableCell>
                        <TableCell style={{ textAlign: 'left' }}>{contact.function_title ?? '-'}</TableCell>
                        <TableCell style={{ textAlign: 'left' }}>{contact.phone ?? '-'}</TableCell>
                        <TableCell style={{ textAlign: 'right' }}>
                          <Button variant="danger" onClick={() => void removeContact(contact.id)}>Supprimer</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          )}
        </Card>
      </div>

      {isModalOpen && (
        <div className="pg-modal-overlay">
          <div className="pg-modal-card" style={{ width: 'min(560px, 94vw)' }}>
            <div className="toolbar pg-modal-header">
              <h2 style={{ margin: 0 }}>{editingId ? 'Modifier fournisseur' : 'Nouveau fournisseur'}</h2>
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>Fermer</Button>
            </div>

            <form className="grid" onSubmit={saveSupplier}>
              <Input placeholder="Denomination" value={form.name} onChange={(event) => setForm((c) => ({ ...c, name: toUpper(event.target.value) }))} required />
              <Input placeholder="Adresse" value={form.address} onChange={(event) => setForm((c) => ({ ...c, address: toUpper(event.target.value) }))} />
              <div className="grid grid-2" style={{ gap: 10 }}>
                <Input placeholder="Telephone mobile" value={form.mobile_phone} onChange={(event) => setForm((c) => ({ ...c, mobile_phone: normalizeTunisiaPhone(event.target.value) }))} />
                <Input placeholder="Telephone fixe" value={form.landline_phone} onChange={(event) => setForm((c) => ({ ...c, landline_phone: normalizeTunisiaPhone(event.target.value) }))} />
              </div>

              <Select value={form.nature} onValueChange={(value) => setForm((c) => ({ ...c, nature: value as SupplierNature }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Nature du fournisseur" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medicament">MEDICAMENT</SelectItem>
                  <SelectItem value="para">PARA</SelectItem>
                  <SelectItem value="mixte">MIXTE</SelectItem>
                </SelectContent>
              </Select>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <Button variant="secondary" onClick={() => setIsModalOpen(false)} type="button">Annuler</Button>
                <Button type="submit" disabled={isSaving}>{isSaving ? 'Enregistrement...' : (editingId ? 'Mettre a jour' : 'Creer')}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
