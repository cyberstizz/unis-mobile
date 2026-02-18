import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DownloadContractButtonProps {
  artistName: string;
  style?: object;
}

// ─── HTML contract template ───────────────────────────────────────────────────
// Mirrors the jsPDF contract from the web dashboard, rebuilt as HTML for expo-print.
// expo-print renders HTML → PDF natively on device (no external dependency).

const buildContractHtml = (artistName: string, dateStr: string): string => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
      color: #111;
      padding: 60px 72px;
      position: relative;
    }

    /* Watermark */
    .watermark {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%) rotate(45deg);
      font-size: 96px;
      font-weight: 900;
      color: rgba(22, 51, 135, 0.06);
      letter-spacing: 24px;
      white-space: nowrap;
      pointer-events: none;
      z-index: 0;
    }

    .content { position: relative; z-index: 1; }

    /* Header */
    .header {
      text-align: center;
      border-bottom: 3px solid #163387;
      padding-bottom: 24px;
      margin-bottom: 32px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 900;
      color: #163387;
      text-transform: uppercase;
      letter-spacing: 2px;
      line-height: 1.3;
    }
    .header .subtitle {
      font-size: 13px;
      color: #555;
      margin-top: 8px;
    }

    /* Body */
    h2 {
      font-size: 15px;
      font-weight: 700;
      color: #163387;
      margin: 28px 0 10px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    p {
      font-size: 13px;
      line-height: 1.75;
      color: #333;
      margin-bottom: 10px;
    }
    .parties {
      background: #f7f9ff;
      border-left: 4px solid #163387;
      padding: 16px 20px;
      border-radius: 4px;
      margin: 16px 0;
    }
    .parties p { margin-bottom: 6px; }
    .parties strong { color: #111; }

    ul {
      margin: 10px 0 10px 20px;
    }
    ul li {
      font-size: 13px;
      line-height: 1.75;
      color: #333;
      margin-bottom: 4px;
    }

    /* Signature block */
    .signature-section {
      margin-top: 48px;
      border-top: 1px solid #ddd;
      padding-top: 32px;
      display: flex;
      gap: 60px;
    }
    .sig-block { flex: 1; }
    .sig-line {
      border-bottom: 1px solid #111;
      height: 40px;
      margin-bottom: 6px;
    }
    .sig-label { font-size: 11px; color: #666; }
    .sig-name { font-size: 13px; font-weight: 700; margin-top: 4px; }

    /* Footer */
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 10px;
      color: #aaa;
      border-top: 1px solid #eee;
      padding-top: 16px;
    }
  </style>
</head>
<body>
  <div class="watermark">UNIS</div>
  <div class="content">

    <div class="header">
      <h1>UNIS Artist Ownership &amp;<br/>Revenue Share Agreement</h1>
      <p class="subtitle">Effective Date: ${dateStr}</p>
    </div>

    <h2>Parties</h2>
    <div class="parties">
      <p><strong>Platform:</strong> UNIS Music Platform ("Unis"), a digital music discovery service</p>
      <p><strong>Artist:</strong> ${artistName} ("Artist"), an independent creator</p>
    </div>

    <h2>1. Ownership</h2>
    <p>
      The Artist retains 100% ownership of all original compositions, sound recordings,
      lyrics, and associated artwork uploaded to the UNIS platform. UNIS claims no
      ownership rights over any Artist content.
    </p>

    <h2>2. License Grant</h2>
    <p>
      By uploading content to UNIS, the Artist grants UNIS a non-exclusive, royalty-free,
      worldwide license to stream, display, and promote the content solely within the
      UNIS platform and its affiliated marketing channels for the purpose of music
      discovery and community engagement.
    </p>

    <h2>3. Revenue Share</h2>
    <p>
      Artists who participate in UNIS jurisdiction-based competitions and earn community
      awards are entitled to revenue share distributions as outlined in the current UNIS
      Revenue Share Policy, which may be updated from time to time with notice to Artists.
    </p>
    <ul>
      <li>Voting-based awards carry the highest revenue weighting</li>
      <li>Score-based and engagement awards carry secondary weighting</li>
      <li>Distributions are processed monthly for eligible Artists</li>
    </ul>

    <h2>4. Content Standards</h2>
    <p>
      The Artist warrants that all uploaded content is original, does not infringe
      third-party intellectual property rights, and complies with UNIS Community
      Guidelines. UNIS reserves the right to remove content that violates these standards.
    </p>

    <h2>5. Termination</h2>
    <p>
      Either party may terminate this agreement at any time. Upon account deletion,
      the Artist's content will be removed from the platform within 30 days. Earned
      but undistributed revenue share will be processed in the final distribution cycle.
    </p>

    <h2>6. Governing Law</h2>
    <p>
      This Agreement shall be governed by the laws of the State of New York,
      without regard to conflict of law principles.
    </p>

    <div class="signature-section">
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Artist Signature</div>
        <div class="sig-name">${artistName}</div>
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">UNIS Platform Representative</div>
        <div class="sig-name">UNIS Music Platform</div>
      </div>
    </div>

    <div class="footer">
      Generated by UNIS · ${dateStr} · unis.app
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
          dialogTitle: 'Save Ownership Contract',
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
      Alert.alert('Error', 'Failed to generate contract. Please try again.');
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
        <ActivityIndicator color="#C0C0C0" size="small" />
      ) : (
        <Text style={styles.btnText}>⬇  Download Ownership Contract</Text>
      )}
    </TouchableOpacity>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(192,192,192,0.3)',
    backgroundColor: '#1a1a1a',
    gap: 8,
  },
  btnText: {
    color: '#C0C0C0',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default DownloadContractButton;