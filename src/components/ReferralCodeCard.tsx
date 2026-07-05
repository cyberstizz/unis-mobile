// src/components/ReferralCodeCard.tsx
// Ported from web `ReferralCodeCard.jsx`.
//
// Receives `referralCode` and `username` as props from ProfileScreen rather
// than fetching them itself. This preserves the web fix for the cache-drift
// bug: the card renders from the exact same profile-summary data as the rest
// of the page (one fetch, one source of truth). No internal fetch; loading and
// error states are handled by the parent.
//
// Prop signature (same as web):
//   - referralCode: string  (required — from ProfileSummaryDto.referralCode)
//   - username:     string  (optional — used in share message)
//   - isArtist:     boolean (optional, defaults false)

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Copy, Check, Sparkles } from 'lucide-react-native';

interface ReferralCodeCardProps {
  referralCode?: string;
  username?: string;
  isArtist?: boolean;
}

const ReferralCodeCard: React.FC<ReferralCodeCardProps> = ({
  referralCode = '',
  username = '',
  isArtist = false,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!referralCode) return;
    try {
      await Clipboard.setStringAsync(referralCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[ReferralCodeCard] action=copy status=fail err=', err);
    }
  };

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Your Code</Text>
      <Text style={styles.title}>
        Bring friends in. <Text style={styles.titleEm}>Earn points.</Text>
      </Text>
      <Text style={styles.desc}>
        {isArtist ? (
          <>
            Share this code with listeners and other artists. Earn{' '}
            <Text style={styles.bold}>+5 points</Text> for every listener and{' '}
            <Text style={styles.bold}>+2</Text> for every artist who joins with your code.
          </>
        ) : (
          <>
            Every user who joins UNIS with your code earns you passive income.
            <Text style={styles.bold}> Earn Cash</Text> when your referrals use the
            platform. You earn a percentage of the income earned from their browsing
            when they view, watch, and listen to ads
          </>
        )}
      </Text>

      <View style={styles.codeRow}>
        <View style={styles.code} accessibilityLabel={`Your referral code: ${referralCode || 'not assigned'}`}>
          <Text style={styles.codeText}>{referralCode || '—'}</Text>
        </View>
        <TouchableOpacity
          style={[styles.copyBtn, copied && styles.copyBtnCopied]}
          onPress={handleCopy}
          disabled={!referralCode}
          accessibilityLabel={copied ? 'Copied' : 'Copy referral code to clipboard'}
        >
          {copied ? <Check size={14} color="#0F7A3E" /> : <Copy size={14} color="#FFFFFF" />}
          <Text style={[styles.copyText, copied && styles.copyTextCopied]}>
            {copied ? 'Copied' : 'Copy'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.how}>
        <View style={styles.howIcon}>
          <Sparkles size={26} strokeWidth={1.5} color="#4a9eff" />
        </View>
        <Text style={styles.howTitle}>How it works</Text>
        {isArtist ? (
          <>
            <Text style={styles.howItem}>
              <Text style={styles.bold}>+5</Text> points per listener signup
            </Text>
            <Text style={styles.howItem}>
              <Text style={styles.bold}>+2</Text> points per artist signup
            </Text>
            <Text style={styles.howItem}>Boosts your reach across jurisdictions</Text>
            <Text style={styles.howItem}>No expiration — share anytime</Text>
          </>
        ) : (
          <>
            <Text style={styles.howItem}>
              <Text style={styles.bold}>+5</Text> points per friend who joins
            </Text>
            <Text style={styles.howItem}>Boost your jurisdiction's ranking</Text>
            <Text style={styles.howItem}>No expiration — share anytime</Text>
          </>
        )}

        {/*
          ============================================================
          STATS BLOCK — uncomment once referral stats are added to
          ProfileSummaryDto (referralsJoined, pointsEarned) and passed
          down as props, mirroring the note in the web component.
          ============================================================
        */}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    backgroundColor: 'rgba(74, 158, 255, 0.05)',
    borderColor: 'rgba(74, 158, 255, 0.15)',
    borderWidth: 1,
    padding: 16,
  },
  eyebrow: {
    color: '#4a9eff',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 19,
    fontWeight: '700',
    marginBottom: 8,
  },
  titleEm: {
    fontStyle: 'italic',
    color: '#4a9eff',
  },
  desc: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  bold: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  code: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    borderStyle: 'dashed',
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginRight: 10,
  },
  codeText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 2,
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004aad',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  copyBtnCopied: {
    backgroundColor: 'rgba(15, 122, 62, 0.15)',
  },
  copyText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    marginLeft: 6,
  },
  copyTextCopied: {
    color: '#0F7A3E',
  },
  how: {
    borderTopColor: 'rgba(255, 255, 255, 0.08)',
    borderTopWidth: 1,
    paddingTop: 14,
  },
  howIcon: {
    marginBottom: 8,
  },
  howTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  howItem: {
    color: '#AAAAAA',
    fontSize: 13,
    lineHeight: 22,
  },
});

export default ReferralCodeCard;