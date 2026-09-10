/**
 * Payments & Payouts Page
 * Core Module: payments
 * Permissions:
 * - payment.view
 * - payment.process_refund
 * - payment.export
 * - payment.manage_payouts
 */

import { useState, useEffect } from 'react';
import api from '../services/api';
import PermissionGate from '../components/PermissionGate';
import { usePermissions } from '../hooks/usePermissions';

export default function PaymentsPage() {
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState('');
  const { can } = usePermissions();

  const loadPayments = async () => {
    try {
      const res = await api.get('/payments');
      setPayments(res.data);
    } catch {
      console.error('Failed to load payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPayments();
  }, []);

  const handleProcessPayout = async (id) => {
    try {
      await api.post('/payments/payout', { paymentId: id });
      setStatusMsg(`Payout #${id} completed.`);
      loadPayments();
    } catch {
      alert('Failed to process payout.');
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">💳 Payments & Payouts</h2>
        <p className="page-description">
          Disburse filmmaker award honorariums, lab fees, and vendor invoices securely.
        </p>
      </div>

      {statusMsg && (
        <div className="alert alert-success" style={{ marginBottom: 'var(--space-md)' }}>
          {statusMsg}
        </div>
      )}

      <div className="alert alert-info" style={{ marginBottom: 'var(--space-lg)', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <span>🔑 <strong>Payment Permissions:</strong></span>
        <span className={`badge ${can('payment.view') ? 'badge-success' : 'badge-danger'}`}>payment.view</span>
        <span className={`badge ${can('payment.manage_payouts') || can('payment.process_payouts') ? 'badge-success' : 'badge-danger'}`}>payment.manage_payouts</span>
        <span className={`badge ${can('payment.export') ? 'badge-success' : 'badge-danger'}`}>payment.export</span>
      </div>

      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Transaction & Payout Ledger</h3>
          <p className="card-subtitle"><span className="permission-section-badge">Requires: payment.view</span></p>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: '48px' }}></div>)}
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>Ref #</th>
                  <th>Recipient</th>
                  <th>Amount</th>
                  <th>Type</th>
                  <th>Date</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(p => (
                  <tr key={p.id}>
                    <td style={{ fontWeight: 600 }}>{p.reference}</td>
                    <td>👤 {p.recipient}</td>
                    <td style={{ fontWeight: 700, color: 'var(--color-primary)' }}>{p.amount}</td>
                    <td>{p.type}</td>
                    <td>{p.date}</td>
                    <td><span className={`badge ${p.status === 'Completed' ? 'badge-success' : 'badge-warning'}`}>{p.status}</span></td>
                    <td>
                      {p.status !== 'Completed' && (
                        <PermissionGate permission="payment.manage_payouts">
                          <button className="btn btn-success btn-sm" onClick={() => handleProcessPayout(p.id)}>
                            💸 Disburse
                          </button>
                        </PermissionGate>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
