import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import ABI from './InsuranceManagerABI.json';
import deployInfo from './deployInfo.json';
import './App.css';

// ─── Constants ───
const CONTRACT_ADDRESS = deployInfo.contractAddress;

const INSURANCE_TYPES = ['AUTO', 'HABITATION', 'SANTÉ', 'VIE', 'VOYAGE'];
const CLAIM_STATUSES = ['Déclaré', 'En examen', 'Approuvé', 'Rejeté', 'Payé'];
const POLICY_STATUSES = ['Active', 'Expirée', 'Annulée', 'Suspendue'];

const STATUS_COLORS = {
  claim: ['#f59e0b', '#3b82f6', '#10b981', '#ef4444', '#6366f1'],
  policy: ['#10b981', '#6b7280', '#ef4444', '#f59e0b'],
};

const TYPE_ICONS = { 0: '🚗', 1: '🏠', 2: '🏥', 3: '❤️', 4: '✈️' };

// ─── Helper ───
const fmt = (wei) => parseFloat(ethers.formatEther(wei || '0')).toFixed(4);
const fmtDate = (ts) => new Date(Number(ts) * 1000).toLocaleDateString('fr-FR');

export default function App() {
  const [account, setAccount] = useState('');
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [contract, setContract] = useState(null);
  const [isOwner, setIsOwner] = useState(false);
  const [isInsurer, setIsInsurer] = useState(false);
  const [poolBalance, setPoolBalance] = useState('0');
  const [policies, setPolicies] = useState([]);
  const [claims, setClaims] = useState([]);
  const [allClaims, setAllClaims] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [policyCounter, setPolicyCounter] = useState(0);
  const [claimCounter, setClaimCounter] = useState(0);

  // Forms
  const [newPolicy, setNewPolicy] = useState({ insured: '', insType: 0, premium: '', coverage: '', days: 365, description: '' });
  const [newClaim, setNewClaim] = useState({ policyId: '', amount: '', description: '', ipfs: '' });
  const [reviewForm, setReviewForm] = useState({ claimId: '', notes: '' });
  const [approveForm, setApproveForm] = useState({ claimId: '', amount: '', notes: '' });
  const [rejectForm, setRejectForm] = useState({ claimId: '', reason: '' });
  const [depositAmount, setDepositAmount] = useState('');

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const connectWallet = async () => {
    if (!window.ethereum) return showToast('MetaMask non détecté !', 'error');
    try {
      const _provider = new ethers.BrowserProvider(window.ethereum);
      await _provider.send('eth_requestAccounts', []);
      const _signer = await _provider.getSigner();
      const _account = await _signer.getAddress();
      const _contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, _signer);

      setProvider(_provider);
      setSigner(_signer);
      setAccount(_account);
      setContract(_contract);

      const owner = await _contract.owner();
      const insurer = await _contract.insurers(_account);
      setIsOwner(owner.toLowerCase() === _account.toLowerCase());
      setIsInsurer(insurer);

      showToast('Wallet connecté !');
    } catch (e) {
      showToast(e.reason || e.message || 'Erreur connexion', 'error');
    }
  };

  const loadData = useCallback(async () => {
    if (!contract || !account) return;
    try {
      const pool = await contract.poolBalance();
      const pc = await contract.policyCounter();
      const cc = await contract.claimCounter();
      setPoolBalance(fmt(pool));
      setPolicyCounter(Number(pc));
      setClaimCounter(Number(cc));

      // Load user policies
      const pIds = await contract.getUserPolicies(account);
      const pData = await Promise.all(pIds.map(id => contract.getPolicy(id)));
      setPolicies(pData.map(p => ({
        id: p.id, insured: p.insured, insurer: p.insurer,
        insType: p.insType, premium: p.premium, coverageAmount: p.coverageAmount,
        startDate: p.startDate, endDate: p.endDate, status: p.status, description: p.description
      })));

      // Load user claims
      const cIds = await contract.getUserClaims(account);
      const cData = await Promise.all(cIds.map(id => contract.getClaim(id)));
      setClaims(cData.map(c => ({
        id: c.id, policyId: c.policyId, claimant: c.claimant,
        amount: c.amount, approvedAmount: c.approvedAmount,
        status: c.status, description: c.description, ipfsHash: c.ipfsHash,
        filedAt: c.filedAt, resolvedAt: c.resolvedAt, notes: c.notes
      })));

      // Load ALL claims for insurer view
      if (isInsurer && Number(cc) > 0) {
        const all = [];
        for (let i = 1; i <= Number(cc); i++) {
          try { const c = await contract.getClaim(i); all.push({ id: c.id, policyId: c.policyId, claimant: c.claimant, amount: c.amount, approvedAmount: c.approvedAmount, status: c.status, description: c.description, ipfsHash: c.ipfsHash, filedAt: c.filedAt, resolvedAt: c.resolvedAt, notes: c.notes }); } catch {}
        }
        setAllClaims(all);
      }
    } catch (e) {
      console.error(e);
    }
  }, [contract, account, isInsurer]);

  useEffect(() => { loadData(); }, [loadData]);

  // ─── Actions ───
  const createPolicy = async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.createPolicy(
        newPolicy.insured,
        parseInt(newPolicy.insType),
        ethers.parseEther(newPolicy.premium),
        ethers.parseEther(newPolicy.coverage),
        parseInt(newPolicy.days),
        newPolicy.description
      );
      await tx.wait();
      showToast('Police créée avec succès !');
      setNewPolicy({ insured: '', insType: 0, premium: '', coverage: '', days: 365, description: '' });
      await loadData();
    } catch (e) { showToast(e.reason || e.message, 'error'); }
    setLoading(false);
  };

  const declareClaim = async () => {
    if (!contract) return;
    setLoading(true);
    try {
      const tx = await contract.declareClaim(
        parseInt(newClaim.policyId),
        ethers.parseEther(newClaim.amount),
        newClaim.description,
        newClaim.ipfs || 'QmNone'
      );
      await tx.wait();
      showToast('Sinistre déclaré !');
      setNewClaim({ policyId: '', amount: '', description: '', ipfs: '' });
      await loadData();
    } catch (e) { showToast(e.reason || e.message, 'error'); }
    setLoading(false);
  };

  const startReview = async () => {
    setLoading(true);
    try {
      await (await contract.startClaimReview(parseInt(reviewForm.claimId), reviewForm.notes)).wait();
      showToast('Sinistre mis en examen');
      setReviewForm({ claimId: '', notes: '' });
      await loadData();
    } catch (e) { showToast(e.reason || e.message, 'error'); }
    setLoading(false);
  };

  const approveClaim = async () => {
    setLoading(true);
    try {
      await (await contract.approveClaim(parseInt(approveForm.claimId), ethers.parseEther(approveForm.amount), approveForm.notes)).wait();
      showToast('Sinistre approuvé !');
      setApproveForm({ claimId: '', amount: '', notes: '' });
      await loadData();
    } catch (e) { showToast(e.reason || e.message, 'error'); }
    setLoading(false);
  };

  const rejectClaim = async () => {
    setLoading(true);
    try {
      await (await contract.rejectClaim(parseInt(rejectForm.claimId), rejectForm.reason)).wait();
      showToast('Sinistre rejeté');
      setRejectForm({ claimId: '', reason: '' });
      await loadData();
    } catch (e) { showToast(e.reason || e.message, 'error'); }
    setLoading(false);
  };

  const payClaim = async (id) => {
    setLoading(true);
    try {
      await (await contract.payClaim(id)).wait();
      showToast('Paiement effectué !');
      await loadData();
    } catch (e) { showToast(e.reason || e.message, 'error'); }
    setLoading(false);
  };

  const depositFunds = async () => {
    setLoading(true);
    try {
      await (await contract.depositFunds({ value: ethers.parseEther(depositAmount) })).wait();
      showToast('Fonds déposés !');
      setDepositAmount('');
      await loadData();
    } catch (e) { showToast(e.reason || e.message, 'error'); }
    setLoading(false);
  };

  // ─── Render ───
  return (
    <div className="app">
      {/* Toast */}
      {toast && <div className={`toast toast--${toast.type}`}>{toast.msg}</div>}

      {/* Header */}
      <header className="header">
        <div className="header__brand">
          <span className="header__logo">⬡</span>
          <span className="header__title">AssurChain</span>
          <span className="header__subtitle">Assurance Décentralisée</span>
        </div>
        {account ? (
          <div className="header__account">
            {isOwner && <span className="badge badge--owner">Propriétaire</span>}
            {isInsurer && !isOwner && <span className="badge badge--insurer">Assureur</span>}
            <span className="account-addr">{account.slice(0, 6)}…{account.slice(-4)}</span>
          </div>
        ) : (
          <button className="btn btn--connect" onClick={connectWallet}>Connecter Wallet</button>
        )}
      </header>

      {!account ? (
        <div className="landing">
          <div className="landing__content">
            <h1>Gestion des Sinistres<br /><span>sur la Blockchain</span></h1>
            <p>Transparence totale. Traçabilité immuable. Remboursements automatisés.</p>
            <button className="btn btn--connect btn--lg" onClick={connectWallet}>
              Connecter MetaMask
            </button>
            <div className="landing__features">
              <div className="feature">
                <span>🔒</span>
                <p>Données immuables</p>
              </div>
              <div className="feature">
                <span>⚡</span>
                <p>Paiements instantanés</p>
              </div>
              <div className="feature">
                <span>👁</span>
                <p>Suivi transparent</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Navigation */}
          <nav className="nav">
            {['dashboard', 'mes-polices', 'mes-sinistres', 'declarer'].map(tab => (
              <button key={tab} className={`nav__btn ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                {tab === 'dashboard' && '📊 Tableau de bord'}
                {tab === 'mes-polices' && '📋 Mes Polices'}
                {tab === 'mes-sinistres' && '🚨 Mes Sinistres'}
                {tab === 'declarer' && '➕ Déclarer'}
              </button>
            ))}
            {isInsurer && (
              <>
                <button className={`nav__btn nav__btn--insurer ${activeTab === 'gestion' ? 'active' : ''}`} onClick={() => setActiveTab('gestion')}>⚙️ Gestion</button>
                <button className={`nav__btn nav__btn--insurer ${activeTab === 'creer-police' ? 'active' : ''}`} onClick={() => setActiveTab('creer-police')}>✏️ Nouvelle Police</button>
              </>
            )}
            {isOwner && (
              <button className={`nav__btn nav__btn--owner ${activeTab === 'fonds' ? 'active' : ''}`} onClick={() => setActiveTab('fonds')}>💰 Fonds</button>
            )}
          </nav>

          <main className="main">

            {/* ─── DASHBOARD ─── */}
            {activeTab === 'dashboard' && (
              <section className="section">
                <h2 className="section__title">Tableau de bord</h2>
                <div className="stats-grid">
                  <div className="stat-card stat-card--pool">
                    <span className="stat-card__label">Pool d'assurance</span>
                    <span className="stat-card__value">{poolBalance} ETH</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__label">Polices totales</span>
                    <span className="stat-card__value">{policyCounter}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__label">Sinistres totaux</span>
                    <span className="stat-card__value">{claimCounter}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__label">Mes polices</span>
                    <span className="stat-card__value">{policies.length}</span>
                  </div>
                  <div className="stat-card">
                    <span className="stat-card__label">Mes sinistres</span>
                    <span className="stat-card__value">{claims.length}</span>
                  </div>
                  <div className="stat-card stat-card--role">
                    <span className="stat-card__label">Rôle</span>
                    <span className="stat-card__value">{isOwner ? 'Propriétaire' : isInsurer ? 'Assureur' : 'Assuré'}</span>
                  </div>
                </div>
                <div className="contract-info">
                  <span className="mono">Contrat : {CONTRACT_ADDRESS}</span>
                  <button className="btn btn--sm" onClick={loadData}>↻ Actualiser</button>
                </div>
              </section>
            )}

            {/* ─── MES POLICES ─── */}
            {activeTab === 'mes-polices' && (
              <section className="section">
                <h2 className="section__title">Mes Polices d'Assurance</h2>
                {policies.length === 0 ? (
                  <div className="empty">Aucune police trouvée pour votre adresse.</div>
                ) : (
                  <div className="cards-grid">
                    {policies.map((p) => (
                      <div className="card" key={p.id.toString()}>
                        <div className="card__header">
                          <span className="card__icon">{TYPE_ICONS[p.insType]}</span>
                          <span className="card__id">Police #{p.id.toString()}</span>
                          <span className="status-badge" style={{ background: STATUS_COLORS.policy[p.status] }}>
                            {POLICY_STATUSES[p.status]}
                          </span>
                        </div>
                        <div className="card__body">
                          <p className="card__type">{INSURANCE_TYPES[p.insType]}</p>
                          <p className="card__desc">{p.description}</p>
                          <div className="card__meta">
                            <span>Prime : <strong>{fmt(p.premium)} ETH</strong></span>
                            <span>Couverture : <strong>{fmt(p.coverageAmount)} ETH</strong></span>
                            <span>Début : <strong>{fmtDate(p.startDate)}</strong></span>
                            <span>Fin : <strong>{fmtDate(p.endDate)}</strong></span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ─── MES SINISTRES ─── */}
            {activeTab === 'mes-sinistres' && (
              <section className="section">
                <h2 className="section__title">Mes Sinistres</h2>
                {claims.length === 0 ? (
                  <div className="empty">Aucun sinistre déclaré.</div>
                ) : (
                  <div className="claims-list">
                    {claims.map((c) => (
                      <div className="claim-card" key={c.id.toString()}>
                        <div className="claim-card__top">
                          <span className="claim-card__id">Sinistre #{c.id.toString()}</span>
                          <span className="status-badge" style={{ background: STATUS_COLORS.claim[c.status] }}>
                            {CLAIM_STATUSES[c.status]}
                          </span>
                          <span className="claim-card__policy">Police #{c.policyId.toString()}</span>
                        </div>
                        <p className="claim-card__desc">{c.description}</p>
                        <div className="claim-card__amounts">
                          <div><label>Réclamé</label><span>{fmt(c.claimedAmount)} ETH</span></div>
                          <div><label>Approuvé</label><span>{fmt(c.approvedAmount)} ETH</span></div>
                        </div>
                        {c.reviewNotes && (
                          <div className="claim-card__notes">
                            <label>Notes assureur :</label> {c.reviewNotes}
                          </div>
                        )}
                        <div className="claim-card__dates">
                          Déclaré le {fmtDate(c.declaredAt)} · Mis à jour le {fmtDate(c.updatedAt)}
                        </div>
                        {c.ipfsDocHash && c.ipfsDocHash !== 'QmNone' && (
                          <div className="claim-card__ipfs mono">IPFS : {c.ipfsDocHash}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* ─── DÉCLARER UN SINISTRE ─── */}
            {activeTab === 'declarer' && (
              <section className="section section--form">
                <h2 className="section__title">Déclarer un Sinistre</h2>
                <div className="form-card">
                  <div className="form-group">
                    <label>ID de la Police *</label>
                    <input type="number" placeholder="Ex: 1" value={newClaim.policyId}
                      onChange={e => setNewClaim({ ...newClaim, policyId: e.target.value })} />
                    {policies.length > 0 && (
                      <div className="form-hint">
                        Vos polices actives : {policies.filter(p => p.status === 0n).map(p => `#${p.id.toString()}`).join(', ') || 'aucune'}
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label>Montant réclamé (ETH) *</label>
                    <input type="number" step="0.001" placeholder="Ex: 0.25" value={newClaim.amount}
                      onChange={e => setNewClaim({ ...newClaim, amount: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Description de l'incident *</label>
                    <textarea placeholder="Décrivez l'incident en détail..." rows={4} value={newClaim.description}
                      onChange={e => setNewClaim({ ...newClaim, description: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Hash IPFS des documents (optionnel)</label>
                    <input type="text" placeholder="QmXXXXXXXXX..." value={newClaim.ipfs}
                      onChange={e => setNewClaim({ ...newClaim, ipfs: e.target.value })} />
                    <div className="form-hint">Hash des photos, rapports de police, devis… stockés sur IPFS</div>
                  </div>
                  <button className="btn btn--primary" onClick={declareClaim} disabled={loading}>
                    {loading ? 'Transaction en cours…' : '🚨 Déclarer le Sinistre'}
                  </button>
                </div>
              </section>
            )}

            {/* ─── GESTION ASSUREUR ─── */}
            {activeTab === 'gestion' && isInsurer && (
              <section className="section">
                <h2 className="section__title">Gestion des Sinistres</h2>

                {/* All Claims Table */}
                <div className="table-wrapper">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>#</th><th>Police</th><th>Déclarant</th><th>Réclamé</th><th>Statut</th><th>Description</th><th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allClaims.map(c => (
                        <tr key={c.id.toString()}>
                          <td className="mono">{c.id.toString()}</td>
                          <td className="mono">{c.policyId.toString()}</td>
                          <td className="mono addr">{c.claimant.slice(0, 8)}…</td>
                          <td>{fmt(c.claimedAmount)} ETH</td>
                          <td>
                            <span className="status-badge" style={{ background: STATUS_COLORS.claim[c.status] }}>
                              {CLAIM_STATUSES[c.status]}
                            </span>
                          </td>
                          <td className="desc-cell">{c.description.slice(0, 40)}…</td>
                          <td>
                            {c.status === 0n && (
                              <button className="btn btn--sm btn--blue" onClick={async () => {
                                const notes = prompt('Notes de révision :') || 'En examen';
                                setLoading(true);
                                try { await (await contract.startClaimReview(c.id, notes)).wait(); await loadData(); showToast('Mis en examen'); } catch (e) { showToast(e.reason || e.message, 'error'); }
                                setLoading(false);
                              }}>Examiner</button>
                            )}
                            {(c.status === 0n || c.status === 1n) && (
                              <>
                                <button className="btn btn--sm btn--green" onClick={async () => {
                                  const amt = prompt('Montant approuvé (ETH) :');
                                  const notes = prompt('Notes :') || 'Approuvé';
                                  if (!amt) return;
                                  setLoading(true);
                                  try { await (await contract.approveClaim(c.id, ethers.parseEther(amt), notes)).wait(); await loadData(); showToast('Approuvé !'); } catch (e) { showToast(e.reason || e.message, 'error'); }
                                  setLoading(false);
                                }}>Approuver</button>
                                <button className="btn btn--sm btn--red" onClick={async () => {
                                  const reason = prompt('Motif du rejet :');
                                  if (!reason) return;
                                  setLoading(true);
                                  try { await (await contract.rejectClaim(c.id, reason)).wait(); await loadData(); showToast('Rejeté'); } catch (e) { showToast(e.reason || e.message, 'error'); }
                                  setLoading(false);
                                }}>Rejeter</button>
                              </>
                            )}
                            {c.status === 2n && (
                              <button className="btn btn--sm btn--purple" onClick={() => payClaim(c.id)}>
                                💸 Payer {fmt(c.approvedAmount)} ETH
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {allClaims.length === 0 && <div className="empty">Aucun sinistre enregistré.</div>}
                </div>
              </section>
            )}

            {/* ─── CRÉER POLICE (ASSUREUR) ─── */}
            {activeTab === 'creer-police' && isInsurer && (
              <section className="section section--form">
                <h2 className="section__title">Créer une Police d'Assurance</h2>
                <div className="form-card">
                  <div className="form-group">
                    <label>Adresse de l'assuré *</label>
                    <input type="text" placeholder="0x..." value={newPolicy.insured}
                      onChange={e => setNewPolicy({ ...newPolicy, insured: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Type d'assurance *</label>
                      <select value={newPolicy.insType} onChange={e => setNewPolicy({ ...newPolicy, insType: e.target.value })}>
                        {INSURANCE_TYPES.map((t, i) => <option key={i} value={i}>{TYPE_ICONS[i]} {t}</option>)}
                      </select>
                    </div>
                    <div className="form-group">
                      <label>Durée (jours) *</label>
                      <input type="number" placeholder="365" value={newPolicy.days}
                        onChange={e => setNewPolicy({ ...newPolicy, days: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Prime annuelle (ETH) *</label>
                      <input type="number" step="0.001" placeholder="0.05" value={newPolicy.premium}
                        onChange={e => setNewPolicy({ ...newPolicy, premium: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Plafond de couverture (ETH) *</label>
                      <input type="number" step="0.01" placeholder="1.0" value={newPolicy.coverage}
                        onChange={e => setNewPolicy({ ...newPolicy, coverage: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Description de la couverture *</label>
                    <textarea placeholder="Détails de la couverture..." rows={3} value={newPolicy.description}
                      onChange={e => setNewPolicy({ ...newPolicy, description: e.target.value })} />
                  </div>
                  <button className="btn btn--primary" onClick={createPolicy} disabled={loading}>
                    {loading ? 'Transaction en cours…' : '📋 Créer la Police'}
                  </button>
                </div>
              </section>
            )}

            {/* ─── FONDS (OWNER) ─── */}
            {activeTab === 'fonds' && isOwner && (
              <section className="section section--form">
                <h2 className="section__title">Gestion du Pool de Fonds</h2>
                <div className="stat-highlight">
                  Pool actuel : <strong>{poolBalance} ETH</strong>
                </div>
                <div className="form-card">
                  <h3>Déposer des Fonds</h3>
                  <div className="form-group">
                    <label>Montant (ETH)</label>
                    <input type="number" step="0.01" placeholder="1.0" value={depositAmount}
                      onChange={e => setDepositAmount(e.target.value)} />
                  </div>
                  <button className="btn btn--primary" onClick={depositFunds} disabled={loading}>
                    {loading ? 'En cours…' : '💰 Déposer dans le Pool'}
                  </button>
                </div>
              </section>
            )}

          </main>
        </>
      )}
    </div>
  );
}