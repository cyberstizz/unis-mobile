// src/components/Downloadcontractbutton.tsx
// Updated to mirror the CURRENT web contract (artistDashboard.jsx →
// downloadOwnershipContract): the launch-ready "Artist Ownership & Revenue
// Share Agreement" — 13 sections including the Revenue Share Schedule
// (85/50/60/15), the tiered Referral Program (10/5/2), DMCA, and NY governing
// law. Web renders it with jsPDF; mobile renders the same text as HTML via
// expo-print (native HTML → PDF), then hands it to the share sheet.

import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DownloadContractButtonProps {
  artistName: string;
  style?: object;
}

// ─── HTML contract template ───────────────────────────────────────────────────
// Text is verbatim from the web jsPDF build so both platforms distribute the
// identical agreement.
//
// ★ item 2a + item 11 FLAG (carried from web): confirm the Revenue Share
// Schedule percentages against the published terms at artists.unismusic.com
// AND the reconciled EarningsService before this document is distributed to
// any artist.

const buildContractHtml = (artistName: string, dateStr: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #2d2d2d;
      padding: 56px 56px 72px;
      position: relative;
      font-size: 9.5pt;
      line-height: 1.5;
    }

    /* Watermark */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(32deg);
      font-size: 120px;
      font-weight: 900;
      color: rgba(242, 243, 245, 1);
      letter-spacing: 12px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 0;
    }

    .content { position: relative; z-index: 1; }

    /* Header */
    .header {
      text-align: center;
      margin-bottom: 28px;
    }
    .header h1 {
      font-size: 19pt;
      font-weight: 700;
      color: #0c0c0c;
      line-height: 1.35;
    }
    .header .effective {
      font-size: 10pt;
      color: #5a5a5a;
      margin-top: 12px;
    }

    h2 {
      font-size: 11pt;
      font-weight: 700;
      color: #111111;
      margin-top: 18px;
      margin-bottom: 6px;
    }

    p {
      color: #2d2d2d;
      margin-bottom: 10px;
      text-align: justify;
    }

    /* Revenue Share Schedule table */
    table.schedule {
      width: 100%;
      border-collapse: collapse;
      margin: 6px 0 12px;
    }
    table.schedule td {
      padding: 6px 8px;
      font-size: 9.5pt;
    }
    table.schedule tr:nth-child(odd) { background: #f7f8fa; }
    table.schedule td.share {
      text-align: right;
      font-weight: 700;
      color: #141414;
    }

    /* Signatures */
    .signature-section {
      display: flex;
      justify-content: space-between;
      margin-top: 56px;
    }
    .sig-block { width: 44%; }
    .sig-line {
      border-bottom: 1px solid #787878;
      height: 28px;
      margin-bottom: 8px;
    }
    .sig-label { font-size: 9pt; color: #464646; }
    .sig-date { font-size: 9pt; color: #464646; margin-top: 10px; }

    .footer {
      margin-top: 48px;
      padding-top: 12px;
      border-top: 1px solid #e2e2e2;
      font-size: 8pt;
      color: #969696;
      text-align: center;
    }
  </style>
</head>
<body>
  <div class="watermark">UNIS</div>
  <div class="content">

    <div class="header">
      <h1>ARTIST OWNERSHIP &amp;<br/>REVENUE SHARE AGREEMENT</h1>
      <div class="effective">Effective Date: ${dateStr}</div>
    </div>

    <p>This Artist Ownership &amp; Revenue Share Agreement (the "Agreement") is entered into as of the Effective Date above, by and between Unis Music Corporation, a New York corporation and wholly-owned subsidiary of Lamb Services, Inc. ("Unis," "we," or "us"), and ${artistName} ("Artist," "you"), an independent music creator. Unis and Artist are each a "Party" and together the "Parties."</p>

    <h2>1. Definitions</h2>
    <p>"Platform" means the Unis hyperlocal music discovery, voting, and sales service, including its websites, mobile applications, and related services. "Content" means the audio recordings, artwork, lyrics, metadata, and other materials you upload. "Master Recording" means a sound recording you own or control. "Net Revenue" means amounts actually received by Unis attributable to your Content, less payment-processor fees, refunds, chargebacks, and applicable taxes.</p>

    <h2>2. Ownership of Your Content</h2>
    <p>You retain all right, title, and interest in and to your Content, including all Master Recordings and underlying compositions you own or control. Nothing in this Agreement transfers ownership of your Content to Unis. Unis claims no ownership of your music.</p>

    <h2>3. License Grant</h2>
    <p>You grant Unis a non-exclusive, worldwide, royalty-bearing, revocable license to host, store, reproduce, stream, publicly perform, display, promote, and (where you enable sales or downloads) distribute your Content on and through the Platform for the purpose of operating its discovery, voting, and sales features. This license exists only while your Content remains on the Platform and terminates as described in Section 8.</p>

    <h2>4. Revenue Share Schedule</h2>
    <p>Subject to the payment terms below, Unis will pay you the following share of Net Revenue attributable to your Content in each revenue stream:</p>

    <table class="schedule">
      <tr><td>Direct song sales &amp; downloads</td><td class="share">85% to Artist</td></tr>
      <tr><td>Paid subscription streaming pool</td><td class="share">50% to Artist</td></tr>
      <tr><td>Audio advertising revenue</td><td class="share">60% to Artist</td></tr>
      <tr><td>Supporter contributions</td><td class="share">15% to Artist</td></tr>
    </table>

    <p>Revenue-stream definitions and the methodology for allocating pooled revenue (such as the subscription streaming pool) are described in the then-current published terms at artists.unismusic.com, which are incorporated by reference. Where this Schedule and the published terms conflict, the published terms control.</p>

    <h2>5. Referral Program</h2>
    <p>Where you refer new members using your referral code, you may earn referral income on qualifying Net Revenue generated by your referrals: 10% on first-tier (direct) referrals, 5% on second-tier referrals, and 2% on third-tier referrals, in each case as further described in the published referral terms. Referral tiers and rates may be adjusted prospectively on notice.</p>

    <h2>6. Payments and Payouts</h2>
    <p>Unis processes artist payouts through Stripe. You are responsible for completing Stripe onboarding and providing accurate payout information. Payouts are made periodically once your available balance meets the minimum payout threshold (currently $50.00). You are solely responsible for all taxes on amounts you receive. Unis may withhold or offset amounts subject to refund, chargeback, or fraud review.</p>

    <h2>7. Your Representations and Warranties</h2>
    <p>You represent and warrant that: (a) you own or control all rights necessary to grant the license in Section 3; (b) your Content does not infringe any third party's copyright, trademark, publicity, privacy, or other rights; (c) you have paid or will pay any co-writers, producers, featured performers, or rights holders any share of the revenue you receive that is due to them; and (d) your Content complies with the Platform's content standards and applicable law.</p>

    <h2>8. Term and Termination</h2>
    <p>This Agreement begins on the Effective Date and continues until terminated. You may remove your Content or close your account at any time, which terminates the Section 3 license on a going-forward basis (subject to cached copies and completed transactions). Unis may suspend or remove Content that violates this Agreement, the content standards, or law, including in response to a valid DMCA notice. Provisions that by their nature should survive termination — including ownership, payment for amounts already earned, warranties, and limitation of liability — survive.</p>

    <h2>9. Copyright and DMCA</h2>
    <p>Unis operates a notice-and-takedown process under the Digital Millennium Copyright Act. If Unis receives a valid infringement notice concerning your Content, Unis may remove or disable access to that Content. You may submit a counter-notice where permitted by law. Repeat infringers may be terminated.</p>

    <h2>10. Limitation of Liability</h2>
    <p>To the maximum extent permitted by law, Unis will not be liable for indirect, incidental, special, consequential, or punitive damages, or for lost profits or revenues, arising out of or relating to this Agreement. Unis's total aggregate liability arising out of this Agreement will not exceed the greater of the amounts paid or payable to you in the twelve months preceding the claim, or $100.</p>

    <h2>11. Independent Relationship</h2>
    <p>The Parties are independent contractors. Nothing in this Agreement creates a partnership, joint venture, employment, or agency relationship, and neither Party may bind the other.</p>

    <h2>12. Governing Law and Disputes</h2>
    <p>This Agreement is governed by the laws of the State of New York, without regard to its conflict-of-laws rules. The state and federal courts located in New York County, New York will have jurisdiction over disputes not otherwise subject to an agreed dispute-resolution process.</p>

    <h2>13. Entire Agreement; Changes</h2>
    <p>This Agreement, together with the published terms incorporated by reference, is the entire agreement between the Parties regarding its subject matter. Unis may update the published terms prospectively; your continued use of the Platform after an update constitutes acceptance. No modification by you is effective unless agreed in writing by Unis.</p>

    <h2>Acknowledgement &amp; Signatures</h2>
    <p>By downloading, retaining, or continuing to use the Platform to distribute your Content, you acknowledge that you have read, understood, and agree to this Agreement.</p>

    <div class="signature-section">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">${artistName} (Artist)</div>
        <div class="sig-date">Date: ${dateStr}</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Unis Music Corporation</div>
        <div class="sig-date">By: Authorized Officer</div>
      </div>
    </div>

    <div class="footer">
      Unis Music Corporation · Artist Ownership &amp; Revenue Share Agreement
    </div>

  </div>
</body>
</html>
`;

// ─── Component ────────────────────────────────────────────────────────────────

const DownloadContractButton: React.FC<DownloadContractButtonProps> = ({
  artistName,
  style,
}) => {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const dateStr = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });

      const html = buildContractHtml(artistName, dateStr);

      // Generate PDF from HTML
      const { uri } = await Print.printToFileAsync({
        html,
        base64: false,
      });

      // Share / save to device
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Save Artist Agreement',
          UTI: 'com.adobe.pdf', // iOS
        });
      } else {
        Alert.alert(
          'PDF Generated',
          'Sharing is not available on this device. The PDF has been saved temporarily at: ' + uri
        );
      }
    } catch (err) {
      console.error('Contract generation error:', err);
      Alert.alert('Error', 'Failed to generate the agreement. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      style={[styles.btn, style]}
      onPress={handleDownload}
      disabled={loading}
    >
      {loading ? (
        <ActivityIndicator color="#FFFFFF" size="small" />
      ) : (
        <Text style={styles.btnText}>Agreement</Text>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 22,
    paddingVertical: 11,
    paddingHorizontal: 18,
  },
  btnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default DownloadContractButton;