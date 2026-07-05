// src/components/CashoutPanel.tsx
// Ported from web `CashoutPanel.jsx`.
//
// CashoutPanel — Unis Earnings Payout via Stripe Connect
//
// Presentation only. All behaviour is driven by props; the parent owns the
// actual Stripe calls (onRequestPayout / onConnectStripe). Amounts are cents.
//
//   <CashoutPanel
//     balance={7523}                    // available balance in cents ($75.23)
//     pendingBalance={1250}             // pending/uncleared balance in cents
//     minimumPayout={5000}              // minimum payout in cents ($50.00)
//     stripeConnected={true}            // whether the user has onboarded Stripe
//     onRequestPayout={(amount) => {}}  // cents; resolves on success, rejects on failure
//     onConnectStripe={() => {}}        // opens Stripe Connect onboarding
//     payoutHistory={[{ id, amount, status, date }]}
//   />
//
// The web version's pointerEvents/opacity confirm-button lock is preserved via
// `disabled` + opacity, which is the RN equivalent the test-suite behavior maps to.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import {
  Wallet,
  ArrowUp,
  Clock,
  Check,
  X,
  Landmark,
  CreditCard,
} from 'lucide-react-native';

// ── Helpers ──────────────────────────────────────────────────────────

const formatCents = (cents?: number | null): string => {
  if (cents == null) return '$0.00';
  return `$${(cents / 100).toFixed(2)}`;
};

const formatDate = (dateStr?: string): string => {
  // ★ Robust to both "2026-04-01" and ISO datetimes. Parse YYYY-MM-DD as a
  // local date so timezones west of UTC don't roll the display back a day.
  if (!dateStr) return '';
  const [year, month, day] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return String(dateStr);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const STATUS_CONFIG: Record<string, { color: string; bg: string; Icon: any; label: string }> = {
  pending:  { color: '#ffb13c', bg: 'rgba(255,177,60,0.1)',  Icon: Clock, label: 'Pending' },
  paid:     { color: '#22c55e', bg: 'rgba(34,197,94,0.1)',   Icon: Check, label: 'Paid' },
  failed:   { color: '#f87171', bg: 'rgba(248,113,113,0.1)', Icon: X,     label: 'Failed' },
  canceled: { color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', Icon: X,     label: 'Canceled' },
};

export interface PayoutHistoryItem {
  id: string;
  amount: number; // cents
  status: string;
  date: string;
}

interface CashoutPanelProps {
  balance?: number;
  pendingBalance?: number;
  minimumPayout?: number;
  stripeConnected?: boolean;
  onRequestPayout?: (amountCents: number) => Promise<void> | void;
  onConnectStripe?: () => void;
  payoutHistory?: PayoutHistoryItem[];
}

const CashoutPanel: React.FC<CashoutPanelProps> = ({
  balance = 0,
  pendingBalance = 0,
  minimumPayout = 5000,
  stripeConnected = false,
  onRequestPayout = (_amountCents: number) => {},
  onConnectStripe = () => {},
  payoutHistory = [] as PayoutHistoryItem[],
}) => {
  const [showConfirm, setShowConfirm] = useState(false);
  const [payoutStatus, setPayoutStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [customAmount, setCustomAmount] = useState('');
  const [useCustom, setUseCustom] = useState(false);

  const canPayout = balance >= minimumPayout && stripeConnected;
  const shortfall = minimumPayout - balance;
  const maxPayout = balance;

  const payoutAmount = useCustom && customAmount
    ? Math.round(parseFloat(customAmount) * 100)
    : balance;

  const isValidAmount = payoutAmount >= minimumPayout && payoutAmount <= maxPayout;

  const handlePayout = async () => {
    // Guard: disabled is visual — programmatic dispatch and rapid double-taps
    // can still fire onPress in some flows. (Same rationale as web.)
    if (payoutStatus === 'processing') return;
    if (useCustom && !isValidAmount) return;

    setPayoutStatus('processing');
    try {
      await onRequestPayout(payoutAmount);
      setPayoutStatus('success');
      setTimeout(() => {
        setShowConfirm(false);
        setPayoutStatus('idle');
        setUseCustom(false);
        setCustomAmount('');
      }, 2000);
    } catch (err) {
      console.error('Payout failed:', err);
      setPayoutStatus('error');
    }
  };

  const confirmLocked = payoutStatus === 'processing' || (useCustom && !isValidAmount);

  return (
    <View>
      {/* ── Balance Card ─────────────────────────────── */}
      <View style={styles.balance}>
        <View style={styles.balanceHead}>
          <View style={styles.balanceIcon}>
            <Wallet size={20} color="#4a9eff" />
          </View>
          <Text style={styles.balanceLabel}>Available Balance</Text>
        </View>
        <Text style={styles.balanceAmount}>{formatCents(balance)}</Text>
        {pendingBalance > 0 && (
          <View style={styles.pending}>
            <Clock size={14} color="#ffb13c" />
            <Text style={styles.pendingText}>{formatCents(pendingBalance)} pending</Text>
          </View>
        )}

        {/* Action area */}
        <View style={styles.action}>
          {!stripeConnected ? (
            // ── Not connected: show onboarding CTA ──
            <View>
              <Text style={styles.connectText}>
                Connect your bank account via Stripe to start receiving payouts.
              </Text>
              <TouchableOpacity style={[styles.btn, styles.btnStripe]} onPress={onConnectStripe}>
                <CreditCard size={18} color="#FFFFFF" />
                <Text style={styles.btnText}>Connect with Stripe</Text>
              </TouchableOpacity>
            </View>
          ) : !canPayout ? (
            // ── Connected but below minimum ──
            <View>
              <View style={styles.progress}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min((balance / minimumPayout) * 100, 100)}%` },
                  ]}
                />
              </View>
              <Text style={styles.minimumText}>
                {formatCents(shortfall)} more to reach the {formatCents(minimumPayout)} minimum payout
              </Text>
            </View>
          ) : !showConfirm ? (
            // ── Ready to cash out ──
            <TouchableOpacity style={[styles.btn, styles.btnPayout]} onPress={() => setShowConfirm(true)}>
              <ArrowUp size={16} color="#FFFFFF" />
              <Text style={styles.btnText}>Cash Out</Text>
            </TouchableOpacity>
          ) : (
            // ── Confirmation step ──
            <View>
              {payoutStatus === 'success' ? (
                <View style={styles.success}>
                  <View style={styles.successDot} />
                  <Text style={styles.successText}>
                    Payout requested! Funds typically arrive in 1–2 business days.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={styles.confirmTitle}>Confirm Payout</Text>

                  {/* Amount selector */}
                  <TouchableOpacity
                    style={[styles.amount, !useCustom && styles.amountActive]}
                    onPress={() => { setUseCustom(false); setCustomAmount(''); }}
                  >
                    <Text style={styles.amountText}>Full balance — {formatCents(balance)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.amount, useCustom && styles.amountActive]}
                    onPress={() => setUseCustom(true)}
                  >
                    <Text style={styles.amountText}>Custom amount</Text>
                  </TouchableOpacity>

                  {useCustom && (
                    <View style={styles.custom}>
                      <Text style={styles.customSign}>$</Text>
                      <TextInput
                        style={styles.customInput}
                        keyboardType="decimal-pad"
                        placeholder={(minimumPayout / 100).toFixed(2)}
                        placeholderTextColor="#666666"
                        value={customAmount}
                        onChangeText={setCustomAmount}
                      />
                    </View>
                  )}

                  {useCustom && !!customAmount && !isValidAmount && (
                    <Text style={styles.error}>
                      {payoutAmount < minimumPayout
                        ? `Minimum payout is ${formatCents(minimumPayout)}`
                        : `Cannot exceed your balance of ${formatCents(balance)}`}
                    </Text>
                  )}

                  <View style={styles.info}>
                    <Landmark size={18} color="#888888" />
                    <Text style={styles.infoText}>
                      Funds will be sent to your connected bank account
                    </Text>
                  </View>

                  <TouchableOpacity
                    style={[styles.btn, styles.btnConfirm, confirmLocked && styles.btnLocked]}
                    onPress={handlePayout}
                    disabled={confirmLocked}
                  >
                    {payoutStatus === 'processing' ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.btnText}>
                        Confirm {formatCents(payoutAmount)} Payout
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cancel}
                    onPress={() => {
                      setShowConfirm(false);
                      setPayoutStatus('idle');
                      setUseCustom(false);
                      setCustomAmount('');
                    }}
                  >
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>

                  {payoutStatus === 'error' && (
                    <Text style={[styles.error, styles.errorCenter]}>
                      Payout failed. Please try again or contact support.
                    </Text>
                  )}
                </>
              )}
            </View>
          )}
        </View>
      </View>

      {/* ── Payout History ────────────────────────────── */}
      {payoutHistory.length > 0 && (
        <View style={styles.history}>
          <Text style={styles.historyTitle}>Payout History</Text>
          {payoutHistory.map((payout) => {
            const sc = STATUS_CONFIG[payout.status] || STATUS_CONFIG.pending;
            const StatusIcon = sc.Icon;
            return (
              <View key={payout.id} style={styles.historyItem}>
                <View style={styles.historyLeft}>
                  <View style={[styles.status, { backgroundColor: sc.bg }]}>
                    <StatusIcon size={13} color={sc.color} />
                    <Text style={[styles.statusText, { color: sc.color }]}>{sc.label}</Text>
                  </View>
                  <Text style={styles.historyDate}>{formatDate(payout.date)}</Text>
                </View>
                <Text style={styles.historyAmount}>{formatCents(payout.amount)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  balance: {
    backgroundColor: 'rgba(0, 74, 173, 0.12)',
    borderColor: 'rgba(74, 158, 255, 0.25)',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
  },
  balanceHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  balanceIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(74, 158, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  balanceLabel: {
    color: '#AAAAAA',
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  balanceAmount: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
  },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  pendingText: {
    color: '#ffb13c',
    fontSize: 12,
    marginLeft: 5,
  },
  action: {
    marginTop: 14,
  },
  connectText: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 24,
    paddingVertical: 13,
  },
  btnStripe: {
    backgroundColor: '#635bff',
  },
  btnPayout: {
    backgroundColor: '#004aad',
  },
  btnConfirm: {
    backgroundColor: '#004aad',
    marginTop: 4,
  },
  btnLocked: {
    opacity: 0.5,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  progress: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#4a9eff',
  },
  minimumText: {
    color: '#AAAAAA',
    fontSize: 12,
  },
  confirmTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 10,
  },
  amount: {
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  amountActive: {
    borderColor: '#4a9eff',
    backgroundColor: 'rgba(74, 158, 255, 0.08)',
  },
  amountText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
  },
  custom: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  customSign: {
    color: '#AAAAAA',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 6,
  },
  customInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    paddingVertical: 11,
  },
  error: {
    color: '#f87171',
    fontSize: 12,
    marginBottom: 8,
  },
  errorCenter: {
    textAlign: 'center',
    marginTop: 8,
  },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  infoText: {
    color: '#888888',
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  cancel: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  cancelText: {
    color: '#AAAAAA',
    fontSize: 13,
    fontWeight: '600',
  },
  success: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderRadius: 12,
    padding: 12,
  },
  successDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#22c55e',
    marginRight: 8,
  },
  successText: {
    color: '#CCCCCC',
    fontSize: 13,
    flex: 1,
  },
  history: {
    marginTop: 14,
  },
  historyTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    borderBottomWidth: 1,
  },
  historyLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginRight: 10,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  historyDate: {
    color: '#888888',
    fontSize: 12,
  },
  historyAmount: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});

export default CashoutPanel;